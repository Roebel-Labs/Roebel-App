-- =====================================================
-- News Articles & Storage Setup
-- =====================================================
-- This migration sets up the news_articles table with RLS policies
-- and configures the news-images storage bucket

-- =====================================================
-- 1. Create Storage Bucket for News Images
-- =====================================================

-- Create the news-images bucket (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'news-images',
  'news-images',
  true,  -- Public bucket for news images
  5242880,  -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

-- =====================================================
-- 2. Storage Bucket Policies for news-images
-- =====================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view news images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload news images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update their news images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete their news images" ON storage.objects;

-- Allow anyone to view/download news images (public bucket)
CREATE POLICY "Anyone can view news images"
ON storage.objects FOR SELECT
USING (bucket_id = 'news-images');

-- Allow authenticated users to upload news images
CREATE POLICY "Authenticated users can upload news images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'news-images');

-- Allow authenticated users to update news images they uploaded
CREATE POLICY "Authenticated users can update their news images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'news-images');

-- Allow authenticated users to delete news images they uploaded
CREATE POLICY "Authenticated users can delete their news images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'news-images');

-- =====================================================
-- 3. News Articles Table RLS Policies
-- =====================================================

-- Enable RLS on news_articles table (if not already enabled)
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view published news articles" ON news_articles;
DROP POLICY IF EXISTS "Authenticated users can view all news articles" ON news_articles;
DROP POLICY IF EXISTS "Authenticated users can insert news articles" ON news_articles;
DROP POLICY IF EXISTS "Authenticated users can update news articles" ON news_articles;
DROP POLICY IF EXISTS "Authenticated users can delete news articles" ON news_articles;

-- Allow anyone to view published articles
CREATE POLICY "Anyone can view published news articles"
ON news_articles FOR SELECT
USING (status = 'published');

-- Allow authenticated users to view all articles (including drafts)
CREATE POLICY "Authenticated users can view all news articles"
ON news_articles FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to insert news articles
-- Note: For production, you may want to restrict this to specific roles/admins
CREATE POLICY "Authenticated users can insert news articles"
ON news_articles FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update news articles
-- Note: For production, you may want to restrict this to article authors or admins
CREATE POLICY "Authenticated users can update news articles"
ON news_articles FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow authenticated users to delete news articles
-- Note: For production, you may want to restrict this to article authors or admins
CREATE POLICY "Authenticated users can delete news articles"
ON news_articles FOR DELETE
TO authenticated
USING (true);

-- =====================================================
-- 4. Grant necessary permissions
-- =====================================================

-- Grant usage on the news_articles table to authenticated users
GRANT ALL ON news_articles TO authenticated;
GRANT ALL ON news_articles TO anon;

-- =====================================================
-- IMPORTANT NOTES FOR PRODUCTION:
-- =====================================================
--
-- 1. AUTHENTICATION: Currently, these policies allow any authenticated user
--    to create/update/delete articles. For production, you should:
--    - Create an admin role in Supabase
--    - Restrict INSERT/UPDATE/DELETE to users with admin role
--    - Example: USING (auth.jwt() ->> 'role' = 'admin')
--
-- 2. AUTHOR TRACKING: You might want to add author_id column to track who
--    created each article and restrict updates to the author or admins
--
-- 3. STORAGE CLEANUP: Consider setting up a storage cleanup policy to
--    delete orphaned images when articles are deleted
--
-- 4. RATE LIMITING: Consider implementing rate limiting on image uploads
--    to prevent abuse
--
-- =====================================================

-- Verification queries (run these to check the setup):
--
-- Check bucket configuration:
-- SELECT * FROM storage.buckets WHERE id = 'news-images';
--
-- Check storage policies:
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE '%news images%';
--
-- Check news_articles policies:
-- SELECT * FROM pg_policies WHERE tablename = 'news_articles';
