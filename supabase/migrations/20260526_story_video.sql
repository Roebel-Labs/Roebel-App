-- ============================================================
-- MIGRATION: story slide videos + black overlay text
-- Adds optional per-slide video (a slide can now be an image OR a
-- video), relaxes the image NOT NULL constraint, switches the
-- overlay-text default to black and flips all existing slides to
-- black, and adds a public-read storage bucket for slide videos.
-- ============================================================

-- Per-slide video (image OR video). Image is no longer mandatory.
ALTER TABLE story_slides
  ADD COLUMN IF NOT EXISTS background_video_url TEXT;

ALTER TABLE story_slides
  ALTER COLUMN background_image_url DROP NOT NULL;

-- Black overlay text: new default + flip every existing slide.
ALTER TABLE story_slides
  ALTER COLUMN text_color SET DEFAULT '#000000';

UPDATE story_slides SET text_color = '#000000';

-- Public-read bucket for uploaded slide videos (mirrors story-audio).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'story-videos',
  'story-videos',
  true,
  52428800, -- 50 MB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
      AND tablename = 'objects' AND policyname = 'story_videos_public_read'
  ) THEN
    CREATE POLICY "story_videos_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'story-videos');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
      AND tablename = 'objects' AND policyname = 'story_videos_public_insert'
  ) THEN
    CREATE POLICY "story_videos_public_insert" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'story-videos');
  END IF;
END $$;
