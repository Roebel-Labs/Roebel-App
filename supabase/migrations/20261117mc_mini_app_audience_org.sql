-- supabase/migrations/20261117mc_mini_app_audience_org.sql
-- Mini Apps 4: a version-2 manifest says whom an app is for (`audience`) and which org it
-- belongs to (`org`); the org confirms the claim (plan
-- docs/superpowers/plans/2026-11-17-miniapp-4-audience-store-docs.md, Task 1).
-- NOT APPLIED. Applying this file is an owner gate; until then the web writes retry without
-- `audience` / `org_account_id` and the Expo store reads without them (no audience, no org).
-- Apply AFTER 20261117ma_mini_app_identity.sql and 20261117mb_mini_app_contracts_gas.sql.
--
-- Matching happens on the device: the store keeps reading every live app, so `audience` is
-- public by design (it is part of the manifest). `org_binding_decided_by` stores the role that
-- decided ('owner' / 'admin'), never a wallet.

alter table public.mini_apps
  add column if not exists audience jsonb,
  add column if not exists org_account_id uuid,
  add column if not exists org_binding text not null default 'none',
  add column if not exists org_binding_decided_at timestamptz,
  add column if not exists org_binding_decided_by text;

-- Named explicitly: the Expo store embeds the org's name with
-- `accounts!mini_apps_org_account_id_fkey(name)` (an unhinted embed could become ambiguous).
alter table public.mini_apps
  drop constraint if exists mini_apps_org_account_id_fkey;
alter table public.mini_apps
  add constraint mini_apps_org_account_id_fkey
  foreign key (org_account_id) references public.accounts(id) on delete set null;

alter table public.mini_apps
  drop constraint if exists mini_apps_org_binding_check;
alter table public.mini_apps
  add constraint mini_apps_org_binding_check
  check (org_binding in ('none', 'requested', 'confirmed', 'rejected'));

alter table public.mini_apps
  drop constraint if exists mini_apps_audience_check;
alter table public.mini_apps
  add constraint mini_apps_audience_check
  check (audience is null or (jsonb_typeof(audience) = 'object' and audience ? 'mode' and audience ? 'anyOf'));

-- An org's page lists its confirmed mini apps.
create index if not exists mini_apps_org_confirmed_idx
  on public.mini_apps (org_account_id)
  where org_binding = 'confirmed';

-- Make PostgREST see the new columns and the relationship right away.
notify pgrst, 'reload schema';
