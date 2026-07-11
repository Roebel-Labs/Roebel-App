-- Mini-App editor chats: server-side persistence of /editor builder sessions.
-- One row per chat; `session` is the trimmed StoredSession (all messages, the
-- last 2 version HTMLs). Owned by a developer; `collaborators` holds wallets
-- that joined via the share_token invite link (/editor?chat=<id>&invite=<t>).
-- Applied live via Supabase MCP on 2026-07-11.

create table if not exists public.mini_app_editor_chats (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  developer_id  uuid not null references public.developers(id) on delete cascade,
  title         text,
  app_slug      text,
  preview       text,                          -- last message excerpt (denormalized for lists)
  session       jsonb not null default '{}'::jsonb,
  share_token   text unique,                   -- null until an invite is created
  collaborators text[] not null default '{}',  -- lowercased wallets joined via invite
  archived      boolean not null default false
);

create index if not exists mini_app_editor_chats_dev_idx
  on public.mini_app_editor_chats(developer_id, updated_at desc);
create index if not exists mini_app_editor_chats_collab_idx
  on public.mini_app_editor_chats using gin(collaborators);

-- Service-role only (like developers/versions): no anon policies.
alter table public.mini_app_editor_chats enable row level security;
