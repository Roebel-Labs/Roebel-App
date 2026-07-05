-- Sommer Camp hackathon registrations (landing page /sommercamp).
-- Wallet-keyed: registering also creates/updates the `developers` row, so a
-- registration doubles as mini-app developer onboarding. Service-role only;
-- reads/writes go through apps/web API routes.
create table if not exists hackathon_registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null default 'sommercamp-2026',
  wallet text not null,
  name text not null,
  age int,
  privacy_accepted_at timestamptz not null,
  agb_accepted_at timestamptz not null,
  newsletter_opt_in boolean not null default false,
  unique (event, wallet)
);

alter table hackathon_registrations enable row level security;
-- No anon/authenticated policies on purpose: service-role access only.

create index if not exists hackathon_registrations_event_idx
  on hackathon_registrations (event, created_at desc);
