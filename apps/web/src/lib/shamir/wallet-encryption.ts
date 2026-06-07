/**
 * Wallet-derived share-encryption helpers.
 *
 * Each Attester's MACI coordinator-key share is encrypted to a Curve25519
 * keypair derived deterministically from their thirdweb wallet signature
 * over a fixed challenge string. The Curve25519 PRIVATE key never leaves
 * the browser; the PUBLIC key is published to Supabase so the founder's
 * key-generation ceremony can seal a share to it later.
 *
 * Determinism requirements:
 * - The challenge string is constant per environment (see SHARE_KEY_CHALLENGE).
 *   Re-deriving the same keypair across sessions requires the wallet to
 *   produce the same signature for the same message. thirdweb's inAppWallet
 *   uses an embedded EOA with RFC-6979 deterministic ECDSA — same input,
 *   same signature — so this holds.
 *
 * Cryptography choices:
 * - Curve25519 + xsalsa20-poly1305 via tweetnacl (already in apps/web deps).
 * - Sealed shares use the ephemeral-sender pattern:
 *     nonce(24) || ephemeralPubKey(32) || ciphertext
 *   This is equivalent to libsodium's crypto_box_seal but avoids a BLAKE2b
 *   dependency by using a per-share random nonce stored alongside.
 * - Curve25519 secret key derivation:
 *     secretKey = sha256("Roebel-Curve25519-share-key-v1" || signatureBytes)[:32]
 *   tweetnacl's box.keyPair.fromSecretKey accepts any 32 bytes as the
 *   clamped scalar; no HKDF needed for a single-purpose derivation.
 */

import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

/**
 * The exact string a wallet must sign to derive its share-encryption keypair.
 * NEVER change this without coordinating a re-registration of every Attester
 * — a change here invalidates every existing Curve25519 keypair on file.
 */
export const SHARE_KEY_CHALLENGE =
  "Roebel DAO — share-encryption key registration v1";

/**
 * Browser-friendly SHA-256 → 32 bytes.
 * Uses SubtleCrypto on the client side, falls back to node:crypto in Jest.
 */
async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto !== "undefined" &&
    "subtle" in globalThis.crypto
  ) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return new Uint8Array(digest);
  }
  // Test / node fallback. require() so webpack doesn't try to bundle node:crypto in the browser.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
  return new Uint8Array(nodeCrypto.createHash("sha256").update(bytes).digest());
}

/**
 * Convert a 0x-prefixed hex string (e.g. an ECDSA signature) to a Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error("hex string must have even length");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Concatenate a UTF-8 prefix and a byte array.
 */
function concatBytes(prefix: string, bytes: Uint8Array): Uint8Array {
  const prefixBytes = naclUtil.decodeUTF8(prefix);
  const out = new Uint8Array(prefixBytes.length + bytes.length);
  out.set(prefixBytes, 0);
  out.set(bytes, prefixBytes.length);
  return out;
}

export type ShareKeypair = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
};

/**
 * Derive a deterministic Curve25519 keypair from a wallet's signature over
 * SHARE_KEY_CHALLENGE. The same signature always yields the same keypair.
 */
export async function deriveShareKeypairFromSignature(
  signatureHex: string
): Promise<ShareKeypair> {
  const sigBytes = hexToBytes(signatureHex);
  const secretSeed = await sha256(
    concatBytes("Roebel-Curve25519-share-key-v1\0", sigBytes)
  );
  const kp = nacl.box.keyPair.fromSecretKey(secretSeed);
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

/**
 * Seal a plaintext share to a recipient's Curve25519 public key.
 *
 * Output layout: nonce(24) || ephemeralPubKey(32) || ciphertext
 * Total overhead vs. plaintext: 24 + 32 + 16 (poly1305 tag) = 72 bytes.
 *
 * Anyone can call this with just the recipient pubkey; only the recipient's
 * secret key can open the resulting ciphertext.
 */
export function sealShareForRecipient(
  plaintext: Uint8Array,
  recipientPubKey: Uint8Array
): Uint8Array {
  if (recipientPubKey.length !== nacl.box.publicKeyLength) {
    throw new Error(
      `recipientPubKey must be ${nacl.box.publicKeyLength} bytes`
    );
  }

  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ciphertext = nacl.box(
    plaintext,
    nonce,
    recipientPubKey,
    ephemeral.secretKey
  );

  const out = new Uint8Array(
    nonce.length + ephemeral.publicKey.length + ciphertext.length
  );
  out.set(nonce, 0);
  out.set(ephemeral.publicKey, nonce.length);
  out.set(ciphertext, nonce.length + ephemeral.publicKey.length);
  return out;
}

/**
 * Open a sealed share with the recipient's secret key. Throws on tamper /
 * wrong key / corrupted ciphertext.
 */
export function openSealedShare(
  sealed: Uint8Array,
  recipientSecretKey: Uint8Array
): Uint8Array {
  if (recipientSecretKey.length !== nacl.box.secretKeyLength) {
    throw new Error(
      `recipientSecretKey must be ${nacl.box.secretKeyLength} bytes`
    );
  }
  if (
    sealed.length < nacl.box.nonceLength + nacl.box.publicKeyLength + nacl.box.overheadLength
  ) {
    throw new Error("sealed payload too short");
  }

  const nonce = sealed.slice(0, nacl.box.nonceLength);
  const ephemeralPub = sealed.slice(
    nacl.box.nonceLength,
    nacl.box.nonceLength + nacl.box.publicKeyLength
  );
  const ciphertext = sealed.slice(
    nacl.box.nonceLength + nacl.box.publicKeyLength
  );

  const plaintext = nacl.box.open(
    ciphertext,
    nonce,
    ephemeralPub,
    recipientSecretKey
  );
  if (!plaintext) {
    throw new Error("decryption failed (tamper / wrong key)");
  }
  return plaintext;
}

/**
 * Encode bytes as a base64 string for transport (e.g. JSON payloads).
 */
export function bytesToBase64(bytes: Uint8Array): string {
  return naclUtil.encodeBase64(bytes);
}

/**
 * Decode a base64 string back to bytes.
 */
export function base64ToBytes(b64: string): Uint8Array {
  return naclUtil.decodeBase64(b64);
}

export { bytesToHex, hexToBytes };
