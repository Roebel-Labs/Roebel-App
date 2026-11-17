// Showing a credential to someone else: the holder's phone signs a short-lived statement
// (showMessage), the server keeps it under a 12-character code for 300 s, and the checker's device
// resolves the code once. The server stores the code only as its SHA-256 and never adds the
// holder's name or picture: what the checker sees is what the holder chose to sign.
// present_create is app only; present_resolve also accepts a pairing session.
// Relative imports only: loaded by `npx tsx --test`.
import { createHash, randomInt } from "node:crypto";
import { leafHash, recoverClaimSigner, verifyProof } from "@netizen-labs/credential-registry";
import { isAddress, type Address, type Hex } from "viem";
import type { Fail, Result } from "./actions";
import type { Caller } from "./caller";
import type { InvitationView } from "./holder";
import type { CredentialStore } from "./store";
import { CODE_ALPHABET } from "../chat/pairing";

export const SHOW_SCOPE = "roebel-credential-show-v1";
export const SHOW_TTL_SECONDS = 300;
export const PRESENTATION_CODE_LENGTH = 12;

export function showMessage(p: { typeId: Hex; account: string; issuedAtSec: number; nonce: string }): string {
  return `${SHOW_SCOPE}:${p.typeId}:${p.account.toLowerCase()}:${p.issuedAtSec}:${p.nonce}`;
}

export type Presentation = {
  v: 1;
  typeId: Hex;
  account: Address;
  issuedAtSec: number;
  nonce: string;
  accountSignature: Hex;
  private?: { batchId: string; leaf: InvitationView["claim"]["leaf"]; proof: Hex[]; claimSignature: Hex | null };
};

export type PresentationDeps = {
  store: CredentialStore;
  /** The register the claim signatures of claim-key leaves are bound to (chain 100). */
  registry: Address;
  now: () => number;
  /** Defaults to verifyWalletSignature (EOA, ERC-1271/6492 smart accounts, passkey Safes). */
  verifySignature?: (wallet: string, message: string, signature: string) => Promise<boolean>;
};

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (status: number, code: string, message: string): Fail => ({ ok: false, status, code, message });
const bad = (message: string) => fail(400, "BAD_REQUEST", message);
const GONE = fail(404, "NOT_FOUND", "Dieser Code ist abgelaufen oder ungültig.");
const NOT_YOURS = fail(403, "FORBIDDEN", "Du kannst nur deinen eigenen Ausweis vorzeigen.");
const PROOF_INVALID = fail(400, "PROOF_INVALID", "Dieser Nachweis passt nicht zu deinem Konto.");
const PROOF_NOT_LIVE = fail(410, "PROOF_NOT_LIVE", "Dieser Ausweis ist nicht mehr gültig.");

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const HEX = /^0x[0-9a-fA-F]*$/;
const NONCE = /^[A-Za-z0-9_-]{8,64}$/;
const DECIMAL = /^\d{1,20}$/;
/** A presentation may be signed slightly ahead of the server clock, not more. */
const CLOCK_SKEW_SECONDS = 60;
const MAX_SIGNATURE_CHARS = 20_000;
const MAX_PROOF = 64;

const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");
const isHex = (v: unknown, max = MAX_SIGNATURE_CHARS): v is Hex => typeof v === "string" && v.length <= max && v.length >= 4 && HEX.test(v);

export function generatePresentationCode(rand: (max: number) => number = randomInt): string {
  let out = "";
  for (let i = 0; i < PRESENTATION_CODE_LENGTH; i++) out += CODE_ALPHABET[rand(CODE_ALPHABET.length)];
  return out;
}

export function normalizePresentationCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.toUpperCase().replace(/[\s-]/g, "");
  if (v.length !== PRESENTATION_CODE_LENGTH) return null;
  for (const ch of v) if (!CODE_ALPHABET.includes(ch)) return null;
  return v;
}

