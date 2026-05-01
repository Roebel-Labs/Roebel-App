-- ============================================
-- Proposal Comments + Likes Schema Migration
-- Adds discussion comments under proposals
-- (mirrors event_experiences) and per-comment hearts
-- (mirrors post_likes).
-- ============================================

-- ── proposal_comments ─────────────────────────
CREATE TABLE IF NOT EXISTS public.proposal_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL,
  wallet_address TEXT NOT NULL,
  account_id UUID DEFAULT NULL,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  media_urls TEXT[] DEFAULT '{}',
  video_url TEXT DEFAULT NULL,
  emoji TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_comments_proposal_created
  ON public.proposal_comments (proposal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_comments_wallet
  ON public.proposal_comments (wallet_address);

CREATE INDEX IF NOT EXISTS idx_proposal_comments_created
  ON public.proposal_comments (created_at DESC);

ALTER TABLE public.proposal_comments
  ADD CONSTRAINT proposal_comments_wallet_address_fkey
  FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address) ON DELETE CASCADE;

ALTER TABLE public.proposal_comments
  ADD CONSTRAINT proposal_comments_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;

ALTER TABLE public.proposal_comments
  ADD CONSTRAINT proposal_comments_proposal_id_fkey
  FOREIGN KEY (proposal_id) REFERENCES public.proposals(proposal_id) ON DELETE CASCADE;

ALTER TABLE public.proposal_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published proposal comments are viewable by all" ON public.proposal_comments
  FOR SELECT USING (status = 'published');

CREATE POLICY "Users can create proposal comments" ON public.proposal_comments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own proposal comments" ON public.proposal_comments
  FOR UPDATE USING (true);

-- ── proposal_comment_likes ────────────────────
CREATE TABLE IF NOT EXISTS public.proposal_comment_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.proposal_comments(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comment_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_proposal_comment_likes_comment
  ON public.proposal_comment_likes (comment_id);

CREATE INDEX IF NOT EXISTS idx_proposal_comment_likes_wallet
  ON public.proposal_comment_likes (wallet_address);

ALTER TABLE public.proposal_comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are viewable by all" ON public.proposal_comment_likes
  FOR SELECT USING (true);

CREATE POLICY "Users can like proposal comments" ON public.proposal_comment_likes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can unlike their own likes" ON public.proposal_comment_likes
  FOR DELETE USING (true);
