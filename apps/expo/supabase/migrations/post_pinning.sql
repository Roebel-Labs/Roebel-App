-- Post pinning: Verified Citizens can pin one of their own posts to the top of
-- its feed for 24h. One active pin per citizen — pinning a new post clears the
-- wallet's previous pin. Pins auto-expire by time: a pinned_until in the past
-- simply stops matching the "> now()" read filter, so no cleanup job is needed.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS pinned_until TIMESTAMPTZ DEFAULT NULL;

-- Fast lookup of the (few) currently-pinned posts per feed for the page-0 prepend.
CREATE INDEX IF NOT EXISTS idx_posts_pinned
  ON public.posts(feed_type, pinned_until DESC)
  WHERE pinned_until IS NOT NULL AND status = 'published';

-- Pin / unpin a post you own. Enforces:
--   * ownership       — the post's wallet_address must match the caller's wallet
--   * Verified Citizen — users.is_verified_citizen must be true
-- Pinning first clears any OTHER active pin held by the same wallet, so each
-- citizen holds at most one pin at a time. Returns the new pinned_until (NULL
-- when unpinning). Mirrors the delete_owned_post* SECURITY DEFINER pattern.
CREATE OR REPLACE FUNCTION public.pin_own_post(
  p_post_id uuid,
  p_wallet  text,
  p_pin     boolean
) RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner   text;
  v_citizen boolean;
  v_until   timestamptz;
BEGIN
  SELECT lower(p.wallet_address)
    INTO v_owner
    FROM public.posts p
   WHERE p.id = p_post_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'post % not found', p_post_id USING ERRCODE = 'P0002';
  END IF;

  IF v_owner <> lower(p_wallet) THEN
    RAISE EXCEPTION 'NOT_OWNER' USING ERRCODE = 'P0001';
  END IF;

  -- Verified-Citizen check. The client treats a user as a citizen when they
  -- hold the CitizenNFT on-chain OR users.is_verified_citizen is set, and it
  -- upgrades users.tier to 'citizen' the moment the NFT is detected. The
  -- is_verified_citizen column can lag — it is only written when tier *flips*
  -- to 'citizen', so a citizen whose tier was already 'citizen' never gets it
  -- backfilled. Accept tier = 'citizen' as the persisted, DB-checkable proxy
  -- for on-chain citizenship, otherwise real citizens are wrongly rejected.
  SELECT (COALESCE(u.is_verified_citizen, false) OR u.tier = 'citizen')
    INTO v_citizen
    FROM public.users u
   WHERE lower(u.wallet_address) = lower(p_wallet);

  IF NOT COALESCE(v_citizen, false) THEN
    RAISE EXCEPTION 'NOT_CITIZEN' USING ERRCODE = 'P0001';
  END IF;

  IF p_pin THEN
    -- One active pin per citizen: clear the wallet's other pins first.
    UPDATE public.posts
       SET pinned_until = NULL
     WHERE lower(wallet_address) = lower(p_wallet)
       AND id <> p_post_id
       AND pinned_until IS NOT NULL;

    v_until := now() + interval '1 day';
  ELSE
    v_until := NULL;
  END IF;

  UPDATE public.posts SET pinned_until = v_until WHERE id = p_post_id;
  RETURN v_until;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pin_own_post(uuid, text, boolean) TO anon, authenticated;
