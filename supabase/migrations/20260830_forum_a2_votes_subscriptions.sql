-- Umfragen-Forum slice A2 (spec §A2.2/A2.5/A2.6):
-- votes with denormalized counters, per-thread subscriptions, reports,
-- edited_at, upvote notifications (anonymous in-app), reply-notification fanout.

-- ── Votes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.forum_votes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type    text NOT NULL CHECK (target_type IN ('thread','reply')),
  target_id      uuid NOT NULL,
  wallet_address text NOT NULL REFERENCES public.users(wallet_address),
  value          smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, wallet_address)
);
CREATE INDEX IF NOT EXISTS forum_votes_target_idx ON public.forum_votes (target_type, target_id);

ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS upvotes_count   integer NOT NULL DEFAULT 0;
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS downvotes_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS edited_at       timestamptz;
ALTER TABLE public.forum_replies ADD COLUMN IF NOT EXISTS upvotes_count   integer NOT NULL DEFAULT 0;
ALTER TABLE public.forum_replies ADD COLUMN IF NOT EXISTS downvotes_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.forum_replies ADD COLUMN IF NOT EXISTS edited_at       timestamptz;

CREATE OR REPLACE FUNCTION public.forum_votes_apply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d_up int := 0; d_down int := 0; v_type text; v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_type := NEW.target_type; v_id := NEW.target_id;
    IF NEW.value = 1 THEN d_up := 1; ELSE d_down := 1; END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_type := OLD.target_type; v_id := OLD.target_id;
    IF OLD.value = 1 THEN d_up := -1; ELSE d_down := -1; END IF;
  ELSE
    IF OLD.value = NEW.value THEN RETURN NEW; END IF;
    v_type := NEW.target_type; v_id := NEW.target_id;
    IF NEW.value = 1 THEN d_up := 1; d_down := -1; ELSE d_up := -1; d_down := 1; END IF;
  END IF;
  IF v_type = 'thread' THEN
    UPDATE public.forum_threads
       SET upvotes_count = GREATEST(0, upvotes_count + d_up),
           downvotes_count = GREATEST(0, downvotes_count + d_down)
     WHERE id = v_id;
  ELSE
    UPDATE public.forum_replies
       SET upvotes_count = GREATEST(0, upvotes_count + d_up),
           downvotes_count = GREATEST(0, downvotes_count + d_down)
     WHERE id = v_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_forum_votes_apply ON public.forum_votes;
CREATE TRIGGER trg_forum_votes_apply
  AFTER INSERT OR UPDATE OF value OR DELETE ON public.forum_votes
  FOR EACH ROW EXECUTE FUNCTION public.forum_votes_apply();

-- ── Subscriptions + reports ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.forum_thread_subscriptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id      uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  wallet_address text NOT NULL REFERENCES public.users(wallet_address),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, wallet_address)
);

CREATE TABLE IF NOT EXISTS public.forum_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type     text NOT NULL CHECK (target_type IN ('thread','reply')),
  target_id       uuid NOT NULL,
  reporter_wallet text NOT NULL,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, reporter_wallet)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.forum_votes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_thread_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_reports              ENABLE ROW LEVEL SECURITY;

-- Votes/subscriptions follow the poll_votes idiom (anon-key model: API-readable,
-- UI shows aggregates only — documented in spec §A2.2). Reports are write-only.
CREATE POLICY forum_votes_select ON public.forum_votes FOR SELECT USING (true);
CREATE POLICY forum_votes_insert ON public.forum_votes FOR INSERT WITH CHECK (true);
CREATE POLICY forum_votes_update ON public.forum_votes FOR UPDATE USING (true);
CREATE POLICY forum_votes_delete ON public.forum_votes FOR DELETE USING (true);
CREATE POLICY forum_thread_subscriptions_select ON public.forum_thread_subscriptions FOR SELECT USING (true);
CREATE POLICY forum_thread_subscriptions_insert ON public.forum_thread_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY forum_thread_subscriptions_delete ON public.forum_thread_subscriptions FOR DELETE USING (true);
CREATE POLICY forum_reports_insert ON public.forum_reports FOR INSERT WITH CHECK (true);

-- Author edits (spec §A2.5): slice A locked all updates behind RPCs; edits need
-- a direct UPDATE path. Published-only on both sides so soft-deleted content
-- stays frozen (the delete RPCs are SECURITY DEFINER and bypass RLS anyway).
CREATE POLICY forum_threads_update ON public.forum_threads FOR UPDATE
  USING (status = 'published') WITH CHECK (status = 'published');
