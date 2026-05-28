-- Relax FKs that block org-account deletion.
--
-- Deleting an org `accounts` row CASCADEs into `roebel_card_partners`, which
-- in turn has children in `roebel_card_charges` / `roebel_card_payouts` with
-- ON DELETE RESTRICT — the cascade aborts and the whole DELETE fails with
-- 23503 / HTTP 409, surfacing in the Expo app as a generic "Konto konnte
-- nicht gelöscht werden" alert.
--
-- Several other FKs on `accounts(id)` are NO ACTION (legacy `conversations`
-- participant columns, `direct_messages.sender_account_id`,
-- `marketplace_listings.account_id`, and both account columns on
-- `roebel_card_purchases`). They don't block today's case but would block
-- future org deletes once those tables hold rows for the deleted account.
--
-- The intended semantics already live in `apps/expo/app/org/settings.tsx`:
-- "Inhalte (...) bleiben erhalten, verlieren jedoch ihre Verknüpfung zum
-- Konto." → SET NULL preserves the historical row and detaches the link.
-- Charges and payouts need DROP NOT NULL because their `partner_id` is
-- currently NOT NULL.

BEGIN;

-- roebel_card_charges.partner_id  (RESTRICT → SET NULL)
ALTER TABLE public.roebel_card_charges
  DROP CONSTRAINT roebel_card_charges_partner_id_fkey;
ALTER TABLE public.roebel_card_charges
  ALTER COLUMN partner_id DROP NOT NULL;
ALTER TABLE public.roebel_card_charges
  ADD CONSTRAINT roebel_card_charges_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES public.roebel_card_partners(id)
  ON DELETE SET NULL;

-- roebel_card_payouts.partner_id  (RESTRICT → SET NULL)
ALTER TABLE public.roebel_card_payouts
  DROP CONSTRAINT roebel_card_payouts_partner_id_fkey;
ALTER TABLE public.roebel_card_payouts
  ALTER COLUMN partner_id DROP NOT NULL;
ALTER TABLE public.roebel_card_payouts
  ADD CONSTRAINT roebel_card_payouts_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES public.roebel_card_partners(id)
  ON DELETE SET NULL;

-- conversations.participant_one_account  (legacy uuid → accounts.id)
ALTER TABLE public.conversations
  DROP CONSTRAINT conversations_participant_one_account_fkey;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_participant_one_account_fkey
  FOREIGN KEY (participant_one_account) REFERENCES public.accounts(id)
  ON DELETE SET NULL;

-- conversations.participant_two_account
ALTER TABLE public.conversations
  DROP CONSTRAINT conversations_participant_two_account_fkey;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_participant_two_account_fkey
  FOREIGN KEY (participant_two_account) REFERENCES public.accounts(id)
  ON DELETE SET NULL;

-- direct_messages.sender_account_id
ALTER TABLE public.direct_messages
  DROP CONSTRAINT direct_messages_sender_account_id_fkey;
ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_sender_account_id_fkey
  FOREIGN KEY (sender_account_id) REFERENCES public.accounts(id)
  ON DELETE SET NULL;

-- marketplace_listings.account_id
ALTER TABLE public.marketplace_listings
  DROP CONSTRAINT marketplace_listings_account_id_fkey;
ALTER TABLE public.marketplace_listings
  ADD CONSTRAINT marketplace_listings_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES public.accounts(id)
  ON DELETE SET NULL;

-- roebel_card_purchases.beneficiary_account_id
ALTER TABLE public.roebel_card_purchases
  DROP CONSTRAINT roebel_card_purchases_beneficiary_account_id_fkey;
ALTER TABLE public.roebel_card_purchases
  ADD CONSTRAINT roebel_card_purchases_beneficiary_account_id_fkey
  FOREIGN KEY (beneficiary_account_id) REFERENCES public.accounts(id)
  ON DELETE SET NULL;

-- roebel_card_purchases.employer_account_id
ALTER TABLE public.roebel_card_purchases
  DROP CONSTRAINT roebel_card_purchases_employer_account_id_fkey;
ALTER TABLE public.roebel_card_purchases
  ADD CONSTRAINT roebel_card_purchases_employer_account_id_fkey
  FOREIGN KEY (employer_account_id) REFERENCES public.accounts(id)
  ON DELETE SET NULL;

COMMIT;
