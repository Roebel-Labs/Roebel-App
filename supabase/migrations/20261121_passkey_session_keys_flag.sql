-- Device sessions ("Röbel Münzen ohne Fingerabdruck"), plan
-- docs/superpowers/plans/2026-11-21-passkey-session-keys-mint.md, Task 9.
--
-- NOT APPLIED. Written by Task 9; Task 13 applies it via the Supabase MCP (project
-- wwbeqhkslxdxhktqzqti) ONLY after the Task 12 security review says RELEASE: yes and Max gives the go.
--
-- 1. Kill switch app_settings.passkey_session_keys_enabled.
--    The sponsor route (apps/web/src/lib/passkey/session-keys-flag.ts) FAILS CLOSED: a missing row,
--    any value but 'true', or a read error = OFF (session-upgrade / session-grant / session ops
--    denied; session-revoke stays sponsored). Until this migration runs the feature is therefore off.
--    The row is inserted as 'false' on purpose (Task 13 step 2 wants it off for the device test anyway);
--    Task 13 step 6 sets it to 'true' for the rollout:
--      update app_settings set value = 'true' where key = 'passkey_session_keys_enabled';
--
-- 2. Budget keys for the device-session modes in the shared sponsor budget
--    (only relevant with PASSKEY_SPONSOR_BUDGET_STORE=supabase; additive on top of
--    20260927_passkey_sponsor_budget.sql + 20261117a_passkey_sponsor_guest_cap.sql, which must be
--    applied first). The handler reserves
--      - session-upgrade / session-grant under the key 'grant:<legacy>' (own per-key cap, so the
--        ~0.0084 xDAI upgrade prefund does not eat the legacy's daily budget);
--      - session (device-key mint) ops under the legacy key PLUS the group 'session:<sender Safe>'
--        (PASSKEY_SPONSOR_SESSION_DAILY_WEI, default 0.005 xDAI per Safe per UTC day).
--    passkey_sponsor_reserve_v2 refused both (address keys only, group 'guests' only), which made the
--    route fail closed with 503. Same signature, same lock order, same grants.

insert into app_settings (key, value) values ('passkey_session_keys_enabled', 'false')
  on conflict (key) do nothing;

alter table public.passkey_sponsor_budget
  drop constraint if exists passkey_sponsor_budget_budget_key_check;
alter table public.passkey_sponsor_budget
  add constraint passkey_sponsor_budget_budget_key_check
  check (
    budget_key in ('global', 'guests')
    or budget_key ~ '^0x[0-9a-f]{40}$'
    or budget_key ~ '^grant:0x[0-9a-f]{40}$'
    or budget_key ~ '^session:0x[0-9a-f]{40}$'
  );

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
  if p_budget_key is null or p_budget_key !~ '^(grant:)?0x[0-9a-f]{40}$' then
    raise exception 'passkey_sponsor_reserve_v2: budget key must be a lowercased address or grant:<address>';
  end if;
  if p_group_key is not null and p_group_key <> 'guests' and p_group_key !~ '^session:0x[0-9a-f]{40}$' then
    raise exception 'passkey_sponsor_reserve_v2: group key must be null, ''guests'' or session:<address>';
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
  'Atomic daily sponsor budget reservation for /api/passkey/sponsor: key = address or grant:<address>, optional group ''guests'' or session:<address>. Service role only.';
