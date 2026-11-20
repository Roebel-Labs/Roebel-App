/**
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-budget.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GLOBAL_DAILY_WEI,
  DEFAULT_GUEST_GLOBAL_DAILY_WEI,
  DEFAULT_PER_KEY_DAILY_WEI,
  GUEST_GROUP_KEY,
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

// ---- the global guest cap (one shared daily total for every guest Safe) ----

test("guest cap defaults: group key 'guests', 0.02 xDAI per UTC day", () => {
  assert.equal(GUEST_GROUP_KEY, "guests");
  assert.equal(DEFAULT_GUEST_GLOBAL_DAILY_WEI, 2n * 10n ** 16n);
});

test("guest cap: guests share one daily total, citizens are not touched by it", async () => {
  const b = new InMemorySponsorBudget({ perKeyDailyWei: 1000n, globalDailyWei: 10_000n });
  const guest = { perKeyDailyWei: 100n, group: { key: "guests", dailyWei: 150n } };
  assert.equal(await b.reserve("0xa", 100n, guest), true);
  assert.equal(await b.reserve("0xb", 100n, guest), false); // group would reach 200 > 150
  assert.equal(await b.reserve("0xb", 50n, guest), true);
  assert.equal(await b.reserve("0xc", 1n, guest), false);   // guests are full
  assert.equal(await b.reserve("0xd", 900n), true);         // a citizen still passes
});

test("a refused guest reservation counts nowhere", async () => {
  const b = new InMemorySponsorBudget({ perKeyDailyWei: 1000n, globalDailyWei: 120n });
  assert.equal(await b.reserve("0xa", 130n, { group: { key: "guests", dailyWei: 500n } }), false);
  assert.equal(await b.reserve("0xa", 120n, { group: { key: "guests", dailyWei: 500n } }), true);
});

test("a guest refused by its own key cap leaves the group total untouched", async () => {
  const b = new InMemorySponsorBudget({ perKeyDailyWei: 1000n, globalDailyWei: 10_000n, now: () => 0 });
  const guest = { perKeyDailyWei: 100n, group: { key: "guests", dailyWei: 150n } };
  assert.equal(await b.reserve("0xa", 101n, guest), false); // over the key cap
  assert.equal(await b.reserve("0xb", 100n, guest), true);
  assert.equal(await b.reserve("0xc", 50n, guest), true);   // the refused 101 was never counted
});

test("the guest total resets with the UTC day", async () => {
  let now = 0;
  const b = new InMemorySponsorBudget({ perKeyDailyWei: 1000n, globalDailyWei: 10_000n, now: () => now });
  const guest = { group: { key: "guests", dailyWei: 100n } };
  assert.equal(await b.reserve("0xa", 100n, guest), true);
  assert.equal(await b.reserve("0xb", 1n, guest), false);
  now += DAY;
  assert.equal(await b.reserve("0xb", 100n, guest), true);
});
