-- Org analytics backbone (spec: docs/superpowers/specs/2026-11-24-account-aware-nav-and-org-analytics-design.md)
--
--   analytics_events  append-only raw events, 90-day retention, no viewer identity
--                     (viewer_hash = sha256(wallet || daily salt), salt rotates daily)
--   analytics_daily   per (owner, object, metric, day) counters, kept forever
--   track_events()    client entry point (batched); resolves the owner server-side
--   triggers          likes, comments, follows/unfollows, event interest counted at the source
--   get_*()           dashboard reads, owner/admin of the account only
--
-- Callers identify by wallet like every other RPC in this app (thirdweb wallets, no Supabase auth).

-- ── Business → account link ────────────────────────────────────────────────
alter table public.businesses add column if not exists account_id uuid references public.accounts(id) on delete set null;
create index if not exists businesses_account_id_idx on public.businesses(account_id);

-- Backfill where the owner wallet owns exactly one organisation account.
update public.businesses b
   set account_id = x.account_id
  from (
    select lower(ao.wallet_address) as w, min(ao.account_id::text)::uuid as account_id
      from public.account_owners ao
      join public.accounts a on a.id = ao.account_id and a.account_type = 'organisation'
     where ao.role = 'owner'
     group by lower(ao.wallet_address)
    having count(*) = 1
  ) x
 where b.account_id is null and lower(b.owner_wallet_address) = x.w;

-- ── Tables ────────────────────────────────────────────────────────────────
create table if not exists public.analytics_events (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  owner_account_id uuid not null,
  object_type text not null check (object_type in ('post','deal','listing','event','profile','mini_app','ticket','link','org')),
  object_id text not null,
  metric text not null check (metric in ('view','impression','click','link_tap','share','like','comment','follow','unfollow','open','interest','save')),
  surface text,
  viewer_hash text
);
create index if not exists analytics_events_owner_time_idx on public.analytics_events(owner_account_id, occurred_at);
alter table public.analytics_events enable row level security;

create table if not exists public.analytics_daily (
  owner_account_id uuid not null,
  object_type text not null,
  object_id text not null,
  metric text not null,
  day date not null,
  count integer not null default 0,
  primary key (owner_account_id, object_type, object_id, metric, day)
);
create index if not exists analytics_daily_owner_day_idx on public.analytics_daily(owner_account_id, day);
alter table public.analytics_daily enable row level security;

create table if not exists public.analytics_salt (
  day date primary key,
  salt text not null
);
alter table public.analytics_salt enable row level security;

-- ── Helpers ───────────────────────────────────────────────────────────────
create or replace function public.analytics_try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- Personal account of a wallet (posts without account_id belong to it).
create or replace function public.analytics_personal_account(p_wallet text) returns uuid
language sql stable security definer set search_path = public as $$
  select ao.account_id
    from account_owners ao
    join accounts a on a.id = ao.account_id and a.account_type = 'personal'
   where lower(ao.wallet_address) = lower(p_wallet)
   limit 1
$$;

