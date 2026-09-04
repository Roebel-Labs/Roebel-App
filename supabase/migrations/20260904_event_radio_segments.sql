-- ============================================================
-- MIGRATION: event_radio_segments (Wochen-Radio)
-- One row per generated narration clip: the daily intro, one clip per
-- event, the weekly outro. Rows are content-addressed (content_hash) so
-- the generator only re-renders what changed. Public read for the Expo
-- app; writes only through the service role (no insert/update policy).
-- ============================================================

CREATE TABLE IF NOT EXISTS event_radio_segments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL CHECK (kind IN ('intro', 'event', 'outro')),
  event_id      UUID REFERENCES events(id) ON DELETE CASCADE,
  -- event: the event id. intro: the date it was written for (YYYY-MM-DD).
  -- outro: the ISO week key (YYYY-Www).
  scope_key     TEXT NOT NULL,
  week_key      TEXT NOT NULL,
  valid_on      DATE,
  content_hash  TEXT NOT NULL,
  script        TEXT NOT NULL,
  audio_url     TEXT NOT NULL,
  duration_ms   INTEGER NOT NULL,
  voice_id      TEXT NOT NULL,
  model_id      TEXT NOT NULL,
  request_id    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_radio_segments_event_kind CHECK (
    (kind = 'event' AND event_id IS NOT NULL) OR (kind <> 'event' AND event_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS event_radio_segments_scope_hash_key
  ON event_radio_segments (kind, scope_key, content_hash);
CREATE INDEX IF NOT EXISTS event_radio_segments_event_idx
  ON event_radio_segments (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS event_radio_segments_scope_idx
  ON event_radio_segments (kind, scope_key, created_at DESC);

ALTER TABLE event_radio_segments ENABLE ROW LEVEL SECURITY;

-- Public read: the Expo app fetches with the anon key.
CREATE POLICY "event_radio_segments_select_public" ON event_radio_segments
  FOR SELECT USING (true);
-- No insert/update/delete policies on purpose: only the service role writes.

-- Settings keys read by the generator and the app.
INSERT INTO app_settings (key, value)
VALUES ('event_radio_voice_id', NULL), ('event_radio_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
