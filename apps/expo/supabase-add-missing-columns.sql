-- Migration: Add missing columns to request_evidence table
-- Date: 2025-01-11
-- Purpose: Fix "Could not find the 'attester_signatures' column" error
--
-- This migration adds 4 columns that the app code expects:
-- - status: Track request state (pending/approved/rejected)
-- - nft_type: Track what type of NFT this request is for (citizen/attester)
-- - attester_signatures: Count of attester signatures (starts at 0)
-- - citizen_signatures: Count of citizen signatures (starts at 0)

-- Step 1: Add missing columns to request_evidence table
ALTER TABLE public.request_evidence
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS nft_type text,
ADD COLUMN IF NOT EXISTS attester_signatures integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS citizen_signatures integer DEFAULT 0;

-- Step 2: Add constraints (with proper PostgreSQL syntax)
DO $$
BEGIN
    -- Add status constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'request_evidence_status_check'
        AND conrelid = 'public.request_evidence'::regclass
    ) THEN
        ALTER TABLE public.request_evidence
        ADD CONSTRAINT request_evidence_status_check
        CHECK (status IN ('pending', 'approved', 'rejected'));
        RAISE NOTICE 'Added status constraint';
    ELSE
        RAISE NOTICE 'Status constraint already exists, skipping';
    END IF;

    -- Add nft_type constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'request_evidence_nft_type_check'
        AND conrelid = 'public.request_evidence'::regclass
    ) THEN
        ALTER TABLE public.request_evidence
        ADD CONSTRAINT request_evidence_nft_type_check
        CHECK (nft_type IN ('citizen', 'attester'));
        RAISE NOTICE 'Added nft_type constraint';
    ELSE
        RAISE NOTICE 'nft_type constraint already exists, skipping';
    END IF;
END $$;

-- Step 3: Create indexes for new columns (for faster queries)
CREATE INDEX IF NOT EXISTS idx_request_evidence_status
ON public.request_evidence(status);

CREATE INDEX IF NOT EXISTS idx_request_evidence_nft_type
ON public.request_evidence(nft_type);

-- Step 4: Backfill existing records with safe defaults
-- This ensures any existing data gets the new column values
UPDATE public.request_evidence
SET
  status = COALESCE(status, 'pending'),
  nft_type = COALESCE(nft_type, contract_type),
  attester_signatures = COALESCE(attester_signatures, 0),
  citizen_signatures = COALESCE(citizen_signatures, 0)
WHERE status IS NULL OR nft_type IS NULL OR attester_signatures IS NULL OR citizen_signatures IS NULL;

-- Step 5: Verify migration success
-- This will show you all columns in the table after migration
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'request_evidence'
  AND table_schema = 'public'
ORDER BY ordinal_position;
