/**
 * Supabase-backed sponsor budget (RPC passkey_sponsor_reserve) + the env switch.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/sponsor-budget-supabase.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_GLOBAL_DAILY_WEI,
  DEFAULT_PER_KEY_DAILY_WEI,
  InMemorySponsorBudget,
  SPONSOR_RESERVE_RPC,
  SupabaseSponsorBudget,
  budgetFromEnv,
} from "../sponsor-budget";

type Call = { fn: string; args: Record<string, unknown> };
function fakeRpc(result: { data?: unknown; error?: { code?: string } | null } | (() => never)) {
  const calls: Call[] = [];
  return {
    calls,
    client: {
      async rpc(fn: string, args: Record<string, unknown>) {
        calls.push({ fn, args });
        if (typeof result === "function") return result();
        return { data: result.data ?? null, error: result.error ?? null };
      },
    },
  };
}

test("reserve calls the atomic RPC with decimal-string wei and the lowercased key", async () => {
  const { calls, client } = fakeRpc({ data: true });
  const b = new SupabaseSponsorBudget(client, { perKeyDailyWei: 100n, globalDailyWei: 1000n });
  assert.equal(await b.reserve("0xABCDEF0000000000000000000000000000000001", 60n), true);
  assert.deepEqual(calls, [
    {
      fn: SPONSOR_RESERVE_RPC,
      args: {
        p_budget_key: "0xabcdef0000000000000000000000000000000001",
        p_cost_wei: "60",
        p_key_cap_wei: "100",
        p_global_cap_wei: "1000",
      },
    },
  ]);
});

test("the RPC answering false = refused; anything but true = refused", async () => {
  for (const data of [false, null, "true", 1]) {
    const { client } = fakeRpc({ data });
    const b = new SupabaseSponsorBudget(client);
    assert.equal(await b.reserve("0x0000000000000000000000000000000000000001", 1n), false, String(data));
  }
});

test("an RPC error throws (the handler fails closed with 503)", async () => {
  const { client } = fakeRpc({ error: { code: "42883" } });
  await assert.rejects(new SupabaseSponsorBudget(client).reserve("0x0000000000000000000000000000000000000001", 1n));
  const boom = fakeRpc(() => {
    throw new Error("fetch failed");
  });
  await assert.rejects(new SupabaseSponsorBudget(boom.client).reserve("0x0000000000000000000000000000000000000001", 1n));
});

test("negative cost is refused without a round trip", async () => {
  const { calls, client } = fakeRpc({ data: true });
  assert.equal(await new SupabaseSponsorBudget(client).reserve("0x0000000000000000000000000000000000000001", -1n), false);
  assert.equal(calls.length, 0);
});

test("a per-call tighter key cap (non-citizen tier) is passed as min(cap, default)", async () => {
  const { calls, client } = fakeRpc({ data: true });
  const b = new SupabaseSponsorBudget(client, { perKeyDailyWei: 100n, globalDailyWei: 1000n });
  await b.reserve("0x0000000000000000000000000000000000000001", 1n, { perKeyDailyWei: 10n });
  await b.reserve("0x0000000000000000000000000000000000000001", 1n, { perKeyDailyWei: 500n });
  assert.equal(calls[0].args.p_key_cap_wei, "10");
  assert.equal(calls[1].args.p_key_cap_wei, "100");
});

test("in-memory budget honours the tighter per-call cap too", async () => {
  const b = new InMemorySponsorBudget({ perKeyDailyWei: 100n, globalDailyWei: 1000n, now: () => 0 });
  assert.equal(await b.reserve("a", 10n, { perKeyDailyWei: 10n }), true);
  assert.equal(await b.reserve("a", 1n, { perKeyDailyWei: 10n }), false);
  // The ordinary cap still applies to the same key without the tier limit.
  assert.equal(await b.reserve("a", 90n), true);
});

test("budgetFromEnv: PASSKEY_SPONSOR_BUDGET_STORE=supabase with a client = Supabase, else in-memory", async () => {
  const { calls, client } = fakeRpc({ data: true });
  const s = budgetFromEnv({ PASSKEY_SPONSOR_BUDGET_STORE: "supabase", PASSKEY_SPONSOR_DAILY_WEI: "7" }, undefined, () => client);
  assert.ok(s instanceof SupabaseSponsorBudget);
  await s.reserve("0x0000000000000000000000000000000000000001", 1n);
  assert.equal(calls[0].args.p_key_cap_wei, "7");
  assert.equal(calls[0].args.p_global_cap_wei, DEFAULT_GLOBAL_DAILY_WEI.toString());
  assert.ok(budgetFromEnv({}, undefined, () => client) instanceof InMemorySponsorBudget);
  assert.ok(budgetFromEnv({ PASSKEY_SPONSOR_BUDGET_STORE: "memory" }, undefined, () => client) instanceof InMemorySponsorBudget);
  // Asked for supabase but no client can be built (missing env): fall back to in-memory, never unlimited.
  const m = budgetFromEnv({ PASSKEY_SPONSOR_BUDGET_STORE: "supabase" }, () => 0, () => null);
  assert.ok(m instanceof InMemorySponsorBudget);
  assert.equal(await m.reserve("a", DEFAULT_PER_KEY_DAILY_WEI + 1n), false);
});

// ---- the migration file (not applied; checked textually) ----

const SQL = readFileSync(
  join(process.cwd(), "../../supabase/migrations/20260927_passkey_sponsor_budget.sql"),
  "utf8",
).toLowerCase();

test("migration: RLS on, no policies, grants revoked from anon/authenticated", () => {
  assert.match(SQL, /alter table public\.passkey_sponsor_budget\s+enable row level security/);
  assert.doesNotMatch(SQL, /create policy/);
  assert.match(SQL, /revoke all on table public\.passkey_sponsor_budget\s+from public, anon, authenticated/);
});

test("migration: reserve function is security definer, pinned search_path, EXECUTE revoked from anon/authenticated", () => {
  assert.match(SQL, /create or replace function public\.passkey_sponsor_reserve\(/);
  assert.match(SQL, /security definer/);
  assert.match(SQL, /set search_path = ''/);
  assert.match(
    SQL,
    /revoke all on function public\.passkey_sponsor_reserve\(text, numeric, numeric, numeric\)\s+from public, anon, authenticated/,
  );
  assert.match(SQL, /grant execute on function public\.passkey_sponsor_reserve\(text, numeric, numeric, numeric\)\s+to service_role/);
  // Row locks make the check-and-add atomic across concurrent serverless instances.
  assert.match(SQL, /for update/);
});
