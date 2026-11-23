-- Microsoft 365 / Outlook connector (mail + calendar): allow kind 'microsoft' (applied 2026-11-23).
alter table public.agent_connectors drop constraint if exists agent_connectors_kind_check;
alter table public.agent_connectors add constraint agent_connectors_kind_check
  check (kind = any (array['mcp'::text, 'google'::text, 'microsoft'::text]));
