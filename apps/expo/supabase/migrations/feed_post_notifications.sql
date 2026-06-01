-- Feed-post push notifications
--
-- Sends a push notification to every device with push enabled whenever a new
-- post is published to the public "Für Alle" feed (posts.feed_type = 'main').
--
-- A Postgres trigger fires the existing `send-notification` Edge Function via
-- pg_net (async, so it adds no latency to the INSERT). The Edge Function URL and
-- bearer key live in Supabase Vault (secrets `edge_send_notification_url` /
-- `edge_send_notification_key`) — they are NOT committed in this migration.

-- 1. Per-device opt-out preference (defaults on → "all users" by default).
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS feed_posts_enabled BOOLEAN NOT NULL DEFAULT true;

-- 2. Trigger function: build a German push payload and call the Edge Function.
CREATE OR REPLACE FUNCTION public.notify_new_main_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author   text;
  v_title    text;
  v_body     text;
  v_url      text;
  v_key      text;
  v_event_id uuid;
  v_data     jsonb;
BEGIN
  -- Display name: account name → user display name → username → fallback.
  v_author := COALESCE(
    (SELECT a.name FROM public.accounts a WHERE a.id = NEW.account_id),
    (SELECT u.display_name FROM public.users u WHERE lower(u.wallet_address) = lower(NEW.wallet_address)),
    (SELECT u.username FROM public.users u WHERE lower(u.wallet_address) = lower(NEW.wallet_address))
  );
  v_title := COALESCE(NULLIF(btrim(v_author), ''), 'Neuer Beitrag');

  -- Body: content excerpt, or a fallback for media/event-only posts.
  v_body := NULLIF(btrim(NEW.content), '');
  IF v_body IS NULL THEN
    v_body := 'hat einen neuen Beitrag geteilt';
  ELSIF length(v_body) > 140 THEN
    v_body := left(v_body, 140) || '…';
  END IF;

  -- Routing: event-experience posts deep-link to the parent event detail page
  -- (data.type='event'), all other "Für Alle" posts deep-link to the post page.
  IF NEW.post_type = 'event_experience' THEN
    v_event_id := COALESCE(
      NEW.linked_event_id,
      (SELECT ee.event_id FROM public.event_experiences ee WHERE ee.id = NEW.linked_experience_id)
    );
  END IF;

  IF v_event_id IS NOT NULL THEN
    v_data := jsonb_build_object('type', 'event', 'eventId', v_event_id);
  ELSE
    v_data := jsonb_build_object('type', 'post', 'postId', NEW.id);
  END IF;

  -- Edge Function endpoint + bearer key from Vault.
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'edge_send_notification_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'edge_send_notification_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'notify_new_main_post: missing vault secrets, skipping push for post %', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'type', 'post_new',
      'title', v_title,
      'body', v_body,
      'data', v_data
    )
  );

  RETURN NEW;
END;
$$;

-- 3. Fire only for newly published posts in the public "Für Alle" feed.
DROP TRIGGER IF EXISTS trg_notify_new_main_post ON public.posts;
CREATE TRIGGER trg_notify_new_main_post
  AFTER INSERT ON public.posts
  FOR EACH ROW
  WHEN (NEW.feed_type = 'main' AND NEW.status = 'published')
  EXECUTE FUNCTION public.notify_new_main_post();
