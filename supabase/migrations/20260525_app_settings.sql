-- ============================================================
-- MIGRATION: app_settings (global key-value config)
-- A tiny singleton settings store editable from the web admin and
-- read at runtime by the Expo app. First use: the shared background
-- audio track that plays under ALL event stories.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Public read — Expo reads with the anon key (mirrors story_collections
-- public read + the story-audio bucket public read).
CREATE POLICY "app_settings_select_public" ON app_settings
  FOR SELECT USING (true);

-- App-layer permissive write — same MVP pattern as story_collections /
-- events. Editing is gated behind the route-protected web admin dashboard.
CREATE POLICY "app_settings_insert" ON app_settings
  FOR INSERT WITH CHECK (true);
CREATE POLICY "app_settings_update" ON app_settings
  FOR UPDATE USING (true);

-- Seed the one key we need now (shared event-stories background track).
INSERT INTO app_settings (key, value)
VALUES ('event_stories_audio_url', NULL)
ON CONFLICT (key) DO NOTHING;
