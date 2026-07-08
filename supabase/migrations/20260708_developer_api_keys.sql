-- Developer API keys for the Netizen Mini App platform (MCP server + CLI/API
-- publishing from Claude Code and other agents).
--
-- Key format: nz_<40 hex chars>. Only the SHA-256 hash is stored; the plain
-- key is shown once at creation. key_prefix (first 12 chars) is kept for
-- display ("nz_ab12cd34…").
--
-- NOT YET APPLIED to the live project (Supabase MCP OAuth unavailable in the
-- build session). Apply via Supabase MCP `apply_migration` or the dashboard
-- SQL editor. The API/MCP code detects the missing table and falls back to
-- wallet-bearer auth with a clear notice until this lands.

create table if not exists public.developer_api_keys (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  name         text not null default 'API-Key',
  key_prefix   text not null,
  key_hash     text not null unique,          -- sha256 hex of the full key
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists developer_api_keys_developer_idx
  on public.developer_api_keys(developer_id);

-- Service-role only (like developers / mini_app_versions / mini_app_rewards).
alter table public.developer_api_keys enable row level security;
