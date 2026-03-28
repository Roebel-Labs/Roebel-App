-- Migration: Add time field to movies table
-- Description: Adds a time column to store screening time alongside the date
-- Date: 2025-12-01

-- Add time column to movies table
ALTER TABLE public.movies
ADD COLUMN IF NOT EXISTS time TIME NULL;

-- Add helpful comment for documentation
COMMENT ON COLUMN public.movies.time IS 'Screening time for the movie (HH:MM format)';

-- Create index on time for efficient queries
CREATE INDEX IF NOT EXISTS idx_movies_time
ON public.movies USING btree (time)
WHERE time IS NOT NULL;

-- Note: This field is optional (NULL) to maintain backward compatibility
-- Existing movies without a time will show as NULL

/*
 * ROLLBACK MIGRATION (if needed):
 *
 * DROP INDEX IF EXISTS idx_movies_time;
 * ALTER TABLE public.movies DROP COLUMN IF EXISTS time;
 */

/*
 * USAGE EXAMPLES:
 *
 * 1. Find all movies screening at a specific time:
 *    SELECT * FROM movies
 *    WHERE time = '19:30:00'
 *    AND status = 'published';
 *
 * 2. Find movies screening in the evening (after 18:00):
 *    SELECT * FROM movies
 *    WHERE time >= '18:00:00'
 *    AND status = 'published'
 *    ORDER BY date, time;
 *
 * 3. Get all movies with both date and time:
 *    SELECT id, title, date, time
 *    FROM movies
 *    WHERE date IS NOT NULL AND time IS NOT NULL
 *    ORDER BY date, time;
 */
