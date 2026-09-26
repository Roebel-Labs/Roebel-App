/**
 * SupabaseEmailStore against a small in-memory PostgREST fake: row shapes, replay/idempotency via
 * unique violations, and that it only ever touches the passkey_* tables (never users/newsletter).
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/email-store-supabase.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PASSKEY_EMAIL_TABLES, SupabaseEmailStore } from "../email-store-supabase";
import { EmailStoreError } from "../email-store";

type Row = Record<string, unknown>;
const KEYS: Record<string, string[]> = {
  passkey_contacts: ["safe_address"],
  passkey_email_challenges: ["safe_address"],
  passkey_email_used_proofs: ["proof_hash"],
  passkey_recovery_alerts: ["wallet_address", "recovery_nonce"],
  passkey_alert_cursor: ["id"],
};

function fakeDb(opts: { failAll?: boolean } = {}) {
  const tables = new Map<string, Row[]>();
  const touched = new Set<string>();
  const rows = (t: string) => tables.get(t) ?? (tables.set(t, []), tables.get(t)!);
  const keyOf = (t: string, r: Row) => KEYS[t].map((k) => String(r[k])).join("|");

  const from = (table: string) => {
    touched.add(table);
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "delete" | "update" = "select";
    let patch: Row = {};
    const exec = () => {
      if (opts.failAll) return { data: null, error: { code: "XX000" } };
      const match = rows(table).filter((r) => filters.every((f) => f(r)));
      if (op === "delete") tables.set(table, rows(table).filter((r) => !match.includes(r)));
      if (op === "update") match.forEach((r) => Object.assign(r, patch));
      return { data: match, error: null };
    };
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => String(r[c]) === String(v)), q),
      lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), q),
      delete: () => ((op = "delete"), q),
      update: (p: Row) => ((op = "update"), (patch = p), q),
      maybeSingle: async () => {
        const r = exec();
        return r.error ? r : { data: (r.data as Row[])[0] ?? null, error: null };
      },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
      insert: async (row: Row) => {
        if (opts.failAll) return { error: { code: "XX000" } };
        if (rows(table).some((r) => keyOf(table, r) === keyOf(table, row))) return { error: { code: "23505" } };
        rows(table).push({ ...row });
        return { error: null };
      },
      upsert: async (row: Row) => {
        if (opts.failAll) return { error: { code: "XX000" } };
        const i = rows(table).findIndex((r) => keyOf(table, r) === keyOf(table, row));
        if (i >= 0) rows(table)[i] = { ...rows(table)[i], ...row };
        else rows(table).push({ ...row });
        return { error: null };
      },
    };
    return q;
  };
  return { db: { from } as unknown as SupabaseClient, tables, touched };
}

const SAFE = "0xAbCd000000000000000000000000000000000001";

test("challenge + contact round-trip with lowercase addresses and no plain code", async () => {
  const f = fakeDb();
  const s = new SupabaseEmailStore(f.db);
  await s.putChallenge({ safe: SAFE, email: "a@example.de", codeHash: "ab".repeat(32), expiresAt: 1_790_000_600, attempts: 0 });
  const ch = await s.getChallenge(SAFE);
  assert.deepEqual(ch, { safe: SAFE.toLowerCase(), email: "a@example.de", codeHash: "ab".repeat(32), expiresAt: 1_790_000_600, attempts: 0 });
  await s.setChallengeAttempts(SAFE, 2);
  assert.equal((await s.getChallenge(SAFE))?.attempts, 2);
  await s.deleteChallenge(SAFE);
  assert.equal(await s.getChallenge(SAFE), null);

  await s.saveVerifiedContact(SAFE, "a@example.de", 1_790_000_000);
  await s.saveVerifiedContact(SAFE, "b@example.de", 1_790_000_100);
  assert.deepEqual(await s.getContact(SAFE), {
    safe: SAFE.toLowerCase(),
    email: "b@example.de",
    emailVerifiedAt: 1_790_000_100,
    alertsEnabled: true,
  });
  assert.equal(f.tables.get("passkey_contacts")!.length, 1);
  await s.deleteContact(SAFE);
  assert.equal(await s.getContact(SAFE), null);
});

test("consumeProof and claimAlert are single-use (unique violation = false)", async () => {
  const s = new SupabaseEmailStore(fakeDb().db);
  assert.equal(await s.consumeProof("p1", 4_000_000_000), true);
  assert.equal(await s.consumeProof("p1", 4_000_000_000), false);
  assert.equal(await s.claimAlert(SAFE, 3n, 1_790_100_000n), true);
  assert.equal(await s.claimAlert(SAFE.toLowerCase(), 3n, 1_790_100_000n), false);
  assert.equal(await s.claimAlert(SAFE, 4n, 1_790_100_000n), true);
  await s.releaseAlert(SAFE, 3n);
  assert.equal(await s.claimAlert(SAFE, 3n, 1_790_100_000n), true);
});

test("cursor round-trip as bigint", async () => {
  const s = new SupabaseEmailStore(fakeDb().db);
  assert.equal(await s.getCursor("c"), null);
  await s.setCursor("c", 46_000_123n);
  assert.equal(await s.getCursor("c"), 46_000_123n);
});

test("only the passkey_* tables are ever touched", async () => {
  const f = fakeDb();
  const s = new SupabaseEmailStore(f.db);
  await s.putChallenge({ safe: SAFE, email: "a@example.de", codeHash: "00", expiresAt: 1, attempts: 0 });
  await s.getChallenge(SAFE);
  await s.saveVerifiedContact(SAFE, "a@example.de", 1);
  await s.getContact(SAFE);
  await s.consumeProof("x", 1);
  await s.claimAlert(SAFE, 1n, 1n);
  await s.setCursor("c", 1n);
  await s.getCursor("c");
  await s.releaseAlert(SAFE, 1n);
  await s.deleteContact(SAFE);
  await s.deleteChallenge(SAFE);
  const allowed = new Set<string>(Object.values(PASSKEY_EMAIL_TABLES));
  for (const t of f.touched) assert.ok(allowed.has(t), `touched ${t}`);
  assert.ok(!f.touched.has("users") && !f.touched.has("newsletter_subscribers"));
});

test("database errors surface as EmailStoreError without user data", async () => {
  const s = new SupabaseEmailStore(fakeDb({ failAll: true }).db);
  await assert.rejects(s.getContact(SAFE), (e: unknown) => e instanceof EmailStoreError && !String((e as Error).message).includes(SAFE));
  await assert.rejects(s.saveVerifiedContact(SAFE, "a@example.de", 1), (e: unknown) => e instanceof EmailStoreError && !(e as Error).message.includes("a@example.de"));
  await assert.rejects(s.consumeProof("p", 1), EmailStoreError);
});

test("migration: RLS on, no policies, no functions, anon/authenticated revoked, no newsletter/users", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const sql = readFileSync(join(__dirname, "../../../../../../supabase/migrations/20260927_passkey_contact_email.sql"), "utf8");
  const code = sql.replace(/--.*$/gm, "").replace(/'[^']*'/g, "''"); // comments and string literals out
  for (const t of Object.values(PASSKEY_EMAIL_TABLES)) {
    assert.match(code, new RegExp(`create table if not exists public\\.${t} \\(`), t);
    assert.match(code, new RegExp(`alter table public\\.${t}\\s+enable row level security`), t);
    assert.match(code, new RegExp(`revoke all on table public\\.${t}\\s+from public, anon, authenticated`), t);
  }
  assert.doesNotMatch(code, /create\s+policy/i);
  assert.doesNotMatch(code, /create\s+(or\s+replace\s+)?function/i);
  assert.doesNotMatch(code, /create\s+trigger/i);
  assert.doesNotMatch(code, /newsletter|public\.users|\busers\b/i);
  assert.doesNotMatch(code, /grant[^;]*\b(anon|authenticated)\b/i);
});
