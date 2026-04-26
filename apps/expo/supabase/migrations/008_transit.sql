-- ============================================================
-- MIGRATION 8: Transit (Bus, Schiff, Bürgerbus)
-- Linie 12 (MVVG/dat Bus), Stadtbus Röbel 024,
-- Nationalpark-Linien 9/10, Elli-Bus, Weisse Flotte (MS Diana, MS Fontane).
-- All admin-managed via apps/web dashboard.
-- ============================================================

CREATE TABLE IF NOT EXISTS transit_lines (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     TEXT NOT NULL UNIQUE,
  name_de                  TEXT NOT NULL,
  mode                     TEXT NOT NULL CHECK (mode IN (
                              'bus_regio',
                              'bus_city',
                              'bus_park',
                              'buergerbus',
                              'ferry',
                              'train'
                            )),
  operator_de              TEXT,
  free_with_gaestekarte    BOOLEAN NOT NULL DEFAULT false,
  carries_bikes            BOOLEAN NOT NULL DEFAULT false,
  bike_fee_eur             NUMERIC(10,2),
  fare_de                  TEXT,
  season_window_de         TEXT,
  call_phone               TEXT,
  call_email               TEXT,
  call_window_de           TEXT,
  website                  TEXT,
  notes_de                 TEXT,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  -- Solarpunk note (e.g. for Elli-Bus electric volunteer service)
  is_electric              BOOLEAN NOT NULL DEFAULT false,
  is_volunteer             BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transit_lines_mode ON transit_lines(mode);
CREATE INDEX IF NOT EXISTS idx_transit_lines_active ON transit_lines(is_active);

ALTER TABLE transit_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transit_lines_select" ON transit_lines FOR SELECT USING (true);
CREATE POLICY "transit_lines_insert" ON transit_lines FOR INSERT WITH CHECK (true);
CREATE POLICY "transit_lines_update" ON transit_lines FOR UPDATE USING (true);
CREATE POLICY "transit_lines_delete" ON transit_lines FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS transit_stops (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id                  UUID NOT NULL REFERENCES transit_lines(id) ON DELETE CASCADE,
  name_de                  TEXT NOT NULL,
  lat                      DOUBLE PRECISION,
  lon                      DOUBLE PRECISION,
  stop_order               INTEGER NOT NULL DEFAULT 0,
  notes_de                 TEXT,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transit_stops_line ON transit_stops(line_id);
CREATE INDEX IF NOT EXISTS idx_transit_stops_active ON transit_stops(is_active);

ALTER TABLE transit_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transit_stops_select" ON transit_stops FOR SELECT USING (true);
CREATE POLICY "transit_stops_insert" ON transit_stops FOR INSERT WITH CHECK (true);
CREATE POLICY "transit_stops_update" ON transit_stops FOR UPDATE USING (true);

-- Simple departure rows. Service days as comma string ('mo,tu,we,th,fr,sa,su').
-- Optional season window (NULL = ganzjährig).
CREATE TABLE IF NOT EXISTS transit_departures (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id                  UUID NOT NULL REFERENCES transit_lines(id) ON DELETE CASCADE,
  stop_id                  UUID REFERENCES transit_stops(id) ON DELETE SET NULL,
  service_days             TEXT NOT NULL DEFAULT 'mo,tu,we,th,fr,sa,su',
  season_start             DATE,
  season_end               DATE,
  departure_time           TIME NOT NULL,
  arrival_time             TIME,
  destination_de           TEXT,
  trip_label_de            TEXT,
  notes_de                 TEXT,
  is_last_of_day           BOOLEAN NOT NULL DEFAULT false,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transit_departures_line ON transit_departures(line_id);
CREATE INDEX IF NOT EXISTS idx_transit_departures_stop ON transit_departures(stop_id);
CREATE INDEX IF NOT EXISTS idx_transit_departures_time ON transit_departures(departure_time);

ALTER TABLE transit_departures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transit_departures_select" ON transit_departures FOR SELECT USING (true);
CREATE POLICY "transit_departures_insert" ON transit_departures FOR INSERT WITH CHECK (true);
CREATE POLICY "transit_departures_update" ON transit_departures FOR UPDATE USING (true);
