-- Final-review fixes for the Umfragen-Forum slice A:
-- 1. forum_replies joins the realtime publication (spec §6: the open thread
--    screen subscribes to reply INSERTs; without this the subscription is inert).
-- 2. Both delete RPCs filter on current status so a repeated call is a no-op
--    (previously a double reply-delete double-decremented reply_count).

ALTER PUBLICATION supabase_realtime ADD TABLE public.forum_replies;

CREATE OR REPLACE FUNCTION public.delete_owned_forum_thread(p_thread_id uuid, p_wallet text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.forum_threads SET status = 'deleted', updated_at = now()
   WHERE id = p_thread_id AND lower(wallet_address) = lower(p_wallet)
     AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'thread not found or not owned by %', p_wallet; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_owned_forum_reply(p_reply_id uuid, p_wallet text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_thread_id uuid;
BEGIN
  UPDATE public.forum_replies SET status = 'deleted'
   WHERE id = p_reply_id AND lower(wallet_address) = lower(p_wallet)
     AND status = 'published'
  RETURNING thread_id INTO v_thread_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'reply not found or not owned by %', p_wallet; END IF;
  UPDATE public.forum_threads
     SET reply_count = GREATEST(0, reply_count - 1)
   WHERE id = v_thread_id;
END; $$;
