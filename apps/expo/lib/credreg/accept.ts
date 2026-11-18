/**
 * Accepting an Ausweis: the public/private choice.
 *
 * - public  → one sponsored `claim` on the app's own register (never a server-given address), wait
 *             for the receipt, then the server records `accept`.
 * - private → the server records `accept`; no transaction, nothing on chain.
 * - decline → the server records `decline`.
 *
 * `makePublic` claims a privately held credential later; the proof is fetched from `mine` (the
 * device cache holds none). `makePrivate` lives in ./visibility and is re-exported here.
 * Never logs and never returns a raw error: errors can carry addresses or call data.
 */
import { leafHash } from '@netizen-labs/credential-registry';
import type { Account } from 'thirdweb/wallets';
import type { Address, Hex } from 'viem';
import type { ApiResult, SigningAccount } from '@/lib/signed-request';
import { fetchMine, respondInvitation } from './api';
import { readHolding, readIsCitizen } from './chain';
import { chainLeaf, claimFor } from './claim-call';
import { credentialsConfigured } from './gate';
import { sendWithGuestClaim } from './guest';
import type { HeldCredential } from './held';
import type { InvitationView } from './types';
import { queueMiniAppSuggestion } from '@/lib/miniapp-suggestions';

export { makePrivate } from './visibility';

export type AcceptChoice = 'public' | 'private' | 'decline';
export type AcceptOptions = { canPublic: boolean; canPrivate: boolean; reason: 'office' | 'private_only' | 'free' };
/** `code: 'NOT_PUBLIC'`: the org keeps members private (now): offer private instead. */
export type AcceptResult = { ok: true } | { ok: false; message: string; code?: 'NOT_PUBLIC' };

type Send = (account: Account, calls: readonly { to: `0x${string}`; data: Hex }[]) => Promise<unknown>;

export type AcceptDeps = {
  send: Send;
  respond: (a: SigningAccount, invitationId: string, decision: 'accept' | 'decline') => Promise<ApiResult<null>>;
  fetchMine: (a: SigningAccount) => Promise<ApiResult<InvitationView[]>>;
  /** The account's on-chain holding of the type (batch + leaf hash). A failure counts as "not this one". */
  holding: (typeId: Hex, account: Address) => Promise<{ batchId: bigint; leaf: Hex } | null>;
  configured: () => boolean;
  nowSec: () => number;
};

const defaultDeps: AcceptDeps = {
  // A non-citizen's first public claim also self-claims Guest (retried without it on failure).
  send: (account, calls) =>
    sendWithGuestClaim(account, calls, { isCitizen: () => readIsCitizen(account.address as Address) }),
  respond: respondInvitation,
  fetchMine,
  holding: readHolding,
  configured: credentialsConfigured,
  nowSec: () => Math.floor(Date.now() / 1000),
};

const FAILED = 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
const EXPIRED = 'Dieser Ausweis ist abgelaufen.';
const REVOKED = 'Dieser Ausweis wurde zurückgezogen.';
const NOT_PUBLIC = 'Diese Organisation zeigt ihre Mitglieder nicht öffentlich.';
const OFFICE_PUBLIC = 'Ein Amt ist öffentlich.';
const LINK_AGAIN = 'Bitte öffne den Link zu diesem Ausweis noch einmal.';
const NO_NETWORK = 'Keine Verbindung. Bitte versuche es noch einmal.';
const NOW_PRIVATE =
  'Diese Organisation zeigt ihre Mitglieder nicht mehr öffentlich. Du kannst deine Mitgliedschaft privat annehmen.';
const OTHER_ACCOUNT = 'Dieser Ausweis gehört zu einem anderen Konto. Bitte melde dich mit dem richtigen Konto an.';

/** Which ways of accepting an invitation offers. */
export function acceptOptions(inv: InvitationView): AcceptOptions {
  if (inv.type.kind === 'role' && inv.type.recognised) return { canPublic: true, canPrivate: false, reason: 'office' };
  if (inv.type.publicClaimAllowed === false) return { canPublic: false, canPrivate: true, reason: 'private_only' };
  return { canPublic: true, canPrivate: true, reason: 'free' };
}

/** The server's messages are German and address-free; anything else becomes the generic line. */
function apiMessage(res: { code: string; message: string }): string {
  if (res.code === 'NETWORK_ERROR') return NO_NETWORK;
  if (typeof res.message === 'string' && res.message.length > 0 && !/0x[0-9a-fA-F]{6,}/.test(res.message)) return res.message;
  return FAILED;
}

function isExpiredAt(validUntilIso: string | null, nowSec: number): boolean {
  if (!validUntilIso) return false;
  const ms = Date.parse(validUntilIso);
  return Number.isFinite(ms) && Math.floor(ms / 1000) < nowSec;
}

/**
 * Is the on-chain holding already exactly this invitation (same batch, same leaf)? Only then is the
 * claim skipped: a claim on a type held from another batch or leaf is a renewal and must be sent.
 */
async function alreadyThisHolding(inv: InvitationView, account: Address, d: AcceptDeps): Promise<boolean> {
  const leaf = chainLeaf(inv);
  if (!leaf) return false;
  try {
    const h = await d.holding(inv.type.typeId, account);
    return !!h && h.batchId === BigInt(inv.claim.batchId) && h.leaf.toLowerCase() === leafHash(leaf).toLowerCase();
  } catch {
    return false;
  }
}

