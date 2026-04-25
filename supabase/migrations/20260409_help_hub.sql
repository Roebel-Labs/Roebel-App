-- ============================================
-- Help Hub Migration
-- Creates help_collections, help_items, help_videos
-- with RLS policies and seed data
-- ============================================

-- 1. help_collections
CREATE TABLE help_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  icon_url text,
  cover_image_url text,
  display_order integer NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE help_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published help_collections"
  ON help_collections FOR SELECT
  USING (is_published = true);

-- 2. help_items
CREATE TABLE help_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES help_collections(id) ON DELETE CASCADE,
  title text NOT NULL,
  subtitle text,
  icon_url text,
  hero_media_url text,
  hero_media_type text NOT NULL DEFAULT 'image',
  body_text text,
  steps jsonb,
  action_enabled boolean NOT NULL DEFAULT false,
  action_label text,
  action_route text,
  display_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE help_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published help_items"
  ON help_items FOR SELECT
  USING (is_published = true);

-- 3. help_videos
CREATE TABLE help_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  thumbnail_url text NOT NULL,
  youtube_url text NOT NULL,
  duration text NOT NULL,
  published_date date NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE help_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published help_videos"
  ON help_videos FOR SELECT
  USING (is_published = true);

-- ============================================
-- 4. Seed Data
-- ============================================

-- Collections
INSERT INTO help_collections (title, subtitle, icon_url, cover_image_url, display_order, is_featured, is_published) VALUES
  ('Was ist neu?', 'Die neuesten Funktionen entdecken', NULL, 'https://placehold.co/800x400/194383/white?text=Was+ist+neu', 0, true, true),
  ('Erste Schritte', 'Lerne die Grundlagen der App', NULL, 'https://placehold.co/800x400/1a5c3a/white?text=Erste+Schritte', 1, false, true),
  ('Bürger werden', 'Verifizierung & Citizen NFT', NULL, 'https://placehold.co/800x400/6b3fa0/white?text=Buerger+werden', 2, false, true);

-- Items for "Erste Schritte"
INSERT INTO help_items (collection_id, title, subtitle, icon_url, hero_media_type, body_text, steps, action_enabled, action_label, action_route, display_order, is_published)
SELECT
  id,
  'Die Grundlagen',
  'Willkommen bei Mein Röbel',
  'https://placehold.co/96x96/194383/white?text=1',
  'image',
  'Mein Röbel ist deine Bürger-App für alles rund um Röbel/Müritz. Hier findest du Events, Nachrichten und kannst mitbestimmen.',
  '["Öffne die App und erkunde den Feed", "Wische zwischen den Tabs: Lokal, Events, News", "Tippe auf einen Beitrag für mehr Details"]'::jsonb,
  false, NULL, NULL, 0, true
FROM help_collections WHERE title = 'Erste Schritte';

INSERT INTO help_items (collection_id, title, subtitle, icon_url, hero_media_type, body_text, steps, action_enabled, action_label, action_route, display_order, is_published)
SELECT
  id,
  'Navigation',
  'So navigierst du durch die App',
  'https://placehold.co/96x96/1a5c3a/white?text=2',
  'image',
  'Die App hat drei Hauptbereiche, die du über die untere Navigation erreichst.',
  '["Home — Dein Feed mit allem Wichtigen", "Entdecken — Orte, Events & mehr finden", "Profil — Dein Account & Einstellungen"]'::jsonb,
  false, NULL, NULL, 1, true
FROM help_collections WHERE title = 'Erste Schritte';

INSERT INTO help_items (collection_id, title, subtitle, icon_url, hero_media_type, body_text, steps, action_enabled, action_label, action_route, display_order, is_published)
SELECT
  id,
  'Abstimmen',
  'Deine Stimme für Röbel',
  'https://placehold.co/96x96/6b3fa0/white?text=3',
  'image',
  'Als verifizierter Bürger kannst du über Vorschläge für Röbel abstimmen. Jeder Bürger hat genau eine Stimme.',
  '["Öffne den Tab Governance auf der Startseite", "Wähle einen aktiven Vorschlag aus", "Tippe auf Abstimmen und wähle Ja oder Nein"]'::jsonb,
  true, 'Zur Abstimmung', '/governance', 2, true
FROM help_collections WHERE title = 'Erste Schritte';

-- Items for "Was ist neu?"
INSERT INTO help_items (collection_id, title, subtitle, icon_url, hero_media_type, body_text, steps, display_order, is_published)
SELECT
  id,
  'Story-Ansicht',
  'Events als Stories entdecken',
  'https://placehold.co/96x96/194383/white?text=S',
  'image',
  'Entdecke kommende Events in einer Story-Ansicht. Wische durch die Woche und finde spannende Veranstaltungen.',
  '["Öffne die Startseite", "Tippe auf einen Story-Kreis oben", "Wische nach links/rechts für weitere Events"]'::jsonb,
  0, true
FROM help_collections WHERE title = 'Was ist neu?';

-- Videos
INSERT INTO help_videos (title, thumbnail_url, youtube_url, duration, published_date, display_order, is_published) VALUES
  ('Willkommen in Röbel', 'https://placehold.co/800x450/1a1a2e/white?text=Welcome', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', '2:30', '2026-04-01', 0, true),
  ('So funktioniert die App', 'https://placehold.co/800x450/16213e/white?text=Tutorial', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', '1:45', '2026-03-15', 1, true);
