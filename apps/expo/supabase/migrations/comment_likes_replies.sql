-- Comment likes, single-level replies, edit markers, wallet-safe notifications
--
-- Adds three things to the post-comment system:
--   1. LIKE a comment  → `post_comment_likes` table + denormalized likes_count,
--      with a push notification to the comment author.
--   2. REPLY to a comment → `post_comments.parent_comment_id` (single level:
--      a reply always points at a TOP-LEVEL comment) + denormalized reply_count.
--      A reply notifies the parent comment's author AND everyone who already
--      replied to that comment (minus the replier) — NOT the post author.
--   3. EDIT markers → `edited_at` on posts and post_comments.
--
-- It also fixes the long-standing wallet-address leak in like/comment pushes:
-- `notify_post_like` / `notify_post_comment` resolved the actor name from raw
-- accounts.name / display_name / username, so users whose name is their wallet
-- got a "0x…" push title. We reuse the wallet-safe `account_display_name()`
-- resolver introduced in notification_clean_titles_bodies.sql via a small
-- `actor_display_name()` wrapper, mirroring notify_new_main_post.
--
-- Comment counts move to DB triggers: posts.comments_count now counts TOP-LEVEL
-- comments (matching the visible list), post_comments.reply_count counts a
-- comment's replies, and post_comments.likes_count counts its likes. The legacy
-- client/RPC count writes are neutralised here so nothing double-counts.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Wallet-safe actor name (account name → display name → username → 'Jemand').
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.actor_display_name(p_account_id uuid, p_wallet text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  v_name := COALESCE(
    public.account_display_name(p_account_id),
    (SELECT NULLIF(btrim(u.display_name), '') FROM public.users u WHERE lower(u.wallet_address) = lower(p_wallet)),
    (SELECT NULLIF(btrim(u.username), '')     FROM public.users u WHERE lower(u.wallet_address) = lower(p_wallet))
  );
  -- Never let a wallet-like value through as a name.
  IF v_name IS NULL OR v_name ~* '^0x[a-f0-9]{6,}$' THEN
    RETURN 'Jemand';
  END IF;
  RETURN v_name;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Schema: comment likes table + new columns.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_comment_likes (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id     UUID NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL REFERENCES public.users(wallet_address) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comment_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_post_comment_likes_comment ON public.post_comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_post_comment_likes_wallet  ON public.post_comment_likes(wallet_address);

ALTER TABLE public.post_comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comment likes are viewable by all" ON public.post_comment_likes;
CREATE POLICY "Comment likes are viewable by all" ON public.post_comment_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can create comment likes" ON public.post_comment_likes;
CREATE POLICY "Users can create comment likes" ON public.post_comment_likes FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can delete their own comment likes" ON public.post_comment_likes;
CREATE POLICY "Users can delete their own comment likes" ON public.post_comment_likes FOR DELETE USING (true);

GRANT SELECT, INSERT, DELETE ON public.post_comment_likes TO anon, authenticated;

ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID DEFAULT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE;
ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS reply_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON public.post_comments(parent_comment_id, created_at ASC);

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ DEFAULT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Denormalized count maintenance (triggers — robust against drift).
-- ─────────────────────────────────────────────────────────────────────────────

-- likes_count on a comment, synced from post_comment_likes.
CREATE OR REPLACE FUNCTION public.post_comment_like_count_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.post_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.post_comments SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_comment_like_count ON public.post_comment_likes;
CREATE TRIGGER trg_post_comment_like_count
  AFTER INSERT OR DELETE ON public.post_comment_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.post_comment_like_count_sync();

-- Comment counts, fully trigger-owned (no client/RPC increments — avoids drift,
-- especially the cascade-delete-of-replies case the per-row RPC could not see):
--   * posts.comments_count counts TOP-LEVEL comments, so the "Kommentare (N)"
--     header matches the visible top-level list.
--   * post_comments.reply_count counts a comment's direct replies.
CREATE OR REPLACE FUNCTION public.post_comment_counts_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_comment_id IS NULL THEN
      UPDATE public.posts
         SET comments_count = comments_count + 1
       WHERE id = NEW.post_id;
    ELSE
      UPDATE public.post_comments
         SET reply_count = reply_count + 1
       WHERE id = NEW.parent_comment_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.parent_comment_id IS NULL THEN
      UPDATE public.posts
         SET comments_count = GREATEST(0, comments_count - 1)
       WHERE id = OLD.post_id;
    ELSE
      UPDATE public.post_comments
         SET reply_count = GREATEST(0, reply_count - 1)
       WHERE id = OLD.parent_comment_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_comment_counts ON public.post_comments;
CREATE TRIGGER trg_post_comment_counts
  AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.post_comment_counts_sync();

-- The trigger now owns comments_count, so the legacy client/RPC count writes
-- must stop (or they would double-count). `increment_post_comments` becomes a
-- no-op (web still calls it harmlessly) and the delete RPC drops its decrement.
CREATE OR REPLACE FUNCTION public.increment_post_comments(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- No-op: posts.comments_count is maintained by trg_post_comment_counts.
  PERFORM 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_owned_post_comment(
  p_comment_id uuid,
  p_wallet text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  -- Replies cascade-delete via the parent FK; comments_count / reply_count are
  -- maintained by trg_post_comment_counts, so this only enforces ownership.
  DELETE FROM public.post_comments
   WHERE id = p_comment_id
     AND lower(wallet_address) = lower(p_wallet);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'comment % not found or not owned by %', p_comment_id, p_wallet
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Notifications.
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a. LIKE on a post → wallet-safe actor name (retrofit).
CREATE OR REPLACE FUNCTION public.notify_post_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_wallet text;
BEGIN
  SELECT lower(p.wallet_address) INTO v_author_wallet FROM public.posts p WHERE p.id = NEW.post_id;
  IF v_author_wallet IS NULL OR v_author_wallet = lower(NEW.wallet_address) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (recipient_wallet, type, title, body, metadata)
  VALUES (
    v_author_wallet,
    'post_like',
    public.actor_display_name(NULL, NEW.wallet_address),
    'hat deinen Beitrag geliked',
    jsonb_build_object('post_id', NEW.post_id, 'actor_wallet', lower(NEW.wallet_address))
  );
  RETURN NEW;
END;
$$;

-- 4b. COMMENT or REPLY on a post.
--   * Top-level comment (parent_comment_id IS NULL) → notify the post author.
--   * Reply (parent_comment_id NOT NULL) → notify the parent comment author +
--     everyone who already replied to that comment, minus the replier.
--     The post author is NOT notified for a reply.
CREATE OR REPLACE FUNCTION public.notify_post_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_author text;
  v_name        text;
  v_body        text;
  v_rec         text;
BEGIN
  -- Shared body excerpt.
  v_body := NULLIF(btrim(NEW.content), '');
  IF v_body IS NULL THEN
    v_body := CASE WHEN NEW.parent_comment_id IS NULL
                   THEN 'hat deinen Beitrag kommentiert'
                   ELSE 'hat auf deinen Kommentar geantwortet' END;
  ELSIF length(v_body) > 140 THEN
    v_body := left(v_body, 140) || '…';
  END IF;

  v_name := public.actor_display_name(NEW.account_id, NEW.wallet_address);

  IF NEW.parent_comment_id IS NULL THEN
    -- Top-level comment → notify the post author.
    SELECT lower(p.wallet_address) INTO v_post_author FROM public.posts p WHERE p.id = NEW.post_id;
    IF v_post_author IS NULL OR v_post_author = lower(NEW.wallet_address) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications (recipient_wallet, type, title, body, metadata)
    VALUES (
      v_post_author,
      'post_comment',
      v_name,
      v_body,
      jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id, 'actor_wallet', lower(NEW.wallet_address))
    );
  ELSE
    -- Reply → parent comment author ∪ prior repliers, minus the replier.
    FOR v_rec IN
      SELECT DISTINCT s.w FROM (
        SELECT lower(c.wallet_address) AS w
          FROM public.post_comments c
         WHERE c.id = NEW.parent_comment_id
        UNION
        SELECT lower(c.wallet_address) AS w
          FROM public.post_comments c
         WHERE c.parent_comment_id = NEW.parent_comment_id
           AND c.id <> NEW.id
      ) s
      WHERE s.w IS NOT NULL
        AND s.w <> lower(NEW.wallet_address)
    LOOP
      INSERT INTO public.notifications (recipient_wallet, type, title, body, metadata)
      VALUES (
        v_rec,
        'post_reply',
        v_name,
        v_body,
        jsonb_build_object(
          'post_id', NEW.post_id,
          'comment_id', NEW.id,
          'parent_comment_id', NEW.parent_comment_id,
          'actor_wallet', lower(NEW.wallet_address)
        )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_post_comment ON public.post_comments;
CREATE TRIGGER trg_notify_post_comment
  AFTER INSERT ON public.post_comments
  FOR EACH ROW
  WHEN (NEW.status = 'published')
  EXECUTE FUNCTION public.notify_post_comment();

-- 4c. LIKE on a comment → notify the comment author (unless self-like).
CREATE OR REPLACE FUNCTION public.notify_post_comment_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment_author text;
  v_post_id        uuid;
BEGIN
  SELECT lower(c.wallet_address), c.post_id
    INTO v_comment_author, v_post_id
    FROM public.post_comments c
   WHERE c.id = NEW.comment_id;

  IF v_comment_author IS NULL OR v_comment_author = lower(NEW.wallet_address) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (recipient_wallet, type, title, body, metadata)
  VALUES (
    v_comment_author,
    'comment_like',
    public.actor_display_name(NULL, NEW.wallet_address),
    'gefällt dein Kommentar',
    jsonb_build_object('post_id', v_post_id, 'comment_id', NEW.comment_id, 'actor_wallet', lower(NEW.wallet_address))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_post_comment_like ON public.post_comment_likes;
CREATE TRIGGER trg_notify_post_comment_like
  AFTER INSERT ON public.post_comment_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_post_comment_like();

-- 4d. Push hub: allow the two new types and deep-link them to the post.
CREATE OR REPLACE FUNCTION public.notify_user_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url  text;
  v_key  text;
  v_data jsonb;
BEGIN
  IF NEW.type NOT IN ('org_invite', 'post_like', 'post_comment', 'post_reply', 'comment_like') THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'org_invite' THEN
    v_data := jsonb_build_object(
      'type', 'org_invite',
      'accountId', NEW.metadata->>'account_id',
      'invitationId', NEW.metadata->>'invitation_id'
    );
  ELSE
    -- post_like / post_comment / post_reply / comment_like all open the post.
    v_data := jsonb_build_object(
      'type', 'post',
      'postId', NEW.metadata->>'post_id',
      'commentId', NEW.metadata->>'comment_id'
    );
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'edge_send_notification_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'edge_send_notification_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'notify_user_notification_push: missing vault secrets, skipping push for notification %', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'type', NEW.type,
      'title', NEW.title,
      'body', NEW.body,
      'walletAddresses', jsonb_build_array(NEW.recipient_wallet),
      'data', v_data
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_user_notification_push ON public.notifications;
CREATE TRIGGER trg_notify_user_notification_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_user_notification_push();
