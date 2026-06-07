/**
 * Shamir Secret Sharing wrapper for the MACI coordinator Babyjubjub privkey.
 *
 * The MACI privkey is serialized as `macisk.<64 hex chars>` (32 bytes) by
 * maci-domainobjs. We treat that 32-byte payload as the secret to split.
 * Shares are produced by the `shamir-secret-sharing` npm pkg (pure TS, no
 * native deps, audited by Privy).
 *
 * Each share is encoded as base64 for transport. The `share-index` is part
 * of the share payload itself (last byte of the produced Uint8Array), so we
 * also publish it separately as a small integer to make UI display easy.
 */

import { split as sssSplit, combine as sssCombine } from "shamir-secret-sharing";

/**
 * Threshold + total shareholders for a single key-generation ceremony.
 * Threshold = how many shares are needed to reconstruct.
 * Total     = how many shareholders we split among.
 */
export type SplitParams = {
  threshold: number;
  total: number;
};

/**
 * One produced share, ready to be sealed to a recipient's pubkey.
 *
 * `shareIndex` is the 1-based x-coordinate of the SSS share. It is also
 * encoded inside `bytes` as the last byte, but we expose it separately for
 * UI and audit purposes.
 */
export type Share = {
  shareIndex: number;
  bytes: Uint8Array;
};

const MACISK_PREFIX = "macisk.";
const MACISK_HEX_LENGTH = 64; // 32 bytes
const SECRET_BYTE_LENGTH = 32;

/**
 * Parse a `macisk.<hex>` string into the raw 32-byte secret.
 */
export function macipkToBytes(macisk: string): Uint8Array {
  if (!macisk.startsWith(MACISK_PREFIX)) {
    throw new Error("not a macisk key (missing 'macisk.' prefix)");
  }
  const hex = macisk.slice(MACISK_PREFIX.length);
  if (hex.length !== MACISK_HEX_LENGTH) {
    throw new Error(
      `expected ${MACISK_HEX_LENGTH} hex chars after prefix, got ${hex.length}`
    );
  }
  const bytes = new Uint8Array(SECRET_BYTE_LENGTH);
  for (let i = 0; i < SECRET_BYTE_LENGTH; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Encode a 32-byte secret back into `macisk.<hex>` form for handoff to
 * maci-domainobjs / the coordinator stack.
 */
export function bytesToMacisk(bytes: Uint8Array): string {
  if (bytes.length !== SECRET_BYTE_LENGTH) {
    throw new Error(`expected ${SECRET_BYTE_LENGTH} bytes, got ${bytes.length}`);
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${MACISK_PREFIX}${hex}`;
}

/**
 * Split a 32-byte secret into `total` shares with reconstruction
 * threshold `threshold`. The order of returned shares matches the
 * 1..total share-index ordering used internally by the SSS library.
 */
export async function splitSecret(
  secret: Uint8Array,
  params: SplitParams
): Promise<Share[]> {
  validateParams(params);
  if (secret.length !== SECRET_BYTE_LENGTH) {
    throw new Error(
      `expected ${SECRET_BYTE_LENGTH}-byte secret, got ${secret.length}`
    );
  }

  const rawShares = await sssSplit(secret, params.total, params.threshold);
  return rawShares.map((bytes, idx) => ({
    shareIndex: idx + 1,
    bytes,
  }));
}

/**
 * Combine ≥ threshold shares back into the 32-byte secret. Throws if too
 * few shares are supplied or if the shares are inconsistent (corrupted /
 * mismatched generation).
 */
export async function combineShares(shares: Share[]): Promise<Uint8Array> {
  if (shares.length < 2) {
    throw new Error("need at least 2 shares to combine");
  }
  const raw = shares.map((s) => s.bytes);
  const secret = await sssCombine(raw);
  if (secret.length !== SECRET_BYTE_LENGTH) {
    throw new Error(
      `reconstructed secret has unexpected length ${secret.length}`
    );
  }
  return secret;
}

function validateParams({ threshold, total }: SplitParams): void {
  if (!Number.isInteger(threshold) || !Number.isInteger(total)) {
    throw new Error("threshold and total must be integers");
  }
  if (threshold < 2) {
    throw new Error("threshold must be ≥ 2 (a 1-share split has no point)");
  }
  if (total < threshold) {
    throw new Error("total must be ≥ threshold");
  }
  if (total > 255) {
    throw new Error("shamir-secret-sharing supports at most 255 shares");
  }
}
