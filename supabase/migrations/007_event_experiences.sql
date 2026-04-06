-- ============================================
-- Event Experiences Schema Migration
-- Allows users to share experiences on events
-- ============================================

CREATE TABLE IF NOT EXISTS public.event_experiences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  media_urls TEXT[] DEFAULT '{}',
  video_url TEXT DEFAULT NULL,
  emoji TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_experiences_event_created
  ON public.event_experiences (event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_experiences_wallet
  ON public.event_experiences (wallet_address);

ALTER TABLE public.event_experiences
  ADD CONSTRAINT event_experiences_wallet_address_fkey
  FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address) ON DELETE CASCADE;

ALTER TABLE public.event_experiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published experiences are viewable by all" ON public.event_experiences
  FOR SELECT USING (status = 'published');

CREATE POLICY "Users can create experiences" ON public.event_experiences
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own experiences" ON public.event_experiences
  FOR UPDATE USING (true);
