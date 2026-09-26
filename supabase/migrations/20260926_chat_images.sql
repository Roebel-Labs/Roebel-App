-- Mecky Chat: image generation pack ('images', tool generate_image) for the Mecky and Design presets.
-- Tool keys map to harness packs (apps/web/src/lib/chat/harness/registry.ts enableKeyFor).
-- generate_image is risk 'private' (no approval): images land in the public `images` bucket under
-- chat/agents/<threadId>/ and only leave the chat through an approved public tool.
-- Daily cap per wallet (free 5 / plus 30 / ultra 100) counts chat_runs rows with route = 'image'.
-- Idempotent; not added to the column default (other bots opt in explicitly).

UPDATE public.chat_bots
SET tools = (
      SELECT array_agg(DISTINCT t ORDER BY t)
      FROM unnest(tools || ARRAY['images']) AS t
    ),
    updated_at = now()
WHERE is_preset = true
  AND slug IN ('mecky', 'design')
  AND NOT (tools @> ARRAY['images']);

-- The per-day image count filters by route; keep it an index scan.
CREATE INDEX IF NOT EXISTS chat_runs_owner_route_created_idx
  ON public.chat_runs (owner_wallet, route, created_at DESC);
