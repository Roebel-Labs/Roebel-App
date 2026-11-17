-- Global daily cap for guest sponsoring (/api/passkey/sponsor, Sovereign Sign-up plan 1, Task 5).
-- NOT APPLIED. Additive on top of 20260927_passkey_sponsor_budget.sql (also not applied; apply
-- that one first, then this one). Gate for Max: apply both, then set
-- PASSKEY_SPONSOR_BUDGET_STORE=supabase on Vercel.
--
-- Every guest (non-citizen) passkey Safe also counts against ONE shared row per UTC day with the
-- pseudo key 'guests', so all guests together can never spend more than the guest cap, however
-- many Safes they create. Citizens never touch that row.
--
-- passkey_sponsor_reserve_v2 = passkey_sponsor_reserve plus an optional group. The v1 function
-- stays as it is (unused by the app from this version on).
--
-- Access: same as v1. SECURITY DEFINER, empty search_path, EXECUTE revoked from
-- public/anon/authenticated (Supabase grants EXECUTE on new functions to anon + authenticated by
-- default, so the revoke is load-bearing), granted to service_role only.

-- Allow the 'guests' pseudo key next to 'global' and lowercased addresses.
alter table public.passkey_sponsor_budget
  drop constraint if exists passkey_sponsor_budget_budget_key_check;
alter table public.passkey_sponsor_budget
  add constraint passkey_sponsor_budget_budget_key_check
  check (budget_key in ('global', 'guests') or budget_key ~ '^0x[0-9a-f]{40}$');

comment on table public.passkey_sponsor_budget is
  'Passkey sponsor spend (wei of EntryPoint prefund reserved) per UTC day per identity; key ''global'' = day total, ''guests'' = all guest Safes together. Service role only.';

-- Atomic check-and-add. Returns true when the cost fits under EVERY cap (key, group when given,
-- global) and is then counted in each of those rows; false otherwise (nothing counted).
-- The day is the database's UTC date, not the caller's clock.
-- Lock order is always: global row, then the group row (when given), then the key row, so
-- concurrent calls cannot deadlock.
create or replace function public.passkey_sponsor_reserve_v2(
  p_budget_key text,
  p_cost_wei numeric,
  p_key_cap_wei numeric,
  p_global_cap_wei numeric,
  p_group_key text,
  p_group_cap_wei numeric
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
begin
  if p_budget_key is null or p_budget_key !~ '^0x[0-9a-f]{40}$' then
    raise exception 'passkey_sponsor_reserve_v2: budget key must be a lowercased address';
  end if;
  if p_group_key is not null and p_group_key <> 'guests' then
    raise exception 'passkey_sponsor_reserve_v2: group key must be null or ''guests''';
  end if;
  if p_cost_wei is null or p_cost_wei < 0 or p_key_cap_wei is null or p_key_cap_wei < 0
     or p_global_cap_wei is null or p_global_cap_wei < 0 then
    return false;
  end if;
  -- A group without a cap is refused, never treated as unlimited.
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

  if v_key + p_cost_wei > p_key_cap_wei or v_global + p_cost_wei > p_global_cap_wei then
    return false;
  end if;
  if p_group_key is not null and v_group + p_cost_wei > p_group_cap_wei then
    return false;
  end if;

  update public.passkey_sponsor_budget set spent_wei = spent_wei + p_cost_wei, updated_at = now()
    where day = v_day
      and (budget_key in ('global', p_budget_key) or (p_group_key is not null and budget_key = p_group_key));
  return true;
end;
$$;

revoke all on function public.passkey_sponsor_reserve_v2(text, numeric, numeric, numeric, text, numeric)
  from public, anon, authenticated;
grant execute on function public.passkey_sponsor_reserve_v2(text, numeric, numeric, numeric, text, numeric)
  to service_role;

comment on function public.passkey_sponsor_reserve_v2(text, numeric, numeric, numeric, text, numeric) is
  'Atomic daily sponsor budget reservation for /api/passkey/sponsor with an optional group cap (''guests''). Service role only.';
