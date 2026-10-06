-- Proof of how a manually recorded payout line was really paid.
--
-- The Gemeinschaftskasse (Attester Safe) pays in native xDAI (1 xDAI = 1 EUR for manual payouts) or
-- EURe, and a budget may be paid with the operator's payment card after the Safe topped it up. A line
-- keeps its promised amount/asset; these columns record what actually left the Safe and how:
--   paid_asset      'EURe' | 'XDAI'          asset the Safe sent in the recorded tx
--   paid_amount     numeric                  amount the Safe sent (card: the whole top-up)
--   payment_method  'safe_transfer' | 'card'
--   proof_url       text                     receipt (card payments), https
--   proof_note      text                     optional note of the recording Attester
-- Written by payout_record_manual / payout_record_card (apps/web/src/lib/vorhaben/task-service.ts),
-- which also works before this migration (it retries the update without these columns). Idempotent.

ALTER TABLE public.proposal_payout_lines
  ADD COLUMN IF NOT EXISTS paid_asset     text,
  ADD COLUMN IF NOT EXISTS paid_amount    numeric(38,18),
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS proof_url      text,
  ADD COLUMN IF NOT EXISTS proof_note     text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposal_payout_lines_paid_asset_check') THEN
    ALTER TABLE public.proposal_payout_lines
      ADD CONSTRAINT proposal_payout_lines_paid_asset_check CHECK (paid_asset IS NULL OR paid_asset IN ('EURe','XDAI'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposal_payout_lines_paid_amount_check') THEN
    ALTER TABLE public.proposal_payout_lines
      ADD CONSTRAINT proposal_payout_lines_paid_amount_check CHECK (paid_amount IS NULL OR paid_amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposal_payout_lines_payment_method_check') THEN
    ALTER TABLE public.proposal_payout_lines
      ADD CONSTRAINT proposal_payout_lines_payment_method_check CHECK (payment_method IS NULL OR payment_method IN ('safe_transfer','card'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposal_payout_lines_proof_url_check') THEN
    ALTER TABLE public.proposal_payout_lines
      ADD CONSTRAINT proposal_payout_lines_proof_url_check CHECK (proof_url IS NULL OR (proof_url LIKE 'https://%' AND length(proof_url) <= 1000));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposal_payout_lines_proof_note_check') THEN
    ALTER TABLE public.proposal_payout_lines
      ADD CONSTRAINT proposal_payout_lines_proof_note_check CHECK (proof_note IS NULL OR length(proof_note) <= 1000);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
