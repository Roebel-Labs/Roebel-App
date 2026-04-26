-- ============================================================
-- MIGRATION 10: Wildlife (sightings + seasonal calendar)
-- The differentiated category. Komoot/AllTrails do not care
-- about cranes. Müritz is a wildlife park.
--
-- Tables:
--   wildlife_species          — catalog (ornitho.de-aligned)
--   wildlife_seasonal_events  — calendar + alarm hints
--   wildlife_sightings        — live tourist-posted feed
--
-- Protected species support: protect_coordinates fuzzes lat/lon
-- in the public feed (raw_lat/raw_lon admin/ranger-only).
-- All admin-managed via apps/web dashboard later.
-- ============================================================

CREATE TABLE IF NOT EXISTS wildlife_species (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     TEXT NOT NULL UNIQUE,
  name_de                  TEXT NOT NULL,
  name_scientific          TEXT,
  category                 TEXT NOT NULL CHECK (category IN (
                              'vogel',
                              'saeugetier',
                              'reptil',
                              'amphibie',
                              'fisch',
                              'insekt',
                              'sonstiges'
                            )),
  is_protected             BOOLEAN NOT NULL DEFAULT false,
  -- Whether sightings should fuzz coordinates for nest protection
  protect_coordinates      BOOLEAN NOT NULL DEFAULT false,
  description_de           TEXT,
  best_months              INTEGER[] NOT NULL DEFAULT '{}',
  best_locations_de        TEXT,
  image_url                TEXT,
  -- Mecky-flavored hint shown on sighting form / calendar
  mecky_tipp_de            TEXT,
  -- ornitho.de cross-post hint
  ornitho_species_code     TEXT,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wildlife_species_active ON wildlife_species(is_active);

ALTER TABLE wildlife_species ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wildlife_species_select" ON wildlife_species FOR SELECT USING (true);
CREATE POLICY "wildlife_species_insert" ON wildlife_species FOR INSERT WITH CHECK (true);
CREATE POLICY "wildlife_species_update" ON wildlife_species FOR UPDATE USING (true);
CREATE POLICY "wildlife_species_delete" ON wildlife_species FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS wildlife_seasonal_events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  species_id               UUID REFERENCES wildlife_species(id) ON DELETE CASCADE,
  title_de                 TEXT NOT NULL,
  description_de           TEXT,
  start_month              INTEGER NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  end_month                INTEGER NOT NULL CHECK (end_month BETWEEN 1 AND 12),
  start_date_hint_de       TEXT,
  peak_window_de           TEXT,
  best_location_de         TEXT,
  alarm_kind               TEXT CHECK (alarm_kind IN (
                              'sunrise_minus_30',
                              'sunset',
                              'morning',
                              'evening',
                              'none'
                            )),
  trigger_hint             TEXT,
  push_message_de          TEXT,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wildlife_seasonal_species ON wildlife_seasonal_events(species_id);
CREATE INDEX IF NOT EXISTS idx_wildlife_seasonal_months ON wildlife_seasonal_events(start_month, end_month);

ALTER TABLE wildlife_seasonal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wildlife_seasonal_events_select" ON wildlife_seasonal_events FOR SELECT USING (true);
CREATE POLICY "wildlife_seasonal_events_insert" ON wildlife_seasonal_events FOR INSERT WITH CHECK (true);
CREATE POLICY "wildlife_seasonal_events_update" ON wildlife_seasonal_events FOR UPDATE USING (true);

CREATE TABLE IF NOT EXISTS wildlife_sightings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  species_id               UUID REFERENCES wildlife_species(id) ON DELETE SET NULL,
  observer_wallet          TEXT,
  observer_name_de         TEXT,
  observed_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Display lat/lon may be fuzzed for protected species
  lat                      DOUBLE PRECISION NOT NULL,
  lon                      DOUBLE PRECISION NOT NULL,
  -- Real coords stored separately (admin/ranger access only)
  raw_lat                  DOUBLE PRECISION,
  raw_lon                  DOUBLE PRECISION,
  individual_count         INTEGER NOT NULL DEFAULT 1,
  notes_de                 TEXT,
  photo_url                TEXT,
  near_landmark_de         TEXT,
  verified_by_mecky        BOOLEAN NOT NULL DEFAULT false,
  mecky_verification_note_de TEXT,
  ranger_verified          BOOLEAN NOT NULL DEFAULT false,
  is_visible               BOOLEAN NOT NULL DEFAULT true,
  helpful_count            INTEGER NOT NULL DEFAULT 0,
  ornitho_cross_posted     BOOLEAN NOT NULL DEFAULT false,
  ornitho_url              TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wildlife_sightings_species ON wildlife_sightings(species_id);
CREATE INDEX IF NOT EXISTS idx_wildlife_sightings_visible ON wildlife_sightings(is_visible);
CREATE INDEX IF NOT EXISTS idx_wildlife_sightings_observed_at ON wildlife_sightings(observed_at DESC);

ALTER TABLE wildlife_sightings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wildlife_sightings_select" ON wildlife_sightings FOR SELECT USING (true);
CREATE POLICY "wildlife_sightings_insert" ON wildlife_sightings FOR INSERT WITH CHECK (true);
CREATE POLICY "wildlife_sightings_update" ON wildlife_sightings FOR UPDATE USING (true);

-- Realtime so the live feed updates within ~2s across devices
ALTER PUBLICATION supabase_realtime ADD TABLE wildlife_sightings;
