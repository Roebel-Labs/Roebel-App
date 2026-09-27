/**
 * Passkey key backup (PREVIEW-ONLY): PRF-wrapped secrets per identity, so a NEW device can get
 * the MACI voting key, the Nostr key and the citizen-commitment salt back after sign-in with the
 * (synced) passkey. Store and verifier are injected; the Next routes only wire the real ones.
 *
 *   POST /api/passkey/key-backup/get  { identity, proof: { timestamp, signature } }
 *        proof = identity's signature over buildKeyBackupProofMessage({ action: 'read', ... })
 *        -> 200 { blobs: { maci?, nostr?, salt? } }   ({} = no backup)
 *   POST /api/passkey/key-backup/put  { identity, blobs: { maci?, nostr?, salt? }, replace?, proof }
 *        proof over { action: 'write', contentHash = sha256(keyBackupContent(blobs, replace)) }
 *        -> 200 { ok, stored: [slots] }
 *        409 { error: 'exists', slots } when a slot already holds a DIFFERENT blob and
 *        replace is not true (a new device must never silently overwrite the real key).
 *
 * Errors: 400 bad_request, 401 bad_proof | proof_expired, 409 exists,
 * 503 disabled | chain_unavailable | store_unavailable.
 *
 * "Only the owner can read": the proof must verify for `identity` under the account-signature
 * rule (Safe ERC-1271 / 6492, Safe-admin envelope of a legacy account, thirdweb admin). A
 * replayed proof only re-reads ciphertext or re-writes the SAME content (the content hash is
 * signed), so no replay store is kept. Logging: fixed strings + error names only.
 */
import { NextResponse } from "next/server";
import { isAddress, isHex, type Address, type Hex } from "viem";
import {
  KEY_BACKUP_BLOB_RE,
  KEY_BACKUP_SLOTS,
  buildKeyBackupProofMessage,
  isKeyBackupProofFresh,
  isKeyBackupSlot,
  keyBackupContentHash,
  type KeyBackupSlot,
} from "./key-backup-proof";
import type { KeyBackupStore } from "./key-backup-store";

const MAX_SIGNATURE_BYTES = 8192;

export type KeyBackupVerify = (input: { address: Address; message: string; signature: Hex }) => Promise<boolean>;

export type KeyBackupDeps = {
  enabled: boolean;
  store: KeyBackupStore | null;
  verify: KeyBackupVerify;
  nowSec: () => number;
};

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const err = (error: string, status: number, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);
const errName = (e: unknown) => (e instanceof Error ? e.name : typeof e);

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseIdentity(v: unknown): Address | null {
  return typeof v === "string" && isAddress(v, { strict: false }) ? (v.toLowerCase() as Address) : null;
}

function parseProof(v: unknown): { timestamp: number; signature: Hex } | null {
  if (!v || typeof v !== "object") return null;
  const { timestamp, signature } = v as Record<string, unknown>;
  if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp)) return null;
  if (typeof signature !== "string" || !isHex(signature, { strict: true }) || signature.length < 4) return null;
  if (signature.length % 2 !== 0 || (signature.length - 2) / 2 > MAX_SIGNATURE_BYTES) return null;
  return { timestamp, signature: signature as Hex };
}

function parseBlobs(v: unknown): Partial<Record<KeyBackupSlot, string>> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Partial<Record<KeyBackupSlot, string>> = {};
  for (const [k, blob] of Object.entries(v as Record<string, unknown>)) {
    if (!isKeyBackupSlot(k) || typeof blob !== "string" || !KEY_BACKUP_BLOB_RE.test(blob)) return null;
    out[k] = blob;
  }
  return Object.keys(out).length > 0 ? out : null;
}

async function checkProof(
  deps: KeyBackupDeps,
  identity: Address,
  proof: { timestamp: number; signature: Hex },
  message: string,
): Promise<NextResponse | null> {
  if (!isKeyBackupProofFresh(proof.timestamp, deps.nowSec())) return err("proof_expired", 401);
  try {
    if (!(await deps.verify({ address: identity, message, signature: proof.signature }))) return err("bad_proof", 401);
  } catch (e) {
    console.error("[passkey-key-backup] signature check failed:", errName(e));
    return err("chain_unavailable", 503);
  }
  return null;
}

export async function handleKeyBackupGet(req: Request, deps: KeyBackupDeps): Promise<NextResponse> {
  if (!deps.enabled) return err("disabled", 503);
  if (!deps.store) return err("store_unavailable", 503);
  const body = await readBody(req);
  const identity = parseIdentity(body?.identity);
  const proof = parseProof(body?.proof);
  if (!identity || !proof) return err("bad_request", 400);

  const bad = await checkProof(deps, identity, proof, buildKeyBackupProofMessage({ action: "read", identity, timestamp: proof.timestamp }));
  if (bad) return bad;
  try {
    return json({ blobs: await deps.store.get(identity) });
  } catch (e) {
    console.error("[passkey-key-backup] store failed:", errName(e));
    return err("store_unavailable", 503);
  }
}

export async function handleKeyBackupPut(req: Request, deps: KeyBackupDeps): Promise<NextResponse> {
  if (!deps.enabled) return err("disabled", 503);
  if (!deps.store) return err("store_unavailable", 503);
  const body = await readBody(req);
  const identity = parseIdentity(body?.identity);
  const proof = parseProof(body?.proof);
  const blobs = parseBlobs(body?.blobs);
  const replace = body?.replace === undefined ? false : body.replace;
  if (!identity || !proof || !blobs || typeof replace !== "boolean") return err("bad_request", 400);

  const message = buildKeyBackupProofMessage({
    action: "write",
    identity,
    timestamp: proof.timestamp,
    contentHash: keyBackupContentHash(blobs, replace),
  });
  const bad = await checkProof(deps, identity, proof, message);
  if (bad) return bad;

  try {
    if (!replace) {
      const existing = await deps.store.get(identity);
      const conflicts = KEY_BACKUP_SLOTS.filter((s) => blobs[s] !== undefined && existing[s] !== undefined && existing[s] !== blobs[s]);
      if (conflicts.length > 0) return err("exists", 409, { slots: conflicts });
    }
    await deps.store.put(identity, blobs);
  } catch (e) {
    console.error("[passkey-key-backup] store failed:", errName(e));
    return err("store_unavailable", 503);
  }
  return json({ ok: true, stored: KEY_BACKUP_SLOTS.filter((s) => blobs[s] !== undefined) });
}
