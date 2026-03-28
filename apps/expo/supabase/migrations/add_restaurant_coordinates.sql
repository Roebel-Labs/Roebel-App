-- Add latitude/longitude to restaurants table (matching businesses table pattern)
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

-- Partial index for geospatial queries
CREATE INDEX IF NOT EXISTS idx_restaurants_coordinates
  ON public.restaurants (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