/** Rebuilds the presentation from known fields only (anything else the client sent is dropped). */
function parsePresentation(p: unknown): Presentation | string {
  if (!p || typeof p !== "object") return "presentation required";
  const r = p as Record<string, unknown>;
  if (r.v !== 1) return "v must be 1";
  if (typeof r.typeId !== "string" || !BYTES32.test(r.typeId)) return "typeId invalid";
  if (typeof r.account !== "string" || !isAddress(r.account, { strict: false })) return "account invalid";
  if (typeof r.issuedAtSec !== "number" || !Number.isSafeInteger(r.issuedAtSec) || r.issuedAtSec <= 0) return "issuedAtSec invalid";
  if (typeof r.nonce !== "string" || !NONCE.test(r.nonce)) return "nonce invalid";
  if (!isHex(r.accountSignature)) return "accountSignature invalid";
  const typeId = r.typeId.toLowerCase() as Hex;
  const out: Presentation = {
    v: 1,
    typeId,
    account: r.account.toLowerCase() as Address,
    issuedAtSec: r.issuedAtSec,
    nonce: r.nonce,
    accountSignature: r.accountSignature,
  };
  if (r.private !== undefined) {
    const q = r.private as Record<string, unknown> | null;
    if (!q || typeof q !== "object") return "private invalid";
    const leaf = q.leaf as Record<string, unknown> | null;
    if (typeof q.batchId !== "string" || !DECIMAL.test(q.batchId)) return "private.batchId invalid";
    if (!leaf || typeof leaf !== "object") return "private.leaf invalid";
    if (leaf.kind !== "account" && leaf.kind !== "claimKey") return "private.leaf.kind invalid";
    if (typeof leaf.typeId !== "string" || leaf.typeId.toLowerCase() !== typeId) return "private.leaf.typeId must match typeId";
    if (typeof leaf.subject !== "string" || !isAddress(leaf.subject, { strict: false })) return "private.leaf.subject invalid";
    if (typeof leaf.validUntil !== "string" || !DECIMAL.test(leaf.validUntil)) return "private.leaf.validUntil invalid";
    if (typeof leaf.salt !== "string" || !BYTES32.test(leaf.salt)) return "private.leaf.salt invalid";
    if (!Array.isArray(q.proof) || q.proof.length > MAX_PROOF || !q.proof.every((h) => typeof h === "string" && BYTES32.test(h))) return "private.proof invalid";
    if (q.claimSignature !== null && !isHex(q.claimSignature, 1_000)) return "private.claimSignature invalid";
    out.private = {
      batchId: q.batchId,
      leaf: {
        kind: leaf.kind,
        typeId,
        subject: leaf.subject.toLowerCase() as Address,
        validUntil: leaf.validUntil,
        salt: leaf.salt.toLowerCase() as Hex,
      },
      proof: (q.proof as string[]).map((h) => h.toLowerCase() as Hex),
      claimSignature: (q.claimSignature as Hex | null) ?? null,
    };
  }
  return out;
}

export async function createPresentation(d: PresentationDeps, c: Caller, p: Presentation): Promise<Result<{ code: string; expiresAt: string }>> {
  const parsed = parsePresentation(p);
  if (typeof parsed === "string") return bad(parsed);
  if (parsed.account !== c.wallet.toLowerCase()) return NOT_YOURS;
  const nowMs = d.now();
  const nowSec = Math.floor(nowMs / 1000);
  if (nowSec - parsed.issuedAtSec > SHOW_TTL_SECONDS || parsed.issuedAtSec - nowSec > CLOCK_SKEW_SECONDS) {
    return fail(400, "STALE", "Bitte zeige den Ausweis noch einmal neu vor.");
  }
  if (parsed.private) {
    const bad = await checkPrivatePart(d, parsed.private, parsed.account, nowMs);
    if (bad) return bad;
  }
  const code = generatePresentationCode();
  const expiresAt = new Date(nowMs + SHOW_TTL_SECONDS * 1000).toISOString();
  await d.store.putPresentation({ codeHash: sha256Hex(code), payload: parsed as unknown as Record<string, unknown>, expiresAt });
  return ok({ code, expiresAt });
}

