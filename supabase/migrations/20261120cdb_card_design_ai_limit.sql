-- Card designer D5: AI backgrounds and stickers count against a daily limit per org and kind
-- (Berlin day; the caller passes the day start). Count and insert run in one transaction under an
-- advisory lock per (org, kind), so two admins generating at the same time near the limit never
-- produce one image too many. Service role only. NOT applied by agents.

CREATE INDEX IF NOT EXISTS credential_design_assets_ai_idx
  ON public.credential_design_assets (account_id, kind, created_at)
  WHERE ai;

CREATE OR REPLACE FUNCTION public.insert_ai_design_asset(
  p_sha text,
  p_account_id uuid,
  p_kind text,
  p_storage_path text,
  p_mime text,
  p_width integer,
  p_height integer,
  p_prompt text,
  p_created_by text,
  p_created_at timestamptz,
  p_since timestamptz,
  p_limit integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  used integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('credential_design_ai:' || p_account_id::text || ':' || p_kind));
  IF EXISTS (SELECT 1 FROM public.credential_design_assets WHERE account_id = p_account_id AND sha = p_sha) THEN
    RETURN true;
  END IF;
  SELECT count(*) INTO used
    FROM public.credential_design_assets
   WHERE account_id = p_account_id AND kind = p_kind AND ai AND created_at >= p_since;
  IF used >= p_limit THEN
    RETURN false;
  END IF;
  INSERT INTO public.credential_design_assets
    (sha, account_id, kind, storage_path, mime, width, height, ai, prompt, created_by, created_at)
  VALUES
    (p_sha, p_account_id, p_kind, p_storage_path, p_mime, p_width, p_height, true, p_prompt, p_created_by, p_created_at);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_ai_design_asset(text, uuid, text, text, text, integer, integer, text, text, timestamptz, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_ai_design_asset(text, uuid, text, text, text, integer, integer, text, text, timestamptz, timestamptz, integer) TO service_role;
