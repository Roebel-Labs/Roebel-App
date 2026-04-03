-- ============================================================
-- MIGRATION 2: Explorer Checkpoint System
-- Tables: explorer_checkpoints, explorer_completions
-- ============================================================

-- 1. Checkpoints — POIs to discover
CREATE TABLE IF NOT EXISTS explorer_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  qr_code TEXT UNIQUE NOT NULL,
  points_reward INTEGER NOT NULL DEFAULT 25,
  badge_image_url TEXT,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE explorer_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read checkpoints" ON explorer_checkpoints
  FOR SELECT USING (true);

-- 2. Completions — user visits
CREATE TABLE IF NOT EXISTS explorer_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
  checkpoint_id UUID NOT NULL REFERENCES explorer_checkpoints(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wallet_address, checkpoint_id)
);

CREATE INDEX idx_completions_wallet ON explorer_completions(wallet_address);

ALTER TABLE explorer_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own completions" ON explorer_completions
  FOR SELECT USING (true);

CREATE POLICY "Users can insert completions" ON explorer_completions
  FOR INSERT WITH CHECK (true);

-- 3. Seed initial checkpoints for Röbel
INSERT INTO explorer_checkpoints (name, description, latitude, longitude, qr_code, points_reward, category) VALUES
  ('St.-Marien-Kirche', 'Gotische Backsteinkirche aus dem 13. Jahrhundert im Zentrum von Röbel.', 53.3725, 12.6047, 'roebel-marien-kirche', 25, 'Historisch'),
  ('St.-Nikolai-Kirche', 'Romanische Feldsteinkirche, eine der ältesten Kirchen der Region.', 53.3718, 12.6012, 'roebel-nikolai-kirche', 25, 'Historisch'),
  ('Röbeler Hafen', 'Idyllischer Hafen am Westufer der Müritz mit Strandpromenade.', 53.3698, 12.6089, 'roebel-hafen', 30, 'Natur'),
  ('Müritz-Strandpromenade', 'Beliebter Spazierweg entlang des Müritzufers mit Blick auf den See.', 53.3685, 12.6105, 'roebel-strandpromenade', 20, 'Natur'),
  ('Marktplatz Röbel', 'Historischer Marktplatz mit Fachwerkhäusern und Wochenmarkt.', 53.3722, 12.6035, 'roebel-marktplatz', 20, 'Historisch'),
  ('Müritz-Nationalpark Eingang', 'Tor zum größten Nationalpark Deutschlands — Seen, Wälder, Kraniche.', 53.3850, 12.6200, 'roebel-nationalpark', 50, 'Natur'),
  ('Windmühle Röbel', 'Restaurierte Holländerwindmühle am Stadtrand.', 53.3755, 12.5980, 'roebel-windmuehle', 30, 'Historisch'),
  ('Badestrand Müritz', 'Öffentlicher Badestrand mit Liegewiese und Spielplatz.', 53.3670, 12.6120, 'roebel-badestrand', 20, 'Freizeit'),
  ('Fischerei Röbel', 'Traditionelle Fischerei — frischer Fang direkt aus der Müritz.', 53.3705, 12.6075, 'roebel-fischerei', 25, 'Kultur'),
  ('Stadtmuseum Röbel', 'Heimatmuseum mit Ausstellungen zur Stadtgeschichte und Region.', 53.3728, 12.6030, 'roebel-museum', 25, 'Kultur'),
  ('Aussichtspunkt Burgwall', 'Panoramablick über die Müritz und die Altstadt von Röbel.', 53.3740, 12.6010, 'roebel-burgwall', 35, 'Natur'),
  ('Radweg Müritz-Rundweg', 'Start/Ziel des 80km Müritz-Rundwegs — Radfahrer-Paradies.', 53.3690, 12.6095, 'roebel-radweg', 30, 'Freizeit');
