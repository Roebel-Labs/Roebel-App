-- apps/roebel-id/migrations/2026-07-26-id-agents.sql
-- Agent principals for Röbel ID. Service-role only; anon/authenticated get NOTHING
-- (client secrets live here). Applied via the Supabase MCP.
create table if not exists public.id_agents (
  address        text primary key,                 -- lowercased smart-account address = OIDC client_id + sub
  owner_sub      text not null,                     -- the authorising human/org principal (act.sub)
  display_name   text,
  scopes         text[] not null default '{}',      -- granted scope strings
  budget_ref     text,                              -- reference to a Zodiac Roles budget (enforced in P3b)
  client_secret  text not null,                     -- client_credentials secret (service-role only)
  enabled        boolean not null default true,     -- kill switch
  created_at     timestamptz not null default now()
);
alter table public.id_agents enable row level security;
-- No policies → only the service_role key (which bypasses RLS) can read/write.

create table if not exists public.id_agent_audit (
  id           bigint generated always as identity primary key,
  agent        text not null,
  act_sub      text not null,
  scopes       text[] not null default '{}',
  jti          text,
  issued_at    timestamptz not null default now()
);
alter table public.id_agent_audit enable row level security;
