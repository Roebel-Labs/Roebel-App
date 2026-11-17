import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(
  resolve(__dirname, "../../../supabase/migrations/20261117cra_credential_register.sql"),
  "utf8",
);

const TABLES = [
  "credential_types",
  "credential_actions",
  "credential_batches",
  "credential_invitations",
  "credential_delegates",
  "credential_presentations",
  "credential_sync_state",
];

for (const t of TABLES) {
  test(`${t}: created, RLS on, grants revoked`, () => {
    assert.match(sql, new RegExp(`create table if not exists public\\.${t}\\b`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${t}\\s+enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on table public\\.${t}\\s+from anon, authenticated`, "i"));
  });
}

test("no policies", () => {
  assert.doesNotMatch(sql, /create policy/i);
});

test("settings keys and accounts column", () => {
  assert.match(sql, /credentials_enabled'/);
  assert.match(sql, /credentials_enabled_production'/);
  assert.match(sql, /on conflict \(key\) do nothing/i);
  assert.match(sql, /alter table public\.accounts add column if not exists credentials_members_public boolean/i);
});

test("ends with the commented reset block", () => {
  assert.match(
    sql,
    /-- RESET \(switching registry address\): truncate credential_presentations, credential_invitations, credential_batches, credential_actions, credential_delegates, credential_types, credential_sync_state;\s*$/,
  );
});

test("unique live root", () => {
  assert.match(sql, /unique index[^;]+credential_batches\s*\(root\)\s*where status <> 'cancelled'/i);
});

test("actions carry the prepare block and a transaction settles one action", () => {
  assert.match(sql, /prepared_block\s+bigint/i);
  assert.match(sql, /unique index[^;]+credential_actions\s*\(tx_hash\)\s*where tx_hash is not null/i);
});
