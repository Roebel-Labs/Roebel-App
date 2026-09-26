-- Ortis agent harness wave 2 (spec docs/superpowers/specs/2026-09-26-ortis-agent-harness-design.md §4):
-- enable the public-actions pack ('actions') and the Röbel Münzen pack ('money') for the Mecky preset.
-- Tool keys map to harness packs (apps/web/src/lib/chat/harness/registry.ts enableKeyFor).
-- Every tool in these packs is gated: approval card per call (money always; public/external unless
-- "immer erlauben"), daily cap, kill switch app_settings.agent_actions_enabled.
-- Idempotent; not added to the column default (other bots opt in explicitly).

UPDATE public.chat_bots
SET tools = (
      SELECT array_agg(DISTINCT t ORDER BY t)
      FROM unnest(tools || ARRAY['actions', 'money']) AS t
    ),
    updated_at = now()
WHERE is_preset = true
  AND slug = 'mecky'
  AND NOT (tools @> ARRAY['actions', 'money']);
