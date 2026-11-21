-- Settle-able sponsor reservations (security review M-2, owner decision 2026-11-21:
-- "keep reserving the max prefund when a voucher is issued, but SETTLE to the actual gas once the
-- op has landed, or release the reservation if it never lands").
--
-- NOT APPLIED. Apply ONLY after, in this order:
--   1. 20260927_passkey_sponsor_budget.sql
--   2. 20261117a_passkey_sponsor_guest_cap.sql
--   3. 20261121_passkey_session_keys_flag.sql   (budget-key constraint allowing grant:/session: keys)
--   4. this file
-- Only relevant with PASSKEY_SPONSOR_BUDGET_STORE=supabase.
--
-- Code: apps/web/src/lib/passkey/sponsor-budget.ts (SupabaseSponsorBudget) and sponsor-settle.ts.
--  - passkey_sponsor_reserve_v3: v2 plus ONE reservation per (sender, nonce) (id '<sender>:0x<nonce>').
--    A repeat request for the same open id tops the reservation up to the larger prefund instead of
--    reserving again; a settled id (that nonce landed) is refused.
--  - passkey_sponsor_settle_v1(id, actual): the server read actualGasCost from the EntryPoint's
--    UserOperationEvent; the day's rows give back reserved - least(actual, reserved).
--  - passkey_sponsor_release_v1(id): the voucher expired and the op never landed; everything back.
--  - passkey_sponsor_expired_v1: open reservations past their voucher validUntil (lazy sweep input).
--
-- Access: like v2. RLS on, no policies, privileges revoked from anon/authenticated; SECURITY DEFINER
-- functions with an empty search_path, EXECUTE revoked from public/anon/authenticated (Supabase grants
-- it by default, so the revoke is load-bearing), granted to service_role only.
-- Lock order everywhere: global row, group row, key row, then the reservation row.

create table if not exists public.passkey_sponsor_reservations (
  reservation_id text primary key check (reservation_id ~ '^0x[0-9a-f]{40}:0x[0-9a-f]{1,64}$'),
  day            date not null,
  budget_key     text not null,
  group_key      text,
  sender         text not null check (sender ~ '^0x[0-9a-f]{40}$'),
  nonce          numeric(78, 0) not null check (nonce >= 0),
  reserved_wei   numeric(78, 0) not null check (reserved_wei >= 0),
  actual_wei     numeric(78, 0) check (actual_wei is null or actual_wei >= 0),
  status         text not null default 'open' check (status in ('open', 'settled', 'released')),
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists passkey_sponsor_reservations_open_idx
  on public.passkey_sponsor_reservations (expires_at) where status = 'open';
create index if not exists passkey_sponsor_reservations_key_open_idx
  on public.passkey_sponsor_reservations (budget_key, expires_at) where status = 'open';

alter table public.passkey_sponsor_reservations enable row level security;
revoke all on table public.passkey_sponsor_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.passkey_sponsor_reservations to service_role;

comment on table public.passkey_sponsor_reservations is
  'Passkey sponsor reservations per (sender, nonce): max prefund reserved at voucher time, settled to the on-chain actualGasCost or released after expiry. Service role only.';

-- ---------------------------------------------------------------------------
create or replace function public.passkey_sponsor_reserve_v3(
  p_budget_key text,
  p_cost_wei numeric,
  p_key_cap_wei numeric,
  p_global_cap_wei numeric,
  p_group_key text,
  p_group_cap_wei numeric,
  p_reservation_id text,
  p_sender text,
  p_nonce numeric,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_global numeric;
  v_group numeric;
  v_key numeric;
  v_res public.passkey_sponsor_reservations%rowtype;
  v_found boolean;
  v_cost numeric;
begin
  if p_budget_key is null or p_budget_key !~ '^((grant|session):)?0x[0-9a-f]{40}$' then
    raise exception 'passkey_sponsor_reserve_v3: budget key must be an address, grant:<address> or session:<address>';
  end if;
  if p_group_key is not null and p_group_key <> 'guests' and p_group_key !~ '^session:0x[0-9a-f]{40}$' then
    raise exception 'passkey_sponsor_reserve_v3: group key must be null, ''guests'' or session:<address>';
  end if;
  if p_reservation_id is null or p_reservation_id !~ '^0x[0-9a-f]{40}:0x[0-9a-f]{1,64}$'
     or p_sender is null or p_sender !~ '^0x[0-9a-f]{40}$'
     or split_part(p_reservation_id, ':', 1) <> p_sender
     or p_nonce is null or p_nonce < 0 or p_expires_at is null then
    raise exception 'passkey_sponsor_reserve_v3: malformed reservation';
  end if;
  if p_cost_wei is null or p_cost_wei < 0 or p_key_cap_wei is null or p_key_cap_wei < 0
     or p_global_cap_wei is null or p_global_cap_wei < 0 then
    return false;
  end if;
  if p_group_key is not null and (p_group_cap_wei is null or p_group_cap_wei < 0) then
    return false;
  end if;

  insert into public.passkey_sponsor_budget (day, budget_key) values (v_day, 'global')
    on conflict (day, budget_key) do nothing;
  if p_group_key is not null then
    insert into public.passkey_sponsor_budget (day, budget_key) values (v_day, p_group_key)
      on conflict (day, budget_key) do nothing;
  end if;
  insert into public.passkey_sponsor_budget (day, budget_key) values (v_day, p_budget_key)
    on conflict (day, budget_key) do nothing;

  select spent_wei into v_global from public.passkey_sponsor_budget
    where day = v_day and budget_key = 'global' for update;
  if p_group_key is not null then
    select spent_wei into v_group from public.passkey_sponsor_budget
      where day = v_day and budget_key = p_group_key for update;
  end if;
  select spent_wei into v_key from public.passkey_sponsor_budget
    where day = v_day and budget_key = p_budget_key for update;

  select * into v_res from public.passkey_sponsor_reservations
    where reservation_id = p_reservation_id for update;
  v_found := found;

  v_cost := p_cost_wei;
  if v_found and v_res.status = 'settled' then
    return false; -- that nonce has landed already
  end if;
  if v_found and v_res.status = 'open' then
    if v_res.day <> v_day or v_res.budget_key <> p_budget_key or v_res.group_key is distinct from p_group_key then
      return false;
    end if;
    v_cost := greatest(p_cost_wei - v_res.reserved_wei, 0);
  end if;

  if v_key + v_cost > p_key_cap_wei or v_global + v_cost > p_global_cap_wei then
    return false;
  end if;
  if p_group_key is not null and v_group + v_cost > p_group_cap_wei then
    return false;
  end if;

  update public.passkey_sponsor_budget set spent_wei = spent_wei + v_cost, updated_at = now()
    where day = v_day
      and (budget_key in ('global', p_budget_key) or (p_group_key is not null and budget_key = p_group_key));

  if v_found and v_res.status = 'open' then
    update public.passkey_sponsor_reservations
      set reserved_wei = reserved_wei + v_cost,
          expires_at = greatest(expires_at, p_expires_at),
          updated_at = now()
      where reservation_id = p_reservation_id;
  else
    -- new, or a released id (the voucher expired unused) reserved afresh
    insert into public.passkey_sponsor_reservations
      (reservation_id, day, budget_key, group_key, sender, nonce, reserved_wei, actual_wei, status, expires_at, created_at, updated_at)
      values (p_reservation_id, v_day, p_budget_key, p_group_key, p_sender, p_nonce, v_cost, null, 'open', p_expires_at, now(), now())
    on conflict (reservation_id) do update set
      day = excluded.day, budget_key = excluded.budget_key, group_key = excluded.group_key,
      sender = excluded.sender, nonce = excluded.nonce, reserved_wei = excluded.reserved_wei,
      actual_wei = null, status = 'open', expires_at = excluded.expires_at,
      created_at = now(), updated_at = now();
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared by settle / release: adds p_delta (may be negative, floored at 0) to the reservation day's rows.
create or replace function public.passkey_sponsor_adjust_v1(
  p_day date, p_budget_key text, p_group_key text, p_delta numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.passkey_sponsor_budget
    set spent_wei = greatest(spent_wei + p_delta, 0), updated_at = now()
    where day = p_day
      and (budget_key in ('global', p_budget_key) or (p_group_key is not null and budget_key = p_group_key));
end;
$$;

-- Locks the day's rows in the global order, then the reservation; returns the locked reservation.
create or replace function public.passkey_sponsor_lock_reservation_v1(p_reservation_id text)
returns public.passkey_sponsor_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_peek public.passkey_sponsor_reservations%rowtype;
  v_res public.passkey_sponsor_reservations%rowtype;
begin
  select * into v_peek from public.passkey_sponsor_reservations where reservation_id = p_reservation_id;
  if not found then
    return null;
  end if;
  perform 1 from public.passkey_sponsor_budget
    where day = v_peek.day and budget_key = 'global' for update;
  if v_peek.group_key is not null then
    perform 1 from public.passkey_sponsor_budget
      where day = v_peek.day and budget_key = v_peek.group_key for update;
  end if;
  perform 1 from public.passkey_sponsor_budget
    where day = v_peek.day and budget_key = v_peek.budget_key for update;
  select * into v_res from public.passkey_sponsor_reservations
    where reservation_id = p_reservation_id for update;
  return v_res;
end;
$$;

create or replace function public.passkey_sponsor_settle_v1(p_reservation_id text, p_actual_wei numeric)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.passkey_sponsor_reservations%rowtype;
  v_charge numeric;
begin
  if p_reservation_id is null or p_actual_wei is null or p_actual_wei < 0 then
    return 'unknown';
  end if;
  v_res := public.passkey_sponsor_lock_reservation_v1(p_reservation_id);
  if v_res.reservation_id is null then
    return 'unknown';
  end if;
  if v_res.status = 'settled' then
    return 'already_settled';
  end if;
  v_charge := least(p_actual_wei, v_res.reserved_wei);
  if v_res.status = 'open' then
    perform public.passkey_sponsor_adjust_v1(v_res.day, v_res.budget_key, v_res.group_key, v_charge - v_res.reserved_wei);
  else
    -- released by the sweep, yet it landed: charge it again
    perform public.passkey_sponsor_adjust_v1(v_res.day, v_res.budget_key, v_res.group_key, v_charge);
  end if;
  update public.passkey_sponsor_reservations
    set status = 'settled', actual_wei = v_charge, updated_at = now()
    where reservation_id = p_reservation_id;
  return 'settled';
end;
$$;

create or replace function public.passkey_sponsor_release_v1(p_reservation_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.passkey_sponsor_reservations%rowtype;
begin
  if p_reservation_id is null then
    return false;
  end if;
  v_res := public.passkey_sponsor_lock_reservation_v1(p_reservation_id);
  if v_res.reservation_id is null or v_res.status <> 'open' then
    return false;
  end if;
  perform public.passkey_sponsor_adjust_v1(v_res.day, v_res.budget_key, v_res.group_key, -v_res.reserved_wei);
  update public.passkey_sponsor_reservations
    set status = 'released', updated_at = now()
    where reservation_id = p_reservation_id;
  return true;
end;
$$;

create or replace function public.passkey_sponsor_expired_v1(p_before timestamptz, p_budget_key text, p_limit integer)
returns table (reservation_id text, sender text, nonce text, created_at bigint)
language sql
security definer
set search_path = ''
as $$
  select r.reservation_id, r.sender, r.nonce::text, extract(epoch from r.created_at)::bigint
  from public.passkey_sponsor_reservations r
  where r.status = 'open'
    and r.expires_at < p_before
    and (p_budget_key is null or r.budget_key = p_budget_key)
  order by r.expires_at
  limit least(greatest(coalesce(p_limit, 0), 0), 50);
$$;

revoke all on function public.passkey_sponsor_reserve_v3(text, numeric, numeric, numeric, text, numeric, text, text, numeric, timestamptz)
  from public, anon, authenticated;
grant execute on function public.passkey_sponsor_reserve_v3(text, numeric, numeric, numeric, text, numeric, text, text, numeric, timestamptz)
  to service_role;
revoke all on function public.passkey_sponsor_adjust_v1(date, text, text, numeric) from public, anon, authenticated;
grant execute on function public.passkey_sponsor_adjust_v1(date, text, text, numeric) to service_role;
revoke all on function public.passkey_sponsor_lock_reservation_v1(text) from public, anon, authenticated;
grant execute on function public.passkey_sponsor_lock_reservation_v1(text) to service_role;
revoke all on function public.passkey_sponsor_settle_v1(text, numeric) from public, anon, authenticated;
grant execute on function public.passkey_sponsor_settle_v1(text, numeric) to service_role;
revoke all on function public.passkey_sponsor_release_v1(text) from public, anon, authenticated;
grant execute on function public.passkey_sponsor_release_v1(text) to service_role;
revoke all on function public.passkey_sponsor_expired_v1(timestamptz, text, integer) from public, anon, authenticated;
grant execute on function public.passkey_sponsor_expired_v1(timestamptz, text, integer) to service_role;
