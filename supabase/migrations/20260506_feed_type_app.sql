-- ============================================
-- Add 'app' value to posts.feed_type CHECK constraint
-- so posts can target the new App discussion feed.
-- Safe to re-run.
-- ============================================

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_feed_type_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_feed_type_check
  CHECK (feed_type IN ('main', 'rathaus', 'app'));

CREATE INDEX IF NOT EXISTS idx_posts_feed_type_status_created
  ON public.posts (feed_type, created_at DESC)
  WHERE status = 'published';
