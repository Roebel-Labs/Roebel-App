-- Mini-App Store v2: feature hero image, notification opt-ins, store stats.
-- Applied to project wwbeqhkslxdxhktqzqti via Supabase MCP on 2026-07-05
-- (migration name: mini_app_store_v2). This file is the repo mirror.

-- 1) Feature/hero artwork for the store carousel (gray placeholder when null).
alter table public.mini_apps
  add column if not exists feature_image_url text;

-- 2) Per-(app, wallet) notification opt-in captured by the Expo host's
--    permission sheet. The web dashboard / notification sender reads this
--    server-side before delivering mini-app notifications.
create table if not exists public.mini_app_notification_optins (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  mini_app_id uuid not null references public.mini_apps(id) on delete cascade,
  wallet      text not null,                    -- lowercased smart-account address
  enabled     boolean not null default true,
  source      text not null default 'expo_host',
  unique (mini_app_id, wallet)
);
create index if not exists mini_app_notification_optins_app_idx
  on public.mini_app_notification_optins(mini_app_id);

-- Same trust tier as mini_app_events (anon writes, wallet is display-level
-- identity): the host runs on the anon key without Supabase auth.
alter table public.mini_app_notification_optins enable row level security;
drop policy if exists "mini_app_notification_optins upsert anon" on public.mini_app_notification_optins;
create policy "mini_app_notification_optins upsert anon"
  on public.mini_app_notification_optins
  for insert to anon, authenticated with check (true);
drop policy if exists "mini_app_notification_optins update anon" on public.mini_app_notification_optins;
create policy "mini_app_notification_optins update anon"
  on public.mini_app_notification_optins
  for update to anon, authenticated using (true) with check (true);
drop policy if exists "mini_app_notification_optins read anon" on public.mini_app_notification_optins;
create policy "mini_app_notification_optins read anon"
  on public.mini_app_notification_optins
  for select to anon, authenticated using (true);

-- 3) Store stats for the detail page ("Aufrufe" + "Genutzt von ... Bürger:innen").
--    Security definer so anon can read aggregates without a select policy on
--    mini_app_events.
create or replace function public.get_mini_app_stats(p_mini_app_id uuid)
returns table (views bigint, citizens bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where event = 'app_open')                as views,
    count(distinct wallet) filter (where wallet is not null)  as citizens
  from public.mini_app_events
  where mini_app_id = p_mini_app_id;
$$;

revoke all on function public.get_mini_app_stats(uuid) from public;
grant execute on function public.get_mini_app_stats(uuid) to anon, authenticated, service_role;
