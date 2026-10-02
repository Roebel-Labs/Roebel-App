-- Proposal lifecycle after the vote: Wahlhelfer co-signing, tasks, payout contracts.
-- Spec: docs/superpowers/specs/2026-10-01-proposal-tasks-payouts-design.md
-- All tables are publicly readable (transparency); every write goes through the
-- web API / cron with the service role. Wallets are stored lowercase.

-- 1. proposals: lifecycle + budget ------------------------------------------------
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS vorhaben_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS budget_amount numeric(38,18),
  ADD COLUMN IF NOT EXISTS budget_asset text CHECK (budget_asset IN ('EURe','EURC')),
  ADD COLUMN IF NOT EXISTS beneficiary_name text,
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'abstimmung'
    CHECK (lifecycle_stage IN ('abstimmung','auszaehlung','angenommen','abgelehnt','in_umsetzung','umgesetzt')),
  ADD COLUMN IF NOT EXISTS tally_confirm_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS tally_confirm_until timestamptz,
  ADD COLUMN IF NOT EXISTS tally_address text;

-- proposals is written ONLY by the service role (web API /api/proposals/store + the vorhaben cron).
-- Until now anon/authenticated could insert and update any row (forged budgets, proposer takeover,
-- stage forgery). Reads stay public via "Proposals are viewable by everyone".
DROP POLICY IF EXISTS "Anyone can insert proposals" ON public.proposals;
DROP POLICY IF EXISTS "Authenticated users can insert proposals" ON public.proposals;
DROP POLICY IF EXISTS "Allow state updates for sync" ON public.proposals;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.proposals FROM anon, authenticated;
GRANT SELECT ON public.proposals TO anon, authenticated;
GRANT ALL ON public.proposals TO service_role;

-- One stored row per on-chain proposal (the store route binds it to the proposer).
CREATE UNIQUE INDEX IF NOT EXISTS proposals_blockchain_proposal_id_key
  ON public.proposals (blockchain_proposal_id) WHERE blockchain_proposal_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.proposal_stage_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  from_stage  text,
  to_stage    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposal_stage_events_proposal_idx ON public.proposal_stage_events (proposal_id, created_at);

-- 2. Wahlhelfer: eligibility snapshot + co-signature --------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_wahlhelfer (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  attester_wallet text NOT NULL CHECK (attester_wallet = lower(attester_wallet)),
  eligible_at     timestamptz NOT NULL DEFAULT now(),
  message         text,
  result_hash     text,
  signature       text,
  confirmed_at    timestamptz,
  reminded_at     timestamptz,
  UNIQUE (proposal_id, attester_wallet)
);
CREATE INDEX IF NOT EXISTS proposal_wahlhelfer_wallet_idx ON public.proposal_wahlhelfer (attester_wallet) WHERE confirmed_at IS NULL;

-- 3. Tasks --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_tasks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id         uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  title               text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 140),
  description         text NOT NULL DEFAULT '',
  acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  reward_amount       numeric(38,18) NOT NULL CHECK (reward_amount >= 0),
  reward_asset        text NOT NULL CHECK (reward_asset IN ('EURe','EURC')),
  deadline            timestamptz,
  status              text NOT NULL DEFAULT 'offen'
    CHECK (status IN ('offen','vergeben','in_arbeit','eingereicht','abgenommen','ausgezahlt','abgebrochen')),
  assignee_wallet     text CHECK (assignee_wallet = lower(assignee_wallet)),
  created_by_wallet   text NOT NULL CHECK (created_by_wallet = lower(created_by_wallet)),
  assigned_by_wallet  text,
  approved_by_wallet  text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposal_tasks_proposal_idx ON public.proposal_tasks (proposal_id);
CREATE INDEX IF NOT EXISTS proposal_tasks_assignee_idx ON public.proposal_tasks (assignee_wallet) WHERE assignee_wallet IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.task_applications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          uuid NOT NULL REFERENCES public.proposal_tasks(id) ON DELETE CASCADE,
  applicant_wallet text NOT NULL CHECK (applicant_wallet = lower(applicant_wallet)),
  note             text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  status           text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','angenommen','abgelehnt','zurueckgezogen')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, applicant_wallet)
);

CREATE TABLE IF NOT EXISTS public.task_activity (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid NOT NULL REFERENCES public.proposal_tasks(id) ON DELETE CASCADE,
  actor_wallet text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('comment','status_change','proof','criteria_check')),
  body         text,
  attachments  jsonb NOT NULL DEFAULT '[]'::jsonb,
  from_status  text,
  to_status    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_activity_task_idx ON public.task_activity (task_id, created_at);

