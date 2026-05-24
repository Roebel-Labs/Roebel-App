-- ============================================================
-- MIGRATION: story audio tracks
-- Adds optional audio_url to story_collections + events, and a
-- public-read storage bucket for the uploaded audio files.
-- ============================================================

ALTER TABLE story_collections
  ADD COLUMN IF NOT EXISTS audio_url TEXT;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS audio_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('story-audio', 'story-audio', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
      AND tablename = 'objects' AND policyname = 'story_audio_public_read'
  ) THEN
    CREATE POLICY "story_audio_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'story-audio');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
      AND tablename = 'objects' AND policyname = 'story_audio_public_insert'
  ) THEN
    CREATE POLICY "story_audio_public_insert" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'story-audio');
  END IF;
END $$;
