-- ============================================================================
-- Supabase Migration: Add Status and Signature Fields to request_evidence
-- ============================================================================
--
-- This migration adds the following fields to the request_evidence table:
--   - status (TEXT): Request status ('pending', 'approved', 'rejected', 'executed')
--   - nft_type (TEXT): Type of NFT request ('citizen' or 'attester')
--   - attester_signatures (INTEGER): Count of attester signatures
--   - citizen_signatures (INTEGER): Count of citizen signatures
--
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql
--
-- ============================================================================

-- Step 1: Add new columns (if they don't exist)
ALTER TABLE request_evidence
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS nft_type TEXT,
ADD COLUMN IF NOT EXISTS attester_signatures INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS citizen_signatures INTEGER DEFAULT 0;

-- Step 2: Backfill existing records
-- Set status to 'pending' for all records where status is NULL
UPDATE request_evidence
SET status = 'pending'
WHERE status IS NULL;

-- Set nft_type from contract_type for records where nft_type is NULL
UPDATE request_evidence
SET nft_type = contract_type
WHERE nft_type IS NULL;

-- Set default signature counts for records where they are NULL
UPDATE request_evidence
SET
  attester_signatures = 0,
  citizen_signatures = 0
WHERE attester_signatures IS NULL OR citizen_signatures IS NULL;

-- Step 3: Add constraints
-- Make status NOT NULL with CHECK constraint
ALTER TABLE request_evidence
ALTER COLUMN status SET NOT NULL,
ALTER COLUMN status SET DEFAULT 'pending';

-- Add check constraint for valid status values
ALTER TABLE request_evidence
ADD CONSTRAINT request_evidence_status_check
CHECK (status IN ('pending', 'approved', 'rejected', 'executed'));

-- Make nft_type NOT NULL
ALTER TABLE request_evidence
ALTER COLUMN nft_type SET NOT NULL;

-- Add check constraint for valid nft_type values
ALTER TABLE request_evidence
ADD CONSTRAINT request_evidence_nft_type_check
CHECK (nft_type IN ('citizen', 'attester'));

-- Ensure signature counts are NOT NULL and >= 0
ALTER TABLE request_evidence
ALTER COLUMN attester_signatures SET NOT NULL,
ALTER COLUMN attester_signatures SET DEFAULT 0,
ADD CONSTRAINT request_evidence_attester_signatures_check
CHECK (attester_signatures >= 0);

ALTER TABLE request_evidence
ALTER COLUMN citizen_signatures SET NOT NULL,
ALTER COLUMN citizen_signatures SET DEFAULT 0,
ADD CONSTRAINT request_evidence_citizen_signatures_check
CHECK (citizen_signatures >= 0);

-- Step 4: Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_request_evidence_status
ON request_evidence(status);

CREATE INDEX IF NOT EXISTS idx_request_evidence_nft_type
ON request_evidence(nft_type);

CREATE INDEX IF NOT EXISTS idx_request_evidence_status_nft_type
ON request_evidence(status, nft_type);

-- ============================================================================
-- Verification Queries
-- ============================================================================
-- Run these to verify the migration succeeded:

-- Check schema
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'request_evidence'
-- AND column_name IN ('status', 'nft_type', 'attester_signatures', 'citizen_signatures');

-- Check data
-- SELECT
--   request_id,
--   contract_type,
--   status,
--   nft_type,
--   attester_signatures,
--   citizen_signatures,
--   created_at
-- FROM request_evidence
-- ORDER BY created_at DESC
-- LIMIT 10;

-- ============================================================================
-- Migration Complete!
-- ============================================================================
