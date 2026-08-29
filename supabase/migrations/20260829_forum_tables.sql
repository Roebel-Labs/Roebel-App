-- Umfragen-Forum slice A (spec: docs/superpowers/specs/2026-08-29-umfragen-forum-design.md)
-- Categories are a curated taxonomy (service-role writes only). Threads/replies
-- are citizen content following the proposal_comments idiom: client inserts,
-- soft-delete via owner-checked SECURITY DEFINER RPCs, RLS enabled from day one.

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.forum_categories (
  slug        text PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name        text NOT NULL,
  about       text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.forum_threads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address   text NOT NULL REFERENCES public.users(wallet_address),
  account_id       uuid REFERENCES public.accounts(id),
  category_slug    text REFERENCES public.forum_categories(slug),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  body             text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  status           text NOT NULL DEFAULT 'published' CHECK (status IN ('published','deleted','flagged')),
  reply_count      integer NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.forum_replies (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id        uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  parent_reply_id  uuid REFERENCES public.forum_replies(id),
  wallet_address   text NOT NULL REFERENCES public.users(wallet_address),
  account_id       uuid REFERENCES public.accounts(id),
  body             text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  status           text NOT NULL DEFAULT 'published' CHECK (status IN ('published','deleted')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forum_threads_activity_idx ON public.forum_threads (last_activity_at DESC);
CREATE INDEX IF NOT EXISTS forum_threads_category_idx ON public.forum_threads (category_slug);
CREATE INDEX IF NOT EXISTS forum_replies_thread_idx  ON public.forum_replies (thread_id, created_at);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_threads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_replies    ENABLE ROW LEVEL SECURITY;

-- Categories: world-readable, writes are service-role only (no insert policy).
CREATE POLICY forum_categories_select ON public.forum_categories FOR SELECT USING (true);

-- Threads/replies: world-readable; inserts must arrive as 'published'.
-- Updates/deletes have NO policy — they go through the owner-checked RPCs below.
CREATE POLICY forum_threads_select ON public.forum_threads FOR SELECT USING (true);
CREATE POLICY forum_threads_insert ON public.forum_threads FOR INSERT WITH CHECK (status = 'published');
CREATE POLICY forum_replies_select ON public.forum_replies FOR SELECT USING (true);
CREATE POLICY forum_replies_insert ON public.forum_replies FOR INSERT WITH CHECK (status = 'published');

-- ── Owner-checked soft delete (idiom: delete_owned_post) ───────────────────
CREATE OR REPLACE FUNCTION public.delete_owned_forum_thread(p_thread_id uuid, p_wallet text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.forum_threads SET status = 'deleted', updated_at = now()
   WHERE id = p_thread_id AND lower(wallet_address) = lower(p_wallet);
  IF NOT FOUND THEN RAISE EXCEPTION 'thread not found or not owned by %', p_wallet; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_owned_forum_reply(p_reply_id uuid, p_wallet text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.forum_replies SET status = 'deleted'
   WHERE id = p_reply_id AND lower(wallet_address) = lower(p_wallet);
  IF NOT FOUND THEN RAISE EXCEPTION 'reply not found or not owned by %', p_wallet; END IF;
END; $$;

-- ── Reply counters ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bump_forum_thread_on_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.forum_threads
     SET reply_count = reply_count + 1, last_activity_at = NEW.created_at
   WHERE id = NEW.thread_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_bump_forum_thread_on_reply ON public.forum_replies;
CREATE TRIGGER trg_bump_forum_thread_on_reply
  AFTER INSERT ON public.forum_replies
  FOR EACH ROW WHEN (NEW.status = 'published')
  EXECUTE FUNCTION public.bump_forum_thread_on_reply();

-- ── In-app notification: reply → thread author ─────────────────────────────
-- (idiom: notify_post_comment in like_comment_invite_notifications.sql)
CREATE OR REPLACE FUNCTION public.notify_forum_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_author_wallet text;
  v_replier_name  text;
  v_body          text;
BEGIN
  SELECT lower(t.wallet_address) INTO v_author_wallet
    FROM public.forum_threads t WHERE t.id = NEW.thread_id;
  IF v_author_wallet IS NULL OR v_author_wallet = lower(NEW.wallet_address) THEN
    RETURN NEW;
  END IF;

  v_replier_name := COALESCE(
    (SELECT NULLIF(btrim(a.name), '') FROM public.accounts a WHERE a.id = NEW.account_id),
    (SELECT NULLIF(btrim(u.display_name), '') FROM public.users u WHERE lower(u.wallet_address) = lower(NEW.wallet_address)),
    (SELECT NULLIF(btrim(u.username), '')     FROM public.users u WHERE lower(u.wallet_address) = lower(NEW.wallet_address))
  );

  v_body := NULLIF(btrim(NEW.body), '');
  IF v_body IS NULL THEN v_body := 'hat auf dein Thema geantwortet';
  ELSIF length(v_body) > 140 THEN v_body := left(v_body, 140) || '…';
  END IF;

  INSERT INTO public.notifications (recipient_wallet, type, title, body, metadata)
  VALUES (
    v_author_wallet, 'forum_reply', COALESCE(v_replier_name, 'Jemand'), v_body,
    jsonb_build_object('thread_id', NEW.thread_id, 'reply_id', NEW.id, 'actor_wallet', lower(NEW.wallet_address))
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_forum_reply ON public.forum_replies;
CREATE TRIGGER trg_notify_forum_reply
  AFTER INSERT ON public.forum_replies
  FOR EACH ROW WHEN (NEW.status = 'published')
  EXECUTE FUNCTION public.notify_forum_reply();

-- ── Seed categories ─────────────────────────────────────────────────────────
INSERT INTO public.forum_categories (slug, name, about, sort_order) VALUES
  ('verkehr',         'Verkehr',         'Straßen, Radwege, Parken, ÖPNV', 1),
  ('bildung',         'Bildung',         'Schule, Kita, Jugend',           2),
  ('haushalt',        'Haushalt',        'Gemeindefinanzen und Ausgaben',  3),
  ('ortsentwicklung', 'Ortsentwicklung', 'Bauen, Plätze, Tourismus',       4)
ON CONFLICT (slug) DO NOTHING;
