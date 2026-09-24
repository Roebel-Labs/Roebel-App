-- Mecky answers in post comments.
--
-- A published comment that mentions "@Mecky" (any case) fires the
-- `mecky-comment-reply` edge function via pg_net. The function reads the
-- post (text, links, video transcript, the comment thread), may fetch the
-- linked pages / search the web, and inserts Mecky's answer as a reply
-- from the `mecky_bot` user.
--
-- 1. mecky_comment_jobs       — one row per triggering comment (idempotency,
--                               status for debugging, per-wallet rate limit)
-- 2. post_video_transcripts   — cached speech-to-text per post video
-- 3. post_comments content cap — Mecky may write up to 1500 chars (users 500)
-- 4. trigger                  — AFTER INSERT → net.http_post to the edge fn

-- 1. Jobs ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mecky_comment_jobs (
  comment_id        uuid PRIMARY KEY REFERENCES public.post_comments(id) ON DELETE CASCADE,
  post_id           uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  asker_wallet      text NOT NULL,
  status            text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'done', 'failed', 'skipped')),
  reply_comment_id  uuid REFERENCES public.post_comments(id) ON DELETE SET NULL,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mecky_comment_jobs_asker_created_idx
  ON public.mecky_comment_jobs (asker_wallet, created_at DESC);

ALTER TABLE public.mecky_comment_jobs ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (edge function) touches this table.
REVOKE ALL ON public.mecky_comment_jobs FROM anon, authenticated;

-- 2. Transcripts --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_video_transcripts (
  post_id     uuid PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  video_url   text NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'ready', 'failed', 'unsupported')),
  source      text,           -- 'cloudflare_captions' | 'openai'
  language    text,
  transcript  text,
  error       text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.post_video_transcripts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_video_transcripts FROM anon, authenticated;

-- 3. Content cap: users 500, Mecky 1500 --------------------------------------
ALTER TABLE public.post_comments DROP CONSTRAINT IF EXISTS post_comments_content_check;
ALTER TABLE public.post_comments ADD CONSTRAINT post_comments_content_check
  CHECK (
    char_length(content) <= 500
    OR (wallet_address = 'mecky_bot' AND char_length(content) <= 1500)
  );

-- 4. Trigger ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mecky_comment_mention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notify_url text;
  v_key        text;
  v_url        text;
BEGIN
  -- Mecky never triggers itself.
  IF NEW.wallet_address = 'mecky_bot' THEN
    RETURN NEW;
  END IF;

  -- Idempotent: a comment is answered at most once.
  INSERT INTO public.mecky_comment_jobs (comment_id, post_id, asker_wallet)
  VALUES (NEW.id, NEW.post_id, lower(NEW.wallet_address))
  ON CONFLICT (comment_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Reuse the push hub's vault entries: same project, same service JWT.
  SELECT decrypted_secret INTO v_notify_url FROM vault.decrypted_secrets WHERE name = 'edge_send_notification_url';
  SELECT decrypted_secret INTO v_key        FROM vault.decrypted_secrets WHERE name = 'edge_send_notification_key';
  IF v_notify_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'mecky_comment_mention: missing vault secrets, skipping comment %', NEW.id;
    RETURN NEW;
  END IF;
  v_url := regexp_replace(v_notify_url, '/functions/v1/.*$', '/functions/v1/mecky-comment-reply');

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('comment_id', NEW.id),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mecky_comment_mention() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mecky_comment_mention ON public.post_comments;
CREATE TRIGGER trg_mecky_comment_mention
  AFTER INSERT ON public.post_comments
  FOR EACH ROW
  -- "@Mecky" as a whole word; not inside an e-mail address like a@mecky.de.
  WHEN (NEW.status = 'published' AND NEW.content ~* '(^|[^[:alnum:]_])@mecky\M')
  EXECUTE FUNCTION public.mecky_comment_mention();
