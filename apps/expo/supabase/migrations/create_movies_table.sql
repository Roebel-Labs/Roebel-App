-- Create movies table for cinema program
CREATE TABLE IF NOT EXISTS movies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  cover_image_url TEXT,
  trailer_youtube_url TEXT,
  fsk TEXT, -- e.g., "FSK 0", "FSK 6", "FSK 12", "FSK 16", "FSK 18"
  status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on date for faster queries
CREATE INDEX IF NOT EXISTS idx_movies_date ON movies(date);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_movies_status ON movies(status);

-- Enable Row Level Security
ALTER TABLE movies ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access to published movies
CREATE POLICY "Allow public read access to published movies"
ON movies FOR SELECT
USING (status = 'published');

-- Create policy for authenticated users to manage movies (if needed for admin)
CREATE POLICY "Allow authenticated users to manage movies"
ON movies FOR ALL
USING (auth.role() = 'authenticated');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_movies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_movies_timestamp
BEFORE UPDATE ON movies
FOR EACH ROW
EXECUTE FUNCTION update_movies_updated_at();

-- Add some helpful comments
COMMENT ON TABLE movies IS 'Cinema program for Kulturstammtisch movie screenings';
COMMENT ON COLUMN movies.title IS 'Movie title';
COMMENT ON COLUMN movies.description IS 'Movie description/synopsis';
COMMENT ON COLUMN movies.date IS 'Screening date';
COMMENT ON COLUMN movies.cover_image_url IS 'URL to movie poster/cover image';
COMMENT ON COLUMN movies.trailer_youtube_url IS 'YouTube URL for movie trailer';
COMMENT ON COLUMN movies.fsk IS 'Age rating (FSK - Freiwillige Selbstkontrolle)';
COMMENT ON COLUMN movies.status IS 'Publication status: draft, published, or archived';
