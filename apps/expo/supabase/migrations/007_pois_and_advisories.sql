-- ============================================================
-- MIGRATION 7: POIs, Daily Advisories, Help Requests
-- Tourist utilities map: Toilets, Trinkwasser, Bike repair,
-- Swim spots, Indoor alternatives, Tourist info, Pharmacies,
-- Observation stands.
--
-- All tables are admin-managed via apps/web dashboard later.
-- All textual content is German-first (suffix _de).
-- ============================================================

CREATE TABLE IF NOT EXISTS pois (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                     TEXT NOT NULL CHECK (type IN (
                              'toilet',
                              'drinking_water',
                              'bike_repair',
                              'bike_rental',
                              'swim_spot',
                              'indoor_alternative',
                              'tourist_info',
                              'pharmacy',
                              'observation_stand',
                              'viewpoint'
                            )),
  name_de                  TEXT NOT NULL,
  description_de           TEXT,
  lat                      DOUBLE PRECISION NOT NULL,
  lon                      DOUBLE PRECISION NOT NULL,
  address                  TEXT,
  phone                    TEXT,
  email                    TEXT,
  website                  TEXT,
  opening_hours_de         TEXT,
  is_24h                   BOOLEAN NOT NULL DEFAULT false,
  is_pannendienst          BOOLEAN NOT NULL DEFAULT false,
  has_gaestekarte_discount BOOLEAN NOT NULL DEFAULT false,
  -- Live status. swim_* values used for swim_spot; open/closed/seasonal/unknown for others.
  status                   TEXT CHECK (status IN (
                              'open',
                              'closed',
                              'seasonal',
                              'unknown',
                              'swim_green',
                              'swim_yellow',
                              'swim_red',
                              'swim_forbidden'
                            )),
  status_note_de           TEXT,
  status_updated_at        TIMESTAMPTZ,
  status_source_de         TEXT, -- e.g. 'badewasser-mv.de', 'manuell durch Mecky-Team'
  -- Free-form metadata: water depth, surface type, supervised flag, parking, etc.
  meta                     JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pois_type ON pois(type);
CREATE INDEX IF NOT EXISTS idx_pois_active ON pois(is_active);

ALTER TABLE pois ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pois_select" ON pois FOR SELECT USING (true);
CREATE POLICY "pois_insert" ON pois FOR INSERT WITH CHECK (true);
CREATE POLICY "pois_update" ON pois FOR UPDATE USING (true);
CREATE POLICY "pois_delete" ON pois FOR DELETE USING (true);

-- ============================================================
-- Daily environmental advisories
-- One row per (date, type). Mosquito index, tick warning,
-- cyanobacteria/Blaualgen risk.
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_advisories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisory_date   DATE NOT NULL,
  type            TEXT NOT NULL CHECK (type IN (
                    'mosquito',
                    'tick',
                    'cyanobacteria',
                    'pollen',
                    'sun'
                  )),
  level           TEXT NOT NULL CHECK (level IN (
                    'niedrig',
                    'mittel',
                    'hoch',
                    'sehr_hoch'
                  )),
  message_de      TEXT NOT NULL,
  recommendation_de TEXT,
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(advisory_date, type)
);

CREATE INDEX IF NOT EXISTS idx_daily_advisories_date ON daily_advisories(advisory_date);
CREATE INDEX IF NOT EXISTS idx_daily_advisories_type ON daily_advisories(type);

ALTER TABLE daily_advisories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_advisories_select" ON daily_advisories FOR SELECT USING (true);
CREATE POLICY "daily_advisories_insert" ON daily_advisories FOR INSERT WITH CHECK (true);
CREATE POLICY "daily_advisories_update" ON daily_advisories FOR UPDATE USING (true);

-- ============================================================
-- Help requests ("Wo bin ich verloren" button)
-- Lightweight version of AllTrails Lifeline. No SMS infrastructure.
-- ============================================================

CREATE TABLE IF NOT EXISTS help_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_wallet         TEXT,
  user_name           TEXT,
  contact_phone       TEXT,
  request_type        TEXT NOT NULL CHECK (request_type IN (
                        'breakdown',
                        'lost',
                        'medical',
                        'general'
                      )),
  lat                 DOUBLE PRECISION,
  lon                 DOUBLE PRECISION,
  message_de          TEXT,
  status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'responded', 'resolved', 'cancelled')),
  responded_by_wallet TEXT,
  responded_at        TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_help_requests_status ON help_requests(status);
CREATE INDEX IF NOT EXISTS idx_help_requests_created ON help_requests(created_at DESC);

ALTER TABLE help_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "help_requests_select" ON help_requests FOR SELECT USING (true);
CREATE POLICY "help_requests_insert" ON help_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "help_requests_update" ON help_requests FOR UPDATE USING (true);

-- Realtime so admin dashboard can react in real time.
ALTER PUBLICATION supabase_realtime ADD TABLE help_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE pois;
