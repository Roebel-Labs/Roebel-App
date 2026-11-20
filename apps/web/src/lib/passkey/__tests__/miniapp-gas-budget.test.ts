/**
 * Gas budget per mini app (sponsor mode "miniapp"): the app's lifetime budget granted at
 * review, a per-person allowance per UTC day across all mini apps, and a daily total.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/miniapp-gas-budget.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MINIAPP_GLOBAL_DAILY_WEI,
  DEFAULT_MINIAPP_PER_PERSON_DAILY_WEI,
  InMemoryMiniAppGasBudget,
  MINIAPP_GAS_RESERVE_RPC,
  SupabaseMiniAppGasBudget,
  miniAppGasBudgetFromEnv,
} from "../miniapp-gas-budget";

const APP = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const APP2 = "3f2504e0-4f89-41d3-9a0c-0305e82c3302";
const P1 = "0x1111111111111111111111111111111111111111";
const P2 = "0x2222222222222222222222222222222222222222";
const P3 = "0x3333333333333333333333333333333333333333";
const DAY = 86_400_000;

test("defaults: 0.003 xDAI per person, 0.05 xDAI in total per day", () => {
  assert.equal(DEFAULT_MINIAPP_PER_PERSON_DAILY_WEI, 3n * 10n ** 15n);
  assert.equal(DEFAULT_MINIAPP_GLOBAL_DAILY_WEI, 5n * 10n ** 16n);
});

test("reserves against the app, the person and the day", async () => {
  const b = new InMemoryMiniAppGasBudget({ appBudgetWei: () => 10n, perPersonDailyWei: 6n, globalDailyWei: 100n });
  assert.equal(await b.reserve(APP, P1, 5n), "ok");
  assert.equal(await b.reserve(APP, P1, 2n), "person_budget");
  assert.equal(await b.reserve(APP, P2, 5n), "ok");
  assert.equal(await b.reserve(APP, P3, 1n), "app_budget");
});

test("the global daily total caps all apps together", async () => {
  const b = new InMemoryMiniAppGasBudget({ appBudgetWei: () => 100n, perPersonDailyWei: 100n, globalDailyWei: 8n });
  assert.equal(await b.reserve(APP, P1, 5n), "ok");
  assert.equal(await b.reserve(APP2, P2, 4n), "global_budget");
  assert.equal(await b.reserve(APP2, P2, 3n), "ok");
});

test("a refused reservation counts nothing", async () => {
  const b = new InMemoryMiniAppGasBudget({ appBudgetWei: () => 10n, perPersonDailyWei: 6n, globalDailyWei: 100n });
  assert.equal(await b.reserve(APP, P1, 7n), "person_budget");
  assert.equal(await b.reserve(APP, P1, 6n), "ok");
  assert.equal(await b.reserve(APP, P2, 11n), "app_budget");
  assert.equal(await b.reserve(APP, P2, 4n), "ok");
});

test("the person allowance resets on the next UTC day, the app budget does not", async () => {
  let now = 10 * DAY + 1000;
  const b = new InMemoryMiniAppGasBudget({ appBudgetWei: () => 10n, perPersonDailyWei: 6n, globalDailyWei: 100n, now: () => now });
  assert.equal(await b.reserve(APP, P1, 6n), "ok");
  assert.equal(await b.reserve(APP, P1, 1n), "person_budget");
  now += DAY;
  assert.equal(await b.reserve(APP, P1, 4n), "ok");
  assert.equal(await b.reserve(APP, P2, 1n), "app_budget");
});

test("an app without a budget is refused at once", async () => {
  const b = new InMemoryMiniAppGasBudget({ appBudgetWei: () => 0n });
  assert.equal(await b.reserve(APP, P1, 1n), "app_budget");
});

test("the person key is case-insensitive", async () => {
  const b = new InMemoryMiniAppGasBudget({ appBudgetWei: () => 100n, perPersonDailyWei: 6n, globalDailyWei: 100n });
  assert.equal(await b.reserve(APP, P1.toUpperCase().replace("0X", "0x"), 6n), "ok");
  assert.equal(await b.reserve(APP2, P1, 1n), "person_budget");
});

function fakeRpc(result: { data?: unknown; error?: unknown }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      async rpc(fn: string, args: Record<string, unknown>) {
        calls.push({ fn, args });
        return { data: result.data ?? null, error: result.error ?? null };
      },
    },
  };
}

test("the Supabase store calls the atomic RPC with decimal wei and the lowercased person", async () => {
  const { calls, client } = fakeRpc({ data: "ok" });
  const b = new SupabaseMiniAppGasBudget(client, { perPersonDailyWei: 6n, globalDailyWei: 100n });
  assert.equal(await b.reserve(APP, "0xABCDEF0000000000000000000000000000000001", 5n), "ok");
  assert.deepEqual(calls, [
    {
      fn: MINIAPP_GAS_RESERVE_RPC,
      args: {
        p_mini_app_id: APP,
        p_person: "0xabcdef0000000000000000000000000000000001",
        p_cost_wei: "5",
        p_person_cap_wei: "6",
        p_global_cap_wei: "100",
      },
    },
  ]);
});

test("the Supabase store passes the verdicts through, throws on errors and unknown answers", async () => {
  for (const v of ["app_budget", "person_budget", "global_budget"]) {
    assert.equal(await new SupabaseMiniAppGasBudget(fakeRpc({ data: v }).client).reserve(APP, P1, 1n), v);
  }
  await assert.rejects(new SupabaseMiniAppGasBudget(fakeRpc({ error: { code: "x" } }).client).reserve(APP, P1, 1n));
  await assert.rejects(new SupabaseMiniAppGasBudget(fakeRpc({ data: "maybe" }).client).reserve(APP, P1, 1n));
});

test("env: caps from MINIAPP_GAS_*, Supabase store when PASSKEY_SPONSOR_BUDGET_STORE=supabase", async () => {
  const { calls, client } = fakeRpc({ data: "ok" });
  const b = miniAppGasBudgetFromEnv(
    { PASSKEY_SPONSOR_BUDGET_STORE: "supabase", MINIAPP_GAS_PER_PERSON_DAILY_WEI: "7", MINIAPP_GAS_GLOBAL_DAILY_WEI: "bad" },
    () => client,
  );
  assert.ok(b instanceof SupabaseMiniAppGasBudget);
  await b.reserve(APP, P1, 1n);
  assert.equal(calls[0].args.p_person_cap_wei, "7");
  assert.equal(calls[0].args.p_global_cap_wei, DEFAULT_MINIAPP_GLOBAL_DAILY_WEI.toString());
  // In-memory without a store knows no app budget: everything is refused.
  const mem = miniAppGasBudgetFromEnv({}, () => client);
  assert.ok(mem instanceof InMemoryMiniAppGasBudget);
  assert.equal(await mem.reserve(APP, P1, 1n), "app_budget");
});
