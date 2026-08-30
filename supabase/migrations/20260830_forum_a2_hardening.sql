-- A2 hardening (review findings): edits go through owner-checked RPCs like
-- deletes; vote rows are frozen to value-only updates so a retargeting UPDATE
-- can't silently corrupt the denormalized counters.

DROP POLICY IF EXISTS forum_threads_update ON public.forum_threads;
DROP POLICY IF EXISTS forum_replies_update ON public.forum_replies;

CREATE OR REPLACE FUNCTION public.update_owned_forum_thread(
  p_thread_id uuid, p_wallet text, p_title text, p_body text, p_category_slug text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.forum_threads
     SET title = btrim(p_title),
         body = p_body,
         category_slug = p_category_slug,
         edited_at = now(),
         updated_at = now()
   WHERE id = p_thread_id
     AND lower(wallet_address) = lower(p_wallet)
     AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'thread not found, deleted, or not owned by %', p_wallet; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.update_owned_forum_reply(
  p_reply_id uuid, p_wallet text, p_body text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.forum_replies
     SET body = btrim(p_body), edited_at = now()
   WHERE id = p_reply_id
     AND lower(wallet_address) = lower(p_wallet)
     AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'reply not found, deleted, or not owned by %', p_wallet; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.forum_votes_freeze_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.target_type <> OLD.target_type
     OR NEW.target_id <> OLD.target_id
     OR lower(NEW.wallet_address) <> lower(OLD.wallet_address) THEN
    RAISE EXCEPTION 'vote rows are value-only updatable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_forum_votes_freeze_identity ON public.forum_votes;
CREATE TRIGGER trg_forum_votes_freeze_identity
  BEFORE UPDATE ON public.forum_votes
  FOR EACH ROW EXECUTE FUNCTION public.forum_votes_freeze_identity();

-- Minor: reporter_wallet had no FK to users, unlike wallet_address elsewhere in
-- the A2 tables. Guarded so the file stays re-runnable in spirit.
DO $$
BEGIN
  ALTER TABLE public.forum_reports
    ADD CONSTRAINT forum_reports_reporter_fkey FOREIGN KEY (reporter_wallet) REFERENCES public.users(wallet_address);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
