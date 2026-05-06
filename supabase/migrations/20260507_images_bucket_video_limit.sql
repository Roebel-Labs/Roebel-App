-- ============================================
-- Allow large video uploads to the shared "images" bucket.
-- 5 GB matches the Supabase Pro per-file maximum.
-- No-op on Free plan: the project-level cap (50 MB) wins.
-- Safe to re-run.
-- ============================================

UPDATE storage.buckets
   SET file_size_limit = 5368709120  -- 5 GB
 WHERE id = 'images';
