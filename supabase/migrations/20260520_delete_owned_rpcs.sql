-- SECURITY DEFINER RPCs that own the delete path for posts, post_comments,
-- proposal_comments, and event_experiences. They bypass RLS, normalize the
-- wallet address case, and raise a single clear error if no row was deleted.
--
-- The client (anon key + thirdweb wallet) calls these via supabase.rpc(). The
-- ownership check (wallet_address match) lives inside the function, so the
-- caller still ultimately trusts the client to pass its own wallet — same
-- posture as the rest of the app's write story.

CREATE OR REPLACE FUNCTION public.delete_owned_post(
  p_post_id uuid,
  p_wallet text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM public.posts
   WHERE id = p_post_id
     AND lower(wallet_address) = lower(p_wallet);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'post % not found or not owned by %', p_post_id, p_wallet
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_owned_post_comment(
  p_comment_id uuid,
  p_wallet text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id uuid;
  v_deleted int;
BEGIN
  DELETE FROM public.post_comments
   WHERE id = p_comment_id
     AND lower(wallet_address) = lower(p_wallet)
   RETURNING post_id INTO v_post_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'comment % not found or not owned by %', p_comment_id, p_wallet
      USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.posts
     SET comments_count = GREATEST(0, comments_count - 1)
   WHERE id = v_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_owned_proposal_comment(
  p_comment_id uuid,
  p_wallet text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM public.proposal_comments
   WHERE id = p_comment_id
     AND lower(wallet_address) = lower(p_wallet);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'proposal comment % not found or not owned by %', p_comment_id, p_wallet
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_owned_experience(
  p_experience_id uuid,
  p_wallet text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  -- Paired feed post first (best-effort, may match 0 rows).
  DELETE FROM public.posts
   WHERE linked_experience_id = p_experience_id
     AND lower(wallet_address) = lower(p_wallet);

  DELETE FROM public.event_experiences
   WHERE id = p_experience_id
     AND lower(wallet_address) = lower(p_wallet);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'experience % not found or not owned by %', p_experience_id, p_wallet
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_owned_post(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_owned_post_comment(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_owned_proposal_comment(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_owned_experience(uuid, text) TO anon, authenticated;
