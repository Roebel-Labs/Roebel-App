-- Persistent daily sponsorship budget for /api/passkey/sponsor (feat/passkey-signin, PREVIEW-ONLY).
-- NOT APPLIED. Gate for Max: apply, then set PASSKEY_SPONSOR_BUDGET_STORE=supabase on the
-- Vercel Preview env (unset = the per-instance in-memory budget).
--
-- One row per (UTC day, budget key). The budget key is the lowercased identity the sponsor
-- policy bound the op to (legacy thirdweb account, citizen Safe, recovered wallet, or the
-- non-citizen passkey Safe in the everyday mode's onboarding tier). The pseudo key 'global'
-- holds the day's total across all identities.
--
-- Access: server-only through the service role (apps/web/src/lib/passkey/sponsor-budget.ts,
-- SupabaseSponsorBudget). RLS on, NO policies, every table privilege revoked from
-- anon/authenticated. The reserve function is SECURITY DEFINER with an empty search_path and
-- EXECUTE revoked from public/anon/authenticated (Supabase grants EXECUTE on new functions to
-- anon + authenticated by default, so the revoke is load-bearing).

create table if not exists public.passkey_sponsor_budget (
  day         date not null,
  budget_key  text not null check (budget_key = 'global' or budget_key ~ '^0x[0-9a-f]{40}$'),
  spent_wei   numeric(78, 0) not null default 0 check (spent_wei >= 0),
  updated_at  timestamptz not null default now(),
  primary key (day, budget_key)
);

alter table public.passkey_sponsor_budget enable row level security;

revoke all on table public.passkey_sponsor_budget from public, anon, authenticated;
grant select, insert, update, delete on table public.passkey_sponsor_budget to service_role;

comment on table public.passkey_sponsor_budget is
  'Passkey sponsor spend (wei of EntryPoint prefund reserved) per UTC day per identity; key ''global'' = day total. Service role only.';

-- Atomic check-and-add. Returns true when the cost fits under BOTH caps (and is then counted),
-- false otherwise (nothing counted). The day is the database's UTC date, not the caller's clock.
-- Lock order is always global row first, then the key row, so concurrent calls cannot deadlock.
create or replace function public.passkey_sponsor_reserve(
  p_budget_key text,
  p_cost_wei numeric,
  p_key_cap_wei numeric,
  p_global_cap_wei numeric
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_global numeric;
  v_key numeric;
begin
  if p_budget_key is null or p_budget_key !~ '^0x[0-9a-f]{40}$' then
    raise exception 'passkey_sponsor_reserve: budget key must be a lowercased address';
  end if;
  if p_cost_wei is null or p_cost_wei < 0 or p_key_cap_wei is null or p_key_cap_wei < 0
     or p_global_cap_wei is null or p_global_cap_wei < 0 then
    return false;
  end if;

  insert into public.passkey_sponsor_budget (day, budget_key) values (v_day, 'global')
    on conflict (day, budget_key) do nothing;
  insert into public.passkey_sponsor_budget (day, budget_key) values (v_day, p_budget_key)
    on conflict (day, budget_key) do nothing;

  select spent_wei into v_global from public.passkey_sponsor_budget
    where day = v_day and budget_key = 'global' for update;
  select spent_wei into v_key from public.passkey_sponsor_budget
    where day = v_day and budget_key = p_budget_key for update;

  if v_key + p_cost_wei > p_key_cap_wei or v_global + p_cost_wei > p_global_cap_wei then
    return false;
  end if;

  update public.passkey_sponsor_budget set spent_wei = spent_wei + p_cost_wei, updated_at = now()
    where day = v_day and budget_key in ('global', p_budget_key);
  return true;
end;
$$;

revoke all on function public.passkey_sponsor_reserve(text, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.passkey_sponsor_reserve(text, numeric, numeric, numeric) to service_role;

comment on function public.passkey_sponsor_reserve(text, numeric, numeric, numeric) is
  'Atomic daily sponsor budget reservation for /api/passkey/sponsor. Service role only.';
