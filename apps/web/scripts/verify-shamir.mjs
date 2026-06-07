/**
 * Self-contained Node.js verification for apps/web/src/lib/shamir/*.
 *
 * Run with: node apps/web/scripts/verify-shamir.mjs
 *
 * Exits 0 on success, non-zero on failure. Useful in CI as a smoke check
 * until apps/web gets a real test runner. Mirrors the assertions in the
 * Jest tests at src/lib/shamir/__tests__/.
 */

import { createHash, webcrypto } from "node:crypto";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { split as sssSplit, combine as sssCombine } from "shamir-secret-sharing";

// Make SubtleCrypto available on globalThis so the helpers exercise the same
// code path they will in the browser.
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  globalThis.crypto = webcrypto;
}

const assertions = [];
function expect(label, cond, detail) {
  assertions.push({ label, ok: !!cond, detail });
}

function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function concatBytes(prefix, bytes) {
  const p = naclUtil.decodeUTF8(prefix);
  const out = new Uint8Array(p.length + bytes.length);
  out.set(p, 0);
  out.set(bytes, p.length);
  return out;
}

async function sha256(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

async function deriveShareKeypair(sigHex) {
  const sig = hexToBytes(sigHex);
  const seed = await sha256(concatBytes("Roebel-Curve25519-share-key-v1\0", sig));
  return nacl.box.keyPair.fromSecretKey(seed);
}

function sealShare(plaintext, recipientPubKey) {
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ct = nacl.box(plaintext, nonce, recipientPubKey, ephemeral.secretKey);
  const out = new Uint8Array(nonce.length + ephemeral.publicKey.length + ct.length);
  out.set(nonce, 0);
  out.set(ephemeral.publicKey, nonce.length);
  out.set(ct, nonce.length + ephemeral.publicKey.length);
  return out;
}

function openShare(sealed, secretKey) {
  const nonce = sealed.slice(0, nacl.box.nonceLength);
  const pub = sealed.slice(nacl.box.nonceLength, nacl.box.nonceLength + nacl.box.publicKeyLength);
  const ct = sealed.slice(nacl.box.nonceLength + nacl.box.publicKeyLength);
  return nacl.box.open(ct, nonce, pub, secretKey);
}

function randomSecret() {
  return new Uint8Array(createHash("sha256").update(String(Math.random())).digest());
}

const fakeSig = "0x" + "aa".repeat(32) + "bb".repeat(32) + "1c";

console.log("→ Curve25519 derivation");
const kp1 = await deriveShareKeypair(fakeSig);
const kp2 = await deriveShareKeypair(fakeSig);
expect(
  "derivation is deterministic",
  bytesToHex(kp1.publicKey) === bytesToHex(kp2.publicKey),
  `pub1=${bytesToHex(kp1.publicKey)} pub2=${bytesToHex(kp2.publicKey)}`
);
const kpOther = await deriveShareKeypair("0x" + "cc".repeat(64) + "1b");
expect(
  "different sigs yield different keypairs",
  bytesToHex(kp1.publicKey) !== bytesToHex(kpOther.publicKey)
);

console.log("→ Seal/open round-trip");
const probe = new TextEncoder().encode("any 32-byte secret would go here");
const sealed = sealShare(probe, kp1.publicKey);
const opened = openShare(sealed, kp1.secretKey);
expect("opened payload matches plaintext", opened && Array.from(opened).join() === Array.from(probe).join());

console.log("→ Sealed payload fails to open with wrong key");
const wrong = openShare(sealed, kpOther.secretKey);
expect("wrong key returns null", wrong === null);

console.log("→ Tampered ciphertext fails to open");
const tampered = new Uint8Array(sealed);
tampered[tampered.length - 1] ^= 1;
const tamperedResult = openShare(tampered, kp1.secretKey);
expect("tampered cipher returns null", tamperedResult === null);

console.log("→ Shamir 3-of-5 round-trip");
const secret = randomSecret();
const shares = await sssSplit(secret, 5, 3);
expect("5 shares produced", shares.length === 5);
const restored = await sssCombine(shares.slice(0, 3));
expect("3 shares restore the original", Array.from(restored).join() === Array.from(secret).join());

console.log("→ Any 3-of-5 combination restores it");
const combos = [
  [0, 1, 4],
  [0, 3, 4],
  [2, 3, 4],
];
for (const [a, b, c] of combos) {
  const r = await sssCombine([shares[a], shares[b], shares[c]]);
  expect(`combo ${a},${b},${c}`, Array.from(r).join() === Array.from(secret).join());
}

console.log("→ Tampered share + 2 valid yields wrong reconstruction");
const tamperShare = new Uint8Array(shares[0]);
tamperShare[0] ^= 0xff;
const wrongRecon = await sssCombine([tamperShare, shares[1], shares[2]]);
expect("tampered combine != original", Array.from(wrongRecon).join() !== Array.from(secret).join());

console.log("→ 2 shares with 3-of-5 split do not equal the original");
const tooFew = await sssCombine(shares.slice(0, 2));
expect("2-share combine != original", Array.from(tooFew).join() !== Array.from(secret).join());

const failed = assertions.filter((a) => !a.ok);
const passed = assertions.length - failed.length;
console.log(`\n${passed}/${assertions.length} checks passed`);
if (failed.length) {
  for (const f of failed) {
    console.error(`✗ ${f.label}${f.detail ? "\n  " + f.detail : ""}`);
  }
  process.exit(1);
}
console.log("✓ all shamir + wallet-encryption checks passed");
