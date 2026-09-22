import { test } from "node:test";
import assert from "node:assert/strict";
import { platformFeeCents } from "./stripe-connect";

test("fee = 2% + 10ct by default", () => {
  process.env.STRIPE_PLATFORM_FEE_BPS = "200";
  process.env.STRIPE_PLATFORM_FEE_FIXED_CENTS = "10";
  assert.equal(platformFeeCents(1000), 30);
  assert.equal(platformFeeCents(500), 20);
});
test("fee never reaches the amount and is 0 for free orders", () => {
  process.env.STRIPE_PLATFORM_FEE_BPS = "200";
  process.env.STRIPE_PLATFORM_FEE_FIXED_CENTS = "10";
  assert.equal(platformFeeCents(0), 0);
  assert.equal(platformFeeCents(5), 4);
});
test("fee can be switched off", () => {
  process.env.STRIPE_PLATFORM_FEE_BPS = "0";
  process.env.STRIPE_PLATFORM_FEE_FIXED_CENTS = "0";
  assert.equal(platformFeeCents(1000), 0);
});
