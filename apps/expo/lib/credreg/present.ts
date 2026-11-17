/**
 * Vorzeigen (the holder's phone): sign a short-lived statement about one credential, hand it to the
 * server (present_create), and show the 12-character code it returns as a QR code. The server
 * keeps the code for 300 s and gives it out once; the checker's phone resolves and verifies it
 * (./verify). showMessage is identical to apps/web/src/lib/credentials/presentations.ts.
 *
 * A private credential needs its proof (batch, leaf, proof, claim signature). The device cache holds
 * none, so a cached private credential is refetched from `mine`; offline it cannot be shown.
 * Never logs and never returns a raw error: errors can carry addresses.
 */
import { getRandomBytes } from 'expo-crypto';
import type { Address, Hex } from 'viem';
import { signQueued, type ApiResult, type SigningAccount } from '@/lib/signed-request';
import { createPresentation, fetchMine } from './api';
import type { HeldCredential } from './held';
import type { InvitationView, Presentation, PresentationCreated } from './types';
import { SHOW_TTL_SECONDS } from './verify';

export { SHOW_TTL_SECONDS };
export const SHOW_SCOPE = 'roebel-credential-show-v1';
export const QR_PREFIX = 'roebel-ausweis:';
/** Same alphabet and length as the server's presentation codes (no 0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;

export function showMessage(p: { typeId: Hex | string; account: string; issuedAtSec: number; nonce: string }): string {
  return `${SHOW_SCOPE}:${p.typeId}:${p.account.toLowerCase()}:${p.issuedAtSec}:${p.nonce}`;
}

export const qrPayload = (code: string): string => `${QR_PREFIX}${code}`;

/** The code inside a scanned `roebel-ausweis:<code>`, normalised; null for anything else. */
export function parseAusweisPayload(data: string): string | null {
  if (typeof data !== 'string' || !data.startsWith(QR_PREFIX)) return null;
  const code = data.slice(QR_PREFIX.length).trim().toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** 16 random bytes as hex (matches the server's nonce pattern). */
export function newNonce(): string {
  return Array.from(getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

export type PresentationErrorCode = 'NEEDS_PROOF' | 'EXPIRED';

export class PresentationError extends Error {
  constructor(
    public readonly code: PresentationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PresentationError';
  }
}

const NEEDS_PROOF = 'Für einen privaten Ausweis braucht die App eine Verbindung. Bitte versuche es online noch einmal.';
const EXPIRED = 'Dieser Ausweis ist abgelaufen.';
const FAILED = 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
const NO_NETWORK = 'Keine Verbindung. Bitte versuche es noch einmal.';

type PresentAccount = Pick<SigningAccount, 'address' | 'signMessage'>;

/**
 * Signs showMessage with the account (one signature; silent for a thirdweb account). The private
 * part goes along only for a private credential, and only with its proof: without one (device
 * cache) this throws NEEDS_PROOF before asking for a signature.
 */
export async function buildPresentation(account: PresentAccount, held: HeldCredential, nowSec: number, nonce: string): Promise<Presentation> {
  if (held.validUntil !== null && held.validUntil < nowSec) throw new PresentationError('EXPIRED', EXPIRED);
  let priv: Presentation['private'];
  if (held.visibility === 'private') {
    const c = held.claim;
    if (!c || !c.leaf || c.leaf.typeId.toLowerCase() !== held.typeId.toLowerCase()) throw new PresentationError('NEEDS_PROOF', NEEDS_PROOF);
    if (c.leaf.kind === 'claimKey' && !c.claimSignature) throw new PresentationError('NEEDS_PROOF', NEEDS_PROOF);
    priv = { batchId: c.batchId, leaf: c.leaf, proof: c.proof, claimSignature: c.claimSignature ?? null };
  }
  const base = {
    v: 1 as const,
    typeId: held.typeId,
    account: account.address.toLowerCase() as Address,
    issuedAtSec: nowSec,
    nonce,
  };
  const accountSignature = (await signQueued(account, showMessage(base))) as Hex;
  return priv ? { ...base, accountSignature, private: priv } : { ...base, accountSignature };
}

export type ShowDeps = {
  fetchMine: (a: SigningAccount) => Promise<ApiResult<InvitationView[]>>;
  create: (a: SigningAccount, p: Presentation) => Promise<ApiResult<PresentationCreated>>;
  nowSec: () => number;
};

const defaultDeps: ShowDeps = { fetchMine, create: createPresentation, nowSec: () => Math.floor(Date.now() / 1000) };

export type ShowResult = { ok: true; code: string; issuedAtSec: number; expiresAtSec: number } | { ok: false; message: string };

/** The proof for a cached private credential, from `mine`: the same invitation, else any accepted one of the type. */
async function withProof(account: SigningAccount, held: HeldCredential, d: ShowDeps): Promise<HeldCredential | null> {
  const res = await d.fetchMine(account);
  if (!res.ok) return null;
  const key = held.typeId.toLowerCase();
  const ofType = res.data.filter((i) => i.state === 'accepted' && i.type?.typeId?.toLowerCase() === key && i.claim);
  const inv = ofType.find((i) => i.id === held.invitationId) ?? ofType[ofType.length - 1];
  return inv ? { ...held, claim: inv.claim } : null;
}

const apiMessage = (res: { code: string; message: string }) =>
  res.code === 'NETWORK_ERROR'
    ? NO_NETWORK
    : typeof res.message === 'string' && res.message.length > 0 && !/0x[0-9a-fA-F]{6,}/.test(res.message)
      ? res.message
      : FAILED;

/** Build, sign and register a presentation; the code is valid until expiresAtSec. */
export async function showCredential(account: SigningAccount, held: HeldCredential, deps: ShowDeps = defaultDeps): Promise<ShowResult> {
  try {
    let h = held;
    if (h.visibility === 'private' && !h.claim) {
      const fresh = await withProof(account, h, deps);
      if (!fresh) return { ok: false, message: NEEDS_PROOF };
      h = fresh;
    }
    const nowSec = deps.nowSec();
    const presentation = await buildPresentation(account, h, nowSec, newNonce());
    const res = await deps.create(account, presentation);
    if (!res.ok) return { ok: false, message: apiMessage(res) };
    return { ok: true, code: res.data.code, issuedAtSec: nowSec, expiresAtSec: nowSec + SHOW_TTL_SECONDS };
  } catch (err) {
    if (err instanceof PresentationError) return { ok: false, message: err.message };
    return { ok: false, message: FAILED };
  }
}
