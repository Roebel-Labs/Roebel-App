-- ============================================
-- Social Posts Schema Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Posts table
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL REFERENCES public.users(wallet_address) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 250),
  media_urls TEXT[] DEFAULT '{}',
  video_url TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'deleted', 'flagged')),
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_wallet_address ON public.posts(wallet_address);
CREATE INDEX IF NOT EXISTS idx_posts_status_created ON public.posts(status, created_at DESC);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published posts are viewable by all" ON public.posts
  FOR SELECT USING (status = 'published');

CREATE POLICY "Users can create their own posts" ON public.posts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own posts" ON public.posts
  FOR UPDATE USING (true);

-- 2. Post links table (cached OG metadata)
CREATE TABLE IF NOT EXISTS public.post_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  og_title TEXT,
  og_description TEXT,
  og_image TEXT,
  og_site_name TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_links_post_id ON public.post_links(post_id);

ALTER TABLE public.post_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Post links are viewable by all" ON public.post_links
  FOR SELECT USING (true);

CREATE POLICY "Post links can be created" ON public.post_links
  FOR INSERT WITH CHECK (true);

-- 3. Post comments table
CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL REFERENCES public.users(wallet_address) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON public.post_comments(post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_post_comments_wallet ON public.post_comments(wallet_address);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments are viewable by all" ON public.post_comments
  FOR SELECT USING (status = 'published');

CREATE POLICY "Users can create comments" ON public.post_comments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own comments" ON public.post_comments
  FOR UPDATE USING (true);

-- 4. Post likes table
CREATE TABLE IF NOT EXISTS public.post_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL REFERENCES public.users(wallet_address) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON public.post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_wallet ON public.post_likes(wallet_address);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are viewable by all" ON public.post_likes
  FOR SELECT USING (true);

CREATE POLICY "Users can create likes" ON public.post_likes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete their own likes" ON public.post_likes
  FOR DELETE USING (true);

-- 5. RPC functions for atomic counter updates
CREATE OR REPLACE FUNCTION increment_post_likes(p_post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE posts SET likes_count = likes_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_post_likes(p_post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_post_comments(p_post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE posts SET comments_count = comments_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. Polls Schema (post_polls + poll_votes)
-- ============================================

CREATE TABLE IF NOT EXISTS public.post_polls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  poll_type TEXT NOT NULL CHECK (poll_type IN ('single', 'multi')),
  options TEXT[] NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id)
);

CREATE INDEX IF NOT EXISTS idx_post_polls_post_id ON public.post_polls(post_id);

ALTER TABLE public.post_polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Polls are viewable by all" ON public.post_polls
  FOR SELECT USING (true);

CREATE POLICY "Users can create polls" ON public.post_polls
  FOR INSERT WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id UUID NOT NULL REFERENCES public.post_polls(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  selected_options INT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(poll_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id ON public.poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_wallet ON public.poll_votes(wallet_address);

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Votes are viewable by all" ON public.poll_votes
  FOR SELECT USING (true);

CREATE POLICY "Users can vote" ON public.poll_votes
  FOR INSERT WITH CHECK (true);

-- ============================================
-- 7. Add media columns to post_comments
-- ============================================

ALTER TABLE public.post_comments ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}';
ALTER TABLE public.post_comments ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT NULL;
