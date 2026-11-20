import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_ALPHABET, CODE_LENGTH, approveUrl, cleanDeviceName, formatCode, generateCode, hashPollToken,
  isPollToken, newPollToken, normalizeCode, pairingView,
} from "./pairing";

test("codes use the unambiguous alphabet and fixed length", () => {
  for (let i = 0; i < 200; i++) {
    const c = generateCode();
    assert.equal(c.length, CODE_LENGTH);
    for (const ch of c) assert.ok(CODE_ALPHABET.includes(ch));
  }
  assert.ok(!/[01OIL]/.test(CODE_ALPHABET));
});

test("normalizeCode accepts typed variants and rejects junk", () => {
  assert.equal(normalizeCode("abcd-efgh"), "ABCDEFGH");
  assert.equal(normalizeCode(" ABCD EFGH "), "ABCDEFGH");
  assert.equal(normalizeCode("ABCD-EFG0"), null);
  assert.equal(normalizeCode("ABC"), null);
  assert.equal(normalizeCode(42), null);
  assert.equal(formatCode("ABCDEFGH"), "ABCD-EFGH");
});

test("poll tokens are 32 random bytes and only their hash is kept", () => {
  const t = newPollToken();
  assert.ok(isPollToken(t));
  assert.notEqual(t, newPollToken());
  assert.match(hashPollToken(t), /^[0-9a-f]{64}$/);
  assert.equal(hashPollToken(t), hashPollToken(t));
  assert.ok(!isPollToken("short"));
});

test("device names are cleaned", () => {
  assert.equal(cleanDeviceName("  Max'   MacBook\n "), "Max' MacBook");
  assert.equal(cleanDeviceName(""), "Ortis Studio");
  assert.equal(cleanDeviceName(null), "Ortis Studio");
  assert.equal(cleanDeviceName("x".repeat(100)).length, 60);
});

test("pairingView expires pending and approved, never claimed", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  const future = "2026-11-12T12:05:00Z";
  const past = "2026-11-12T11:55:00Z";
  assert.equal(pairingView({ status: "pending", expires_at: future }, now), "pending");
  assert.equal(pairingView({ status: "approved", expires_at: future }, now), "approved");
  assert.equal(pairingView({ status: "approved", expires_at: past }, now), "expired");
  assert.equal(pairingView({ status: "claimed", expires_at: past }, now), "claimed");
});

test("approveUrl points at the confirmation page", () => {
  assert.equal(approveUrl("https://www.roebel.app/", "ABCDEFGH"), "https://www.roebel.app/studio/verbinden?code=ABCDEFGH");
});