CREATE POLICY forum_replies_update ON public.forum_replies FOR UPDATE
  USING (status = 'published') WITH CHECK (status = 'published');

-- ── Upvote notification — anonymous in-app (spec §A2.6) ────────────────────
CREATE OR REPLACE FUNCTION public.notify_forum_upvote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner text; v_thread_id uuid; v_body text;
BEGIN
  IF NEW.value <> 1 THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.value = 1 THEN RETURN NEW; END IF;
  IF NEW.target_type = 'thread' THEN
    SELECT lower(wallet_address), id INTO v_owner, v_thread_id
      FROM public.forum_threads WHERE id = NEW.target_id;
    v_body := 'Jemand hat dein Thema hochgewählt';
  ELSE
    SELECT lower(wallet_address), thread_id INTO v_owner, v_thread_id
      FROM public.forum_replies WHERE id = NEW.target_id;
    v_body := 'Jemand hat deine Antwort hochgewählt';
  END IF;
  IF v_owner IS NULL OR v_owner = lower(NEW.wallet_address) THEN RETURN NEW; END IF;
  -- Deliberately no actor name/wallet: votes stay aggregate-anonymous in-app.
  INSERT INTO public.notifications (recipient_wallet, type, title, body, metadata)
  VALUES (v_owner, 'forum_vote', 'Neue Zustimmung', v_body,
    jsonb_build_object('thread_id', v_thread_id, 'target_type', NEW.target_type, 'target_id', NEW.target_id));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_forum_upvote ON public.forum_votes;
CREATE TRIGGER trg_notify_forum_upvote
  AFTER INSERT OR UPDATE OF value ON public.forum_votes
  FOR EACH ROW EXECUTE FUNCTION public.notify_forum_upvote();

-- ── Reply-notification fanout (spec §A2.6) ─────────────────────────────────
-- Recipients: thread author ∪ parent-reply author ∪ subscribers, minus actor.
CREATE OR REPLACE FUNCTION public.notify_forum_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_thread_author text; v_parent_wallet text; v_replier_name text;
  v_body text; v_recipient text;
BEGIN
  SELECT lower(t.wallet_address) INTO v_thread_author
    FROM public.forum_threads t WHERE t.id = NEW.thread_id;
  IF v_thread_author IS NULL THEN RETURN NEW; END IF;

  IF NEW.parent_reply_id IS NOT NULL THEN
    SELECT lower(wallet_address) INTO v_parent_wallet
      FROM public.forum_replies WHERE id = NEW.parent_reply_id;
  END IF;

  v_replier_name := COALESCE(
    (SELECT NULLIF(btrim(a.name), '') FROM public.accounts a WHERE a.id = NEW.account_id),
    (SELECT NULLIF(btrim(u.display_name), '') FROM public.users u WHERE lower(u.wallet_address) = lower(NEW.wallet_address)),
    (SELECT NULLIF(btrim(u.username), '')     FROM public.users u WHERE lower(u.wallet_address) = lower(NEW.wallet_address))
  );

  v_body := NULLIF(btrim(NEW.body), '');
  IF v_body IS NULL THEN v_body := 'hat auf ein Thema geantwortet';
  ELSIF length(v_body) > 140 THEN v_body := left(v_body, 140) || '…';
  END IF;

  FOR v_recipient IN
    SELECT DISTINCT r.wallet FROM (
      SELECT v_thread_author AS wallet
      UNION SELECT v_parent_wallet
      UNION SELECT lower(s.wallet_address) FROM public.forum_thread_subscriptions s WHERE s.thread_id = NEW.thread_id
    ) r
    WHERE r.wallet IS NOT NULL AND r.wallet <> lower(NEW.wallet_address)
  LOOP
    INSERT INTO public.notifications (recipient_wallet, type, title, body, metadata)
    VALUES (v_recipient, 'forum_reply', COALESCE(v_replier_name, 'Jemand'), v_body,
      jsonb_build_object('thread_id', NEW.thread_id, 'reply_id', NEW.id, 'actor_wallet', lower(NEW.wallet_address)));
  END LOOP;
  RETURN NEW;
END; $$;
-- trg_notify_forum_reply (from 20260829_forum_tables.sql) keeps firing this
-- CREATE OR REPLACE'd body — the trigger itself needs no change.
