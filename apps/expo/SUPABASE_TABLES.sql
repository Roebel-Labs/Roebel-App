-- Supabase Tables for Citizen Verification System
-- Run this SQL in your Supabase SQL Editor

-- Table 1: verification_evidence
-- Stores encrypted personal data for verification requests
CREATE TABLE IF NOT EXISTS public.verification_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id BIGINT NOT NULL,
  requester TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('citizen', 'attester')),
  encrypted_data JSONB NOT NULL,
  public_metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_verification_evidence_request_id
  ON public.verification_evidence(request_id);
CREATE INDEX IF NOT EXISTS idx_verification_evidence_requester
  ON public.verification_evidence(requester);
CREATE INDEX IF NOT EXISTS idx_verification_evidence_type
  ON public.verification_evidence(type);
CREATE INDEX IF NOT EXISTS idx_verification_evidence_created_at
  ON public.verification_evidence(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.verification_evidence ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read all evidence (encrypted anyway)
CREATE POLICY "Anyone can read verification evidence"
  ON public.verification_evidence
  FOR SELECT
  USING (true);

-- Policy: Authenticated users can insert their own evidence
CREATE POLICY "Users can insert their own evidence"
  ON public.verification_evidence
  FOR INSERT
  WITH CHECK (true);

-- Table 2: verification_requests
-- Tracks verification request status and metadata
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id BIGINT UNIQUE NOT NULL,
  requester TEXT NOT NULL,
  target TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('citizen', 'attester')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'executed')),
  attester_signatures INT NOT NULL DEFAULT 0,
  citizen_signatures INT NOT NULL DEFAULT 0,
  evidence_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_verification_requests_request_id
  ON public.verification_requests(request_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_requester
  ON public.verification_requests(requester);
CREATE INDEX IF NOT EXISTS idx_verification_requests_target
  ON public.verification_requests(target);
CREATE INDEX IF NOT EXISTS idx_verification_requests_status
  ON public.verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_verification_requests_type
  ON public.verification_requests(type);
CREATE INDEX IF NOT EXISTS idx_verification_requests_created_at
  ON public.verification_requests(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read all requests
CREATE POLICY "Anyone can read verification requests"
  ON public.verification_requests
  FOR SELECT
  USING (true);

-- Policy: Authenticated users can insert requests
CREATE POLICY "Users can insert verification requests"
  ON public.verification_requests
  FOR INSERT
  WITH CHECK (true);

-- Policy: Authenticated users can update request status
CREATE POLICY "Users can update verification requests"
  ON public.verification_requests
  FOR UPDATE
  USING (true);

-- Add updated_at trigger for verification_evidence
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_verification_evidence_updated_at
  BEFORE UPDATE ON public.verification_evidence
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_verification_requests_updated_at
  BEFORE UPDATE ON public.verification_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON public.verification_evidence TO authenticated;
GRANT ALL ON public.verification_requests TO authenticated;
GRANT SELECT ON public.verification_evidence TO anon;
GRANT SELECT ON public.verification_requests TO anon;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Verification system tables created successfully!';
  RAISE NOTICE 'Tables: verification_evidence, verification_requests';
  RAISE NOTICE 'Run SELECT * FROM verification_evidence; to verify';
END $$;
