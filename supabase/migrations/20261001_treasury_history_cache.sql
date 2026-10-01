-- Gemeinschaftskasse: fast first paint for the app.
--
-- /api/treasury (apps/web/src/app/api/treasury/route.ts) upserts every
-- complete (non-degraded) answer into this single row; the Expo app reads it
-- with one select and renders the € figure + history right away, then
-- replaces it with the route's live answer when that differs.
--
-- payload = the route's JSON (euroTotal, xdai, eure, rate, rateSource, asOf,
-- history[{ txHash, direction, euro, timestamp, label, link{type,id,title} }],
-- historyAvailable). Public data only (the Safe is public on chain); no
-- wallet addresses are stored.

create table if not exists public.treasury_snapshot (
  id smallint primary key default 1 check (id = 1),
  payload jsonb not null,
  euro_total numeric,
  updated_at timestamptz not null default now()
);

alter table public.treasury_snapshot enable row level security;

-- Readers: anyone (anon + authenticated). Writers: service_role only (it
-- bypasses RLS; no insert/update/delete policy exists for anyone else).
revoke all on table public.treasury_snapshot from public, anon, authenticated;
grant select on table public.treasury_snapshot to anon, authenticated;
grant all on table public.treasury_snapshot to service_role;

drop policy if exists "treasury_snapshot public read" on public.treasury_snapshot;
create policy "treasury_snapshot public read"
  on public.treasury_snapshot
  for select
  to anon, authenticated
  using (true);
