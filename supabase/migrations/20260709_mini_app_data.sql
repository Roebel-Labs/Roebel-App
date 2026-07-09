-- Mini-app datastore ("Mini-CMS") — scoped key-value/JSON storage every mini
-- app gets through the host bridge (sdk.data.*), plus an "Inhalte" editor on
-- the developer dashboard.
--
--   scope 'app'  — the app's content (lessons, products, texts). Readable by
--                  everyone; writable only by the app's developer/admin
--                  (dashboard/MCP) — NOT by the app at runtime, so no user can
--                  vandalize shared content.
--   scope 'user' — per-wallet state (progress, submissions, scores). Read and
--                  written by the app at runtime via the host (wallet-keyed).
--
-- NOT YET APPLIED (Supabase MCP OAuth unavailable in the build session).
-- Apply via Supabase MCP `apply_migration` or the dashboard SQL editor.
-- The API degrades with a clear German error until this lands.

create table if not exists public.mini_app_data (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  mini_app_id  uuid not null references public.mini_apps(id) on delete cascade,
  scope        text not null check (scope in ('app','user')),
  wallet       text,                          -- null for scope 'app'; lowercased for 'user'
  key          text not null,
  value        jsonb not null default '{}'::jsonb,
  constraint mini_app_data_wallet_scope check (
    (scope = 'app' and wallet is null) or (scope = 'user' and wallet is not null)
  )
);

-- Postgres treats NULLs as distinct in unique constraints → coalesce index.
create unique index if not exists mini_app_data_unique_idx
  on public.mini_app_data (mini_app_id, scope, coalesce(wallet, ''), key);
create index if not exists mini_app_data_app_idx
  on public.mini_app_data (mini_app_id, scope);

-- Service-role only (like mini_app_versions/rewards) — all access goes
-- through /api/mini-apps/data, which enforces scoping + quotas.
alter table public.mini_app_data enable row level security;
