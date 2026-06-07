/**
 * Unit tests for wallet-derived share encryption. Runs under Jest /
 * Vitest when a test runner is added. Also covered end-to-end by
 * apps/web/scripts/verify-shamir.mjs.
 */

import nacl from "tweetnacl";

import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  deriveShareKeypairFromSignature,
  hexToBytes,
  openSealedShare,
  sealShareForRecipient,
} from "../wallet-encryption";

describe("wallet-encryption", () => {
  const fakeSignature =
    "0x" +
    "aa".repeat(32) +
    "bb".repeat(32) +
    "1c";

  test("derives a deterministic keypair from a signature", async () => {
    const kp1 = await deriveShareKeypairFromSignature(fakeSignature);
    const kp2 = await deriveShareKeypairFromSignature(fakeSignature);
    expect(bytesToHex(kp1.publicKey)).toBe(bytesToHex(kp2.publicKey));
    expect(bytesToHex(kp1.secretKey)).toBe(bytesToHex(kp2.secretKey));
    expect(kp1.publicKey).toHaveLength(nacl.box.publicKeyLength);
    expect(kp1.secretKey).toHaveLength(nacl.box.secretKeyLength);
  });

  test("different signatures yield different keypairs", async () => {
    const kpA = await deriveShareKeypairFromSignature(fakeSignature);
    const kpB = await deriveShareKeypairFromSignature(
      "0x" + "cc".repeat(64) + "1b"
    );
    expect(bytesToHex(kpA.publicKey)).not.toBe(bytesToHex(kpB.publicKey));
  });

  test("seal + open round-trips a payload", async () => {
    const recipient = await deriveShareKeypairFromSignature(fakeSignature);
    const plaintext = new TextEncoder().encode("any 32-byte secret would go here");

    const sealed = sealShareForRecipient(plaintext, recipient.publicKey);
    const opened = openSealedShare(sealed, recipient.secretKey);

    expect(Array.from(opened)).toEqual(Array.from(plaintext));
  });

  test("opening with the wrong secret key fails", async () => {
    const recipient = await deriveShareKeypairFromSignature(fakeSignature);
    const wrong = await deriveShareKeypairFromSignature(
      "0x" + "11".repeat(64) + "1c"
    );
    const plaintext = new TextEncoder().encode("hello shamir world");
    const sealed = sealShareForRecipient(plaintext, recipient.publicKey);
    expect(() => openSealedShare(sealed, wrong.secretKey)).toThrow();
  });

  test("tampered ciphertext fails to open", async () => {
    const recipient = await deriveShareKeypairFromSignature(fakeSignature);
    const plaintext = new TextEncoder().encode("integrity check payload");
    const sealed = sealShareForRecipient(plaintext, recipient.publicKey);
    // Flip a bit in the ciphertext region (skip past nonce + ephemeral pubkey).
    const tampered = new Uint8Array(sealed);
    tampered[tampered.length - 1] ^= 0x01;
    expect(() => openSealedShare(tampered, recipient.secretKey)).toThrow();
  });

  test("hex <-> bytes round-trip", () => {
    const hex = "00deadbeef01feedface";
    const bytes = hexToBytes(hex);
    expect(bytesToHex(bytes)).toBe(hex);
    expect(hexToBytes("0x" + hex)).toEqual(bytes);
  });

  test("base64 <-> bytes round-trip", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 254, 255]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});
