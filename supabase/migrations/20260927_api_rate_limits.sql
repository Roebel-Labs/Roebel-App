-- Shared fixed-window rate limits for the web API routes that spend money on the app's behalf
-- (feat/app-secrets-server: /api/ai/anthropic, /api/ai/menu-image, /api/irys/upload).
-- NOT APPLIED. Gate for Max: apply to production. Until then the routes fall back to their
-- per-instance in-memory limit (apps/web/src/lib/rate-limit/index.ts, SharedLimiter).
--
-- Access: server-only through the service role. RLS on, NO policies, every table privilege
-- revoked from anon/authenticated. The take function is SECURITY DEFINER with an empty
-- search_path and EXECUTE revoked from public/anon/authenticated (Supabase grants EXECUTE on
-- new functions to anon + authenticated by default, so the revoke is load-bearing).

create table if not exists public.api_rate_limits (
  bucket_key    text primary key check (char_length(bucket_key) between 1 and 200),
  window_start  timestamptz not null default now(),
  hit_count     integer not null default 0 check (hit_count >= 0)
);

alter table public.api_rate_limits enable row level security;

revoke all on table public.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limits to service_role;

comment on table public.api_rate_limits is
  'Fixed-window hit counters for server API rate limits (key = "<rule>:<identity>"). Service role only.';

-- Atomic count-and-check. Returns true when the hit fits in the current window (and is counted),
-- false when the window is already full (nothing counted). A window older than p_window_seconds
-- restarts at 1. The row lock (for update) serialises concurrent hits on the same key.
create or replace function public.api_rate_limit_take(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.api_rate_limits%rowtype;
begin
  if p_key is null or char_length(p_key) = 0 or char_length(p_key) > 200
     or p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'api_rate_limit_take: invalid arguments';
  end if;

  insert into public.api_rate_limits (bucket_key, window_start, hit_count)
    values (p_key, now(), 0)
    on conflict (bucket_key) do nothing;

  select * into v_row from public.api_rate_limits where bucket_key = p_key for update;

  if v_row.window_start <= now() - make_interval(secs => p_window_seconds) then
    update public.api_rate_limits set window_start = now(), hit_count = 1 where bucket_key = p_key;
    return true;
  end if;

  if v_row.hit_count >= p_limit then
    return false;
  end if;

  update public.api_rate_limits set hit_count = hit_count + 1 where bucket_key = p_key;
  return true;
end;
$$;

revoke all on function public.api_rate_limit_take(text, integer, integer) from public, anon, authenticated;
grant execute on function public.api_rate_limit_take(text, integer, integer) to service_role;

comment on function public.api_rate_limit_take(text, integer, integer) is
  'Fixed-window rate limit hit: true = allowed and counted, false = window full. Service role only.';
