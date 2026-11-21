/**
 * Supabase-backed sponsor budget (RPC passkey_sponsor_reserve_v2) + the env switch.
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
  GUEST_GROUP_KEY,
  SPONSOR_EXPIRED_RPC,
  SPONSOR_RELEASE_RPC,
  SPONSOR_RESERVE_RPC,
  SPONSOR_RESERVE_V3_RPC,
  SPONSOR_SETTLE_RPC,
  SupabaseSponsorBudget,
  reservationIdOf,
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
        p_group_key: null,
        p_group_cap_wei: null,
      },
    },
  ]);
});

test("the RPC is passkey_sponsor_reserve_v2", () => {
  assert.equal(SPONSOR_RESERVE_RPC, "passkey_sponsor_reserve_v2");
});

test("a guest reservation passes the group key and the group cap", async () => {
  const { calls, client } = fakeRpc({ data: true });
  const b = new SupabaseSponsorBudget(client, { perKeyDailyWei: 1000n, globalDailyWei: 10_000n });
  assert.equal(
    await b.reserve("0x0000000000000000000000000000000000000001", 60n, {
      perKeyDailyWei: 100n,
      group: { key: GUEST_GROUP_KEY, dailyWei: 150n },
    }),
    true,
  );
  assert.deepEqual(calls[0].args, {
    p_budget_key: "0x0000000000000000000000000000000000000001",
    p_cost_wei: "60",
    p_key_cap_wei: "100",
    p_global_cap_wei: "10000",
    p_group_key: "guests",
    p_group_cap_wei: "150",
  });
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

const GUEST_SQL = readFileSync(
  join(process.cwd(), "../../supabase/migrations/20261117a_passkey_sponsor_guest_cap.sql"),
  "utf8",
).toLowerCase();

test("guest-cap migration: additive v2 reserve, 'guests' allowed as a key, service role only", () => {
  assert.match(GUEST_SQL, /create or replace function public\.passkey_sponsor_reserve_v2\(/);
  assert.match(GUEST_SQL, /security definer/);
  assert.match(GUEST_SQL, /set search_path = ''/);
  assert.match(GUEST_SQL, /'guests'/);
  const sig = String.raw`public\.passkey_sponsor_reserve_v2\(text, numeric, numeric, numeric, text, numeric\)`;
  assert.match(GUEST_SQL, new RegExp(`revoke all on function ${sig}\\s+from public, anon, authenticated`));
  assert.match(GUEST_SQL, new RegExp(`grant execute on function ${sig}\\s+to service_role`));
  assert.match(GUEST_SQL, /for update/);
  // The earlier migration is left as it is (not applied yet, never edited).
  assert.doesNotMatch(GUEST_SQL, /create table/);
});

// ---- settle-able reservations (security review M-2; migration 20261121b_passkey_sponsor_settle.sql) ----

const SESS = "session:0x00000000000000000000000000000000000000aa";
const SENDER = "0x00000000000000000000000000000000000000AA" as const;

test("a reservation goes to passkey_sponsor_reserve_v3 with id, sender, decimal nonce and expiry", async () => {
  const { calls, client } = fakeRpc({ data: true });
  const b = new SupabaseSponsorBudget(client, { perKeyDailyWei: 10n, globalDailyWei: 1000n });
  const nonce = (1n << 200n) + 5n;
  assert.equal(
    await b.reserve(SESS, 60n, { keyCapWei: 500n, reservation: { id: reservationIdOf(SENDER, nonce), sender: SENDER, nonce, expiresAt: 1_800_000_000 } }),
    true,
  );
  assert.equal(calls[0].fn, SPONSOR_RESERVE_V3_RPC);
  assert.equal(SPONSOR_RESERVE_V3_RPC, "passkey_sponsor_reserve_v3");
  assert.deepEqual(calls[0].args, {
    p_budget_key: SESS,
    p_cost_wei: "60",
    p_key_cap_wei: "500",
    p_global_cap_wei: "1000",
    p_group_key: null,
    p_group_cap_wei: null,
    p_reservation_id: `${SENDER.toLowerCase()}:0x${nonce.toString(16)}`,
    p_sender: SENDER.toLowerCase(),
    p_nonce: nonce.toString(),
    p_expires_at: "2027-01-15T08:00:00.000Z",
  });
});

test("keyCapWei outside session:<address> is refused without a round trip", async () => {
  const { calls, client } = fakeRpc({ data: true });
  const b = new SupabaseSponsorBudget(client);
  assert.equal(await b.reserve("0x00000000000000000000000000000000000000aa", 1n, { keyCapWei: 10n ** 18n }), false);
  assert.equal(calls.length, 0);
});

test("settle / release / expired call their RPCs; anything unexpected = unknown / false / skipped", async () => {
  const s = fakeRpc({ data: "settled" });
  assert.equal(await new SupabaseSponsorBudget(s.client).settle("id", 42n), "settled");
  assert.deepEqual(s.calls[0], { fn: SPONSOR_SETTLE_RPC, args: { p_reservation_id: "id", p_actual_wei: "42" } });
  assert.equal(await new SupabaseSponsorBudget(fakeRpc({ data: "weird" }).client).settle("id", 1n), "unknown");
  assert.equal(await new SupabaseSponsorBudget(fakeRpc({ data: null }).client).settle("id", -1n), "unknown");

  const r = fakeRpc({ data: true });
  assert.equal(await new SupabaseSponsorBudget(r.client).release("id"), true);
  assert.equal(r.calls[0].fn, SPONSOR_RELEASE_RPC);
  assert.equal(await new SupabaseSponsorBudget(fakeRpc({ data: "true" }).client).release("id"), false);

  const e = fakeRpc({
    data: [
      { reservation_id: "a", sender: "0x00000000000000000000000000000000000000aa", nonce: "77", created_at: 5 },
      { reservation_id: "b", sender: "nope", nonce: "1", created_at: 5 },
      { reservation_id: "c", sender: "0x00000000000000000000000000000000000000aa", nonce: "-1", created_at: 5 },
    ],
  });
  const rows = await new SupabaseSponsorBudget(e.client).expiredReservations({ beforeSeconds: 0, budgetKey: SESS, limit: 3 });
  assert.equal(e.calls[0].fn, SPONSOR_EXPIRED_RPC);
  assert.deepEqual(e.calls[0].args, { p_before: "1970-01-01T00:00:00.000Z", p_budget_key: SESS, p_limit: 3 });
  assert.deepEqual(rows, [{ id: "a", sender: "0x00000000000000000000000000000000000000aa", nonce: 77n, createdAt: 5 }]);
  await assert.rejects(new SupabaseSponsorBudget(fakeRpc({ error: { code: "x" } }).client).settle("id", 1n));
});

const SETTLE_SQL = readFileSync(
  join(process.cwd(), "../../supabase/migrations/20261121b_passkey_sponsor_settle.sql"),
  "utf8",
).toLowerCase();

test("settle migration: RLS on, table + every function revoked from anon/authenticated, service role only", () => {
  assert.match(SETTLE_SQL, /alter table public\.passkey_sponsor_reservations enable row level security/);
  assert.match(SETTLE_SQL, /revoke all on table public\.passkey_sponsor_reservations from public, anon, authenticated/);
  assert.doesNotMatch(SETTLE_SQL, /create policy/);
  for (const fn of ["reserve_v3", "adjust_v1", "lock_reservation_v1", "settle_v1", "release_v1", "expired_v1"]) {
    assert.match(SETTLE_SQL, new RegExp(`revoke all on function public\\.passkey_sponsor_${fn}\\([^)]*\\)\\s+from public, anon, authenticated`), fn);
    assert.match(SETTLE_SQL, new RegExp(`grant execute on function public\\.passkey_sponsor_${fn}\\([^)]*\\)\\s+to service_role`), fn);
  }
  assert.equal((SETTLE_SQL.match(/^security definer$/gm) ?? []).length, 6);
  assert.equal((SETTLE_SQL.match(/^set search_path = ''$/gm) ?? []).length, 6);
});
