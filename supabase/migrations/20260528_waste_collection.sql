-- 20260528_waste_collection.sql
-- Abfallkalender (waste collection calendar) for Röbel/Müritz.
--
-- Data source: Landkreis Mecklenburgische Seenplatte GeMoS WasteBox ICS feed.
-- Operator: REMONDIS Seenplatte (field collection); calendar published by Landkreis.
-- Röbel node_id = 12236.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.waste_collection (
  id bigserial primary key,
  node_id int not null,
  pickup_date date not null,
  fraction text not null,
  summary text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  source_url text not null,
  ics_uid text,
  updated_at timestamptz not null default now(),
  unique (node_id, pickup_date, fraction)
);

create index if not exists waste_collection_node_date_idx
  on public.waste_collection (node_id, pickup_date);

alter table public.waste_collection enable row level security;

drop policy if exists "public read waste_collection" on public.waste_collection;
create policy "public read waste_collection"
  on public.waste_collection for select
  using (true);

-- Weekly sync via pg_cron: Mondays 03:00 UTC.
-- Idempotent: unschedule existing job before re-creating.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'sync-abfallkalender-weekly';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end $$;

select cron.schedule(
  'sync-abfallkalender-weekly',
  '0 3 * * 1',
  $$
  select net.http_post(
    url := 'https://wwbeqhkslxdxhktqzqti.supabase.co/functions/v1/sync-abfallkalender',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
