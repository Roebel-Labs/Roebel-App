-- Smart Event QR (step 2): RCRC attendance rewards from the operational funder.
-- reward_events is the registry of valid events (so event_attend can't be claimed for a
-- made-up id). The funder pays a small RCRC reward, once per (wallet, event) — a web-of-trust
-- "was in Röbel" marker. Works for citizens AND onboarded tourists (holding RCRC ≠ minting it).
-- Applied via Supabase MCP 2026-06-20.

create table if not exists public.reward_events (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  starts_at   timestamptz,
  expires_at  timestamptz,                 -- null = no expiry
  active      boolean not null default true,
  created_by  text,                        -- citizen wallet that created it
  created_at  timestamptz not null default now()
);
alter table public.reward_events enable row level security;

insert into public.reward_config (action, amount_atto, enabled, per_reference, daily_cap, description) values
  ('event_attend', 5000000000000000000, true, true, null, 'Bei einem lokalen Röbel-Event dabei gewesen (1x pro Event; auch für Gäste)')
on conflict (action) do nothing;
