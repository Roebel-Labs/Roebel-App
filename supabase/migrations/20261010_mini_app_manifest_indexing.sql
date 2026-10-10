-- supabase/migrations/20261010_mini_app_manifest_indexing.sql
-- Self-hosted mini apps indexed from /.well-known/roebel-miniapp.json
-- (spec docs/superpowers/specs/2026-10-10-miniapp-manifest-indexing-design.md).
alter table public.mini_apps
  add column if not exists origin text,
  add column if not exists manifest_url text,
  add column if not exists last_indexed_at timestamptz,
  add column if not exists index_error text,
  add column if not exists pending_update boolean not null default false;

create unique index if not exists mini_apps_origin_key
  on public.mini_apps (origin) where origin is not null;

alter table public.mini_app_versions
  add column if not exists manifest_hash text;