/** After a failed claim: has the org closed public membership meanwhile? Best effort. */
async function nowPrivateOnly(account: Account, inv: InvitationView, d: AcceptDeps): Promise<boolean> {
  try {
    const res = await d.fetchMine(account as unknown as SigningAccount);
    if (!res.ok) return false;
    const fresh = res.data.find((i) => i.id === inv.id);
    return !!fresh && !acceptOptions(fresh).canPublic;
  } catch {
    return false;
  }
}

async function claimOnChain(account: Account, inv: InvitationView, d: AcceptDeps): Promise<AcceptResult> {
  const me = account.address.toLowerCase();
  // An account leaf names its account: a claim from any other one can only revert.
  if (inv.claim?.leaf?.kind === 'account' && inv.claim.leaf.subject.toLowerCase() !== me) return { ok: false, message: OTHER_ACCOUNT };
  if (await alreadyThisHolding(inv, account.address as Address, d)) return { ok: true };
  const call = claimFor(inv);
  if (!call) return { ok: false, message: inv.claim?.leaf?.kind === 'claimKey' ? LINK_AGAIN : FAILED };
  try {
    await d.send(account, [call]);
    return { ok: true };
  } catch {
    if (await nowPrivateOnly(account, inv, d)) return { ok: false, message: NOW_PRIVATE, code: 'NOT_PUBLIC' };
    return { ok: false, message: FAILED };
  }
}

export async function acceptInvitation(
  account: Account,
  inv: InvitationView,
  choice: AcceptChoice,
  deps: Partial<AcceptDeps> = {},
): Promise<AcceptResult> {
  const d = { ...defaultDeps, ...deps };
  if (!d.configured()) return { ok: false, message: FAILED };
  if (inv.state === 'revoked') return { ok: false, message: REVOKED };
  const signer = account as unknown as SigningAccount;

  if (choice === 'decline') {
    const res = await d.respond(signer, inv.id, 'decline');
    return res.ok ? { ok: true } : { ok: false, message: apiMessage(res) };
  }

  if (isExpiredAt(inv.validUntil, d.nowSec())) return { ok: false, message: EXPIRED };
  const opts = acceptOptions(inv);
  if (choice === 'private' && !opts.canPrivate) return { ok: false, message: OFFICE_PUBLIC };
  if (choice === 'public' && !opts.canPublic) return { ok: false, message: NOT_PUBLIC };

  if (choice === 'public') {
    const claimed = await claimOnChain(account, inv, d);
    if (!claimed.ok) return claimed;
  }
  let res = await d.respond(signer, inv.id, 'accept');
  // After a successful claim the register already shows it: one more try to record it.
  if (!res.ok && choice === 'public') res = await d.respond(signer, inv.id, 'accept');
  if (!res.ok) return { ok: false, message: apiMessage(res) };
  // The org's mini app may be suggested on Erkunden once (device only, nothing sent).
  if (inv.org?.accountId) await queueMiniAppSuggestion(inv.org.accountId).catch(() => {});
  return { ok: true };
}

/**
 * A privately held credential becomes public: one `claim` with the invitation's leaf and proof
 * (and claim signature) fetched fresh from `mine`. Refused when the org keeps members private or
 * the credential expired.
 */
export async function makePublic(account: Account, held: HeldCredential, deps: Partial<AcceptDeps> = {}): Promise<AcceptResult> {
  const d = { ...defaultDeps, ...deps };
  if (!d.configured()) return { ok: false, message: FAILED };
  if (held.publicAllowed === false) return { ok: false, message: NOT_PUBLIC };
  if (held.validUntil !== null && held.validUntil < d.nowSec()) return { ok: false, message: EXPIRED };

  const res = await d.fetchMine(account as unknown as SigningAccount);
  if (!res.ok) return { ok: false, message: apiMessage(res) };
  const typeKey = held.typeId.toLowerCase();
  const candidates = res.data.filter((i) => i.state === 'accepted' && i.type.typeId.toLowerCase() === typeKey);
  const inv = candidates.find((i) => i.id === held.invitationId) ?? candidates.find((i) => !isExpiredAt(i.validUntil, d.nowSec()));
  if (!inv) return { ok: false, message: FAILED };
  if (isExpiredAt(inv.validUntil, d.nowSec())) return { ok: false, message: EXPIRED };
  if (!acceptOptions(inv).canPublic) return { ok: false, message: NOT_PUBLIC };
  return claimOnChain(account, inv, d);
}

// ── hand-off between the link screen and the accept screen ───────────────────
// The redeemed invitation is passed in memory (never in route params, never stored), so the
// accept screen does not have to ask the server again right after the link was opened.

let handoff: InvitationView | null = null;

export function rememberInvitation(inv: InvitationView): void {
  handoff = inv;
}

/** Non-destructive (a state initialiser may run twice); replaced by the next redeemed link. */
export function rememberedInvitation(id: string): InvitationView | null {
  return handoff && handoff.id === id ? handoff : null;
}

/** After an answer the remembered copy is stale. */
export function forgetInvitation(id: string): void {
  if (handoff && handoff.id === id) handoff = null;
}
