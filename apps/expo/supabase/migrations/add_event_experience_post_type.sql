-- Surface event experiences as posts in the main feed.
--
-- When a user adds an experience to an event, we mirror it into the `posts`
-- table so it shows up in the home feed via the existing fetchFeedPosts query.
-- The mirrored row keeps a back-reference to the experience via
-- `linked_experience_id` so we can cascade soft-deletes from the event detail
-- screen.

-- Allow the new post_type value
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_post_type_check;
ALTER TABLE posts ADD CONSTRAINT posts_post_type_check
  CHECK (post_type IN ('user', 'mecky', 'event_share', 'marketplace_share', 'event_experience'));

-- Back-reference column
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS linked_experience_id UUID
  REFERENCES event_experiences(id) ON DELETE SET NULL;

-- Index for the cascade-delete lookup
CREATE INDEX IF NOT EXISTS idx_posts_linked_experience_id
  ON posts(linked_experience_id) WHERE linked_experience_id IS NOT NULL;
