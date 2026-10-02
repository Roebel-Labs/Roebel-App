-- Manual task payouts by pasted tx hash.
--
-- Task payouts are not automated for now: an Attester pays from the Gemeinschaftskasse Safe, ideally
-- ONE Safe batch tx with the reward to the assignee + the 5 % platform fee, and records its hash.
-- One tx may therefore back two manual_safe lines of the same task (role 'aufgabe' + 'plattform').
-- The server (payout_record_manual) only allows sharing a hash between lines of the SAME reference;
-- this index keeps the database guarantee "one tx per role". Idempotent.

-- 1. One manual tx per role (was: one manual tx per line).
DROP INDEX IF EXISTS public.proposal_payout_lines_manual_tx_key;
CREATE UNIQUE INDEX IF NOT EXISTS proposal_payout_lines_manual_tx_role_key
  ON public.proposal_payout_lines (tx_hash, role) WHERE rail = 'manual_safe' AND tx_hash IS NOT NULL;

-- 2. Still-unpaid task lines planned on the Safe-proposal rail move to the manual rail
--    (vorhaben_settings.task_payout_rail defaults to 'manual_safe' when the key is absent).
UPDATE public.proposal_payout_lines
   SET rail = 'manual_safe', updated_at = now()
 WHERE reference_type = 'task'
   AND role IN ('aufgabe', 'plattform')
   AND rail = 'safe_eure'
   AND status = 'geplant';

NOTIFY pgrst, 'reload schema';
