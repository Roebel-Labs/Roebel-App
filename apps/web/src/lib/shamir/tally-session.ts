/**
 * Browser-side helpers for the tally-time UI at
 * /admin/dashboard/coordinator/tally/[pollId].
 *
 * Lifecycle from the Attester's perspective:
 *   1. Page loads, fetches active session for pollId via /api/coordinator/sessions/[id].
 *   2. Verifies the session manifest signature recovers to MACI_INFRA.coordinator —
 *      this is the trust root that proves the session pubkey came from a real
 *      reconstructor we control, not an MITM.
 *   3. User signs SHARE_KEY_CHALLENGE, derives Curve25519, opens their sealed share.
 *   4. User signs a per-submission payload binding (sessionPubkey || shareIndex || wallet).
 *   5. We POST the decrypted share to the coordinator service over HTTPS.
 *
 * Server bridge: the coordinator service is at COORDINATOR_BASE_URL (from
 * maci-config.ts). We post directly from the browser — no Next.js proxy —
 * so the share bytes never touch our Vercel logs.
 */

import { verifyMessage } from "ethers";
import { COORDINATOR_BASE_URL, MACI_INFRA } from "@/lib/maci-config";
import {
  SHARE_KEY_CHALLENGE,
  base64ToBytes,
  bytesToBase64,
  deriveShareKeypairFromSignature,
  openSealedShare,
} from "@/lib/shamir/wallet-encryption";

const MANIFEST_DOMAIN = "Roebel DAO coordinator session manifest v1";
const SUBMISSION_DOMAIN = "Roebel DAO coordinator share submission v1";

export type SessionManifest = {
  sessionId: string;
  pollId: string;
  keyGenerationId: string;
  governorAddress: string;
  sessionPubkeyBase64: string;
  attesterAllowlist: string[];
  expiresAt: string;
};

export type SessionRow = {
  id: string;
  key_generation_id: string;
  governor_address: string;
  poll_id: string;
  reconstructor_session_pubkey: string; // bytea hex `\\x...`
  reconstructor_session_signature: string;
  expires_at: string;
  state: "open" | "completed" | "expired" | "aborted";
  submitted_shares_count: number;
  created_at: string;
  completed_at: string | null;
};

export type EncryptedShareRow = {
  walletAddress: string;
  shareIndex: number;
  encryptedShareBase64: string;
  keyGenerationId: string;
};

/**
 * Build the exact byte string the coordinator service signed when it minted
 * the session manifest. Must mirror lib/session-manifest.js#buildManifestPayload.
 */
function buildManifestPayload(m: SessionManifest): string {
  const ordered = {
    sessionId: m.sessionId,
    pollId: m.pollId,
    keyGenerationId: m.keyGenerationId,
    governorAddress: m.governorAddress.toLowerCase(),
    sessionPubkeyBase64: m.sessionPubkeyBase64,
    attesterAllowlist: [...m.attesterAllowlist].map((a) => a.toLowerCase()).sort(),
    expiresAt: m.expiresAt,
  };
  return `${MANIFEST_DOMAIN}\n${JSON.stringify(ordered)}`;
}

/**
 * Convert a Postgres bytea literal (`\x...`) into a Uint8Array.
 */
function pgByteaToBytes(value: string): Uint8Array {
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Verify the reconstructor session manifest was signed by the configured
 * coordinator EOA. Returns the parsed manifest if valid, throws otherwise.
 */
export function verifySessionManifest(session: SessionRow): SessionManifest {
  const sessionPubkeyBytes = pgByteaToBytes(session.reconstructor_session_pubkey);
  const sessionPubkeyBase64 = bytesToBase64(sessionPubkeyBytes);

  // Rebuild the manifest from the session row. We need the allowlist + key
  // generation id; in production the page will pass these in alongside the
  // session (fetched in one shot from /api/coordinator/sessions/[id]).
  // For now require the caller to provide them via the loose object below.
  // The manifest is reconstructed and verified by `verifySessionManifestFull`.
  throw new Error(
    "Use verifySessionManifestFull(session, allowlist, keyGenerationId, pollId)",
  );
}

export function verifySessionManifestFull(
  session: SessionRow,
  attesterAllowlist: string[],
): SessionManifest {
  const sessionPubkeyBytes = pgByteaToBytes(session.reconstructor_session_pubkey);
  const sessionPubkeyBase64 = bytesToBase64(sessionPubkeyBytes);

  const manifest: SessionManifest = {
    sessionId: session.id,
    pollId: session.poll_id,
    keyGenerationId: session.key_generation_id,
    governorAddress: session.governor_address,
    sessionPubkeyBase64,
    attesterAllowlist,
    expiresAt: session.expires_at,
  };

  const payload = buildManifestPayload(manifest);
  const recovered = verifyMessage(payload, session.reconstructor_session_signature);
  if (recovered.toLowerCase() !== MACI_INFRA.coordinator.toLowerCase()) {
    throw new Error(
      `manifest signature does not recover to coordinator: got ${recovered}`,
    );
  }
  return manifest;
}

/**
 * Decrypt this wallet's sealed share using their wallet-signed Curve25519 key.
 *
 * @param account thirdweb account ({ signMessage })
 * @param encryptedShareBase64 the row from coordinator_shares
 * @returns the raw share bytes ready to POST to the reconstructor
 */
export async function decryptShareForCurrentWallet(account: {
  signMessage: (args: { message: string }) => Promise<string>;
}, encryptedShareBase64: string): Promise<Uint8Array> {
  const signature = await account.signMessage({ message: SHARE_KEY_CHALLENGE });
  const kp = await deriveShareKeypairFromSignature(signature);
  return openSealedShare(base64ToBytes(encryptedShareBase64), kp.secretKey);
}

/**
 * Build + sign the submission payload binding (sessionPubkey || shareIndex || wallet).
 * This is what the reconstructor's verifySubmissionSignature checks against.
 */
export async function signSubmission(
  account: { address: string; signMessage: (args: { message: string }) => Promise<string> },
  manifest: SessionManifest,
  shareIndex: number,
): Promise<string> {
  const canonical = JSON.stringify({
    sessionPubkeyBase64: manifest.sessionPubkeyBase64,
    shareIndex,
    wallet: account.address.toLowerCase(),
  });
  const message = `${SUBMISSION_DOMAIN}\n${canonical}`;
  return account.signMessage({ message });
}

/**
 * Submit a decrypted share to the coordinator service.
 * Throws on non-200 response. Returns the server's {received, needed}.
 */
export async function submitShareToReconstructor(args: {
  manifest: SessionManifest;
  shareIndex: number;
  shareBytes: Uint8Array;
  walletAddress: string;
  submissionSignature: string;
}): Promise<{ received: number; needed: number }> {
  const url = `${COORDINATOR_BASE_URL}/sessions/${args.manifest.sessionId}/submissions`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionPubkeyBase64Returned: args.manifest.sessionPubkeyBase64,
      walletAddress: args.walletAddress,
      shareIndex: args.shareIndex,
      signature: args.submissionSignature,
      shareBytesBase64: bytesToBase64(args.shareBytes),
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      detail = JSON.parse(text).error ?? text;
    } catch {
      /* keep raw text */
    }
    throw new Error(`reconstructor rejected: ${res.status} ${detail}`);
  }
  return JSON.parse(text);
}
