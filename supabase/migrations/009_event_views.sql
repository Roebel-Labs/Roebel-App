-- Track unique event views per user
CREATE TABLE IF NOT EXISTS public.event_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_event_views_event ON public.event_views(event_id);
CREATE INDEX IF NOT EXISTS idx_event_views_wallet ON public.event_views(wallet_address);
