-- ============================================================
-- MIGRATION 9: Sternfahrten (curated tours)
-- 30 hand-built routes — anti-Komoot moat, editorial curation.
-- All admin-managed via apps/web dashboard later.
-- Each tour has: distance, duration, surface, family/wildlife flags,
-- ferry/bus combo, season, GPX/Komoot/AllTrails handoff URLs,
-- and ordered tour_stops referencing pois where useful.
-- ============================================================

CREATE TABLE IF NOT EXISTS tours (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     TEXT NOT NULL UNIQUE,
  title_de                 TEXT NOT NULL,
  subtitle_de              TEXT,
  description_de           TEXT,
  cover_image_url          TEXT,
  start_lat                DOUBLE PRECISION,
  start_lon                DOUBLE PRECISION,
  start_label_de           TEXT,
  distance_km              NUMERIC(6,2),
  duration_min             INTEGER,
  elevation_gain_m         INTEGER,
  surface_de               TEXT,
  -- Mecky-Schwierigkeit calibrated to flat Müritz reality
  difficulty               TEXT NOT NULL CHECK (difficulty IN ('leicht', 'mittel', 'sportlich')),
  -- Multi-tag classification — gin-indexed for fast filter
  categories               TEXT[] NOT NULL DEFAULT '{}',
  hours_bucket             TEXT CHECK (hours_bucket IN ('2h', '4h', 'tag', 'mehrtag')),
  is_sternfahrt            BOOLEAN NOT NULL DEFAULT true,
  is_meckys_tipp_today     BOOLEAN NOT NULL DEFAULT false,
  ferry_combo              BOOLEAN NOT NULL DEFAULT false,
  bus_combo                BOOLEAN NOT NULL DEFAULT false,
  has_swim_stop            BOOLEAN NOT NULL DEFAULT false,
  has_eis_stop             BOOLEAN NOT NULL DEFAULT false,
  family_friendly          BOOLEAN NOT NULL DEFAULT false,
  bad_weather_alternative  BOOLEAN NOT NULL DEFAULT false,
  season_de                TEXT,
  best_start_time_de       TEXT,
  return_options_de        TEXT,
  gpx_url                  TEXT,
  komoot_url               TEXT,
  alltrails_url            TEXT,
  highlights_de            JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings_de              JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tours_active ON tours(is_active);
CREATE INDEX IF NOT EXISTS idx_tours_categories ON tours USING gin(categories);
CREATE INDEX IF NOT EXISTS idx_tours_hours_bucket ON tours(hours_bucket);

ALTER TABLE tours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tours_select" ON tours FOR SELECT USING (true);
CREATE POLICY "tours_insert" ON tours FOR INSERT WITH CHECK (true);
CREATE POLICY "tours_update" ON tours FOR UPDATE USING (true);
CREATE POLICY "tours_delete" ON tours FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS tour_stops (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id                  UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  stop_order               INTEGER NOT NULL,
  name_de                  TEXT NOT NULL,
  description_de           TEXT,
  lat                      DOUBLE PRECISION,
  lon                      DOUBLE PRECISION,
  km_from_start            NUMERIC(6,2),
  -- Stop type for icon mapping in UI
  stop_type                TEXT CHECK (stop_type IN (
                              'start',
                              'finish',
                              'observation_stand',
                              'swim_spot',
                              'viewpoint',
                              'eisdiele',
                              'restaurant',
                              'toilet',
                              'transit_stop',
                              'sehenswuerdigkeit'
                            )),
  poi_id                   UUID REFERENCES pois(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tour_stops_tour ON tour_stops(tour_id);
CREATE INDEX IF NOT EXISTS idx_tour_stops_order ON tour_stops(tour_id, stop_order);

ALTER TABLE tour_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tour_stops_select" ON tour_stops FOR SELECT USING (true);
CREATE POLICY "tour_stops_insert" ON tour_stops FOR INSERT WITH CHECK (true);
CREATE POLICY "tour_stops_update" ON tour_stops FOR UPDATE USING (true);
CREATE POLICY "tour_stops_delete" ON tour_stops FOR DELETE USING (true);

-- Track tour completions for Reise-Erinnerung (Feature 7)
CREATE TABLE IF NOT EXISTS tour_completions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id                  UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  user_wallet              TEXT NOT NULL,
  completed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes_de                 TEXT,
  UNIQUE(tour_id, user_wallet)
);

CREATE INDEX IF NOT EXISTS idx_tour_completions_user ON tour_completions(user_wallet);

ALTER TABLE tour_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tour_completions_select" ON tour_completions FOR SELECT USING (true);
CREATE POLICY "tour_completions_insert" ON tour_completions FOR INSERT WITH CHECK (true);
