-- 20260411_roebel_card.sql
-- Full Röbel Card voucher schema: buyer, partner, employer roles.
--
-- This migration renames the legacy points/stamp tables to free the
-- "roebel_card" namespace for the new euro-balance voucher system, then
-- creates the full voucher schema (cards, purchases, partners, charges,
-- offers, payouts, employees, verein fund, compliance).

begin;

-- =============================================================================
-- 1. Rename legacy points/stamp tables so the "roebel_card" namespace is free
--    for the new euro-balance voucher system.
-- =============================================================================

alter table if exists roebel_card rename to roebel_points_card;
alter table if exists roebel_card_partners rename to roebel_stamp_partners;

-- Update the legacy increment function to reference the renamed table.
create or replace function increment_roebel_points(
  p_wallet_address text,
  p_amount integer
)
returns integer
language plpgsql
as $$
declare
  new_balance integer;
begin
  update roebel_points_card
  set
    points_balance = points_balance + p_amount,
    total_earned = case when p_amount > 0 then total_earned + p_amount else total_earned end,
    total_spent = case when p_amount < 0 then total_spent + abs(p_amount) else total_spent end,
    last_activity_at = now(),
    updated_at = now()
  where wallet_address = p_wallet_address
  returning points_balance into new_balance;

  if not found then
    insert into roebel_points_card (wallet_address, points_balance, total_earned, total_spent)
    values (
      p_wallet_address,
      greatest(p_amount, 0),
      greatest(p_amount, 0),
      greatest(-p_amount, 0)
    )
    returning points_balance into new_balance;
  end if;

  return new_balance;
end;
$$;

-- =============================================================================
-- 2. Cards (one row per holder; a wallet can own multiple cards when issued by
--    an employer for Sachbezug purposes).
-- =============================================================================

