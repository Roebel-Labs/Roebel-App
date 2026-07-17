-- Mini-App shares in feed posts: a post can reference a live mini app and
-- render it as a tappable store card (same pattern as event/marketplace shares).
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS linked_mini_app_id UUID REFERENCES public.mini_apps(id) ON DELETE SET NULL;

-- Extend post_type CHECK to allow 'mini_app_share'
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_post_type_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_post_type_check
  CHECK (post_type IN ('user', 'mecky', 'event_share', 'marketplace_share', 'event_experience', 'repost', 'quote', 'mini_app_share'));
