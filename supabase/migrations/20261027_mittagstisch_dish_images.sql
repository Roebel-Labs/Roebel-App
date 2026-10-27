-- Mittagstisch dish photos: every special_menu_items row that is saved
-- without a photo gets an AI food photo generated in the background.
--
-- The weekly Mittagstisch is entered by an agent through the web admin, so
-- generation must not depend on anyone pressing a button. Flow:
--   1. jobs table              — one row per dish, written ONLY by the trigger
--   2. trigger                 — AFTER INSERT/UPDATE with image_url NULL →
--                                queue job + net.http_post to the edge fn
--   3. special-menu-image-job  — claims the pending job and calls
--                                generate-menu-image (SEED_TOKEN stays in the
--                                edge runtime)
--
-- The edge fn is reachable with the anon key, so a job row is the actual
-- authorization: a caller can at most start a generation that is already due.
-- `attempts` caps paid generations per dish.

-- 1. Jobs ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.special_menu_image_jobs (
  special_menu_item_id uuid PRIMARY KEY REFERENCES public.special_menu_items(id) ON DELETE CASCADE,
  dish_name            text NOT NULL,
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'running', 'done', 'failed', 'skipped')),
  attempts             integer NOT NULL DEFAULT 0,
  error                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.special_menu_image_jobs ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (edge fn) and the trigger touch it.
REVOKE ALL ON public.special_menu_image_jobs FROM anon, authenticated;

-- 2. Trigger ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.queue_special_menu_item_image()
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
  IF NEW.image_url IS NOT NULL OR coalesce(trim(NEW.name), '') = '' THEN
    RETURN NEW;
  END IF;

  -- Re-queue only when nothing is in flight (a run older than 10 min died
  -- with its edge worker) and the per-dish cap is not hit.
  INSERT INTO public.special_menu_image_jobs (special_menu_item_id, dish_name)
  VALUES (NEW.id, NEW.name)
  ON CONFLICT (special_menu_item_id) DO UPDATE
    SET status = 'pending', dish_name = EXCLUDED.dish_name, error = NULL, updated_at = now()
    WHERE (special_menu_image_jobs.status <> 'running'
           OR special_menu_image_jobs.updated_at < now() - interval '10 minutes')
      AND special_menu_image_jobs.attempts < 3;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Reuse the push hub's vault entries: same project, same anon JWT.
  SELECT decrypted_secret INTO v_notify_url FROM vault.decrypted_secrets WHERE name = 'edge_send_notification_url';
  SELECT decrypted_secret INTO v_key        FROM vault.decrypted_secrets WHERE name = 'edge_send_notification_key';
  IF v_notify_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'queue_special_menu_item_image: missing vault secrets, skipping item %', NEW.id;
    RETURN NEW;
  END IF;
  v_url := regexp_replace(v_notify_url, '/functions/v1/.*$', '/functions/v1/special-menu-image-job');

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('special_menu_item_id', NEW.id),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.queue_special_menu_item_image() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_queue_special_menu_item_image ON public.special_menu_items;
CREATE TRIGGER trg_queue_special_menu_item_image
  AFTER INSERT OR UPDATE OF name, description, image_url ON public.special_menu_items
  FOR EACH ROW
  WHEN (NEW.image_url IS NULL)
  EXECUTE FUNCTION public.queue_special_menu_item_image();