create or replace function public.analytics_owner_of(p_type text, p_id text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_uuid uuid := analytics_try_uuid(p_id);
  v_owner uuid;
begin
  if p_type in ('profile', 'org') then
    select id into v_owner from accounts where id = v_uuid;
  elsif p_type = 'post' then
    select coalesce(p.account_id, analytics_personal_account(p.wallet_address)) into v_owner from posts p where p.id = v_uuid;
  elsif p_type = 'event' then
    select account_id into v_owner from events where id = v_uuid;
  elsif p_type = 'listing' then
    select account_id into v_owner from marketplace_listings where id = v_uuid;
  elsif p_type = 'mini_app' then
    select org_account_id into v_owner from mini_apps where id::text = p_id;
  elsif p_type = 'deal' then
    select b.account_id into v_owner from business_deals d join businesses b on b.id = d.business_id where d.id = v_uuid;
  elsif p_type = 'ticket' then
    select e.account_id into v_owner from tickets t join events e on e.id = t.event_id where t.id = v_uuid;
  end if;
  return v_owner;
end $$;

create or replace function public.analytics_bump(p_owner uuid, p_type text, p_id text, p_metric text, p_day date, p_n integer default 1)
returns void language sql security definer set search_path = public as $$
  insert into analytics_daily (owner_account_id, object_type, object_id, metric, day, count)
  values (p_owner, p_type, p_id, p_metric, p_day, p_n)
  on conflict (owner_account_id, object_type, object_id, metric, day)
  do update set count = analytics_daily.count + excluded.count
$$;

create or replace function public.analytics_viewer_hash(p_wallet text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_salt text;
  v_day date := (now() at time zone 'Europe/Berlin')::date; -- same day boundary as the counters
begin
  if p_wallet is null or btrim(p_wallet) = '' then return null; end if;
  -- pgcrypto lives in the `extensions` schema on Supabase: qualify, search_path is pinned to public.
  insert into analytics_salt(day, salt) values (v_day, encode(extensions.gen_random_bytes(16), 'hex'))
  on conflict (day) do nothing;
  select salt into v_salt from analytics_salt where day = v_day;
  return encode(extensions.digest(lower(p_wallet) || v_salt, 'sha256'), 'hex');
end $$;

-- Record one event: raw row + daily counter. Owner resolved from the object.
create or replace function public.analytics_record(p_type text, p_id text, p_metric text, p_surface text, p_viewer_hash text, p_at timestamptz default now())
returns boolean language plpgsql security definer set search_path = public as $$
declare v_owner uuid := analytics_owner_of(p_type, p_id);
begin
  if v_owner is null then return false; end if;
  insert into analytics_events(occurred_at, owner_account_id, object_type, object_id, metric, surface, viewer_hash)
  values (p_at, v_owner, p_type, p_id, p_metric, p_surface, p_viewer_hash);
  perform analytics_bump(v_owner, p_type, p_id, p_metric, (p_at at time zone 'Europe/Berlin')::date, 1);
  return true;
end $$;

create or replace function public.analytics_enabled() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value from app_settings where key = 'analytics_tracking_enabled'), 'true') <> 'false'
$$;

