-- Posting restrictions for the main home feed.
--
-- Strategy: citizens (is_verified_citizen=true) post freely; non-citizens get a
-- gated "Besucher" posting mode that requires a one-time GPS proof near Röbel,
-- 24h account age, and rate limits (2/day, 5/week). Auto-generated posts
-- (post_type != 'user') bypass the gates so the experience-mirroring flow at
-- supabase-experiences.ts and event/marketplace shares keep working.
--
-- Enforcement lives in a BEFORE INSERT trigger on public.posts. The RLS INSERT
-- policy stays as-is — the trigger is the new gate, raising typed messages the
-- client can parse (LOCATION_REQUIRED, ACCOUNT_TOO_YOUNG:<iso>,
-- RATE_LIMIT_DAY:<iso>, RATE_LIMIT_WEEK:<iso>).
--
-- Also adds an AFTER INSERT trigger on post_reports that auto-flags a post
-- once it has reached 3 distinct reports. The existing admin page
-- apps/web/src/app/admin/dashboard/flagged-posts already reads status='flagged',
-- so flagged content surfaces there automatically.

------------------------------------------------------------------------------
-- 1. Columns
------------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS location_verified_at  timestamptz,
  ADD COLUMN IF NOT EXISTS location_verified_lat numeric,
  ADD COLUMN IF NOT EXISTS location_verified_lng numeric;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS moderation_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS moderation_reason text,
  ADD COLUMN IF NOT EXISTS hidden_at          timestamptz;

------------------------------------------------------------------------------
-- 2. Unique constraint: one report per (post, reporter)
------------------------------------------------------------------------------

-- Deduplicate any historical rows first so the unique index can be created.
DELETE FROM public.post_reports a
 USING public.post_reports b
 WHERE a.ctid > b.ctid
   AND a.post_id = b.post_id
   AND lower(a.reporter_wallet_address) = lower(b.reporter_wallet_address);

CREATE UNIQUE INDEX IF NOT EXISTS post_reports_unique_reporter
  ON public.post_reports (post_id, lower(reporter_wallet_address));

------------------------------------------------------------------------------
-- 3. Trigger: enforce posting rules on user posts
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_posting_rules() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user           public.users%ROWTYPE;
  v_now            timestamptz := now();
  v_day_count      int;
  v_week_count     int;
  v_oldest_day     timestamptz;
  v_oldest_week    timestamptz;
