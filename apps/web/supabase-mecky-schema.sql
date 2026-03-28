-- =====================================================
-- Mecky Bot: Schema Updates, System User & Drafts Table
-- Run this migration in your Supabase SQL Editor
-- =====================================================

-- 1. Add missing columns to users table (role, neighborhood, interests, vereine, privacy_settings)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'resident'
  CHECK (role IN ('resident', 'business', 'tourist', 'official'));

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS neighborhood TEXT;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS interests JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS vereine JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{
  "bio": "public",
  "neighborhood": "public",
  "interests": "public",
  "vereine": "citizens",
  "email": "private",
  "phone_number": "private",
  "voting_history": "citizens",
  "gamification_points": "public"
}'::jsonb;

-- 2. Insert Mecky system user into users table
INSERT INTO public.users (
  wallet_address,
  username,
  profile_picture_url,
  bio,
  role,
  neighborhood,
  is_verified_citizen,
  phone_verified
)
VALUES (
  'mecky_bot',
  'Mecky',
  '/mecky/mecky.png',
  'Moin! Ick biin Mecky, de Bulle vun Röbel. Ick bring di dat Neuste ut de Region!',
  'official',
  'Altstadt',
  true,
  false
)
ON CONFLICT (wallet_address) DO NOTHING;

-- 3. Create mecky_drafts table for AI-generated post proposals
CREATE TABLE IF NOT EXISTS public.mecky_drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  source_url TEXT,
  source_title TEXT,
  source_site TEXT,
  source_published_at TIMESTAMPTZ,
  rss_item_guid TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image TEXT,
  og_site_name TEXT,
  ai_model TEXT DEFAULT 'claude-sonnet-4-20250514',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_post_id UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_mecky_drafts_status ON public.mecky_drafts(status);
CREATE INDEX IF NOT EXISTS idx_mecky_drafts_created ON public.mecky_drafts(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mecky_drafts_rss_guid
  ON public.mecky_drafts(rss_item_guid) WHERE rss_item_guid IS NOT NULL;

-- 5. Enable RLS
ALTER TABLE public.mecky_drafts ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
CREATE POLICY "Mecky drafts are viewable by all"
  ON public.mecky_drafts FOR SELECT USING (true);

CREATE POLICY "Mecky drafts can be created"
  ON public.mecky_drafts FOR INSERT WITH CHECK (true);

CREATE POLICY "Mecky drafts can be updated"
  ON public.mecky_drafts FOR UPDATE USING (true);
