/**
 * Checking a shown credential (the checker's phone). Pure: every chain read, the metadata fetch and
 * the claim-signature recovery come in as deps, the registry address is the app's own.
 *
 * Replay protection: the server keeps a code for 300 s and hands it out once, but a photographed
 * QR code could still be resolved by someone else. So a presentation older than 300 s, or one whose
 * account signature the server could not verify, is "Nicht gültig" before anything is read.
 * The server is not trusted alone: this phone checks the account signature itself
 * (deps.verifySignature, the server's one rule) and the age against its own clock.
 *
 * Title and organisation come from the type's metadata URI as read from chain, never from the
 * presentation: a presenter cannot rename what they show. Chain read failures, a failed signature
 * check and missing metadata for a valid credential throw; the screen shows "Nicht geprüft"
 * instead of a false "Nicht gültig".
 */
import { leafHash, type CredentialRegistryReader, type Leaf, type recoverClaimSigner } from '@netizen-labs/credential-registry';
import type { Address, Hex } from 'viem';
import type { fetchTypeMetadata } from './chain';
import { SHOW_TTL_SECONDS, showMessage } from './show-code';
import type { Presentation } from './types';

/** Local clock: a presentation may be this much older than the server's TTL (clock and transit slack)… */
export const LOCAL_MAX_AGE_SECONDS = 360;
/** …and signed at most this far in this phone's future. */
export const LOCAL_MAX_SKEW_SECONDS = 60;

export class CheckUnavailableError extends Error {
  constructor(message = 'check unavailable') {
    super(message);
    this.name = 'CheckUnavailableError';
  }
}

/** validUntil: unix seconds; null = no expiry. */
export type CheckResult =
  | { result: 'valid'; title: string; orgName: string | null; recognised: boolean; validUntil: number | null }
  | { result: 'expired' | 'revoked' | 'invalid'; title: string | null; orgName: string | null };

export type VerifyDeps = {
  reader: Pick<CredentialRegistryReader, 'holds' | 'checkLeaf' | 'getType'>;
  recoverClaimSigner: typeof recoverClaimSigner;
  metadata: typeof fetchTypeMetadata;
  registry: Address;
  /** Universal account-signature check on Gnosis (EOA, ERC-1271, ERC-6492, passkey Safe). Throws on RPC failure. */
  verifySignature: (address: string, message: string, signature: string) => Promise<boolean>;
  /** On-chain holding of a public credential (its validUntil, 0 = none). Throws on RPC failure. */
  holding: (typeId: Hex, account: Address) => Promise<{ validUntil: bigint }>;
  nowSec: () => number;
};

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL = /^\d{1,20}$/;
const lc = (s: string) => s.toLowerCase();

const INVALID: CheckResult = { result: 'invalid', title: null, orgName: null };

/** The type as the register describes it. null = unknown type. */
async function describe(typeId: Hex, d: VerifyDeps): Promise<{ title: string | null; orgName: string | null; recognised: boolean } | null> {
  const type = await d.reader.getType(typeId);
  if (!type) return null;
  const meta = await d.metadata(type.config.metadataURI);
  return {
    title: meta?.name ?? null,
    orgName: meta?.properties.organisation ?? null,
    recognised: type.recognised === true && type.kind === 'role',
  };
}

function toLeaf(l: NonNullable<Presentation['private']>['leaf']): Leaf | null {
  if (!l || (l.kind !== 'account' && l.kind !== 'claimKey')) return null;
  if (typeof l.typeId !== 'string' || !BYTES32.test(l.typeId)) return null;
  if (typeof l.subject !== 'string' || !ADDRESS.test(l.subject)) return null;
  if (typeof l.salt !== 'string' || !BYTES32.test(l.salt)) return null;
  if (typeof l.validUntil !== 'string' || !DECIMAL.test(l.validUntil)) return null;
  return { kind: l.kind, typeId: l.typeId, subject: l.subject, validUntil: BigInt(l.validUntil), salt: l.salt };
}

