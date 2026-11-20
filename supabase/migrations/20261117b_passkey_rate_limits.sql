-- Shared rate limit for the passkey warning email (Sovereign Sign-up plan 1, Task 10).
-- NOT APPLIED. Gate for Max: apply through the Supabase MCP, then set
-- PASSKEY_RATE_LIMIT_STORE=supabase on Vercel.
--
-- One fixed-window counter row per (scope, key_hash). key_hash is a sha256 of the lowercased
-- key (Safe address or email address), so no email address is stored.
--
-- Access: service role only. RLS on with no policies; table privileges revoked; the function is
-- SECURITY DEFINER with an empty search_path and EXECUTE only for service_role (Supabase grants
-- EXECUTE on new functions to anon + authenticated by default, so the revoke is load-bearing).

create table if not exists public.passkey_rate_limits (
  scope text not null check (scope in ('email-safe', 'email-address')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  count int not null,
  primary key (scope, key_hash)
);

alter table public.passkey_rate_limits enable row level security;
revoke all on table public.passkey_rate_limits from public, anon, authenticated;

comment on table public.passkey_rate_limits is
  'Fixed-window rate-limit counters for the passkey warning email. key_hash = sha256 of the lowercased key; no address stored. Service role only.';

-- Counts one hit. Returns true when the hit fits in the window's limit, false when the limit is
-- already reached (nothing counted). The window restarts when now() >= window_start + window.
-- The clock is the database's.
create or replace function public.passkey_rate_take(
  p_scope text,
  p_key_hash text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds < 1 then
    return false;
  end if;

  insert into public.passkey_rate_limits as r (scope, key_hash, window_start, count)
  values (p_scope, p_key_hash, now(), 1)
  on conflict (scope, key_hash) do update
    set window_start = case
          when now() >= r.window_start + make_interval(secs => p_window_seconds) then now()
          else r.window_start
        end,
        count = case
          when now() >= r.window_start + make_interval(secs => p_window_seconds) then 1
          else r.count + 1
        end
    where now() >= r.window_start + make_interval(secs => p_window_seconds)
       or r.count < p_limit
  returning count into v_count;

  -- No row returned = the conflict branch was skipped (window still open, limit reached).
  return v_count is not null;
end;
$$;

revoke all on function public.passkey_rate_take(text, text, int, int) from public, anon, authenticated;
grant execute on function public.passkey_rate_take(text, text, int, int) to service_role;
