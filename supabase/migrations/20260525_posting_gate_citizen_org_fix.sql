-- Fix posting-gate false negatives for citizens and org accounts.
--
-- 1. Treat tier='citizen' OR is_verified_citizen as citizen. Some rows have
--    tier='citizen' but a stale is_verified_citizen=false (the auto-sync effect
--    can't repair that state), which made on-chain citizens read as tourists.
-- 2. Skip enforcement entirely for org-account posts (account_id IS NOT NULL).
--    Org accounts are citizen-owned (creation is citizen-gated in the app), so
--    they post like citizens.
--
-- Mirrors the client bypass in usePostingPermission({ bypass: isCitizen ||
-- isOrgAccount(activeAccount) }).

CREATE OR REPLACE FUNCTION public.enforce_posting_rules() RETURNS trigger
LANGUAGE plpgsql
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
  -- Only enforce gates on freeform personal user posts. Auto-generated rows
  -- (event_share, event_experience, marketplace_share, mecky) and org-account
  -- posts (account_id set) pass through.
  IF NEW.post_type IS DISTINCT FROM 'user' THEN
    RETURN NEW;
  END IF;
  IF NEW.account_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_user
    FROM public.users
   WHERE lower(wallet_address) = lower(NEW.wallet_address)
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Citizens post freely. tier='citizen' OR the verified flag both qualify.
  IF COALESCE(v_user.is_verified_citizen, false) OR v_user.tier = 'citizen' THEN
    RETURN NEW;
  END IF;

  IF v_user.location_verified_at IS NULL THEN
    RAISE EXCEPTION 'LOCATION_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF v_user.created_at IS NULL OR v_user.created_at > v_now - interval '24 hours' THEN
    RAISE EXCEPTION 'ACCOUNT_TOO_YOUNG:%',
      to_char(COALESCE(v_user.created_at, v_now) + interval '24 hours',
              'YYYY-MM-DD"T"HH24:MI:SSOF')
      USING ERRCODE = 'P0001';
  END IF;

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

  IF COALESCE(v_user.is_verified_citizen, false) OR v_user.tier = 'citizen' THEN
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
