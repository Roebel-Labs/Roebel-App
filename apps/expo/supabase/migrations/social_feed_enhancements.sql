-- =====================================================================
-- Social Feed Enhancements
-- Adds feed_type, post_type, and linked IDs to posts table
-- Adds is_pinned to service_alerts
-- =====================================================================

-- feed_type: Determines which tab the post appears on
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS feed_type TEXT NOT NULL DEFAULT 'main'
  CHECK (feed_type IN ('main', 'rathaus'));

-- post_type: Distinguishes regular user posts from special content
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'user'
  CHECK (post_type IN ('user', 'mecky', 'event_share'));

-- linked_event_id: If this post is an auto-generated event share
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS linked_event_id UUID REFERENCES events(id) ON DELETE SET NULL;

-- linked_mecky_draft_id: If this post was created from a mecky_draft
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS linked_mecky_draft_id UUID REFERENCES mecky_drafts(id) ON DELETE SET NULL;

-- Indexes for feed queries
CREATE INDEX IF NOT EXISTS idx_posts_feed_type_created
  ON posts(feed_type, created_at DESC) WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_posts_post_type
  ON posts(post_type);

-- is_pinned for service alerts
ALTER TABLE service_alerts
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