BEGIN
  -- Only enforce gates on freeform user posts. Auto-generated rows
  -- (event_share, event_experience, marketplace_share, mecky) pass through.
  IF NEW.post_type IS DISTINCT FROM 'user' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_user
    FROM public.users
   WHERE lower(wallet_address) = lower(NEW.wallet_address)
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Citizens post freely.
  IF COALESCE(v_user.is_verified_citizen, false) THEN
    RETURN NEW;
  END IF;

  -- Gate 1: one-time GPS proof near Röbel.
  IF v_user.location_verified_at IS NULL THEN
    RAISE EXCEPTION 'LOCATION_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- Gate 2: account age >= 24h.
  IF v_user.created_at IS NULL OR v_user.created_at > v_now - interval '24 hours' THEN
    RAISE EXCEPTION 'ACCOUNT_TOO_YOUNG:%',
      to_char(COALESCE(v_user.created_at, v_now) + interval '24 hours',
              'YYYY-MM-DD"T"HH24:MI:SSOF')
      USING ERRCODE = 'P0001';
  END IF;

  -- Gate 3a: <= 2 user-posts in the last 24h.
  SELECT count(*), min(created_at) INTO v_day_count, v_oldest_day
    FROM public.posts
   WHERE lower(wallet_address) = lower(NEW.wallet_address)
     AND post_type = 'user'
     AND status <> 'deleted'
     AND created_at > v_now - interval '24 hours';

  IF v_day_count >= 2 THEN
    RAISE EXCEPTION 'RATE_LIMIT_DAY:%',
      to_char(v_oldest_day + interval '24 hours', 'YYYY-MM-DD"T"HH24:MI:SSOF')
      USING ERRCODE = 'P0001';
  END IF;

  -- Gate 3b: <= 5 user-posts in the last 7d.
  SELECT count(*), min(created_at) INTO v_week_count, v_oldest_week
    FROM public.posts
   WHERE lower(wallet_address) = lower(NEW.wallet_address)
     AND post_type = 'user'
     AND status <> 'deleted'
     AND created_at > v_now - interval '7 days';

  IF v_week_count >= 5 THEN
    RAISE EXCEPTION 'RATE_LIMIT_WEEK:%',
      to_char(v_oldest_week + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SSOF')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_posting_rules_trg ON public.posts;
CREATE TRIGGER enforce_posting_rules_trg
  BEFORE INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_posting_rules();

------------------------------------------------------------------------------
-- 4. RPC: verify_user_location (haversine check, 10 km radius)
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.verify_user_location(
  p_wallet text,
  p_lat    numeric,
  p_lng    numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_center_lat numeric := 53.3796;  -- Röbel/Müritz Marktplatz
  v_center_lng numeric := 12.6051;
  v_radius_km  numeric := 10;
  v_distance   numeric;
BEGIN
  v_distance := 6371 * 2 * asin(
    sqrt(
      power(sin(radians((p_lat - v_center_lat) / 2)), 2)
      + cos(radians(v_center_lat)) * cos(radians(p_lat))
      * power(sin(radians((p_lng - v_center_lng) / 2)), 2)
    )
  );

  IF v_distance > v_radius_km THEN
    RAISE EXCEPTION 'LOCATION_TOO_FAR:%', round(v_distance, 1)
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.users
     SET location_verified_at  = now(),
         location_verified_lat = p_lat,
         location_verified_lng = p_lng,
         updated_at            = now()
   WHERE lower(wallet_address) = lower(p_wallet);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'distance_km', round(v_distance, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_user_location(text, numeric, numeric)
  TO anon, authenticated;

------------------------------------------------------------------------------
-- 5. Trigger: auto-flag post on 3rd unique report
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_post_report_threshold() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.post_reports
   WHERE post_id = NEW.post_id;

  IF v_count >= 3 THEN
    UPDATE public.posts
       SET status    = 'flagged',
           hidden_at = COALESCE(hidden_at, now())
     WHERE id = NEW.post_id
       AND status = 'published';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS post_reports_auto_hide_trg ON public.post_reports;
CREATE TRIGGER post_reports_auto_hide_trg
  AFTER INSERT ON public.post_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_post_report_threshold();

------------------------------------------------------------------------------
-- 6. Helper view used by the apps/expo client for rate-limit countdowns
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_posting_status(p_wallet text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        public.users%ROWTYPE;
  v_now         timestamptz := now();
  v_day_count   int;
  v_week_count  int;
  v_oldest_day  timestamptz;
  v_oldest_week timestamptz;
BEGIN
  SELECT * INTO v_user
    FROM public.users
   WHERE lower(wallet_address) = lower(p_wallet)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'unknown_user');
  END IF;

  IF COALESCE(v_user.is_verified_citizen, false) THEN
    RETURN jsonb_build_object('kind', 'allowed', 'tier', 'citizen');
  END IF;

  IF v_user.location_verified_at IS NULL THEN
    RETURN jsonb_build_object('kind', 'needs_location');
  END IF;

  IF v_user.created_at IS NULL OR v_user.created_at > v_now - interval '24 hours' THEN
    RETURN jsonb_build_object(
      'kind', 'account_too_young',
      'unlock_at', COALESCE(v_user.created_at, v_now) + interval '24 hours'
    );
  END IF;

  SELECT count(*), min(created_at) INTO v_day_count, v_oldest_day
    FROM public.posts
   WHERE lower(wallet_address) = lower(p_wallet)
     AND post_type = 'user'
     AND status <> 'deleted'
     AND created_at > v_now - interval '24 hours';

  IF v_day_count >= 2 THEN
    RETURN jsonb_build_object(
      'kind', 'rate_limited',
      'scope', 'day',
      'unlock_at', v_oldest_day + interval '24 hours'
    );
  END IF;

  SELECT count(*), min(created_at) INTO v_week_count, v_oldest_week
    FROM public.posts
   WHERE lower(wallet_address) = lower(p_wallet)
     AND post_type = 'user'
     AND status <> 'deleted'
     AND created_at > v_now - interval '7 days';

  IF v_week_count >= 5 THEN
    RETURN jsonb_build_object(
      'kind', 'rate_limited',
      'scope', 'week',
      'unlock_at', v_oldest_week + interval '7 days'
    );
  END IF;

  RETURN jsonb_build_object(
    'kind', 'allowed',
    'tier', 'tourist',
    'remaining_today', 2 - v_day_count,
    'remaining_week',  5 - v_week_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_posting_status(text) TO anon, authenticated;
