-- Fixes to 20260829_forum_tables.sql, found in task review (never edit/rename
-- an already-applied migration):
--
-- Finding 1: delete_owned_forum_reply only flipped status to 'deleted' and
-- never decremented forum_threads.reply_count, leaving the counter stale
-- after a reply delete. Aligned with the delete_owned_post_comment idiom in
-- supabase/migrations/20260520_delete_owned_rpcs.sql: capture the reply's
-- thread_id via RETURNING, then decrement with GREATEST(0, reply_count - 1).
--
-- Finding 2: forum_replies_insert allowed a reply to be inserted onto a
-- soft-deleted (status <> 'published') thread. Tightened the WITH CHECK to
-- also require the parent thread to be published.

CREATE OR REPLACE FUNCTION public.delete_owned_forum_reply(p_reply_id uuid, p_wallet text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_thread_id uuid;
BEGIN
  UPDATE public.forum_replies SET status = 'deleted'
   WHERE id = p_reply_id AND lower(wallet_address) = lower(p_wallet)
   RETURNING thread_id INTO v_thread_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'reply not found or not owned by %', p_wallet; END IF;

  UPDATE public.forum_threads
     SET reply_count = GREATEST(0, reply_count - 1)
   WHERE id = v_thread_id;
END; $$;

DROP POLICY IF EXISTS forum_replies_insert ON public.forum_replies;
CREATE POLICY forum_replies_insert ON public.forum_replies FOR INSERT
  WITH CHECK (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.forum_threads t
      WHERE t.id = thread_id AND t.status = 'published'
    )
  );
