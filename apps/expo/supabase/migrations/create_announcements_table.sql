-- Create announcements table for generic full-screen modals
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,

  -- Call-to-action
  cta_label TEXT DEFAULT 'Mehr erfahren',
  cta_link TEXT,
  cta_type TEXT DEFAULT 'deep_link' CHECK (cta_type IN ('deep_link', 'external_url')),

  -- Display control
  is_active BOOLEAN DEFAULT false,
  priority INTEGER DEFAULT 0,
  show_once BOOLEAN DEFAULT true,

  -- Scheduling
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for active announcements ordered by priority
CREATE INDEX IF NOT EXISTS idx_announcements_active
  ON announcements (is_active, priority DESC) WHERE is_active = true;

-- Enable Row Level Security
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Public read access (app reads without auth)
CREATE POLICY "Allow public read access to announcements"
ON announcements FOR SELECT
USING (true);

-- Authenticated admin write access
CREATE POLICY "Allow authenticated users to manage announcements"
ON announcements FOR ALL
USING (auth.role() = 'authenticated');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_announcements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_announcements_timestamp
BEFORE UPDATE ON announcements
FOR EACH ROW
EXECUTE FUNCTION update_announcements_updated_at();

COMMENT ON TABLE announcements IS 'Generic full-screen announcement modals - for promoting livestreams, app updates, features, etc.';
COMMENT ON COLUMN announcements.cta_type IS 'deep_link = router.push(), external_url = Linking.openURL()';
COMMENT ON COLUMN announcements.priority IS 'Higher priority = shown first when multiple are active';
COMMENT ON COLUMN announcements.show_once IS 'If true, only shown once per device (tracked via AsyncStorage)';
