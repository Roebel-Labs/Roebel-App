-- Röbel Münzen reward rail (Phase 1). On-chain payouts are signed by the funder hot
-- wallet inside the claim-reward edge function; these tables are the config + idempotency
-- + audit layer. Service-role only (RLS on, no anon/authenticated policies).
-- Applied via Supabase MCP 2026-06-20.

-- Per-action reward configuration (admin-editable, like rewards_tasks).
create table if not exists public.reward_config (
  action          text primary key,
  amount_atto     numeric not null,            -- payout in atto-Münzen (18 dp)
  enabled         boolean not null default true,
  per_reference   boolean not null default true,   -- true = once per (wallet, reference_id)
  cooldown_hours  integer,
  daily_cap       integer,                     -- max paid claims/wallet/day for this action
  description     text,
  updated_at      timestamptz not null default now()
);

-- Idempotency + audit of every payout attempt. The unique index is the anti-double-pay spine.
create table if not exists public.reward_claims (
  id            uuid primary key default gen_random_uuid(),
  wallet        text not null,
  action        text not null references public.reward_config(action),
  reference_id  text not null,                 -- proposal_id / event id / sentinel(=action)
  amount_atto   numeric not null,
  status        text not null default 'pending', -- pending | paid | failed | rejected
  tx_hash       text,
  error         text,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz,
  unique (wallet, action, reference_id)
);
create index if not exists reward_claims_wallet_idx on public.reward_claims (wallet, action, created_at desc);

-- Operational mirror of the funder float (dashboards / low-balance alerts).
create table if not exists public.funder_ledger (
  id           uuid primary key default gen_random_uuid(),
  direction    text not null,                  -- payout | charge | topup | sweep
  wallet       text,
  amount_atto  numeric not null,
  ref          text,
  tx_hash      text,
  created_at   timestamptz not null default now()
);

-- Locked to service role: the edge function (service key) bypasses RLS; nobody else may
-- read/write reward rows directly. (No policies created on purpose.)
alter table public.reward_config  enable row level security;
alter table public.reward_claims  enable row level security;
alter table public.funder_ledger  enable row level security;

-- Seed config with conservative placeholder amounts (admin-tunable). 1 Münze = 1e18 atto.
insert into public.reward_config (action, amount_atto, enabled, per_reference, daily_cap, description) values
  ('proposal_vote', 1000000000000000000,  true,  true, null, 'Teilnahme an einer Abstimmung (1x pro Vorschlag, nur Teilnahme – nie die Wahl)'),
  ('event_submit',  3000000000000000000,  true,  true, 3,    'Veranstaltung eingereicht (max. 3/Tag)')
on conflict (action) do nothing;
