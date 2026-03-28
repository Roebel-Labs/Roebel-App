-- Add livestream fields directly to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS livestream_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS livestream_active BOOLEAN DEFAULT false;

-- Index for quick active livestream lookups
CREATE INDEX IF NOT EXISTS idx_events_livestream_active
  ON events (livestream_active) WHERE livestream_active = true;

COMMENT ON COLUMN events.livestream_url IS 'YouTube livestream URL (any format: watch, live, embed)';
COMMENT ON COLUMN events.livestream_active IS 'Whether this event is currently being livestreamed';
