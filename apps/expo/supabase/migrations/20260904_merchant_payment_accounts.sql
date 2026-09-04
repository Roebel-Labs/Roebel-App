-- Merchant stablecoin acceptance registry (spec 2026-09-04, slice 1a).
--
-- One row per PERSON's Gnosis Pay account (the "Konto"); a person who owns
-- several places links each of them through merchant_entities. The Safe
-- address is the receive address printed into EIP-681 QR codes in slice 1b.
--
-- Access model: RLS is on and NO write policy exists, so the anon key cannot
-- insert or update anything -- every write goes through the merchant-registry
-- edge function, which verifies an ERC-1271 signature from the owner's smart
-- account. Reads are split two ways:
--   * anon may SELECT only LIVE rows, and only the non-sensitive columns
--     (column-level GRANT below). owner_wallet and gp_user_id are never
--     readable by the anon key.
--   * an owner reads their own row -- including pending states -- through the
--     security-definer function merchant_account_for_wallet().

create type merchant_account_status as enum (
  'pending_kyc', 'kyc_approved', 'deploying', 'live', 'suspended'
);

create type merchant_entity_type as enum ('business', 'restaurant', 'account');

create table merchant_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  -- lower-cased thirdweb smart-account address; the Gnosis Pay identity
  owner_wallet text not null unique,
  gp_user_id text unique,
  gp_safe_address text unique,
  chain_id integer not null default 100,
  token text not null default 'EURe',
  status merchant_account_status not null default 'pending_kyc',
  card_status text,
  iban_status text,
  daily_allowance_eur numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table merchant_payment_accounts is
  'Gnosis Pay Konto per merchant owner. Receive address for stablecoin payments.';

create index merchant_payment_accounts_status_idx
  on merchant_payment_accounts (status);

create table merchant_entities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references merchant_payment_accounts(id) on delete cascade,
  entity_type merchant_entity_type not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);

comment on table merchant_entities is
  'Links a Konto to the businesses/restaurants/accounts it collects for (map pins).';

create index merchant_entities_account_idx on merchant_entities (account_id);

alter table merchant_payment_accounts enable row level security;
alter table merchant_entities enable row level security;

-- Column-level read grant: the anon key may never see owner_wallet or
-- gp_user_id. Revoke the table-wide grant Supabase hands out by default first.
revoke select on merchant_payment_accounts from anon, authenticated;
grant select (id, gp_safe_address, status, token, chain_id)
  on merchant_payment_accounts to anon, authenticated;

-- Row-level read: only live merchants are public.
create policy merchant_accounts_read_live
  on merchant_payment_accounts for select
  using (status = 'live');

-- Entity links carry no personal data.
create policy merchant_entities_read_all
  on merchant_entities for select
  using (true);

-- No INSERT/UPDATE/DELETE policy exists on either table, so RLS denies every
-- client write. Writes go through the merchant-registry edge function.

-- Public acceptance list: what the map needs, and nothing else. security_invoker
-- so the caller's own grants and policies apply -- no definer escalation.
create view merchant_acceptance_public
with (security_invoker = true) as
  select e.entity_type,
         e.entity_id,
         a.token,
         a.chain_id
  from merchant_entities e
  join merchant_payment_accounts a on a.id = e.account_id
  where a.status = 'live';

comment on view merchant_acceptance_public is
  'Public feed of places accepting stablecoin payments. Seam for the open registry (spec 2).';

grant select on merchant_acceptance_public to anon, authenticated;

-- An owner reading their OWN Konto, including pre-live states and gp_user_id.
-- Security definer because the anon read policy above only exposes live rows.
create function merchant_account_for_wallet(p_wallet text)
returns table (
  id uuid,
  gp_user_id text,
  gp_safe_address text,
  status merchant_account_status,
  card_status text,
  iban_status text,
  token text,
  chain_id integer
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.gp_user_id, a.gp_safe_address, a.status,
         a.card_status, a.iban_status, a.token, a.chain_id
  from merchant_payment_accounts a
  where a.owner_wallet = lower(p_wallet)
$$;

revoke execute on function merchant_account_for_wallet(text) from public;
grant execute on function merchant_account_for_wallet(text) to anon, authenticated;
