-- Bürgerrat threads: source + stage on forum_threads, stage history, reply targets.
-- Spec: docs/superpowers/specs/2026-09-16-buergerrat-discussion-threads-design.md §6

-- ── forum_replies ───────────────────────────────────────────────────────────
ALTER TABLE public.forum_replies
  ADD COLUMN IF NOT EXISTS reply_to_reply_id uuid REFERENCES public.forum_replies(id),
  ADD COLUMN IF NOT EXISTS author_kind text NOT NULL DEFAULT 'citizen'
    CHECK (author_kind IN ('citizen', 'agent'));

-- Only the node (service role) may mark a reply as agent-authored. Clients
-- insert through the anon key and get 'citizen' regardless of what they send.
CREATE OR REPLACE FUNCTION public.forum_replies_guard_author_kind()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    NEW.author_kind := 'citizen';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS forum_replies_guard_author_kind ON public.forum_replies;
CREATE TRIGGER forum_replies_guard_author_kind
  BEFORE INSERT ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.forum_replies_guard_author_kind();

-- ── forum_threads ───────────────────────────────────────────────────────────
ALTER TABLE public.forum_threads
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'citizen'
    CHECK (source IN ('citizen', 'buergerrat')),
  ADD COLUMN IF NOT EXISTS source_rank integer,
  ADD COLUMN IF NOT EXISTS source_score integer,
  ADD COLUMN IF NOT EXISTS source_citation text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS official_comment text,
  ADD COLUMN IF NOT EXISTS stage text
    CHECK (stage IN ('idee','entwurf','diskussion','meinungsbild','beschlussvorlage',
                     'beschlossen','abgelehnt','umgesetzt','ruhend','zurueckgezogen'));

CREATE INDEX IF NOT EXISTS forum_threads_source_rank_idx
  ON public.forum_threads (source, source_rank);

-- Official fields are admin-only: anything a client sends is stripped.
CREATE OR REPLACE FUNCTION public.forum_threads_guard_official()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    NEW.source := 'citizen';
    NEW.source_rank := NULL;
    NEW.source_score := NULL;
    NEW.source_citation := NULL;
    NEW.source_url := NULL;
    NEW.official_comment := NULL;
    NEW.stage := NULL;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS forum_threads_guard_official ON public.forum_threads;
CREATE TRIGGER forum_threads_guard_official
  BEFORE INSERT ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.forum_threads_guard_official();

-- ── stage history ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.forum_thread_stage_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  stage       text NOT NULL
    CHECK (stage IN ('idee','entwurf','diskussion','meinungsbild','beschlussvorlage',
                     'beschlossen','abgelehnt','umgesetzt','ruhend','zurueckgezogen')),
  note        text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forum_thread_stage_events_thread_idx
  ON public.forum_thread_stage_events (thread_id, occurred_at);

ALTER TABLE public.forum_thread_stage_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS forum_thread_stage_events_select ON public.forum_thread_stage_events;
CREATE POLICY forum_thread_stage_events_select
  ON public.forum_thread_stage_events FOR SELECT USING (true);
-- No insert/update/delete policies: stage changes are SQL / service-role only.
GRANT SELECT ON public.forum_thread_stage_events TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.forum_thread_stage_apply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.forum_threads
     SET stage = NEW.stage, updated_at = now()
   WHERE id = NEW.thread_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS forum_thread_stage_apply ON public.forum_thread_stage_events;
CREATE TRIGGER forum_thread_stage_apply
  AFTER INSERT ON public.forum_thread_stage_events
  FOR EACH ROW EXECUTE FUNCTION public.forum_thread_stage_apply();

-- ── reply notifications: also the directly answered author ─────────────────
CREATE OR REPLACE FUNCTION public.notify_forum_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_thread_author text; v_parent_wallet text; v_target_wallet text; v_replier_name text;
  v_body text; v_recipient text;
BEGIN
  SELECT lower(t.wallet_address) INTO v_thread_author
    FROM public.forum_threads t WHERE t.id = NEW.thread_id;
  IF v_thread_author IS NULL THEN RETURN NEW; END IF;

  IF NEW.parent_reply_id IS NOT NULL THEN
    SELECT lower(wallet_address) INTO v_parent_wallet
      FROM public.forum_replies WHERE id = NEW.parent_reply_id;
  END IF;
  IF NEW.reply_to_reply_id IS NOT NULL THEN
    SELECT lower(wallet_address) INTO v_target_wallet
      FROM public.forum_replies WHERE id = NEW.reply_to_reply_id;
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
      UNION SELECT v_target_wallet
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

-- ── two more curated categories ─────────────────────────────────────────────
INSERT INTO public.forum_categories (slug, name, about, sort_order) VALUES
  ('gesundheit',    'Gesundheit & Sport', 'Ärzte, Fitness, Sportflächen',           5),
  ('zusammenleben', 'Zusammenleben',      'Begegnung, Engagement, Kommunikation',   6)
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';
