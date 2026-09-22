-- Stripe Connect event tickets — review fixes for 20260921_stripe_connect_tickets.sql.
--
-- 1) stripe_connected_accounts was keyed on account_id alone, so an org could hold exactly one
--    Connect account across BOTH modes. Switching the platform key from sandbox to live (or back)
--    would have collided on the primary key: the live account could not be inserted, and
--    connectedAccountRow() — which filters on livemode — would have found nothing and reported
--    the org as "not connected" while the test-mode row sat in the table. Re-key on a surrogate
--    id and make (account_id, livemode) the uniqueness rule instead: one account per org per mode.
-- 2) ticket_types still handed anon/authenticated the TRUNCATE, REFERENCES and TRIGGER grants that
--    Postgres/Supabase give out by default. The 20260921 migration revoked only insert/update/delete.
--
-- Not applied by an agent (no Supabase CLI in this environment) — apply via the Supabase MCP.

alter table stripe_connected_accounts drop constraint stripe_connected_accounts_pkey;
alter table stripe_connected_accounts add column if not exists id uuid not null default gen_random_uuid();
alter table stripe_connected_accounts add primary key (id);
create unique index if not exists stripe_connected_accounts_account_livemode_uq
  on stripe_connected_accounts (account_id, livemode);

revoke truncate, references, trigger on ticket_types from anon, authenticated;