/** Does the private leaf belong to the presenting account? Mirrors the server's checkPrivatePart. */
async function boundToPresenter(
  q: NonNullable<Presentation['private']>,
  leaf: Leaf,
  batchId: bigint,
  account: Address,
  boundTo: Address | null,
  d: VerifyDeps,
): Promise<boolean> {
  if (leaf.kind === 'account') return lc(leaf.subject) === lc(account);
  if (boundTo) return lc(boundTo) === lc(account);
  if (typeof q.claimSignature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(q.claimSignature)) return false;
  try {
    const signer = await d.recoverClaimSigner({
      chainId: 100,
      registry: d.registry,
      batchId,
      leaf: leafHash(leaf),
      account,
      signature: q.claimSignature,
    });
    return lc(signer) === lc(leaf.subject);
  } catch {
    return false;
  }
}

export async function verifyPresentation(
  r: { presentation: Presentation; signatureValid: boolean; ageSeconds: number },
  deps: VerifyDeps,
): Promise<CheckResult> {
  const p = r.presentation;
  // 1. Replay / forgery: nothing is read for a stale or unsigned presentation.
  if (r.signatureValid !== true) return INVALID;
  if (typeof r.ageSeconds !== 'number' || !Number.isFinite(r.ageSeconds) || r.ageSeconds > SHOW_TTL_SECONDS) return INVALID;
  if (!p || p.v !== 1 || typeof p.typeId !== 'string' || !BYTES32.test(p.typeId)) return INVALID;
  if (typeof p.account !== 'string' || !ADDRESS.test(p.account)) return INVALID;
  if (typeof p.issuedAtSec !== 'number' || !Number.isSafeInteger(p.issuedAtSec)) return INVALID;
  if (typeof p.nonce !== 'string' || typeof p.accountSignature !== 'string') return INVALID;
  const localNow = deps.nowSec();
  if (localNow - p.issuedAtSec > LOCAL_MAX_AGE_SECONDS || p.issuedAtSec - localNow > LOCAL_MAX_SKEW_SECONDS) return INVALID;
  const typeId = lc(p.typeId) as Hex;
  const account = lc(p.account) as Address;

  // 2. Private: the leaf must be for the type it claims (checked before any read).
  let priv: { q: NonNullable<Presentation['private']>; leaf: Leaf; batchId: bigint } | null = null;
  if (p.private !== undefined && p.private !== null) {
    const q = p.private;
    const leaf = toLeaf(q.leaf);
    if (!leaf || lc(leaf.typeId) !== typeId) return INVALID;
    if (typeof q.batchId !== 'string' || !DECIMAL.test(q.batchId)) return INVALID;
    if (!Array.isArray(q.proof) || !q.proof.every((h) => typeof h === 'string' && BYTES32.test(h))) return INVALID;
    priv = { q, leaf, batchId: BigInt(q.batchId) };
  }

  // 3. The account signed exactly this statement (this phone checks it, not only the server).
  if (!(await deps.verifySignature(account, showMessage(p), p.accountSignature))) return INVALID;

  const info = await describe(typeId, deps);
  if (!info) return INVALID;
  const named = { title: info.title, orgName: info.orgName };

  // 4a. Public: the register says whether the account holds the type now (expiry-aware).
  if (!priv) {
    if (!(await deps.reader.holds(typeId, account))) return { result: 'invalid', ...named };
    if (!info.title) throw new CheckUnavailableError('metadata unavailable');
    const { validUntil } = await deps.holding(typeId, account);
    const until = BigInt(validUntil) === 0n ? null : Number(validUntil);
    return { result: 'valid', title: info.title, orgName: info.orgName, recognised: info.recognised, validUntil: until };
  }

  // 4b. Private: the leaf is in a live batch of the register, and it belongs to the presenter.
  const { status, boundTo } = await deps.reader.checkLeaf(priv.batchId, priv.leaf, priv.q.proof);
  if (status === 'expired') return { result: 'expired', ...named };
  if (status === 'revoked') return { result: 'revoked', ...named };
  if (status !== 'valid') return { result: 'invalid', ...named };
  if (!(await boundToPresenter(priv.q, priv.leaf, priv.batchId, account, boundTo, deps))) return { result: 'invalid', ...named };
  if (!info.title) throw new CheckUnavailableError('metadata unavailable');
  const until = priv.leaf.validUntil === 0n ? null : Number(priv.leaf.validUntil);
  return { result: 'valid', title: info.title, orgName: info.orgName, recognised: info.recognised, validUntil: until };
}
