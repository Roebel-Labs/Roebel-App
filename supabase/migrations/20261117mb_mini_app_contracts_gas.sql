-- supabase/migrations/20261117mb_mini_app_contracts_gas.sql
-- Mini Apps 3: the `contracts` declaration of a version-2 manifest and the gas budget per
-- mini app that pays for its sponsored (gasless) calls (plan
-- docs/superpowers/plans/2026-11-17-miniapp-3-wallet.md, Task 2).
-- NOT APPLIED. Applying this file is an owner gate; the code writes without `contracts`
-- and refuses every mini-app sponsorship until then. Apply AFTER 20261117ma_mini_app_identity.sql.
--
-- Budget model: every reservation counts the reserved maximum of the operation (the
-- EntryPoint prefund), like passkey_sponsor_budget. Three counters, all must have room:
--   - the app's lifetime budget (mini_apps.gas_budget_wei, granted at review, default 0),
--   - the person's allowance per UTC day across all mini apps ('person:<address>' row),
--   - the day's total across all mini apps ('global' row).
-- These counters are separate from passkey_sponsor_budget: a mini app can never spend the
-- citizens' everyday sponsor budget.
--
-- Column access: the anon read policy "mini_apps read live" is row-level and Supabase grants
-- table-level SELECT to anon, so gas_budget_wei / gas_spent_wei are readable for live apps.
-- Restricting them would need a column-level re-grant of the whole table for anon (every
-- future column would then be hidden by default and `select *` would break); not done here.
-- The two values are not secret.

alter table public.mini_apps
  add column if not exists contracts jsonb not null default '[]'::jsonb,
  add column if not exists gas_budget_wei numeric(78, 0) not null default 0,
  add column if not exists gas_spent_wei numeric(78, 0) not null default 0;

alter table public.mini_apps
  drop constraint if exists mini_apps_gas_budget_check;
alter table public.mini_apps
  add constraint mini_apps_gas_budget_check check (gas_budget_wei >= 0 and gas_spent_wei >= 0);

create table if not exists public.mini_app_gas_daily (
  day        date not null,
  key        text not null check (key = 'global' or key ~ '^person:0x[0-9a-f]{40}$'),
  spent_wei  numeric(78, 0) not null default 0 check (spent_wei >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, key)
);

-- Service role only: RLS on, no policies, no table privileges for the API roles.
alter table public.mini_app_gas_daily enable row level security;
revoke all on table public.mini_app_gas_daily from public, anon, authenticated;
grant select, insert, update, delete on table public.mini_app_gas_daily to service_role;

comment on table public.mini_app_gas_daily is
  'Mini-app sponsor spend (wei of EntryPoint prefund reserved) per UTC day: key ''global'' = all mini apps, ''person:<address>'' = one person across all mini apps. Service role only.';

-- Atomic check-and-add over the three counters, in one transaction with row locks.
-- Returns 'app_budget' | 'person_budget' | 'global_budget' (nothing counted) or 'ok' (the
-- cost added to all three). The day is the database's UTC date, not the caller's clock.
-- Lock order is always: the app row, the global row, the person row (no deadlocks).
create or replace function public.mini_app_gas_reserve(
  p_mini_app_id uuid,
  p_person text,
  p_cost_wei numeric,
  p_person_cap_wei numeric,
  p_global_cap_wei numeric
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_person_key text;
  v_budget numeric;
  v_spent numeric;
  v_global numeric;
  v_person numeric;
begin
  if p_person is null or p_person !~ '^0x[0-9a-f]{40}$' then
    raise exception 'mini_app_gas_reserve: person must be a lowercased address';
  end if;
  if p_cost_wei is null or p_cost_wei < 0 or p_person_cap_wei is null or p_person_cap_wei < 0
     or p_global_cap_wei is null or p_global_cap_wei < 0 then
    return 'app_budget';
  end if;
  v_person_key := 'person:' || p_person;

  select gas_budget_wei, gas_spent_wei into v_budget, v_spent
    from public.mini_apps where id = p_mini_app_id for update;
  if not found or v_spent + p_cost_wei > v_budget then
    return 'app_budget';
  end if;

  insert into public.mini_app_gas_daily (day, key) values (v_day, 'global')
    on conflict (day, key) do nothing;
  insert into public.mini_app_gas_daily (day, key) values (v_day, v_person_key)
    on conflict (day, key) do nothing;

  select spent_wei into v_global from public.mini_app_gas_daily
    where day = v_day and key = 'global' for update;
  select spent_wei into v_person from public.mini_app_gas_daily
    where day = v_day and key = v_person_key for update;

  if v_person + p_cost_wei > p_person_cap_wei then
    return 'person_budget';
  end if;
  if v_global + p_cost_wei > p_global_cap_wei then
    return 'global_budget';
  end if;

  update public.mini_apps set gas_spent_wei = gas_spent_wei + p_cost_wei where id = p_mini_app_id;
  update public.mini_app_gas_daily set spent_wei = spent_wei + p_cost_wei, updated_at = now()
    where day = v_day and key in ('global', v_person_key);
  return 'ok';
end;
$$;

revoke all on function public.mini_app_gas_reserve(uuid, text, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.mini_app_gas_reserve(uuid, text, numeric, numeric, numeric) to service_role;

comment on function public.mini_app_gas_reserve(uuid, text, numeric, numeric, numeric) is
  'Atomic mini-app gas reservation (app budget, person per day, global per day) for /api/passkey/sponsor. Service role only.';
