-- ============================================================
-- MIGRATION 11: Storage buckets for tourist admin uploads
-- Public read; insert/update/delete via authenticated session
-- (admin dashboard uses anon key + Supabase Auth, no extra gate).
-- Mirrors the pattern of the existing 'news-images' bucket.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('tour-images', 'tour-images', true),
  ('wildlife-images', 'wildlife-images', true),
  ('poi-images', 'poi-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access on all three buckets
CREATE POLICY "tour_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tour-images');

CREATE POLICY "wildlife_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'wildlife-images');

CREATE POLICY "poi_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'poi-images');

-- Permissive write/update/delete (admin dashboard is the only writer in v1).
-- Tighten later via custom JWT claim or service-role-only inserts.
CREATE POLICY "tour_images_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'tour-images');

CREATE POLICY "tour_images_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'tour-images');

CREATE POLICY "tour_images_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'tour-images');

CREATE POLICY "wildlife_images_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'wildlife-images');

CREATE POLICY "wildlife_images_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'wildlife-images');

CREATE POLICY "wildlife_images_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'wildlife-images');

CREATE POLICY "poi_images_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'poi-images');

CREATE POLICY "poi_images_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'poi-images');

CREATE POLICY "poi_images_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'poi-images');
