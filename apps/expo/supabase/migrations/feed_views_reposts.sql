-- Views (X-style impressions, per-user counts) + repost/quote support.
-- Spec: docs/superpowers/specs/2026-07-10-x-style-feed-views-design.md

-- ── Views ────────────────────────────────────────────────────
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.post_views (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  view_count integer NOT NULL DEFAULT 1,
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, wallet_address)
);

ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_views_select ON public.post_views;
CREATE POLICY post_views_select ON public.post_views FOR SELECT USING (true);
-- No INSERT/UPDATE policies: writes happen only through the RPC below.

CREATE OR REPLACE FUNCTION public.increment_post_views(p_post_ids uuid[], p_wallet text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_wallet IS NULL OR btrim(p_wallet) = '' OR p_post_ids IS NULL OR array_length(p_post_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.post_views (post_id, wallet_address)
    SELECT DISTINCT unnest(p_post_ids), lower(p_wallet)
  ON CONFLICT (post_id, wallet_address)
    DO UPDATE SET view_count = post_views.view_count + 1,
                  last_viewed_at = now();

  UPDATE public.posts
     SET views_count = views_count + 1
   WHERE id = ANY(p_post_ids)
     AND status = 'published';
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_post_views(uuid[], text) TO anon, authenticated;

-- ── Repost / quote ───────────────────────────────────────────
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS quoted_post_id uuid REFERENCES public.posts(id);
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS reposts_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS posts_quoted_post_id_idx ON public.posts (quoted_post_id) WHERE quoted_post_id IS NOT NULL;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_post_type_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_post_type_check
  CHECK (post_type IN ('user', 'mecky', 'event_share', 'marketplace_share', 'event_experience', 'repost', 'quote'));

-- One plain repost per user per post (quotes are unlimited).
CREATE UNIQUE INDEX IF NOT EXISTS posts_one_repost_per_user
  ON public.posts (wallet_address, quoted_post_id)
  WHERE post_type = 'repost' AND status = 'published';

-- Maintain reposts_count on the ORIGINAL for repost+quote rows.
CREATE OR REPLACE FUNCTION public.maintain_reposts_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_type IN ('repost', 'quote') AND NEW.quoted_post_id IS NOT NULL AND NEW.status = 'published' THEN
      UPDATE public.posts SET reposts_count = reposts_count + 1 WHERE id = NEW.quoted_post_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_type IN ('repost', 'quote') AND OLD.quoted_post_id IS NOT NULL AND OLD.status = 'published' THEN
      UPDATE public.posts SET reposts_count = GREATEST(0, reposts_count - 1) WHERE id = OLD.quoted_post_id;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.post_type IN ('repost', 'quote') AND OLD.quoted_post_id IS NOT NULL THEN
      IF OLD.status = 'published' AND NEW.status <> 'published' THEN
        UPDATE public.posts SET reposts_count = GREATEST(0, reposts_count - 1) WHERE id = OLD.quoted_post_id;
      ELSIF OLD.status <> 'published' AND NEW.status = 'published' THEN
        UPDATE public.posts SET reposts_count = reposts_count + 1 WHERE id = OLD.quoted_post_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintain_reposts_count ON public.posts;
CREATE TRIGGER trg_maintain_reposts_count
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.maintain_reposts_count();

-- Plain reposts must NOT push-notify the whole town (quotes still do).
-- Recreate the feed-post notification trigger with a post_type exclusion.
DROP TRIGGER IF EXISTS trg_notify_new_main_post ON public.posts;
CREATE TRIGGER trg_notify_new_main_post
  AFTER INSERT ON public.posts
  FOR EACH ROW
  WHEN (NEW.feed_type = 'main' AND NEW.status = 'published' AND NEW.post_type <> 'repost')
  EXECUTE FUNCTION public.notify_new_main_post();
