-- Migration: Add Google Maps geographical data to events table
-- Description: Adds latitude, longitude, place_id, formatted_address, and address_components
--              to enable displaying events on a map
-- Date: 2025-01-27

-- Add geographical columns to events table
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7) NULL,
ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7) NULL,
ADD COLUMN IF NOT EXISTS place_id VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS formatted_address TEXT NULL,
ADD COLUMN IF NOT EXISTS address_components JSONB NULL;

-- Create spatial index for efficient map queries (filtering by coordinates)
CREATE INDEX IF NOT EXISTS idx_events_coordinates
ON public.events USING btree (latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Create index on place_id for quick lookups
CREATE INDEX IF NOT EXISTS idx_events_place_id
ON public.events USING btree (place_id)
WHERE place_id IS NOT NULL;

-- Add helpful comments for documentation
COMMENT ON COLUMN public.events.latitude IS 'Geographical latitude from Google Maps (-90 to 90)';
COMMENT ON COLUMN public.events.longitude IS 'Geographical longitude from Google Maps (-180 to 180)';
COMMENT ON COLUMN public.events.place_id IS 'Google Maps Place ID for reference and updates';
COMMENT ON COLUMN public.events.formatted_address IS 'Human-readable address from Google Maps';
COMMENT ON COLUMN public.events.address_components IS 'Structured address data (city, country, postal code, etc.) in JSONB format';

-- Add check constraint to validate coordinate ranges
ALTER TABLE public.events
ADD CONSTRAINT check_latitude_range CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));

ALTER TABLE public.events
ADD CONSTRAINT check_longitude_range CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));

-- Note: The original 'location' column is kept for backward compatibility
-- It stores the user-entered or Google-formatted address string

/*
 * ROLLBACK MIGRATION (if needed):
 *
 * ALTER TABLE public.events DROP CONSTRAINT IF EXISTS check_latitude_range;
 * ALTER TABLE public.events DROP CONSTRAINT IF EXISTS check_longitude_range;
 * DROP INDEX IF EXISTS idx_events_coordinates;
 * DROP INDEX IF EXISTS idx_events_place_id;
 * ALTER TABLE public.events DROP COLUMN IF EXISTS latitude;
 * ALTER TABLE public.events DROP COLUMN IF EXISTS longitude;
 * ALTER TABLE public.events DROP COLUMN IF EXISTS place_id;
 * ALTER TABLE public.events DROP COLUMN IF EXISTS formatted_address;
 * ALTER TABLE public.events DROP COLUMN IF EXISTS address_components;
 */

/*
 * USAGE EXAMPLES:
 *
 * 1. Find all events within a bounding box (e.g., visible map area):
 *    SELECT * FROM events
 *    WHERE latitude BETWEEN 48.0 AND 49.0
 *    AND longitude BETWEEN 11.0 AND 12.0;
 *
 * 2. Find events in a specific city (using address_components):
 *    SELECT * FROM events
 *    WHERE address_components @> '[{"types": ["locality"], "long_name": "Berlin"}]';
 *
 * 3. Get all events with coordinates for map display:
 *    SELECT id, title, latitude, longitude, formatted_address
 *    FROM events
 *    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
 *    AND status = 'approved';
 */
