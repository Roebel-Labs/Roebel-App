-- ============================================
-- Help Hub: Sections
-- Adds help_sections table and section_id to help_collections
-- ============================================

-- 1. help_sections table
CREATE TABLE help_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  view_mode text NOT NULL DEFAULT 'grid' CHECK (view_mode IN ('grid', 'list')),
  display_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE help_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published help_sections"
  ON help_sections FOR SELECT
  USING (is_published = true);

-- 2. Add section_id to help_collections (nullable — featured-only collections don't need one)
ALTER TABLE help_collections
  ADD COLUMN section_id uuid REFERENCES help_sections(id) ON DELETE SET NULL;

-- ============================================
-- 3. Seed sections + re-assign existing collections
-- ============================================

INSERT INTO help_sections (title, view_mode, display_order, is_published) VALUES
  ('Erste Schritte', 'grid', 0, true),
  ('Hol das Beste aus der App', 'grid', 1, true),
  ('Mehr Tipps entdecken', 'list', 2, true);

-- Move "Erste Schritte" collection to the new "Erste Schritte" section
UPDATE help_collections
SET section_id = (SELECT id FROM help_sections WHERE title = 'Erste Schritte')
WHERE title = 'Erste Schritte';

-- Move "Bürger werden" collection to the "Mehr Tipps entdecken" section
UPDATE help_collections
SET section_id = (SELECT id FROM help_sections WHERE title = 'Mehr Tipps entdecken')
WHERE title = 'Bürger werden';

-- "Was ist neu?" stays featured-only (section_id remains NULL)

-- ============================================
-- 4. Add extra seed collections to demonstrate sections
-- ============================================

-- Add "Abstimmen" as a standalone featured collection + in "Hol das Beste aus der App"
INSERT INTO help_collections (title, subtitle, icon_url, cover_image_url, section_id, display_order, is_featured, is_published)
SELECT
  'Abstimmen & Mitgestalten',
  'Deine Stimme für Röbel',
  'https://placehold.co/96x96/6b3fa0/white?text=V',
  'https://placehold.co/800x400/6b3fa0/white?text=Abstimmen',
  (SELECT id FROM help_sections WHERE title = 'Hol das Beste aus der App'),
  0, true, true;

-- Add "Veranstaltungen" in "Hol das Beste aus der App"
INSERT INTO help_collections (title, subtitle, icon_url, cover_image_url, section_id, display_order, is_featured, is_published)
SELECT
  'Veranstaltungen',
  'Events entdecken & teilen',
  'https://placehold.co/96x96/1a5c3a/white?text=E',
  NULL,
  (SELECT id FROM help_sections WHERE title = 'Hol das Beste aus der App'),
  1, false, true;

-- Add "Sicherheit & Datenschutz" in the list-view section
INSERT INTO help_collections (title, subtitle, icon_url, cover_image_url, section_id, display_order, is_featured, is_published)
SELECT
  'Sicherheit & Datenschutz',
  'So schützt du deine Daten',
  'https://placehold.co/96x96/194383/white?text=S',
  NULL,
  (SELECT id FROM help_sections WHERE title = 'Mehr Tipps entdecken'),
  1, false, true;

-- Add "Barrierefreiheit" in the list-view section
INSERT INTO help_collections (title, subtitle, icon_url, cover_image_url, section_id, display_order, is_featured, is_published)
SELECT
  'Barrierefreiheit',
  'Einstellungen für bessere Bedienung',
  'https://placehold.co/96x96/1a5c3a/white?text=B',
  NULL,
  (SELECT id FROM help_sections WHERE title = 'Mehr Tipps entdecken'),
  2, false, true;
