-- Donations / Unterstützungsbeiträge ledger for the Gemeinschaftskasse.
--
-- Money physically lands in the treasury Safe on Gnosis (EURe V2 / xDAI) —
-- on-chain stays the source of truth for balances. These tables are ONLY the
-- attribution + status layer, fed by two webhooks in apps/web:
--
--   /api/monerium/webhook  — incoming SEPA → EURe mints (rail 'sepa')
--   /api/donate/webhook    — Stripe checkout completions (rail 'stripe')
--
-- Wording note (Stripe ToS + Spendenrecht): until a gemeinnütziger e.V. owns
-- the accounts these are "Unterstützungsbeiträge" (voluntary contributions),
-- NOT tax-deductible Spenden. See docs/MONERIUM_FIAT_TREASURY_RESEARCH.md §5/§6.
--
-- RLS: enabled with NO anon policies — every read/write goes through the web
-- API using the service-role client. Public surfaces get sanitized views via
-- /api/donate/recent (never wallet addresses, never raw memos).

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  -- 'sepa'   = bank transfer to the Monerium IBAN (auto-mints EURe into the Safe)
  -- 'stripe' = card / Apple Pay / Google Pay checkout (reaches the Safe later
  --            via the aggregated Stripe payout to the same IBAN)
  -- 'onchain' = direct transfer to the Safe (recorded manually / by indexer later)
  rail text not null check (rail in ('sepa','stripe','onchain')),
  status text not null default 'pending' check (status in ('pending','settled','failed','refunded')),
  amount_cents bigint not null check (amount_cents > 0),
  -- Stripe: amount net of Stripe fees (from the balance transaction), so the
  -- transparent ledger can show what actually reaches the treasury. NULL for
  -- SEPA (Monerium charges nothing — net == gross).
  net_amount_cents bigint,
  currency text not null default 'eur',
  donor_name text,
  donor_message text,
  donor_wallet_address text,
  public_visible boolean not null default true,
  -- SEPA reference code (RBL-XXXXXX) that attributed this donation, if any.
  reference_code text,
  campaign text,
  stripe_session_id text,
  stripe_payment_intent_id text,
  monerium_order_id text,
  tx_hash text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

-- Idempotency anchors for webhook replays (partial: rails don't share ids).
create unique index if not exists donations_stripe_session_uq
  on public.donations (stripe_session_id) where stripe_session_id is not null;
create unique index if not exists donations_monerium_order_uq
  on public.donations (monerium_order_id) where monerium_order_id is not null;
create index if not exists donations_status_created_idx
  on public.donations (status, created_at desc);

comment on table public.donations is
  'Attribution ledger for Gemeinschaftskasse contributions across rails (sepa/stripe/onchain). On-chain is the balance source of truth.';

-- Personal SEPA reference codes. A donor puts their code in the bank-transfer
-- Verwendungszweck; the Monerium webhook regex-matches it in the order memo.
-- One persistent code per wallet (find-or-create); anonymous web visitors get
-- a fresh code per request (wallet_address null).
create table if not exists public.donation_references (
  code text primary key,
  wallet_address text,
  display_name text,
  campaign text,
  created_at timestamptz not null default now()
);
create unique index if not exists donation_references_wallet_uq
  on public.donation_references (wallet_address) where wallet_address is not null;

-- Raw Monerium webhook event log: idempotency (event_id PK — retries reuse the
-- same webhook-id) + audit trail + debugging.
create table if not exists public.monerium_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  processed boolean not null default false,
  error text,
  received_at timestamptz not null default now()
);

alter table public.donations enable row level security;
alter table public.donation_references enable row level security;
alter table public.monerium_events enable row level security;

-- app_settings keys used by the donation system (seeded via admin, no DDL):
--   donations_enabled       'true' | 'false'  (kill switch; missing = disabled)
--   donation_iban           the Monerium IBAN (EE…)
--   donation_bic            BIC of the IBAN
--   donation_recipient_name account holder name donors must enter
