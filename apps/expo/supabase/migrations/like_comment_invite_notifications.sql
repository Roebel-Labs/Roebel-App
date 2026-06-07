-- Like / comment / org-invite notifications (push + in-app)
--
-- Adds push notifications for three previously-silent events:
--   * someone LIKES your post
--   * someone COMMENTS on your post
--   * you receive an organisation invitation
--
-- Design — the `notifications` table is the single push hub:
--   1. post_likes / post_comments AFTER INSERT triggers create an in-app
--      `notifications` row addressed to the post author (client-agnostic, so it
--      works from both the web and expo apps).
--   2. org invites already insert a `notifications` row from client code.
--   3. A single AFTER INSERT trigger on `notifications` turns push-eligible rows
--      into a push via the existing `send-notification` Edge Function (pg_net,
--      async), scoped to the recipient's wallet.
--
-- Prereqs (already present from the feed-post / DM features):
--   * pg_net + supabase_vault extensions
--   * Vault secrets edge_send_notification_url / edge_send_notification_key
--   * push_tokens.wallet_address linkage (populated by the client on login)

-- 1. Per-device opt-out preferences (default on, mirroring dms_enabled).
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS likes_enabled       BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS comments_enabled    BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS org_invites_enabled BOOLEAN NOT NULL DEFAULT true;

-- 2. In-app notification on a new LIKE → addressed to the post author.
CREATE OR REPLACE FUNCTION public.notify_post_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_wallet text;
  v_liker_name    text;
BEGIN
  -- Resolve the post author's wallet.
  SELECT lower(p.wallet_address) INTO v_author_wallet
    FROM public.posts p
   WHERE p.id = NEW.post_id;

  IF v_author_wallet IS NULL THEN
    RETURN NEW;
  END IF;

  -- Never notify yourself for liking your own post.
  IF v_author_wallet = lower(NEW.wallet_address) THEN
    RETURN NEW;
  END IF;

  -- Display name of the liker: user display name → username → fallback.
  SELECT COALESCE(NULLIF(btrim(u.display_name), ''), NULLIF(btrim(u.username), ''))
    INTO v_liker_name
    FROM public.users u
   WHERE lower(u.wallet_address) = lower(NEW.wallet_address);

  INSERT INTO public.notifications (recipient_wallet, type, title, body, metadata)
  VALUES (
    v_author_wallet,
    'post_like',
    COALESCE(v_liker_name, 'Jemand'),
    'hat deinen Beitrag geliked',
    jsonb_build_object('post_id', NEW.post_id, 'actor_wallet', lower(NEW.wallet_address))
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_post_like ON public.post_likes;
CREATE TRIGGER trg_notify_post_like
  AFTER INSERT ON public.post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_post_like();

-- 3. In-app notification on a new COMMENT → addressed to the post author.
CREATE OR REPLACE FUNCTION public.notify_post_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_wallet  text;
  v_commenter_name text;
  v_body           text;
BEGIN
  SELECT lower(p.wallet_address) INTO v_author_wallet
    FROM public.posts p
   WHERE p.id = NEW.post_id;

  IF v_author_wallet IS NULL THEN
    RETURN NEW;
  END IF;

  -- Never notify yourself for commenting on your own post.
  IF v_author_wallet = lower(NEW.wallet_address) THEN
    RETURN NEW;
  END IF;

  -- Display name: posting account name → user display name → username.
  v_commenter_name := COALESCE(
    (SELECT NULLIF(btrim(a.name), '') FROM public.accounts a WHERE a.id = NEW.account_id),
    (SELECT NULLIF(btrim(u.display_name), '') FROM public.users u WHERE lower(u.wallet_address) = lower(NEW.wallet_address)),
    (SELECT NULLIF(btrim(u.username), '')     FROM public.users u WHERE lower(u.wallet_address) = lower(NEW.wallet_address))
  );

  -- Body: comment excerpt, or a fallback for media/sticker-only comments.
  v_body := NULLIF(btrim(NEW.content), '');
  IF v_body IS NULL THEN
    v_body := 'hat deinen Beitrag kommentiert';
  ELSIF length(v_body) > 140 THEN
    v_body := left(v_body, 140) || '…';
  END IF;

  INSERT INTO public.notifications (recipient_wallet, type, title, body, metadata)
  VALUES (
    v_author_wallet,
    'post_comment',
    COALESCE(v_commenter_name, 'Jemand'),
    v_body,
    jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id, 'actor_wallet', lower(NEW.wallet_address))
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_post_comment ON public.post_comments;
CREATE TRIGGER trg_notify_post_comment
  AFTER INSERT ON public.post_comments
  FOR EACH ROW
  WHEN (NEW.status = 'published')
  EXECUTE FUNCTION public.notify_post_comment();

-- 4. Push hub: turn a push-eligible `notifications` row into a push via the
--    existing send-notification Edge Function, scoped to the recipient wallet.
--    Unknown notification types are ignored (no push), so other in-app-only
--    notification types added in the future do not silently start pushing.
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
  IF NEW.type NOT IN ('org_invite', 'post_like', 'post_comment') THEN
    RETURN NEW;
  END IF;

  -- Build the deep-link payload per type.
  IF NEW.type = 'org_invite' THEN
    v_data := jsonb_build_object(
      'type', 'org_invite',
      'accountId', NEW.metadata->>'account_id',
      'invitationId', NEW.metadata->>'invitation_id'
    );
  ELSE
    v_data := jsonb_build_object('type', 'post', 'postId', NEW.metadata->>'post_id');
  END IF;

  -- Edge Function endpoint + bearer key from Vault; skip push (the in-app row
  -- is still created) if either secret is missing.
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
