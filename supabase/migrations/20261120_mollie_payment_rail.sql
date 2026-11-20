-- Mollie payment rail, phase M1 (design: docs/superpowers/specs/2026-11-18-mollie-payments-design.md §3.2).
-- Idempotent; applied by hand in the SQL editor. Access model as in 20260921_stripe_connect_tickets.sql:
-- RLS on, no client policies, every read/write through apps/web API routes with the service role.

-- 1) One row per org × provider × mode. stripe_connected_accounts stays the Stripe source and is read
--    through the Stripe provider; this table holds Mollie (and later any further provider).
create table if not exists payment_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  provider text not null check (provider in ('mollie', 'stripe')),
  provider_org_id text,
  profile_id text,
  livemode boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  status text not null default 'needs-data' check (status in ('none', 'needs-data', 'in-review', 'completed')),
  created_by_wallet text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider, livemode)
);
comment on table payment_accounts is 'Org payment accounts per provider and mode (Mollie via OAuth). Mirror of provider state; the provider is the truth.';

-- 2) OAuth refresh tokens, AES-256-GCM encrypted with PAYMENT_TOKEN_KEY (apps/web lib/payments/secrets.ts).
--    Service role only: RLS on and deliberately NO policies. Access tokens are never stored.
create table if not exists payment_account_secrets (
  payment_account_id uuid primary key references payment_accounts(id) on delete cascade,
  refresh_token_enc text not null,
  scope text,
  updated_at timestamptz not null default now()
);

-- 3) Webhook idempotency for non-Stripe providers (Stripe keeps stripe_events).
--    Mollie id = 'mollie:<tr_id>:<status>:<refunded cents>' (one row per observed payment state).
create table if not exists payment_events (
  id text primary key,
  provider text not null,
  type text not null,
  provider_account text,
  livemode boolean not null default false,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

-- 4) ticket_orders: Mollie rail + provider-neutral payment reference.
alter table ticket_orders drop constraint if exists ticket_orders_rail_check;
alter table ticket_orders add constraint ticket_orders_rail_check check (rail in ('stripe', 'free', 'eure', 'mollie'));
alter table ticket_orders add column if not exists provider_payment_id text;
alter table ticket_orders add column if not exists provider_account_id text;
create unique index if not exists ticket_orders_provider_payment_uq on ticket_orders (provider_payment_id) where provider_payment_id is not null;

alter table payment_accounts enable row level security;
alter table payment_account_secrets enable row level security;
alter table payment_events enable row level security;

-- Supabase hands anon/authenticated default grants on every new table; none of these are client-facing.
revoke all on payment_accounts, payment_account_secrets, payment_events from anon, authenticated;

-- 5) Feature flag, default OFF. Same semantics as stripe_connect_enabled: 'true' = everyone,
--    any other non-empty value = comma-separated wallet allowlist, missing/'false' = off.
insert into app_settings (key, value) values ('mollie_enabled', 'false')
on conflict (key) do nothing;
