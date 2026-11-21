/**
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-budget.test.ts
 */
import { reservationIdOf } from "../sponsor-budget";
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

test("defaults: 0.01 xDAI per legacy account and 0.25 xDAI globally per day (raised for M-2)", () => {
  assert.equal(DEFAULT_PER_KEY_DAILY_WEI, 10n ** 16n);
  assert.equal(DEFAULT_GLOBAL_DAILY_WEI, 25n * 10n ** 16n);
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

// ---- settle-able reservations (security review M-2) ----

const S = "0x00000000000000000000000000000000000000aa" as const;
const SKEY = `session:${S}`;
const rid = (n: bigint) => reservationIdOf(S, n);
const resv = (n: bigint, expiresAt = 1_000) => ({ keyCapWei: 1_000n, reservation: { id: rid(n), sender: S, nonce: n, expiresAt } });

test("settle gives back reserved - actual; the freed budget is usable again", async () => {
  const b = new InMemorySponsorBudget({ perKeyDailyWei: 10n, globalDailyWei: 1_000n, now: () => 0 });
  assert.equal(await b.reserve(SKEY, 600n, resv(1n)), true);
  assert.equal(await b.reserve(SKEY, 600n, resv(2n)), false, "key cap 1000 reached by reservations");
  assert.equal(await b.settle(rid(1n), 100n), "settled");
  assert.equal(await b.reserve(SKEY, 600n, resv(2n)), true, "700 <= 1000 after settling");
  assert.equal(await b.settle(rid(1n), 1n), "already_settled");
  assert.equal(await b.settle(rid(9n), 1n), "unknown");
});

test("settle never charges more than reserved; a negative amount counts as 0", async () => {
  const b = new InMemorySponsorBudget({ globalDailyWei: 1_000n, now: () => 0 });
  await b.reserve(SKEY, 300n, resv(1n));
  await b.settle(rid(1n), 10_000n);
  assert.equal(await b.reserve(SKEY, 700n, resv(2n)), true, "only 300 charged");
  assert.equal(await b.reserve(SKEY, 1n, resv(3n)), false);
  const c = new InMemorySponsorBudget({ globalDailyWei: 1_000n, now: () => 0 });
  await c.reserve(SKEY, 300n, resv(1n));
  await c.settle(rid(1n), -5n);
  assert.equal(await c.reserve(SKEY, 1_000n, resv(2n)), true);
});

test("one reservation per (sender, nonce): a repeat tops up to the larger prefund, never double-counts", async () => {
  const b = new InMemorySponsorBudget({ globalDailyWei: 1_000n, now: () => 0 });
  for (let i = 0; i < 10; i++) assert.equal(await b.reserve(SKEY, 400n, resv(1n)), true);
  assert.equal(await b.reserve(SKEY, 500n, resv(1n)), true, "top-up by 100");
  assert.equal(await b.reserve(SKEY, 500n, resv(2n)), true, "500 + 500 = 1000");
  assert.equal(await b.reserve(SKEY, 1n, resv(3n)), false);
});

test("a settled nonce cannot be reserved again; a released one can", async () => {
  const b = new InMemorySponsorBudget({ globalDailyWei: 1_000n, now: () => 0 });
  await b.reserve(SKEY, 100n, resv(1n));
  await b.settle(rid(1n), 50n);
  assert.equal(await b.reserve(SKEY, 100n, resv(1n)), false);
  await b.reserve(SKEY, 100n, resv(2n));
  assert.equal(await b.release(rid(2n)), true);
  assert.equal(await b.release(rid(2n)), false, "only open reservations release");
  assert.equal(await b.reserve(SKEY, 100n, resv(2n)), true);
});

test("release gives everything back; settle after a (mistaken) release charges again", async () => {
  const b = new InMemorySponsorBudget({ globalDailyWei: 1_000n, now: () => 0 });
  await b.reserve(SKEY, 900n, resv(1n));
  await b.release(rid(1n));
  assert.equal(await b.settle(rid(1n), 400n), "settled");
  assert.equal(await b.reserve(SKEY, 601n, resv(2n)), false, "400 charged again");
  assert.equal(await b.reserve(SKEY, 600n, resv(2n)), true);
});

test("expiredReservations: open ones past expiresAt only, oldest first, by key, bounded", async () => {
  const b = new InMemorySponsorBudget({ globalDailyWei: 10_000n, now: () => 0 });
  await b.reserve(SKEY, 1n, resv(1n, 300));
  await b.reserve(SKEY, 1n, resv(2n, 100));
  await b.reserve(SKEY, 1n, resv(3n, 900));
  await b.reserve(SKEY, 1n, resv(4n, 50));
  await b.settle(rid(4n), 1n);
  const e = await b.expiredReservations({ beforeSeconds: 500, limit: 10 });
  assert.deepEqual(e.map((r) => r.nonce), [2n, 1n]);
  assert.equal(e[0].sender, S);
  assert.equal((await b.expiredReservations({ beforeSeconds: 500, limit: 1 })).length, 1);
  assert.equal((await b.expiredReservations({ beforeSeconds: 500, budgetKey: "session:0x00000000000000000000000000000000000000bb", limit: 10 })).length, 0);
});

test("keyCapWei only for session:<address> keys (deny elsewhere)", async () => {
  const b = new InMemorySponsorBudget({ perKeyDailyWei: 10n, now: () => 0 });
  assert.equal(await b.reserve("0x00000000000000000000000000000000000000aa", 5n, { keyCapWei: 1_000n }), false);
  assert.equal(await b.reserve("grant:0x00000000000000000000000000000000000000aa", 5n, { keyCapWei: 1_000n }), false);
  assert.equal(await b.reserve(SKEY, 500n, { keyCapWei: 1_000n }), true, "own cap replaces the 10 wei store cap");
  assert.equal(await b.reserve(SKEY, 501n, { keyCapWei: 1_000n }), false);
});

test("an open reservation from an earlier UTC day is not topped up (refused), the day's counters reset", async () => {
  let now = 0;
  const b = new InMemorySponsorBudget({ globalDailyWei: 1_000n, now: () => now });
  await b.reserve(SKEY, 100n, resv(1n));
  now = DAY;
  assert.equal(await b.reserve(SKEY, 100n, resv(1n)), false);
  assert.equal(await b.settle(rid(1n), 10n), "settled", "settling yesterday's reservation is harmless");
  assert.equal(await b.reserve(SKEY, 1_000n, resv(2n)), true, "today's counters untouched");
});
