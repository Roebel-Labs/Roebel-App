-- Task 3: Extend the push hub to forward `forum_reply` notifications.
--
-- Preserves the live body of public.notify_user_notification_push() exactly
-- (read via pg_get_functiondef immediately before this migration was written)
-- with two additions:
--   1. 'forum_reply' added to the type whitelist.
--   2. A deep-link branch for 'forum_reply' producing
--      {"type":"forum_thread","threadId":<uuid>} for the app's push-routing
--      (Task 8's thread screen route /forum/thread/[id]).
--
-- Everything else (vault lookups, net.http_post call, trigger) is untouched.

CREATE OR REPLACE FUNCTION public.notify_user_notification_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url  text;
  v_key  text;
  v_data jsonb;
BEGIN
  IF NEW.type NOT IN ('org_invite', 'post_like', 'post_comment', 'post_reply', 'comment_like', 'mini_app', 'forum_reply') THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'org_invite' THEN
    v_data := jsonb_build_object(
      'type', 'org_invite',
      'accountId', NEW.metadata->>'account_id',
      'invitationId', NEW.metadata->>'invitation_id'
    );
  ELSIF NEW.type = 'mini_app' THEN
    v_data := jsonb_build_object(
      'type', 'mini_app',
      'slug', NEW.metadata->>'slug',
      'url', NEW.metadata->>'target_url'
    );
  ELSIF NEW.type = 'forum_reply' THEN
    v_data := jsonb_build_object('type', 'forum_thread', 'threadId', NEW.metadata->>'thread_id');
  ELSE
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
$function$
;