/**
 * The private part is not covered by showMessage, so the server vouches for it here: the leaf must
 * belong to the presenter (account leaf: subject = presenter; claim-key leaf: a claim signature of
 * the one-time key for the presenter), the proof must lead to the mirrored root of an on-chain batch
 * of that type, its invitation must be accepted, and the mirror must not know the leaf as revoked or expired.
 */
async function checkPrivatePart(d: PresentationDeps, q: NonNullable<Presentation["private"]>, account: Address, nowMs: number): Promise<Fail | null> {
  const leaf = { kind: q.leaf.kind, typeId: q.leaf.typeId, subject: q.leaf.subject, validUntil: BigInt(q.leaf.validUntil), salt: q.leaf.salt };
  const hash = leafHash(leaf).toLowerCase() as Hex;
  if (leaf.kind === "account") {
    if (leaf.subject.toLowerCase() !== account.toLowerCase()) return PROOF_INVALID;
  } else {
    if (!q.claimSignature) return PROOF_INVALID;
    let signer: string;
    try {
      signer = await recoverClaimSigner({ chainId: 100, registry: d.registry, batchId: BigInt(q.batchId), leaf: hash, account, signature: q.claimSignature });
    } catch {
      return PROOF_INVALID;
    }
    if (signer.toLowerCase() !== leaf.subject.toLowerCase()) return PROOF_INVALID;
  }
  const batch = await d.store.getBatchByChainId(q.batchId);
  if (!batch || batch.typeId.toLowerCase() !== leaf.typeId) return PROOF_INVALID;
  if (!verifyProof(batch.root, hash, q.proof)) return PROOF_INVALID;
  if (batch.status === "revoked") return PROOF_NOT_LIVE;
  if (batch.status !== "onchain") return PROOF_INVALID;
  const [row] = await d.store.listInvitations({ batchId: batch.id, leafHash: hash });
  if (!row) return PROOF_INVALID;
  if (row.status === "revoked") return PROOF_NOT_LIVE;
  // Only an accepted invitation is a credential: a declined (or still open) one cannot be presented.
  if (row.status !== "accepted") return PROOF_INVALID;
  if (q.leaf.validUntil !== "0" && Number(q.leaf.validUntil) < Math.floor(nowMs / 1000)) return PROOF_NOT_LIVE;
  return null;
}

async function defaultVerify(wallet: string, message: string, signature: string): Promise<boolean> {
  const { verifyWalletSignature } = await import("../signed-request/signature");
  return verifyWalletSignature(wallet, message, signature);
}

export async function resolvePresentation(
  d: PresentationDeps,
  _c: Caller,
  p: { code: string },
): Promise<Result<{ presentation: Presentation; signatureValid: boolean; ageSeconds: number }>> {
  const code = normalizePresentationCode(p?.code);
  if (!code) return GONE;
  const codeHash = sha256Hex(code);
  const nowMs = d.now();
  const row = await d.store.getPresentation(codeHash, nowMs);
  if (!row) return GONE;
  const presentation = row.payload as unknown as Presentation;
  const ageSeconds = Math.floor(nowMs / 1000) - presentation.issuedAtSec;
  if (ageSeconds > SHOW_TTL_SECONDS) {
    await d.store.deletePresentation(codeHash);
    return GONE;
  }
  // Verify before taking the row: a verifier outage (throws) leaves the code usable for a retry.
  const signatureValid = await (d.verifySignature ?? defaultVerify)(presentation.account, showMessage(presentation), presentation.accountSignature);
  const taken = await d.store.takePresentation(codeHash, nowMs);
  if (!taken) return GONE;
  return ok({ presentation, signatureValid, ageSeconds: Math.max(0, ageSeconds) });
}
