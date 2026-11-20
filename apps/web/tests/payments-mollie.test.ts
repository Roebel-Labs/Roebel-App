import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { clampMollieApplicationFee, platformFeeCents } from "../src/lib/payments/fees";
import { decryptSecret, encryptSecret, signState, verifyState } from "../src/lib/payments/secrets";

process.env.PAYMENT_TOKEN_KEY = randomBytes(32).toString("base64");

test("platform fee prefers PLATFORM_FEE_* and falls back to STRIPE_PLATFORM_FEE_*", () => {
  delete process.env.PLATFORM_FEE_BPS;
  delete process.env.PLATFORM_FEE_FIXED_CENTS;
  process.env.STRIPE_PLATFORM_FEE_BPS = "200";
  process.env.STRIPE_PLATFORM_FEE_FIXED_CENTS = "10";
  assert.equal(platformFeeCents(1000), 30);
  process.env.PLATFORM_FEE_BPS = "100";
  process.env.PLATFORM_FEE_FIXED_CENTS = "0";
  assert.equal(platformFeeCents(1000), 10);
  delete process.env.PLATFORM_FEE_BPS;
  delete process.env.PLATFORM_FEE_FIXED_CENTS;
});

test("Mollie fee is clamped to amount − (35 ct + 6 %), never negative", () => {
  assert.equal(clampMollieApplicationFee(30, 1000), 30); // cap 1000-35-60 = 905
  assert.equal(clampMollieApplicationFee(30, 50), 12); // cap 50-35-3 = 12
  assert.equal(clampMollieApplicationFee(30, 30), 0); // cap negative → 0
  assert.equal(clampMollieApplicationFee(30, 0), 0);
});

test("refresh tokens round-trip through AES-256-GCM and tampering fails", () => {
  const enc = encryptSecret("refresh_abc");
  assert.notEqual(enc, "refresh_abc");
  assert.equal(decryptSecret(enc), "refresh_abc");
  const parts = enc.split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decryptSecret(parts.join(".")));
});

test("OAuth state binds account + wallet and rejects forgery and expiry", () => {
  const s = signState("acc-1", "0xABC", 60);
  assert.deepEqual({ ...verifyState(s), exp: 0 }, { accountId: "acc-1", wallet: "0xabc", exp: 0 });
  const [body] = s.split(".");
  assert.equal(verifyState(`${body}.AAAA`), null);
  assert.equal(verifyState(signState("acc-1", "0xabc", -10)), null);
});
