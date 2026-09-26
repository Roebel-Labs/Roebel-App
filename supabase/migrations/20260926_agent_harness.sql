-- Ortis agent harness, wave 1 (spec: docs/superpowers/specs/2026-09-26-ortis-agent-harness-design.md §3.3)
--
-- Server-only data: RLS enabled with NO policies, all grants revoked from
-- anon/authenticated. The Next.js runtime (apps/web/src/lib/chat/harness) is
-- the only reader/writer, via the service role.
--
-- 1. agent_actions  — audit + approval queue for every harness tool call
-- 2. agent_grants   — "immer erlauben" per (wallet, bot, tool)
-- 3. agent_memory   — facts a bot remembers about the user
-- 4. agent_prefs    — per-user pause switch
-- 5. chat_bots.tools — presets + column default gain 'roebel','user','memory','web'
--
-- Kill switch: app_settings.agent_actions_enabled ('false' → gated tools off).
-- No row is inserted: a missing row means enabled.

-- 1. Actions (audit + approvals) -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet       text NOT NULL,
  thread_id    uuid REFERENCES public.chat_threads(id) ON DELETE SET NULL,
  message_id   uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  bot_id       uuid REFERENCES public.chat_bots(id) ON DELETE SET NULL,
  task_id      uuid,                      -- agent_tasks (wave 2)
  tool         text NOT NULL,
  risk         text NOT NULL CHECK (risk IN ('read', 'private', 'public', 'money', 'external')),
  input        jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary      text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed', 'expired')),
  result       jsonb,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  executed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS agent_actions_wallet_created_idx
  ON public.agent_actions (wallet, created_at DESC);
-- Daily cap: gated executions per wallet since midnight Europe/Berlin.
CREATE INDEX IF NOT EXISTS agent_actions_wallet_gated_exec_idx
  ON public.agent_actions (wallet, executed_at)
  WHERE risk IN ('public', 'money', 'external') AND status = 'executed';
CREATE INDEX IF NOT EXISTS agent_actions_pending_idx
  ON public.agent_actions (wallet, created_at) WHERE status = 'pending';

-- 2. Grants ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_grants (
  wallet      text NOT NULL,
  bot_id      uuid NOT NULL REFERENCES public.chat_bots(id) ON DELETE CASCADE,
  tool        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet, bot_id, tool)
);

-- 3. Memory ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_memory (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet      text NOT NULL,
  bot_id      uuid REFERENCES public.chat_bots(id) ON DELETE CASCADE,   -- null = all bots
  fact        text NOT NULL CHECK (char_length(fact) BETWEEN 1 AND 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_memory_wallet_created_idx
  ON public.agent_memory (wallet, created_at DESC);

-- 4. Prefs -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_prefs (
  wallet      text PRIMARY KEY,
  paused      boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS on, no policies, no grants -----------------------------------------------------
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_grants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_prefs   ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agent_actions FROM anon, authenticated;
REVOKE ALL ON public.agent_grants  FROM anon, authenticated;
REVOKE ALL ON public.agent_memory  FROM anon, authenticated;
REVOKE ALL ON public.agent_prefs   FROM anon, authenticated;

-- (No functions are created here, so there is no EXECUTE grant to revoke.)

-- 5. Bot tool keys -------------------------------------------------------------------
-- New bots get the harness packs by default; presets gain them idempotently.
ALTER TABLE public.chat_bots
  ALTER COLUMN tools SET DEFAULT '{web_search,files,ask_options,roebel,user,memory,web}';

UPDATE public.chat_bots
SET tools = (
      SELECT array_agg(DISTINCT t ORDER BY t)
      FROM unnest(tools || ARRAY['roebel', 'user', 'memory', 'web']) AS t
    ),
    updated_at = now()
WHERE is_preset = true
  AND NOT (tools @> ARRAY['roebel', 'user', 'memory', 'web']);
