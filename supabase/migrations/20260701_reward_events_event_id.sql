-- Link the Smart-Event-QR registry (reward_events) to the event listing (events).
-- Enables per-event proof-of-attendance counts on the org dashboard:
-- reward_claims where action='event_attend' and reference_id = the linked reward_events.id.
-- Applied via Supabase MCP 2026-07-01.

ALTER TABLE public.reward_events
  ADD COLUMN IF NOT EXISTS event_id uuid NULL REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reward_events_event ON public.reward_events(event_id);