-- ── Client entry point ────────────────────────────────────────────────────
create or replace function public.track_events(p_events jsonb, p_wallet text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  e jsonb;
  v_type text; v_id text; v_metric text; v_surface text;
  v_hash text;
  v_n integer := 0;
begin
  if not analytics_enabled() then return 0; end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then return 0; end if;
  v_hash := analytics_viewer_hash(p_wallet);

  for e in select * from jsonb_array_elements(p_events) limit 50 loop
    v_type := e->>'object_type';
    v_id := e->>'object_id';
    v_metric := e->>'metric';
    v_surface := left(e->>'surface', 40);
    if v_type is null or v_id is null or v_metric is null then continue; end if;
    if v_type not in ('post','deal','listing','event','profile','mini_app','ticket','link','org') then continue; end if;
    if v_metric not in ('view','impression','click','link_tap','share','open','save') then continue; end if; -- like/comment/follow/interest come from triggers

    if not analytics_record(v_type, v_id, v_metric, v_surface, v_hash) then continue; end if;
    v_n := v_n + 1;

    -- Legacy counters (posts/listings/deals views_count, clicks_count) keep their existing writers;
    -- track_events only feeds the analytics tables, so nothing is counted twice.
  end loop;
  return v_n;
end $$;

grant execute on function public.track_events(jsonb, text) to anon, authenticated;

-- ── Source triggers (likes, comments, follows, interest) ──────────────────
create or replace function public.analytics_trg_post_like() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if analytics_enabled() then
      perform analytics_record('post', new.post_id::text, 'like', 'like', analytics_viewer_hash(new.wallet_address), coalesce(new.created_at, now()));
    end if;
  exception when others then
    null; -- analytics must never block the source write
  end;
  return new;
end $$;
drop trigger if exists analytics_post_like on public.post_likes;
create trigger analytics_post_like after insert on public.post_likes for each row execute function public.analytics_trg_post_like();

create or replace function public.analytics_trg_post_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if analytics_enabled() then
      perform analytics_record('post', new.post_id::text, 'comment', 'comment', analytics_viewer_hash(new.wallet_address), coalesce(new.created_at, now()));
    end if;
  exception when others then
    null; -- analytics must never block the source write
  end;
  return new;
end $$;
drop trigger if exists analytics_post_comment on public.post_comments;
create trigger analytics_post_comment after insert on public.post_comments for each row execute function public.analytics_trg_post_comment();

create or replace function public.analytics_trg_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if analytics_enabled() then
      if tg_op = 'INSERT' then
        perform analytics_record('profile', new.target_account_id::text, 'follow', new.source, analytics_viewer_hash(new.follower_wallet), coalesce(new.created_at, now()));
      else
        perform analytics_record('profile', old.target_account_id::text, 'unfollow', null, analytics_viewer_hash(old.follower_wallet), now());
      end if;
    end if;
  exception when others then
    null; -- analytics must never block the source write
  end;
  return null;
end $$;
drop trigger if exists analytics_follow on public.account_follows;
create trigger analytics_follow after insert or delete on public.account_follows for each row execute function public.analytics_trg_follow();

create or replace function public.analytics_trg_event_interest() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if analytics_enabled() then
      perform analytics_record('event', new.event_id::text, 'interest', 'interest', analytics_viewer_hash(new.user_wallet), coalesce(new.created_at, now()));
    end if;
  exception when others then
    null; -- analytics must never block the source write
  end;
  return new;
end $$;
drop trigger if exists analytics_event_interest on public.event_interests;
create trigger analytics_event_interest after insert on public.event_interests for each row execute function public.analytics_trg_event_interest();

-- ── Backfill daily counters from history (no raw events, no viewer data) ──
insert into public.analytics_daily (owner_account_id, object_type, object_id, metric, day, count)
select owner, 'post', post_id, 'like', day, count(*)::int from (
  select public.analytics_owner_of('post', l.post_id::text) owner, l.post_id::text post_id, (l.created_at at time zone 'Europe/Berlin')::date day
    from public.post_likes l) s
 where owner is not null group by owner, post_id, day
on conflict do nothing;

insert into public.analytics_daily (owner_account_id, object_type, object_id, metric, day, count)
select owner, 'post', post_id, 'comment', day, count(*)::int from (
  select public.analytics_owner_of('post', c.post_id::text) owner, c.post_id::text post_id, (c.created_at at time zone 'Europe/Berlin')::date day
    from public.post_comments c) s
 where owner is not null group by owner, post_id, day
on conflict do nothing;

insert into public.analytics_daily (owner_account_id, object_type, object_id, metric, day, count)
select f.target_account_id, 'profile', f.target_account_id::text, 'follow', (f.created_at at time zone 'Europe/Berlin')::date, count(*)::int
  from public.account_follows f join public.accounts a on a.id = f.target_account_id
 group by 1, 3, 5
on conflict do nothing;

insert into public.analytics_daily (owner_account_id, object_type, object_id, metric, day, count)
select owner, 'event', event_id, 'interest', day, count(*)::int from (
  select public.analytics_owner_of('event', i.event_id::text) owner, i.event_id::text event_id, (i.created_at at time zone 'Europe/Berlin')::date day
    from public.event_interests i) s
 where owner is not null group by owner, event_id, day
on conflict do nothing;

-- ── Dashboard reads (owner/admin only) ────────────────────────────────────
create or replace function public.analytics_assert_access(p_account_id uuid, p_wallet text, p_from date, p_to date)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  if p_to - p_from > 730 then
    raise exception 'range too long' using errcode = '22023';
  end if;
  if not exists (
    select 1 from account_owners
     where account_id = p_account_id and lower(wallet_address) = lower(p_wallet) and role in ('owner', 'admin')
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;

-- One row per day x metric in [p_from, p_to], zero-filled.
create or replace function public.get_account_analytics(
  p_account_id uuid, p_wallet text, p_from date, p_to date, p_metrics text[], p_object_type text default null
) returns table(day date, metric text, count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform analytics_assert_access(p_account_id, p_wallet, p_from, p_to);
  return query
    select d::date, m, coalesce(sum(ad.count), 0)::bigint
      from generate_series(p_from, p_to, interval '1 day') d
     cross join unnest(p_metrics) m
      left join analytics_daily ad
        on ad.owner_account_id = p_account_id and ad.day = d::date and ad.metric = m
       and (p_object_type is null or ad.object_type = p_object_type)
     group by d, m
     order by d, m;
end $$;

-- Totals for the range and the same-length window right before it.
create or replace function public.get_account_analytics_totals(p_account_id uuid, p_wallet text, p_from date, p_to date, p_object_type text default null)
returns table(metric text, current bigint, previous bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_len integer := p_to - p_from + 1;
begin
  perform analytics_assert_access(p_account_id, p_wallet, p_from, p_to);
  return query
    select ad.metric,
           coalesce(sum(ad.count) filter (where ad.day between p_from and p_to), 0)::bigint,
           coalesce(sum(ad.count) filter (where ad.day between p_from - v_len and p_from - 1), 0)::bigint
      from analytics_daily ad
     where ad.owner_account_id = p_account_id
       and ad.day between p_from - v_len and p_to
       and (p_object_type is null or ad.object_type = p_object_type)
     group by ad.metric;
end $$;

create or replace function public.get_top_objects(p_account_id uuid, p_wallet text, p_from date, p_to date, p_metric text, p_limit integer default 10)
returns table(object_type text, object_id text, count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform analytics_assert_access(p_account_id, p_wallet, p_from, p_to);
  return query
    select ad.object_type, ad.object_id, sum(ad.count)::bigint c
      from analytics_daily ad
     where ad.owner_account_id = p_account_id and ad.metric = p_metric and ad.day between p_from and p_to
     group by ad.object_type, ad.object_id
     order by c desc
     limit least(greatest(p_limit, 1), 50);
end $$;

-- Distinct viewers per day (raw events, so at most the last 90 days have data).
create or replace function public.get_account_uniques(p_account_id uuid, p_wallet text, p_from date, p_to date)
returns table(day date, uniques bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform analytics_assert_access(p_account_id, p_wallet, p_from, p_to);
  return query
    select d::date, coalesce(u.n, 0)::bigint
      from generate_series(p_from, p_to, interval '1 day') d
      left join (
        select (e.occurred_at at time zone 'Europe/Berlin')::date dd, count(distinct e.viewer_hash) n
          from analytics_events e
         where e.owner_account_id = p_account_id and e.metric in ('view', 'impression') and e.viewer_hash is not null
           and e.occurred_at >= p_from::timestamp at time zone 'Europe/Berlin'
           and e.occurred_at < (p_to + 1)::timestamp at time zone 'Europe/Berlin'
         group by 1
      ) u on u.dd = d::date
     order by 1;
end $$;

-- Where interactions happen (raw events, last 90 days).
create or replace function public.get_account_surfaces(p_account_id uuid, p_wallet text, p_from date, p_to date)
returns table(surface text, count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform analytics_assert_access(p_account_id, p_wallet, p_from, p_to);
  return query
    select coalesce(e.surface, 'sonstige'), count(*)::bigint
      from analytics_events e
     where e.owner_account_id = p_account_id
       and e.occurred_at >= p_from::timestamp at time zone 'Europe/Berlin'
       and e.occurred_at < (p_to + 1)::timestamp at time zone 'Europe/Berlin'
     group by 1 order by 2 desc limit 12;
end $$;

grant execute on function public.get_account_analytics(uuid, text, date, date, text[], text) to anon, authenticated;
grant execute on function public.get_account_analytics_totals(uuid, text, date, date, text) to anon, authenticated;
grant execute on function public.get_top_objects(uuid, text, date, date, text, integer) to anon, authenticated;
grant execute on function public.get_account_uniques(uuid, text, date, date) to anon, authenticated;
grant execute on function public.get_account_surfaces(uuid, text, date, date) to anon, authenticated;

-- Internal helpers are not callable from clients.
revoke execute on function public.analytics_record(text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.analytics_bump(uuid, text, text, text, date, integer) from public, anon, authenticated;
revoke execute on function public.analytics_viewer_hash(text) from public, anon, authenticated;
revoke execute on function public.analytics_owner_of(text, text) from public, anon, authenticated;
revoke execute on function public.analytics_personal_account(text) from public, anon, authenticated;
revoke execute on function public.analytics_assert_access(uuid, text, date, date) from public, anon, authenticated;

-- ── Retention ─────────────────────────────────────────────────────────────
select cron.schedule('analytics-purge-raw', '20 3 * * *',
  $$delete from public.analytics_events where occurred_at < now() - interval '90 days'; delete from public.analytics_salt where day < current_date - 2;$$);