-- 4. Contract + payout lines --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_contracts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id           uuid NOT NULL UNIQUE REFERENCES public.proposals(id) ON DELETE CASCADE,
  platform_fee_bps      integer NOT NULL CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  platform_safe_address text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.proposal_payout_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id        uuid NOT NULL REFERENCES public.proposal_contracts(id) ON DELETE CASCADE,
  proposal_id        uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  role               text NOT NULL CHECK (role IN ('empfaenger','aufgabe','wahlhelfer','plattform')),
  recipient_wallet   text CHECK (recipient_wallet = lower(recipient_wallet)),
  recipient_label    text NOT NULL,
  amount             numeric(38,18) NOT NULL CHECK (amount > 0),
  asset              text NOT NULL CHECK (asset IN ('EURe','EURC','MUENZEN','XDAI')),
  rail               text NOT NULL CHECK (rail IN ('funder_muenzen','funder_xdai','safe_eure','manual_safe','safe_eurc_base')),
  reference_type     text NOT NULL CHECK (reference_type IN ('proposal','task','wahlhelfer')),
  reference_id       uuid NOT NULL,
  status             text NOT NULL DEFAULT 'geplant'
    CHECK (status IN ('geplant','sendend','vorgeschlagen','gesendet','bestaetigt','unklar','fehlgeschlagen')),
  error              text,
  attempt_started_at timestamptz,
  safe_tx_hash       text,
  safe_nonce         integer,
  tx_hash            text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, reference_type, reference_id)
);
CREATE INDEX IF NOT EXISTS proposal_payout_lines_proposal_idx ON public.proposal_payout_lines (proposal_id);
CREATE INDEX IF NOT EXISTS proposal_payout_lines_open_idx ON public.proposal_payout_lines (status) WHERE status <> 'bestaetigt';
CREATE INDEX IF NOT EXISTS proposal_payout_lines_recipient_idx ON public.proposal_payout_lines (recipient_wallet);
-- A recorded manual Safe transfer can back exactly one budget line (payout_record_manual maps 23505 → TX_USED).
CREATE UNIQUE INDEX IF NOT EXISTS proposal_payout_lines_manual_tx_key
  ON public.proposal_payout_lines (tx_hash) WHERE rail = 'manual_safe' AND tx_hash IS NOT NULL;

-- 5. Settings (service-role write only; app_settings is anon-writable, so not used) --
CREATE TABLE IF NOT EXISTS public.vorhaben_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO public.vorhaben_settings (key, value) VALUES
  ('platform_fee_bps', '500'),
  ('platform_safe_address', '0xbcabbaa26420e0a4771808f9639d4176355e5d4b'),
  ('wahlhelfer_reward_asset', 'MUENZEN'),
  ('wahlhelfer_reward_amount', '10'),
  ('budget_fee_rail', 'funder_xdai'),
  ('tally_confirm_window_days', '7'),
  ('dispatch_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- 6. RLS: public read, no client writes ---------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proposal_stage_events','proposal_wahlhelfer','proposal_tasks','task_applications',
                           'task_activity','proposal_contracts','proposal_payout_lines','vorhaben_settings']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_public_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)', t || '_public_read', t);
  END LOOP;
END $$;

-- 7. Backfill proposal #3 (150 € Seglerverein) ---------------------------------------
UPDATE public.proposals
SET vorhaben_enabled = true,
    budget_amount = 150,
    budget_asset = 'EURe',
    beneficiary_name = 'Röbeler Seglerverein – Spendenaktion „Vereinsbus“'
WHERE id = 'f4a87bbe-9deb-4f5e-9807-3b8534135c15';

INSERT INTO public.proposal_contracts (proposal_id, platform_fee_bps, platform_safe_address)
VALUES ('f4a87bbe-9deb-4f5e-9807-3b8534135c15', 500, '0xbcabbaa26420e0a4771808f9639d4176355e5d4b')
ON CONFLICT (proposal_id) DO NOTHING;

INSERT INTO public.proposal_tasks (proposal_id, title, description, acceptance_criteria, reward_amount, reward_asset, created_by_wallet)
SELECT 'f4a87bbe-9deb-4f5e-9807-3b8534135c15',
       'Spende an den Seglerverein überweisen und Quittung hochladen',
       'Die beschlossenen 150 € gehen aus der Gemeinschaftskasse an den Röbeler Seglerverein (Spendenaktion „Vereinsbus“). Du sorgst dafür, dass die Überweisung ausgelöst wird, und belegst sie hier.',
       '[{"id":"c1","text":"Überweisung von 150 € aus der Gemeinschaftskasse ausgelöst"},
         {"id":"c2","text":"Zahlungsnachweis (Transaktions-Hash) angehängt"},
         {"id":"c3","text":"Spendenquittung des Vereins hochgeladen"}]'::jsonb,
       5, 'EURe', '0xc49de63ccfee46c6c5c3e393293f66779799fb28'
WHERE NOT EXISTS (
  SELECT 1 FROM public.proposal_tasks
  WHERE proposal_id = 'f4a87bbe-9deb-4f5e-9807-3b8534135c15'
    AND title = 'Spende an den Seglerverein überweisen und Quittung hochladen'
);

NOTIFY pgrst, 'reload schema';
