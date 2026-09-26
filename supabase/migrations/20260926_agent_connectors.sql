-- Ortis agent harness — connectors (spec: docs/superpowers/specs/2026-09-26-ortis-agent-harness-design.md §3.3, §4)
--
-- Server-only data: RLS enabled with NO policies, all grants revoked from
-- anon/authenticated. The Next.js runtime (apps/web/src/lib/chat/harness/connectors)
-- is the only reader/writer, via the service role.
--
-- 1. agent_connectors — user-added remote MCP servers + the Google OAuth link
--    secret_enc  = AES-256-GCM (env CHAT_CONNECTOR_KEY) of a JSON blob:
--                  mcp → { headers }, google → { refreshToken, scope }
--    tools_cache = MCP tools listed on add / refresh
--                  [{ name, description, inputSchema, readOnly }]
-- 2. chat_bots.tools — Mecky + Recherche presets gain the 'connectors' key

-- 1. Connectors ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_connectors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet       text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('mcp', 'google')),
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  url          text,
  secret_enc   text,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disabled')),
  tools_cache  jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_connectors_wallet_idx
  ON public.agent_connectors (wallet, created_at);
-- One Google link per wallet (reconnecting replaces it).
CREATE UNIQUE INDEX IF NOT EXISTS agent_connectors_one_google_idx
  ON public.agent_connectors (wallet) WHERE kind = 'google';

ALTER TABLE public.agent_connectors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_connectors FROM anon, authenticated;
-- (No functions are created here, so there is no EXECUTE grant to revoke.)

-- 2. Bot tool key 'connectors' for Mecky + Recherche --------------------------------
UPDATE public.chat_bots
SET tools = (
      SELECT array_agg(DISTINCT t ORDER BY t)
      FROM unnest(tools || ARRAY['connectors']) AS t
    ),
    updated_at = now()
WHERE is_preset = true
  AND slug IN ('mecky', 'recherche')
  AND NOT (tools @> ARRAY['connectors']);
