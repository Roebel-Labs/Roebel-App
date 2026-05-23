-- 20260523162655_roebel_card_relax_rls_prod_repair.sql
--
-- Repair the production RLS gap that prevented Realtime from delivering
-- pending roebel_card_charges to the citizen device.
--
-- The Expo app uses the anon Supabase key with no auth session, so
-- auth.jwt() ->> 'sub' is always NULL and the session-1 "related read"
-- policies denied every row. Supabase Realtime postgres_changes also
-- respects RLS, so the citizen's INSERT subscription delivered nothing
-- and the PendingChargeModal never opened while the partner watched
-- "Warte auf Bestätigung" tick down to 00:00.
--
-- 20260418_roebel_card_relax_rls.sql already added the right policies
-- but was never applied to wwbeqhkslxdxhktqzqti (the project's
-- supabase_migrations.schema_migrations table only goes back to
-- 2026-05-21, so all Röbel Card migrations were applied out-of-band).
-- This migration brings prod in line with what 20260418 declared,
-- plus REPLICA IDENTITY FULL so the postgres_changes filter
-- (card_id=eq.<uuid>) works reliably for UPDATE events.
--
-- Idempotent: safe to rerun.

-- roebel_card_charges — public select so anon + realtime can see rows
drop policy if exists "roebel_card_charges: related read" on roebel_card_charges;
drop policy if exists "roebel_card_charges: public read" on roebel_card_charges;
create policy "roebel_card_charges: public read" on roebel_card_charges
  for select using (true);

-- roebel_card — needed for v_roebel_card_overview reads
drop policy if exists "roebel_card: owner read" on roebel_card;
drop policy if exists "roebel_card: public read" on roebel_card;
create policy "roebel_card: public read" on roebel_card
  for select using (true);

-- roebel_card_purchases — Stripe purchase history
drop policy if exists "roebel_card_purchases: related read" on roebel_card_purchases;
drop policy if exists "roebel_card_purchases: public read" on roebel_card_purchases;
create policy "roebel_card_purchases: public read" on roebel_card_purchases
  for select using (true);

-- roebel_card_partners — allow any-status read for owners
drop policy if exists "roebel_card_partners: owner read" on roebel_card_partners;
drop policy if exists "roebel_card_partners: any status read" on roebel_card_partners;
create policy "roebel_card_partners: any status read" on roebel_card_partners
  for select using (true);

-- roebel_card_offers — broaden to all offers
drop policy if exists "roebel_card_offers: public read" on roebel_card_offers;
create policy "roebel_card_offers: public read" on roebel_card_offers
  for select using (true);

-- roebel_card_payouts
drop policy if exists "roebel_card_payouts: partner read" on roebel_card_payouts;
drop policy if exists "roebel_card_payouts: public read" on roebel_card_payouts;
create policy "roebel_card_payouts: public read" on roebel_card_payouts
  for select using (true);

-- roebel_card_employees
drop policy if exists "roebel_card_employees: employer read" on roebel_card_employees;
drop policy if exists "roebel_card_employees: public read" on roebel_card_employees;
create policy "roebel_card_employees: public read" on roebel_card_employees
  for select using (true);

-- roebel_card_compliance
drop policy if exists "roebel_card_compliance: employer read" on roebel_card_compliance;
drop policy if exists "roebel_card_compliance: public read" on roebel_card_compliance;
create policy "roebel_card_compliance: public read" on roebel_card_compliance
  for select using (true);

-- Anon write paths used by in-app registration flows
drop policy if exists "roebel_card_partners: anon insert" on roebel_card_partners;
create policy "roebel_card_partners: anon insert" on roebel_card_partners
  for insert with check (true);

drop policy if exists "roebel_card_partners: anon update" on roebel_card_partners;
create policy "roebel_card_partners: anon update" on roebel_card_partners
  for update using (true) with check (true);

drop policy if exists "roebel_card_employees: anon insert" on roebel_card_employees;
create policy "roebel_card_employees: anon insert" on roebel_card_employees
  for insert with check (true);

drop policy if exists "roebel_card_employees: anon update" on roebel_card_employees;
create policy "roebel_card_employees: anon update" on roebel_card_employees
  for update using (true) with check (true);

drop policy if exists "roebel_card: anon insert" on roebel_card;
create policy "roebel_card: anon insert" on roebel_card
  for insert with check (true);

-- REPLICA IDENTITY FULL so postgres_changes filters work reliably on
-- non-PK columns. The citizen subscription filters card_id=eq.<uuid>.
alter table roebel_card_charges replica identity full;
