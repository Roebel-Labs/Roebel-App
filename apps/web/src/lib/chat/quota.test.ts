import { test } from "node:test";
import assert from "node:assert/strict";
import { DAILY_TOKEN_LIMITS, effectiveTier, quotaState, quotaWindowStart, sumTokens } from "./quota";

test("tier limits match the spec", () => {
  assert.deepEqual(DAILY_TOKEN_LIMITS, { free: 150_000, plus: 1_500_000, ultra: 6_000_000 });
});

test("sumTokens adds input + output and tolerates nulls", () => {
  assert.equal(sumTokens([{ input_tokens: 100, output_tokens: 50 }, { input_tokens: null, output_tokens: 7 }]), 157);
});

test("quotaState flags exceeded at the limit", () => {
  assert.deepEqual(quotaState(149_999, "free"), { used: 149_999, limit: 150_000, remaining: 1, exceeded: false });
  assert.equal(quotaState(150_000, "free").exceeded, true);
  assert.equal(quotaState(200_000, "free").remaining, 0);
  assert.equal(quotaState(200_000, "plus").exceeded, false);
});

test("effectiveTier falls back to free when missing or expired", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  assert.equal(effectiveTier(null, now), "free");
  assert.equal(effectiveTier({ tier: "ultra", expires_at: null }, now), "ultra");
  assert.equal(effectiveTier({ tier: "plus", expires_at: "2026-09-25T11:59:59Z" }, now), "free");
  assert.equal(effectiveTier({ tier: "bogus", expires_at: null }, now), "free");
});

test("quota window starts at midnight Europe/Berlin (summer + winter time)", () => {
  assert.equal(quotaWindowStart(new Date("2026-09-25T12:00:00Z")), "2026-09-24T22:00:00.000Z");
  assert.equal(quotaWindowStart(new Date("2026-09-24T22:30:00Z")), "2026-09-24T22:00:00.000Z");
  assert.equal(quotaWindowStart(new Date("2026-12-10T08:00:00Z")), "2026-12-09T23:00:00.000Z");
});
