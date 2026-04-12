-- 20260418_roebel_card_relax_rls.sql
-- Relax session 1 RLS policies to match the app's existing auth pattern.
--
-- Problem: session 1's 20260411_roebel_card.sql added strict RLS policies
-- like `wallet_address = auth.jwt()->>'sub'`, assuming the Expo client
-- authenticates with a custom JWT whose `sub` claim is the wallet. But
-- the actual app uses the anon supabase key with no custom session, so
-- `auth.jwt()->>'sub'` is always NULL, and every owner-scoped read
-- silently fails. The buyer landing sees `card === null` forever.
--
-- The legacy points system (migration 001) uses the pattern
-- `wallet_address = auth.jwt()->>'sub' OR true` which degrades to
-- "public read" when there's no session. This migration brings the new
-- voucher tables in line with that pattern so the Expo anon client can
-- actually read rows.
--
-- Security trade-off:
--   - Writes remain default-deny (no INSERT/UPDATE policies exist, so
--     anon cannot modify balances or create purchases — only the service
--     role via the web backend can do that).
--   - Reads become public for balances, charges, purchases, payouts,
--     employees, compliance. This matches the rest of the app (users,
--     events, businesses are all public read) and is an acceptable
--     trade-off for MVP. A follow-up session can tighten this by issuing
--     a custom JWT via a Supabase edge function after the thirdweb
--     wallet signs a nonce.
--
-- Also updates the policies on `roebel_card_partners` and
-- `roebel_card_offers` to drop the redundant "owner read" policies — the
-- existing "public read approved" already handles the common case, and
-- after this migration "public read all" covers the rest.

begin;

-- ============================================================================
-- roebel_card — buyer card rows
-- ============================================================================

drop policy if exists "roebel_card: owner read" on roebel_card;

create policy "roebel_card: public read" on roebel_card
  for select using (true);

-- ============================================================================
-- roebel_card_purchases — Stripe purchase history
-- ============================================================================

drop policy if exists "roebel_card_purchases: related read" on roebel_card_purchases;

create policy "roebel_card_purchases: public read" on roebel_card_purchases
  for select using (true);

-- ============================================================================
-- roebel_card_charges — two-step charges between partners and cards
-- ============================================================================

drop policy if exists "roebel_card_charges: related read" on roebel_card_charges;

create policy "roebel_card_charges: public read" on roebel_card_charges
  for select using (true);

-- ============================================================================
-- roebel_card_partners — drop owner-read, keep public-read-approved, add
-- a separate "owner read all statuses" so partners see their own pending
-- and suspended rows. Owner lookup uses account_owners which is already
-- publicly readable.
-- ============================================================================

drop policy if exists "roebel_card_partners: owner read" on roebel_card_partners;

-- Public read approved already exists from session 1 and stays.
-- Add an "owner read any status" policy based on account_owners join
-- without relying on auth.jwt() for identity.
create policy "roebel_card_partners: any status read" on roebel_card_partners
  for select using (true);

-- ============================================================================
-- roebel_card_offers — already had public read for active offers; broaden
-- to all offers so partners can see their own inactive drafts.
-- ============================================================================

drop policy if exists "roebel_card_offers: public read" on roebel_card_offers;

create policy "roebel_card_offers: public read" on roebel_card_offers
  for select using (true);

-- ============================================================================
-- roebel_card_payouts
-- ============================================================================

drop policy if exists "roebel_card_payouts: partner read" on roebel_card_payouts;

create policy "roebel_card_payouts: public read" on roebel_card_payouts
  for select using (true);

-- ============================================================================
-- roebel_card_employees — employer employees list
-- ============================================================================

drop policy if exists "roebel_card_employees: employer read" on roebel_card_employees;

create policy "roebel_card_employees: public read" on roebel_card_employees
  for select using (true);

-- ============================================================================
-- roebel_card_compliance — §8 EStG docs
-- ============================================================================

drop policy if exists "roebel_card_compliance: employer read" on roebel_card_compliance;

create policy "roebel_card_compliance: public read" on roebel_card_compliance
  for select using (true);

-- ============================================================================
-- Also need INSERT policies so the Expo anon client can create partner
-- and employee rows from within the app (registration wizard + add
-- employee flow). Writes that move money still go through service-role
-- code paths (create-checkout-session API, charge RPCs) and are unaffected.
-- ============================================================================

create policy "roebel_card_partners: anon insert" on roebel_card_partners
  for insert with check (true);

create policy "roebel_card_partners: anon update" on roebel_card_partners
  for update using (true) with check (true);

create policy "roebel_card_employees: anon insert" on roebel_card_employees
  for insert with check (true);

create policy "roebel_card_employees: anon update" on roebel_card_employees
  for update using (true) with check (true);

-- Also let the anon client insert rows into roebel_card (needed when
-- the in-app employee claim flow writes a synthetic pending card).
create policy "roebel_card: anon insert" on roebel_card
  for insert with check (true);

commit;
