-- Atomic claim / release for payout lines. The UPDATE … WHERE status='geplant'
-- is the only gate between two dispatchers: one wins, the other gets zero rows.
CREATE OR REPLACE FUNCTION public.claim_payout_line(p_line_id uuid)
RETURNS SETOF public.proposal_payout_lines
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.proposal_payout_lines
  SET status = 'sendend', attempt_started_at = now(), error = NULL, updated_at = now()
  WHERE id = p_line_id AND status = 'geplant'
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_payout_line(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payout_line(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_payout_line(p_line_id uuid, p_error text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.proposal_payout_lines
  SET status = 'geplant', error = p_error, updated_at = now()
  WHERE id = p_line_id AND status = 'sendend' AND tx_hash IS NULL AND safe_tx_hash IS NULL;
$$;
REVOKE ALL ON FUNCTION public.release_payout_line(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_payout_line(uuid, text) TO service_role;
