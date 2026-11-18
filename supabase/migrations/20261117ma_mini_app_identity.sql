-- supabase/migrations/20261117ma_mini_app_identity.sql
-- Mini Apps 2: manifest version "2" with an identity section, per-app pseudonyms and
-- consent grants (plan docs/superpowers/plans/2026-11-17-miniapp-2-identity-credentials.md,
-- Task 4). Applying this file is an owner gate; the code reads as "version 1" until then.

-- The anon read policy "mini_apps read live" is row-level (using status = 'live'), so it
-- covers the two new columns without a change.
alter table public.mini_apps
  add column if not exists manifest_version text not null default '1',
  add column if not exists identity jsonb;

alter table public.mini_apps
  drop constraint if exists mini_apps_manifest_version_check;
alter table public.mini_apps
  add constraint mini_apps_manifest_version_check check (manifest_version in ('1', '2'));

-- Per-app pseudonym ("nz_…", HMAC of app id + wallet) and its reverse lookup.
create table if not exists public.mini_app_subjects (
  mini_app_id uuid not null references public.mini_apps(id) on delete cascade,
  wallet text not null,
  subject text not null unique,
  created_at timestamptz default now(),
  primary key (mini_app_id, wallet)
);

-- What a person agreed to share with an app; `asked` = consent keys already shown
-- (granted or declined), so a declined item is not asked again.
create table if not exists public.mini_app_grants (
  mini_app_id uuid not null references public.mini_apps(id) on delete cascade,
  wallet text not null,
  profile boolean not null default false,
  address boolean not null default false,
  credentials text[] not null default '{}',
  asked text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (mini_app_id, wallet)
);

-- Service role only: RLS on, no policies, and no table privileges for the API roles.
alter table public.mini_app_subjects enable row level security;
alter table public.mini_app_grants enable row level security;
revoke all on public.mini_app_subjects from anon, authenticated;
revoke all on public.mini_app_grants from anon, authenticated;
