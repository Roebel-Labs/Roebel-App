/**
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-budget.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GLOBAL_DAILY_WEI,
  DEFAULT_PER_KEY_DAILY_WEI,
  InMemorySponsorBudget,
  budgetFromEnv,
} from "../sponsor-budget";

const DAY = 86_400_000;

test("defaults: 0.01 xDAI per legacy account and 0.05 xDAI globally per day", () => {
  assert.equal(DEFAULT_PER_KEY_DAILY_WEI, 10n ** 16n);
  assert.equal(DEFAULT_GLOBAL_DAILY_WEI, 5n * 10n ** 16n);
});

test("per-key cap: reserves until the day's cap, then refuses", async () => {
  let now = 0;
  const b = new InMemorySponsorBudget({ perKeyDailyWei: 100n, globalDailyWei: 1000n, now: () => now });
  assert.equal(await b.reserve("a", 60n), true);
  assert.equal(await b.reserve("a", 40n), true);
  assert.equal(await b.reserve("a", 1n), false);
  // A refused reservation spends nothing: another key still has its full allowance.
  assert.equal(await b.reserve("b", 100n), true);
  // The next UTC day resets.
  now += DAY;
  assert.equal(await b.reserve("a", 100n), true);
});

test("keys are case-insensitive", async () => {
  const b = new InMemorySponsorBudget({ perKeyDailyWei: 100n, globalDailyWei: 1000n, now: () => 0 });
  assert.equal(await b.reserve("0xABCD", 100n), true);
  assert.equal(await b.reserve("0xabcd", 1n), false);
});

test("global cap applies across keys", async () => {
  const b = new InMemorySponsorBudget({ perKeyDailyWei: 100n, globalDailyWei: 150n, now: () => 0 });
  assert.equal(await b.reserve("a", 100n), true);
  assert.equal(await b.reserve("b", 60n), false);
  assert.equal(await b.reserve("b", 50n), true);
  assert.equal(await b.reserve("c", 1n), false);
});

test("a single cost over a cap is refused", async () => {
  const b = new InMemorySponsorBudget({ perKeyDailyWei: 100n, globalDailyWei: 1000n, now: () => 0 });
  assert.equal(await b.reserve("a", 101n), false);
  assert.equal(await b.reserve("a", 0n), true);
});

test("budgetFromEnv reads PASSKEY_SPONSOR_DAILY_WEI / PASSKEY_SPONSOR_GLOBAL_DAILY_WEI, defaults otherwise", async () => {
  const b = budgetFromEnv({ PASSKEY_SPONSOR_DAILY_WEI: "10", PASSKEY_SPONSOR_GLOBAL_DAILY_WEI: "15" }, () => 0);
  assert.equal(await b.reserve("a", 10n), true);
  assert.equal(await b.reserve("a", 1n), false);
  assert.equal(await b.reserve("b", 6n), false);
  const d = budgetFromEnv({}, () => 0);
  assert.equal(await d.reserve("a", DEFAULT_PER_KEY_DAILY_WEI), true);
  assert.equal(await d.reserve("a", 1n), false);
  // Garbage env falls back to the defaults (never "unlimited").
  const g = budgetFromEnv({ PASSKEY_SPONSOR_DAILY_WEI: "lots" }, () => 0);
  assert.equal(await g.reserve("a", DEFAULT_PER_KEY_DAILY_WEI + 1n), false);
});
