-- Röbel Münzen tips on feed comments + Münzen payments on the Supabase DM rail.
--
-- 1. post_comment_tips: one row per completed on-chain transfer (the client
--    inserts it AFTER the gasless group-token transfer settled; tx_hash is the
--    proof). post_comments.tips_total is the denormalised sum shown next to
--    the coin button.
-- 2. A tip creates a `comment_tip` notification for the comment author; the
--    push hub forwards it and deep-links to the post + comment (same payload
--    as comment_like).
-- 3. direct_messages.payment: receipt for a Münzen transfer sent in a chat
--    that runs on the Supabase rail (the XMTP rail keeps its
--    transactionReference messages).

-- ── 1. Tips ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_comment_tips (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id       uuid NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  sender_wallet    text NOT NULL,
  recipient_wallet text NOT NULL,
  amount           numeric(20, 2) NOT NULL CHECK (amount > 0 AND amount <= 100000),
  tx_hash          text NOT NULL UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_comment_tips_comment_idx ON public.post_comment_tips (comment_id);

ALTER TABLE public.post_comment_tips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comment tips are viewable by all" ON public.post_comment_tips;
CREATE POLICY "Comment tips are viewable by all"
  ON public.post_comment_tips FOR SELECT USING (true);

-- Same trust model as post_comment_likes (wallet auth, no Supabase session).
-- No UPDATE/DELETE policy: a recorded tip is permanent.
DROP POLICY IF EXISTS "Users can record comment tips" ON public.post_comment_tips;
CREATE POLICY "Users can record comment tips"
  ON public.post_comment_tips FOR INSERT WITH CHECK (true);

ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS tips_total numeric(20, 2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.post_comment_tip_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_comment_author text;
  v_post_id        uuid;
  v_amount_text    text;
BEGIN
  UPDATE public.post_comments
     SET tips_total = tips_total + NEW.amount
   WHERE id = NEW.comment_id
  RETURNING lower(wallet_address), post_id INTO v_comment_author, v_post_id;

  IF v_comment_author IS NULL OR v_comment_author = lower(NEW.sender_wallet) THEN
    RETURN NEW;
  END IF;

  -- "5" for whole amounts, "2,50" otherwise (German decimal comma).
  v_amount_text := CASE
    WHEN NEW.amount = trunc(NEW.amount) THEN trunc(NEW.amount)::text
    ELSE replace(NEW.amount::text, '.', ',')
  END;

  INSERT INTO public.notifications (recipient_wallet, type, title, body, metadata)
  VALUES (
    v_comment_author,
    'comment_tip',
    public.actor_display_name(NULL, NEW.sender_wallet),
    'dankt dir mit ' || v_amount_text || ' Röbel Münzen für deinen Kommentar',
    jsonb_build_object(
      'post_id', v_post_id,
      'comment_id', NEW.comment_id,
      'actor_wallet', lower(NEW.sender_wallet),
      'amount', NEW.amount
    )
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_comment_tip_after_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_post_comment_tip_after_insert ON public.post_comment_tips;
CREATE TRIGGER trg_post_comment_tip_after_insert
  AFTER INSERT ON public.post_comment_tips
  FOR EACH ROW
  EXECUTE FUNCTION public.post_comment_tip_after_insert();

-- ── 2. Push hub: forward comment_tip ──────────────────────────────────
-- Live body (pg_get_functiondef, 2026-11-16) with 'comment_tip' added to the
-- whitelist. It takes the default deep link: {type:'post', postId, commentId}.
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
  IF NEW.type NOT IN ('org_invite', 'post_like', 'post_comment', 'post_reply', 'comment_like', 'comment_tip', 'mini_app', 'forum_reply', 'forum_vote', 'vorhaben_tally', 'vorhaben_task', 'vorhaben_payout', 'vorhaben_safe') THEN
    RETURN NEW;
  END IF;

  -- Muted actors never reach the recipient's lock screen (the inbox filters them client-side).
  IF NEW.metadata ? 'actor_wallet' AND EXISTS (
    SELECT 1 FROM public.account_hides h
    JOIN public.account_owners ao ON ao.account_id = h.target_account_id
    JOIN public.accounts a ON a.id = h.target_account_id AND a.account_type = 'personal'
    WHERE h.kind = 'muted'
      AND h.viewer_wallet = lower(NEW.recipient_wallet)
      AND lower(ao.wallet_address) = lower(NEW.metadata->>'actor_wallet')
  ) THEN
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
  ELSIF NEW.type = 'forum_vote' THEN
    v_data := jsonb_build_object('type', 'forum_thread', 'threadId', NEW.metadata->>'thread_id');
  ELSIF NEW.type IN ('vorhaben_tally', 'vorhaben_task', 'vorhaben_payout', 'vorhaben_safe') THEN
    v_data := jsonb_build_object(
      'type', 'vorhaben',
      'screen', NEW.metadata->>'screen',
      'proposalId', NEW.metadata->>'proposal_id',
      'taskId', NEW.metadata->>'task_id'
    );
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
$function$;

-- ── 3. Münzen receipts on the Supabase DM rail ────────────────────────
-- Shape: {"txHash": "0x…", "networkId": "eip155:100", "amount": 2.5}.
-- `content` carries a readable fallback line for the inbox preview, the push
-- body and app versions that do not know the column yet.
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS payment jsonb;
