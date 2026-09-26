-- Ortis agent harness, wave 2: durable autonomous tasks
-- (spec: docs/superpowers/specs/2026-09-26-ortis-agent-harness-design.md §3.3 agent_tasks, §4 tasks pack)
--
-- Server-only data: RLS enabled with NO policies, all grants revoked from
-- anon/authenticated. The Next.js runtime (apps/web/src/lib/chat/harness/tasks.ts
-- + task-worker.ts) is the only reader/writer, via the service role.
--
-- Worker: GET /api/chat/cron/tasks (every minute) + an immediate kick after
-- start_task. A tick claims a task with a guarded update (status + attempts as
-- the version), holds a lease in next_tick_at while running, and writes the
-- checkpoint + steps back.
--
-- Additive to the spec: message_id (the bot message carrying the `task` part,
-- cached so the worker can patch the card) and result (final text).

CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet        text NOT NULL,
  thread_id     uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  message_id    uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  bot_id        uuid REFERENCES public.chat_bots(id) ON DELETE SET NULL,
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  goal          text NOT NULL CHECK (char_length(goal) BETWEEN 1 AND 4000),
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'running', 'waiting_approval', 'done', 'failed', 'cancelled')),
  steps         jsonb NOT NULL DEFAULT '[]'::jsonb,
  checkpoint    jsonb NOT NULL DEFAULT '{}'::jsonb,
  result        text,
  error         text,
  attempts      integer NOT NULL DEFAULT 0,
  next_tick_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Worker scan: queued tasks that are due + running tasks whose lease expired.
CREATE INDEX IF NOT EXISTS agent_tasks_due_idx
  ON public.agent_tasks (next_tick_at)
  WHERE status IN ('queued', 'running');
-- Per-wallet concurrency cap (running) + active list.
CREATE INDEX IF NOT EXISTS agent_tasks_wallet_status_idx
  ON public.agent_tasks (wallet, status);

-- Link audit/approval rows to their task (column exists since 20260926_agent_harness.sql).
CREATE INDEX IF NOT EXISTS agent_actions_task_idx
  ON public.agent_actions (task_id) WHERE task_id IS NOT NULL;

ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_tasks FROM anon, authenticated;

-- (No functions are created here, so there is no EXECUTE grant to revoke.)

-- Bot tool key 'tasks' (start_task / ask_bot) for the presets, idempotent.
-- The chat_bots.tools column default is NOT touched here (other wave-2 packs
-- extend it too); new user bots opt in through the bot editor.
UPDATE public.chat_bots
SET tools = (
      SELECT array_agg(DISTINCT t ORDER BY t)
      FROM unnest(tools || ARRAY['tasks']) AS t
    ),
    updated_at = now()
WHERE is_preset = true
  AND NOT (tools @> ARRAY['tasks']);
