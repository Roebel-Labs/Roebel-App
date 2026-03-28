-- =====================================================
-- HomeTown DAO - Users Table Schema
-- =====================================================
-- This schema creates a users table for phone authentication,
-- user profiles, and NFT membership tracking.
--
-- Run this in your Supabase SQL Editor
-- =====================================================

-- 1. Create users table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Authentication
  wallet_address TEXT NOT NULL UNIQUE,
  phone_number TEXT UNIQUE, -- E.164 format: +1234567890
  phone_verified BOOLEAN DEFAULT false,

  -- Profile information (optional)
  username TEXT UNIQUE,
  profile_picture_url TEXT,
  bio TEXT,

  -- NFT membership status (cached for quick access)
  nft_balance BIGINT DEFAULT 0,
  has_delegated BOOLEAN DEFAULT false,
  delegate_address TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 30),
  CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]+$'),
  CONSTRAINT bio_length CHECK (char_length(bio) <= 500)
);

-- 2. Add comment to table
COMMENT ON TABLE public.users IS 'User profiles with phone authentication and NFT membership tracking';

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_wallet_address
  ON public.users(wallet_address);

CREATE INDEX IF NOT EXISTS idx_users_phone_number
  ON public.users(phone_number)
  WHERE phone_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_username
  ON public.users(username)
  WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_created_at
  ON public.users(created_at DESC);

-- 4. Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Attach trigger
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_users_updated_at();

-- 6. Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 7. Drop existing policies if any
DROP POLICY IF EXISTS "Users can view all profiles" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;

-- 8. Create RLS policies

-- Anyone can view user profiles (public profiles)
CREATE POLICY "Users can view all profiles"
  ON public.users
  FOR SELECT
  USING (true);

-- Allow anyone to insert (authentication will be handled by API)
CREATE POLICY "Users can insert their own profile"
  ON public.users
  FOR INSERT
  WITH CHECK (true);

-- Allow anyone to update (API will verify wallet ownership)
CREATE POLICY "Users can update their own profile"
  ON public.users
  FOR UPDATE
  USING (true);

-- 9. Update proposals table to add blockchain_proposal_id column
ALTER TABLE public.proposals
ADD COLUMN IF NOT EXISTS blockchain_proposal_id TEXT;

-- Add index for blockchain_proposal_id
CREATE INDEX IF NOT EXISTS idx_proposals_blockchain_id
  ON public.proposals(blockchain_proposal_id)
  WHERE blockchain_proposal_id IS NOT NULL;

-- 10. Create storage bucket for profile pictures (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-pictures', 'profile-pictures', true)
ON CONFLICT (id) DO NOTHING;

-- 11. Create storage policy for profile picture uploads
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can upload their own pictures" ON storage.objects;
  DROP POLICY IF EXISTS "Users can update their own pictures" ON storage.objects;
  DROP POLICY IF EXISTS "Public can view profile pictures" ON storage.objects;

  -- Allow uploads to profile-pictures bucket
  CREATE POLICY "Users can upload their own pictures"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'profile-pictures');

  -- Allow updates to profile-pictures bucket
  CREATE POLICY "Users can update their own pictures"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'profile-pictures');

  -- Allow public viewing
  CREATE POLICY "Public can view profile pictures"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'profile-pictures');
END $$;

-- 12. Verify setup
DO $$
BEGIN
  RAISE NOTICE '✅ Users table created successfully!';
  RAISE NOTICE '✅ Indexes and triggers configured!';
  RAISE NOTICE '✅ RLS policies enabled!';
  RAISE NOTICE '✅ Profile pictures storage bucket created!';
  RAISE NOTICE '✅ Proposals table updated with blockchain_proposal_id column!';
  RAISE NOTICE '';
  RAISE NOTICE '🎉 Schema setup complete! You can now implement phone authentication.';
END $$;

-- 13. Display table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
ORDER BY ordinal_position;

-- 14. Display all indexes
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'users'
ORDER BY indexname;
