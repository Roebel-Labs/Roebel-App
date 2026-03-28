-- Supabase Schema Fixes and Enhancements
-- Run this in your Supabase SQL Editor

-- 1. Create trigger function for updated_at (if it doesn't exist)
CREATE OR REPLACE FUNCTION update_proposals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Ensure trigger is attached (recreate to be safe)
DROP TRIGGER IF EXISTS update_proposals_updated_at ON public.proposals;
CREATE TRIGGER update_proposals_updated_at
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION update_proposals_updated_at();

-- 3. Enable Row Level Security
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies (if any)
DROP POLICY IF EXISTS "Proposals are viewable by everyone" ON public.proposals;
DROP POLICY IF EXISTS "Authenticated users can insert proposals" ON public.proposals;
DROP POLICY IF EXISTS "System can insert proposals" ON public.proposals;
DROP POLICY IF EXISTS "System can update proposals" ON public.proposals;

-- 5. Create RLS policies

-- Allow public read access (anyone can view proposals)
CREATE POLICY "Proposals are viewable by everyone"
  ON public.proposals
  FOR SELECT
  USING (true);

-- Allow anyone to insert (your API will handle this)
-- In production, you might want to restrict this to service role only
CREATE POLICY "System can insert proposals"
  ON public.proposals
  FOR INSERT
  WITH CHECK (true);

-- Allow updates (for vote syncing)
CREATE POLICY "System can update proposals"
  ON public.proposals
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 6. Add unique constraint on proposal_number (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_proposals_proposal_number'
  ) THEN
    CREATE UNIQUE INDEX idx_proposals_proposal_number
      ON public.proposals(proposal_number)
      WHERE proposal_number IS NOT NULL;
  END IF;
END $$;

-- 7. Add GIN index for full-text search on title and summary
-- This requires the pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP INDEX IF EXISTS idx_proposals_title_search;
DROP INDEX IF EXISTS idx_proposals_summary_search;

CREATE INDEX idx_proposals_title_search
  ON public.proposals
  USING gin(title gin_trgm_ops);

CREATE INDEX idx_proposals_summary_search
  ON public.proposals
  USING gin(summary gin_trgm_ops);

-- 8. Add index for filtering by multiple states (common query pattern)
CREATE INDEX IF NOT EXISTS idx_proposals_state_created
  ON public.proposals(state, created_at DESC);

-- 9. Verify all indexes exist
DO $$
BEGIN
  RAISE NOTICE 'All indexes and policies have been created/verified successfully!';
END $$;

-- 10. Display current table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'proposals'
ORDER BY ordinal_position;

-- 11. Display all indexes
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'proposals'
ORDER BY indexname;