create table roebel_card (
  id                uuid primary key default gen_random_uuid(),
  wallet_address    text not null,
  owner_account_id  uuid references accounts(id) on delete set null,
  balance_cents     bigint not null default 0 check (balance_cents >= 0),
  status            text not null default 'active'
                      check (status in ('active','frozen','deactivated')),
  qr_secret         text not null default encode(gen_random_bytes(32), 'hex'),
  label             text, -- optional display label, e.g. "Privat", "Arbeitgeber X"
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_roebel_voucher_card_wallet        on roebel_card(wallet_address);
create index idx_roebel_voucher_card_owner_account on roebel_card(owner_account_id);

-- =============================================================================
-- 3. Purchases (stock-up events; one row per Stripe checkout session).
-- =============================================================================

create table roebel_card_purchases (
  id                       uuid primary key default gen_random_uuid(),
  card_id                  uuid not null references roebel_card(id) on delete restrict,
  amount_cents             bigint not null check (amount_cents > 0),
  fee_cents                bigint not null check (fee_cents >= 0),
  beneficiary_account_id   uuid references accounts(id), -- null = Röbeler Topf
  purchaser_wallet_address text not null,
  is_sachbezug             boolean not null default false,
  employer_account_id      uuid references accounts(id),
  stripe_session_id        text,
  stripe_payment_intent_id text,
  status                   text not null default 'pending'
                            check (status in ('pending','paid','failed','refunded')),
  created_at               timestamptz not null default now(),
  paid_at                  timestamptz
);

create index idx_roebel_purchases_card            on roebel_card_purchases(card_id);
create index idx_roebel_purchases_beneficiary     on roebel_card_purchases(beneficiary_account_id);
create index idx_roebel_purchases_employer        on roebel_card_purchases(employer_account_id);
create index idx_roebel_purchases_stripe_session  on roebel_card_purchases(stripe_session_id);

-- =============================================================================
-- 4. Payment-accepting partners (distinct from the legacy stamp partners).
-- =============================================================================

create table roebel_card_partners (
  id                     uuid primary key default gen_random_uuid(),
  account_id             uuid not null unique references accounts(id) on delete cascade,
  -- Payout details. IBAN is encrypted at the application layer; only the
  -- last 4 digits are stored in plaintext for display.
  iban_encrypted         text,
  iban_last4             text,
  bic                    text,
  account_holder         text,
  -- Partner agreement (signature capture at registration).
  signature_url          text,
  agreement_version      text,
  agreement_signed_at    timestamptz,
  -- Operational state.
  status                 text not null default 'pending'
                          check (status in ('pending','approved','rejected','suspended')),
  pending_balance_cents  bigint not null default 0 check (pending_balance_cents >= 0),
  lifetime_volume_cents  bigint not null default 0,
  approved_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index idx_roebel_voucher_partners_status on roebel_card_partners(status);

-- =============================================================================
-- 5. Charges (two-step: partner submits → buyer confirms).
-- =============================================================================

create table roebel_card_charges (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid not null references roebel_card(id) on delete restrict,
  partner_id    uuid not null references roebel_card_partners(id) on delete restrict,
  amount_cents  bigint not null check (amount_cents > 0),
  offer_id      uuid, -- FK added after roebel_card_offers is created
  status        text not null default 'pending'
                 check (status in ('pending','approved','declined','expired','reversed')),
  partner_note  text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '2 minutes'),
  approved_at   timestamptz,
  declined_at   timestamptz
);

create index idx_roebel_charges_card_status on roebel_card_charges(card_id, status);
create index idx_roebel_charges_partner     on roebel_card_charges(partner_id);
create index idx_roebel_charges_expires     on roebel_card_charges(expires_at) where status = 'pending';

-- =============================================================================
-- 6. Partner offers / discounts.
-- =============================================================================

create table roebel_card_offers (
  id               uuid primary key default gen_random_uuid(),
  partner_id       uuid not null references roebel_card_partners(id) on delete cascade,
  title            text not null,
  description      text,
  kind             text not null check (kind in (
                      'percent_discount',
                      'fixed_discount',
                      'free_item_at_threshold',
                      'other'
                    )),
  value_bps        integer,  -- 500 = 5%
  threshold_cents  bigint,
  free_item        text,
  is_active        boolean not null default true,
  starts_at        timestamptz,
  ends_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_roebel_offers_partner_active on roebel_card_offers(partner_id) where is_active;

-- Resolve the circular dependency with charges.offer_id now that offers exists.
alter table roebel_card_charges
  add constraint roebel_charges_offer_fk
  foreign key (offer_id) references roebel_card_offers(id) on delete set null;

-- =============================================================================
-- 7. Partner payouts (IBAN settlement history).
-- =============================================================================

create table roebel_card_payouts (
  id               uuid primary key default gen_random_uuid(),
  partner_id       uuid not null references roebel_card_partners(id) on delete restrict,
  amount_cents     bigint not null check (amount_cents > 0),
  period_start     timestamptz not null,
  period_end       timestamptz not null,
  status           text not null default 'pending'
                    check (status in ('pending','sent','failed')),
  stripe_payout_id text,
  reference        text, -- human reference, e.g. "RC-2026-04"
  initiated_at     timestamptz not null default now(),
  sent_at          timestamptz
);

create index idx_roebel_payouts_partner on roebel_card_payouts(partner_id);

-- =============================================================================
-- 8. Employer → employee card assignments (Sachbezug use case).
-- =============================================================================

create table roebel_card_employees (
  id                      uuid primary key default gen_random_uuid(),
  employer_account_id     uuid not null references accounts(id) on delete cascade,
  card_id                 uuid not null references roebel_card(id) on delete restrict,
  employee_wallet_address text, -- null until employee claims the invite
  employee_label          text not null, -- e.g. "Anna M. / Küche"
  invite_code             text not null unique,
  monthly_topup_cents     bigint not null default 0 check (monthly_topup_cents >= 0),
  topup_mode              text not null default 'manual'
                           check (topup_mode in ('manual','automatic')),
  status                  text not null default 'invited'
                           check (status in ('invited','active','deactivated')),
  created_at              timestamptz not null default now(),
  activated_at            timestamptz,
  deactivated_at          timestamptz
);

create index idx_roebel_employees_employer on roebel_card_employees(employer_account_id);
create index idx_roebel_employees_card     on roebel_card_employees(card_id);
create index idx_roebel_employees_invite   on roebel_card_employees(invite_code);

-- =============================================================================
-- 9. Shared "Röbeler Topf" community fund (fallback when no Verein is chosen).
-- =============================================================================

create table roebel_verein_fund (
  id             uuid primary key default gen_random_uuid(),
  balance_cents  bigint not null default 0 check (balance_cents >= 0),
  updated_at     timestamptz not null default now()
);

-- Seed the singleton fund row.
insert into roebel_verein_fund (balance_cents) values (0);

create table roebel_verein_fund_entries (
  id            uuid primary key default gen_random_uuid(),
  purchase_id   uuid not null references roebel_card_purchases(id) on delete restrict,
  amount_cents  bigint not null check (amount_cents > 0),
  created_at    timestamptz not null default now()
);

create index idx_roebel_verein_fund_entries_purchase on roebel_verein_fund_entries(purchase_id);

-- =============================================================================
-- 10. Per-Verein contribution ledger (what each Verein has earned / been paid).
-- =============================================================================

create table roebel_verein_contributions (
  id                     uuid primary key default gen_random_uuid(),
  beneficiary_account_id uuid not null unique references accounts(id) on delete cascade,
  pending_amount_cents   bigint not null default 0 check (pending_amount_cents >= 0),
  paid_amount_cents      bigint not null default 0 check (paid_amount_cents >= 0),
  updated_at             timestamptz not null default now()
);

create index idx_roebel_verein_contrib_beneficiary on roebel_verein_contributions(beneficiary_account_id);

-- =============================================================================
-- 11. §8 EStG Sachbezug compliance documentation (per employer per month).
-- =============================================================================

create table roebel_card_compliance (
  id                   uuid primary key default gen_random_uuid(),
  employer_account_id  uuid not null references accounts(id) on delete cascade,
  year                 integer not null check (year between 2026 and 2100),
  month                integer not null check (month between 1 and 12),
  total_issued_cents   bigint not null default 0,
  employee_count       integer not null default 0,
  compliance_pdf_url   text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (employer_account_id, year, month)
);

-- =============================================================================
-- 12. Convenience view: card overview (balance + aggregate stats).
-- =============================================================================

create or replace view v_roebel_card_overview as
select
  c.id                                              as card_id,
  c.wallet_address,
  c.owner_account_id,
  c.balance_cents,
  c.status,
  (select count(*) from roebel_card_charges ch
     where ch.card_id = c.id and ch.status = 'approved') as approved_charge_count,
  (select coalesce(sum(amount_cents),0) from roebel_card_charges ch
     where ch.card_id = c.id and ch.status = 'approved') as lifetime_spend_cents,
  c.created_at,
  c.updated_at
from roebel_card c;

-- =============================================================================
-- 13. Row Level Security. Money-moving writes are done by the service role,
--     so no write policies are defined; default-deny keeps anon/auth safe.
-- =============================================================================

alter table roebel_card                 enable row level security;
alter table roebel_card_purchases       enable row level security;
alter table roebel_card_partners        enable row level security;
alter table roebel_card_charges         enable row level security;
alter table roebel_card_offers          enable row level security;
alter table roebel_card_payouts         enable row level security;
alter table roebel_card_employees       enable row level security;
alter table roebel_verein_fund          enable row level security;
alter table roebel_verein_fund_entries  enable row level security;
alter table roebel_verein_contributions enable row level security;
alter table roebel_card_compliance      enable row level security;

-- Cards: owner can read their own cards (by wallet).
create policy "roebel_card: owner read" on roebel_card
  for select using (wallet_address = (auth.jwt()->>'sub'));

-- Purchases: either the purchaser or the card owner can read.
create policy "roebel_card_purchases: related read" on roebel_card_purchases
  for select using (
    purchaser_wallet_address = (auth.jwt()->>'sub')
    or card_id in (select id from roebel_card where wallet_address = (auth.jwt()->>'sub'))
  );

-- Partners: anyone can read approved partners (they're the public merchant directory).
create policy "roebel_card_partners: public read approved" on roebel_card_partners
  for select using (status = 'approved');

-- Partners: owners can read their own row regardless of status.
create policy "roebel_card_partners: owner read" on roebel_card_partners
  for select using (
    account_id in (
      select account_id from account_owners where wallet_address = (auth.jwt()->>'sub')
    )
  );

-- Offers: public read for active offers from approved partners.
create policy "roebel_card_offers: public read" on roebel_card_offers
  for select using (
    is_active
    and partner_id in (select id from roebel_card_partners where status = 'approved')
  );

-- Charges: either the card owner or the partner account owner can read.
create policy "roebel_card_charges: related read" on roebel_card_charges
  for select using (
    card_id in (select id from roebel_card where wallet_address = (auth.jwt()->>'sub'))
    or partner_id in (
      select id from roebel_card_partners where account_id in (
        select account_id from account_owners where wallet_address = (auth.jwt()->>'sub')
      )
    )
  );

-- Payouts: partner account owners only.
create policy "roebel_card_payouts: partner read" on roebel_card_payouts
  for select using (
    partner_id in (
      select id from roebel_card_partners where account_id in (
        select account_id from account_owners where wallet_address = (auth.jwt()->>'sub')
      )
    )
  );

-- Employees: employer org owners only.
create policy "roebel_card_employees: employer read" on roebel_card_employees
  for select using (
    employer_account_id in (
      select account_id from account_owners where wallet_address = (auth.jwt()->>'sub')
    )
  );

-- Compliance: employer org owners only.
create policy "roebel_card_compliance: employer read" on roebel_card_compliance
  for select using (
    employer_account_id in (
      select account_id from account_owners where wallet_address = (auth.jwt()->>'sub')
    )
  );

-- Verein fund + contributions: public read for transparency.
create policy "roebel_verein_fund: public read" on roebel_verein_fund
  for select using (true);

create policy "roebel_verein_contributions: public read" on roebel_verein_contributions
  for select using (true);

-- =============================================================================
-- 14. updated_at triggers.
-- =============================================================================

create or replace function roebel_card_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_roebel_card_updated
  before update on roebel_card
  for each row execute function roebel_card_set_updated_at();

create trigger trg_roebel_card_partners_updated
  before update on roebel_card_partners
  for each row execute function roebel_card_set_updated_at();

create trigger trg_roebel_card_offers_updated
  before update on roebel_card_offers
  for each row execute function roebel_card_set_updated_at();

create trigger trg_roebel_verein_contributions_updated
  before update on roebel_verein_contributions
  for each row execute function roebel_card_set_updated_at();

create trigger trg_roebel_card_compliance_updated
  before update on roebel_card_compliance
  for each row execute function roebel_card_set_updated_at();

commit;
