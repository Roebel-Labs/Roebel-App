# Proposal tasks, Wahlhelfer co-signing and payout contracts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every proposal a visible lifecycle after the vote: Attesters co-sign the tally result and get paid as Wahlhelfer, proposals carry tasks that anyone can apply for and get paid for, and one payout contract per proposal shows who got what for what.

**Architecture:** A Supabase ledger (new tables, public read, service-role writes) driven by the **web app** (`apps/web`): signed-request API routes for app actions, a 5-minute Vercel cron that reads the governor on Gnosis, advances the lifecycle and dispatches payouts. Money moves through rail adapters: Röbel Münzen and xDAI from the funder hot wallet via a new Supabase edge function (the funder key never leaves Supabase), EURe from the Attester Safe via a Safe proposer delegate, and manual Safe transfers recorded by tx hash. The Expo app reads the tables directly and writes only through the web API.

**Tech Stack:** Next.js 15 route handlers, viem 2, `@safe-global/api-kit` 5 + `protocol-kit` 8, Supabase (Postgres, edge functions on Deno + viem 2.21), Expo SDK 56 / expo-router, thirdweb smart accounts, Node `tsx --test` (web), jest-expo (Expo).

**Spec:** [`docs/superpowers/specs/2026-10-01-proposal-tasks-payouts-design.md`](../specs/2026-10-01-proposal-tasks-payouts-design.md) — read it first. §"Implementation notes" at its end lists where this plan deliberately refines the spec.

**Deadline:** voting on proposal #3 ends **2026-10-04 14:03 UTC**. Phase 1 (Tasks 1–10) is everything the Wahlhelfer flow needs and must be merged and deployed (web on Vercel, edge function, migration) before the #3 tally lands on-chain. Phase 2 (Tasks 11–17) adds tasks, the Safe rail and the contract screen. The Expo parts ship to devices only after Max runs the EAS update himself.

## Global Constraints

- Package manager: **pnpm** only. Never npm/yarn.
- Migrations go to root `supabase/migrations/YYYYMMDD_snake_case.sql` and are applied with the **Supabase MCP** (`apply_migration`). Before any write, run `get_project_url` and confirm it is `https://wwbeqhkslxdxhktqzqti.supabase.co`.
- Every new SQL function: `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated;` then `GRANT EXECUTE … TO service_role;` (Supabase grants EXECUTE to anon/authenticated by default).
- New tables: RLS on, `FOR SELECT USING (true)` policy, `GRANT SELECT … TO anon, authenticated`, no client write policies.
- Code identifiers and comments in **English**; every user-facing string in **German**.
- Expo: `StyleSheet.create` + `useTheme()`; **no NativeWind**. Never show a raw wallet address in UI — resolve to display name (`users.display_name || users.username`), fall back to "Unbekannt".
- Expo imports of workspace files: extensionless relative imports (never `.js`).
- Expo hooks: import `useFocusEffect`/navigation hooks from `expo-router`, never `@react-navigation/native`.
- Web `src/lib/vorhaben/*` files use **relative imports only** (no `@/` alias) so `npx tsx --test` can load them.
- Web tests: `apps/web/tests/vorhaben-*.test.ts`, run with `pnpm test:web` (root script `tsx --test apps/web/tests/*.test.ts`, the CI step).
- Expo tests: `apps/expo/lib/__tests__/*.test.ts`, run with `cd apps/expo && npx jest <path>` (never `--watchAll` in automation).
- Chain: Gnosis, chain id 100. Governor `0x5F5e499Dc1872c2Ce19a4b50cd10f680e78E3Ba3`, AttesterNFTv2 `0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82`, Attester Safe `0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa`, EURe `0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430`, Circles Hub `0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8`, Röbel group `0xAc2CeCdBead594F97358a0d3132454f24F3E470c`, funder `0x5ac82fD7f576c86aed8d174074bA707eC1979D9B`, platform Safe `0xbCAbbAA26420e0A4771808F9639D4176355E5d4B`.
- MACI vote options: Against = 0, For = 1, Abstain = 2. OZ `ProposalState`: 0 Pending, 1 Active, 2 Canceled, 3 Defeated, 4 Succeeded, 5 Queued, 6 Expired, 7 Executed.
- Confirmed values: platform fee **500 bps** (on top), Wahlhelfer reward **10 MUENZEN**, #3 task reward **5 EURe**, budget fee rail for #3 **funder_xdai** (asset XDAI), confirmation window **7 days**, reminder after **3 days**.
- No "Test"/"Simulation" wording anywhere in UI.
- Commit convention: `feat(web): …`, `feat(expo): …`, `feat(db): …`, `fix(…)`, `docs: …`; stage files by path (never `git add -A`); end every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push after each commit. Check `git branch --show-current` before every commit.
- **Never run `eas update` / `eas build`** — Max does that himself.

## Review Focus

1. **Double payout under concurrency** — the cron and an immediate dispatch race on the same line; exactly one transfer must happen. Pinned in Task 2 (`claim_payout_line` SQL check) and Task 8 (dispatch test with two concurrent calls).
2. **Old proposals suddenly paying Wahlhelfer** — proposals #1/#2 (and any proposal without `vorhaben_enabled`) must never open a confirmation window or create lines. Pinned in Task 9 (sync test: disabled proposal is a no-op).
3. **Self-dealing on tasks** — proposer assigning a task to themselves, or the assignee approving their own work. Pinned in Task 4 (task-machine tests).
4. **Signing a result that changed** — an Attester signs while the on-chain tally differs from what the server rebuilds (or the window is closed / they are not eligible); the confirmation must be rejected, not stored. Pinned in Task 10 (tally-confirm service tests).
5. **Funder float or Safe nonce problems** — low Münzen/xDAI must leave the line `geplant` with `float_low` (never `fehlgeschlagen`), and a Safe tx replaced at the same nonce must become `fehlgeschlagen` with an admin alert. Pinned in Task 7 (edge pure helper test) and Task 13 (safe-rail poll test).

---

## File map

**Database**
- `supabase/migrations/20261001_vorhaben_core.sql` — tables, settings, claim RPC, #3 backfill (Task 1–2)
- `supabase/migrations/20261001_vorhaben_push.sql` — push hub whitelist extension (Task 6)

**Web — pure domain (`apps/web/src/lib/vorhaben/`)**
- `constants.ts` — addresses, settings keys
- `money.ts` — atto conversion + fee maths
- `payout-plan.ts` — builds payout line drafts (main + fee)
- `task-machine.ts` — task state machine + role rules
- `stage.ts` — lifecycle stage derivation
- `tally-message.ts` — canonical co-sign text + result hash

**Web — IO**
- `chain.ts` — governor/tally/attester reads (viem)
- `settings.ts` — reads `vorhaben_settings`
- `repo.ts` — Supabase queries used by services
- `notify.ts` — inserts `notifications` rows
- `rails/funder.ts`, `rails/safe.ts`, `rails/manual.ts` — rail adapters
- `dispatch.ts` — dispatch + reconcile payout lines
- `sync.ts` — per-proposal lifecycle sync
- `task-service.ts` — task actions
- `tally-service.ts` — co-sign read + submit
- `apps/web/src/app/api/vorhaben/tasks/route.ts`, `apps/web/src/app/api/vorhaben/tally-confirm/route.ts`, `apps/web/src/app/api/cron/vorhaben/route.ts`
- `apps/web/src/lib/signed-request/{message,verify}.ts` — gain a `scope` option
- `apps/web/scripts/vorhaben-add-safe-delegate.mjs` — one-time delegate registration
- `apps/web/vercel.json` — cron entry

**Edge function**
- `apps/expo/supabase/functions/_shared/payout-amount.ts` — import-free atto helpers (tested from web)
- `apps/expo/supabase/functions/vorhaben-payout-send/index.ts`

**Expo**
- `apps/expo/lib/signed-request.ts` — `scope` parameter
- `apps/expo/lib/vorhaben.ts` — reads + actions
- `apps/expo/lib/vorhaben-labels.ts` — pure labels / next-step logic
- `apps/expo/components/vorhaben/{StatusChip,VorhabenStepper,TaskCard,VorhabenSection}.tsx`
- `apps/expo/components/profile/{TallyDutyCard,MyTasksCard}.tsx`
- `apps/expo/app/auszaehlung/[proposalId].tsx`, `app/aufgabe/[id].tsx`, `app/aufgabe/neu.tsx`, `app/aufgaben/index.tsx`, `app/vertrag/[proposalId].tsx`
- Modified: `app/proposal/[id].tsx`, `app/profile.tsx`, `app/governance.tsx`, `app/transaction.tsx`, `app/_layout.tsx`, `app/notifications/index.tsx`

**Web proposal creation**
- Modified: `apps/web/src/components/proposals/CreateProposalForm.tsx`, `apps/web/src/app/api/proposals/store/route.ts`

---

# Phase 1 — Wahlhelfer path (must ship before #3's tally)

### Task 1: Core schema, settings and #3 backfill

**Files:**
- Create: `supabase/migrations/20261001_vorhaben_core.sql`

**Interfaces:**
- Produces (tables, all `public`):
  - `proposals` + columns `vorhaben_enabled boolean NOT NULL DEFAULT false`, `budget_amount numeric(38,18)`, `budget_asset text`, `beneficiary_name text`, `lifecycle_stage text NOT NULL DEFAULT 'abstimmung'`, `tally_confirm_opened_at timestamptz`, `tally_confirm_until timestamptz`, `tally_address text`
  - `proposal_stage_events(id, proposal_id uuid, from_stage, to_stage, created_at)`
  - `proposal_wahlhelfer(id, proposal_id, attester_wallet, eligible_at, message, result_hash, signature, confirmed_at, reminded_at)` UNIQUE(proposal_id, attester_wallet)
  - `proposal_tasks(id, proposal_id, title, description, acceptance_criteria jsonb, reward_amount, reward_asset, deadline, status, assignee_wallet, created_by_wallet, assigned_by_wallet, approved_by_wallet, created_at, updated_at)`
  - `task_applications(id, task_id, applicant_wallet, note, status, created_at)` UNIQUE(task_id, applicant_wallet)
  - `task_activity(id, task_id, actor_wallet, kind, body, attachments jsonb, from_status, to_status, created_at)`
  - `proposal_contracts(id, proposal_id UNIQUE, platform_fee_bps, platform_safe_address, created_at)`
  - `proposal_payout_lines(id, contract_id, proposal_id, role, recipient_wallet, recipient_label, amount, asset, rail, reference_type, reference_id, status, error, attempt_started_at, safe_tx_hash, safe_nonce, tx_hash, created_at, updated_at)` UNIQUE(role, reference_type, reference_id)
  - `vorhaben_settings(key text PK, value text NOT NULL)` — public read, service-role write only
- All wallets stored **lowercase**.

- [ ] **Step 1: Confirm the MCP target and inspect current state**

Run via Supabase MCP: `get_project_url` → must be `https://wwbeqhkslxdxhktqzqti.supabase.co`. Then `execute_sql`:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='proposals'
  and column_name in ('vorhaben_enabled','lifecycle_stage','budget_amount');
select to_regclass('public.proposal_tasks'), to_regclass('public.vorhaben_settings');
```

Expected: zero rows / nulls (nothing exists yet). If anything exists, stop and report.

- [ ] **Step 2: Write the migration**

```sql
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
```

- [ ] **Step 3: Apply and verify**

Apply with MCP `apply_migration` (name `20261001_vorhaben_core`, the file content). Then `execute_sql`:

```sql
select proposal_number, vorhaben_enabled, budget_amount, lifecycle_stage from proposals order by proposal_number;
select count(*) from proposal_tasks;
select key, value from vorhaben_settings order by key;
```

Expected: only #3 has `vorhaben_enabled = true`, budget 150; one task; 7 settings rows with `dispatch_enabled = false`.

Then check anon cannot write (`execute_sql`):

```sql
set role anon;
insert into vorhaben_settings(key,value) values ('x','y');
```

Expected: `permission denied for table vorhaben_settings`. Run `reset role;` afterwards.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261001_vorhaben_core.sql
git commit -m "feat(db): proposal lifecycle, tasks, Wahlhelfer and payout ledger tables"
git push
```

---

### Task 2: Atomic payout-line claim RPC

**Files:**
- Create: `supabase/migrations/20261001_vorhaben_claim_rpc.sql` (separate file — applied migrations stay immutable)

**Interfaces:**
- Produces: `public.claim_payout_line(p_line_id uuid) RETURNS SETOF public.proposal_payout_lines` — flips exactly one `geplant` line to `sendend` (sets `attempt_started_at = now()`, clears `error`) and returns it; returns zero rows if the line is not `geplant`. Service role only.
- Produces: `public.release_payout_line(p_line_id uuid, p_error text) RETURNS void` — `sendend` → `geplant` with `error = p_error`, only if no `tx_hash`/`safe_tx_hash` was stored.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply and prove the double-claim gate**

Apply with MCP `apply_migration` (name `20261001_vorhaben_claim_rpc`). Then in one `execute_sql` (rolled back so nothing persists):

```sql
begin;
insert into proposal_payout_lines (contract_id, proposal_id, role, recipient_wallet, recipient_label, amount, asset, rail, reference_type, reference_id)
select c.id, c.proposal_id, 'wahlhelfer', '0x0000000000000000000000000000000000000001', 'Probe', 1, 'MUENZEN', 'funder_muenzen', 'wahlhelfer', gen_random_uuid()
from proposal_contracts c limit 1
returning id \gset
select count(*) as first  from claim_payout_line((select id from proposal_payout_lines where recipient_label='Probe'));
select count(*) as second from claim_payout_line((select id from proposal_payout_lines where recipient_label='Probe'));
rollback;
```

If `\gset` is not supported by the MCP, drop `returning id \gset` — the subselects already find the row. Expected: `first = 1`, `second = 0`.

Then: `select has_function_privilege('anon','public.claim_payout_line(uuid)','execute');` → `false`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261001_vorhaben_claim_rpc.sql
git commit -m "feat(db): atomic claim/release RPCs for payout lines"
git push
```

---

### Task 3: Money maths and payout-line planning

**Files:**
- Create: `apps/web/src/lib/vorhaben/constants.ts`
- Create: `apps/web/src/lib/vorhaben/money.ts`
- Create: `apps/web/src/lib/vorhaben/payout-plan.ts`
- Create: `apps/expo/supabase/functions/_shared/payout-amount.ts`
- Test: `apps/web/tests/vorhaben-money.test.ts`, `apps/web/tests/vorhaben-payout-plan.test.ts`

**Interfaces:**
- Produces `constants.ts`:
  ```ts
  export const GOVERNOR: `0x${string}`; export const ATTESTER_NFT: `0x${string}`;
  export const ATTESTER_SAFE: `0x${string}`; export const EURE: `0x${string}`;
  export const FUNDER: `0x${string}`; export const CHAIN_ID = 100;
  export const VOTE_OPTION = { against: 0n, for: 1n, abstain: 2n } as const;
  export type Asset = "EURe" | "EURC" | "MUENZEN" | "XDAI";
  export type Rail = "funder_muenzen" | "funder_xdai" | "safe_eure" | "manual_safe" | "safe_eurc_base";
  export type LineRole = "empfaenger" | "aufgabe" | "wahlhelfer" | "plattform";
  export type LineStatus = "geplant" | "sendend" | "vorgeschlagen" | "gesendet" | "bestaetigt" | "unklar" | "fehlgeschlagen";
  ```
- Produces `money.ts`: `toAtto(amount: string | number): bigint`, `fromAtto(atto: bigint): string`, `feeAtto(amountAtto: bigint, bps: number): bigint`
- Produces `payout-plan.ts`:
  ```ts
  export interface LineDraft { role: LineRole; recipient_wallet: string | null; recipient_label: string;
    amount: string; asset: Asset; rail: Rail; reference_type: "proposal" | "task" | "wahlhelfer"; reference_id: string; }
  export interface FeeConfig { bps: number; platformSafe: string; budgetFeeRail: Rail; }
  export function railForAsset(asset: Asset): Rail;
  export function planWahlhelferLines(i: { wahlhelferId: string; wallet: string; label: string; amount: string; asset: Asset }, fee: FeeConfig): LineDraft[];
  export function planTaskLines(i: { taskId: string; wallet: string; label: string; amount: string; asset: Asset }, fee: FeeConfig): LineDraft[];
  export function planBudgetLines(i: { proposalId: string; beneficiary: string; amount: string; asset: Asset }, fee: FeeConfig): LineDraft[];
  ```
  The fee line shares `reference_type`/`reference_id` with its main line and has `role: "plattform"` (the UNIQUE key stays distinct by role). Zero-amount fees produce no line.
- Produces `_shared/payout-amount.ts` (no imports): `toAtto(amount: string | number): bigint`, `fromAtto(atto: bigint): string` — byte-for-byte the same bodies as `money.ts`.

- [ ] **Step 1: Write the failing tests**

`apps/web/tests/vorhaben-money.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { toAtto, fromAtto, feeAtto } from "../src/lib/vorhaben/money";
import * as edge from "../../expo/supabase/functions/_shared/payout-amount";
import * as consts from "../src/lib/vorhaben/constants";
import { CONTRACTS } from "../../../packages/blockchain/src/index";

test("toAtto handles integers, decimals and postgres numeric strings", () => {
  assert.equal(toAtto("5"), 5n * 10n ** 18n);
  assert.equal(toAtto("0.25"), 25n * 10n ** 16n);
  assert.equal(toAtto("150.000000000000000000"), 150n * 10n ** 18n);
  assert.equal(toAtto(10), 10n * 10n ** 18n);
});

test("toAtto rejects junk and negatives", () => {
  assert.throws(() => toAtto("-1"));
  assert.throws(() => toAtto("1e3"));
  assert.throws(() => toAtto(""));
});

test("fromAtto trims trailing zeros", () => {
  assert.equal(fromAtto(25n * 10n ** 16n), "0.25");
  assert.equal(fromAtto(150n * 10n ** 18n), "150");
});

test("fee is floor(amount * bps / 10000)", () => {
  assert.equal(fromAtto(feeAtto(toAtto("150"), 500)), "7.5");
  assert.equal(fromAtto(feeAtto(toAtto("5"), 500)), "0.25");
  assert.equal(fromAtto(feeAtto(toAtto("10"), 500)), "0.5");
  assert.equal(feeAtto(1n, 500), 0n);
  assert.throws(() => feeAtto(1n, 10001));
});

test("edge copy matches the web implementation", () => {
  for (const v of ["0", "5", "0.25", "150.000000000000000000", "123.456789"]) {
    assert.equal(edge.toAtto(v), toAtto(v));
    assert.equal(edge.fromAtto(toAtto(v)), fromAtto(toAtto(v)));
  }
});

test("constants mirror packages/blockchain", () => {
  assert.equal(consts.GOVERNOR.toLowerCase(), CONTRACTS.maciAttesterGovernor.toLowerCase());
  assert.equal(consts.ATTESTER_NFT.toLowerCase(), CONTRACTS.attesterNFT.toLowerCase());
});
```

`apps/web/tests/vorhaben-payout-plan.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { planBudgetLines, planTaskLines, planWahlhelferLines, railForAsset, type FeeConfig } from "../src/lib/vorhaben/payout-plan";

const fee: FeeConfig = { bps: 500, platformSafe: "0xbcabbaa26420e0a4771808f9639d4176355e5d4b", budgetFeeRail: "funder_xdai" };

test("wahlhelfer: 10 Münzen + 0.5 Münzen fee on the funder rail", () => {
  const lines = planWahlhelferLines({ wahlhelferId: "w1", wallet: "0xAA", label: "Anna", amount: "10", asset: "MUENZEN" }, fee);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((l) => [l.role, l.amount, l.asset, l.rail, l.reference_type, l.reference_id]), [
    ["wahlhelfer", "10", "MUENZEN", "funder_muenzen", "wahlhelfer", "w1"],
    ["plattform", "0.5", "MUENZEN", "funder_muenzen", "wahlhelfer", "w1"],
  ]);
  assert.equal(lines[0].recipient_wallet, "0xaa");
  assert.equal(lines[1].recipient_wallet, fee.platformSafe);
  assert.equal(lines[1].recipient_label, "Plattform");
});

test("task: 5 EURe + 0.25 EURe fee, both on the Safe rail", () => {
  const lines = planTaskLines({ taskId: "t1", wallet: "0xbb", label: "Ben", amount: "5", asset: "EURe" }, fee);
  assert.deepEqual(lines.map((l) => [l.role, l.amount, l.rail]), [["aufgabe", "5", "safe_eure"], ["plattform", "0.25", "safe_eure"]]);
});

test("budget: manual Safe line in EURe + fee in xDAI on the funder", () => {
  const lines = planBudgetLines({ proposalId: "p1", beneficiary: "Seglerverein", amount: "150", asset: "EURe" }, fee);
  assert.deepEqual(lines.map((l) => [l.role, l.amount, l.asset, l.rail, l.recipient_wallet]), [
    ["empfaenger", "150", "EURe", "manual_safe", null],
    ["plattform", "7.5", "XDAI", "funder_xdai", fee.platformSafe],
  ]);
});

test("zero fee produces no platform line", () => {
  const lines = planTaskLines({ taskId: "t1", wallet: "0xbb", label: "Ben", amount: "5", asset: "EURe" }, { ...fee, bps: 0 });
  assert.equal(lines.length, 1);
});

test("rail per asset", () => {
  assert.equal(railForAsset("MUENZEN"), "funder_muenzen");
  assert.equal(railForAsset("XDAI"), "funder_xdai");
  assert.equal(railForAsset("EURe"), "safe_eure");
  assert.equal(railForAsset("EURC"), "safe_eurc_base");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:web`
Expected: FAIL — `Cannot find module '../src/lib/vorhaben/money'`.

- [ ] **Step 3: Implement**

`apps/web/src/lib/vorhaben/constants.ts`:

```ts
// Addresses for the proposal lifecycle. Mirrors packages/blockchain/src/index.ts
// (a test asserts equality) — kept as literals so tsx tests load without aliases.
export const CHAIN_ID = 100;
export const GOVERNOR = "0x5F5e499Dc1872c2Ce19a4b50cd10f680e78E3Ba3" as const;
export const ATTESTER_NFT = "0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82" as const;
export const ATTESTER_SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa" as const;
export const EURE = "0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430" as const;
export const FUNDER = "0x5ac82fD7f576c86aed8d174074bA707eC1979D9B" as const;

/** MACI vote options as used by the Tally contract. */
export const VOTE_OPTION = { against: 0n, for: 1n, abstain: 2n } as const;

export type Asset = "EURe" | "EURC" | "MUENZEN" | "XDAI";
export type Rail = "funder_muenzen" | "funder_xdai" | "safe_eure" | "manual_safe" | "safe_eurc_base";
export type LineRole = "empfaenger" | "aufgabe" | "wahlhelfer" | "plattform";
export type LineStatus = "geplant" | "sendend" | "vorgeschlagen" | "gesendet" | "bestaetigt" | "unklar" | "fehlgeschlagen";
export type Stage = "abstimmung" | "auszaehlung" | "angenommen" | "abgelehnt" | "in_umsetzung" | "umgesetzt";
```

`apps/web/src/lib/vorhaben/money.ts`:

```ts
// 18-decimal fixed-point helpers for Münzen, xDAI and EURe (all 18 decimals on Gnosis).
// EURC on Base (6 decimals) gets its own helper when that rail is built.
// Keep in sync with apps/expo/supabase/functions/_shared/payout-amount.ts (test-enforced).
const UNIT = 10n ** 18n;

export function toAtto(amount: string | number): bigint {
  const s = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`invalid amount: ${amount}`);
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * UNIT + BigInt((frac + "0".repeat(18)).slice(0, 18));
}

export function fromAtto(atto: bigint): string {
  const whole = atto / UNIT;
  const frac = (atto % UNIT).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function feeAtto(amountAtto: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new Error(`bps out of range: ${bps}`);
  return (amountAtto * BigInt(bps)) / 10000n;
}
```

`apps/expo/supabase/functions/_shared/payout-amount.ts` (no imports — loaded by Deno and by Node tests):

```ts
// Import-free copy of apps/web/src/lib/vorhaben/money.ts (toAtto/fromAtto).
// A web test asserts both produce identical results.
const UNIT = 10n ** 18n;

export function toAtto(amount: string | number): bigint {
  const s = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`invalid amount: ${amount}`);
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * UNIT + BigInt((frac + "0".repeat(18)).slice(0, 18));
}

export function fromAtto(atto: bigint): string {
  const whole = atto / UNIT;
  const frac = (atto % UNIT).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
```

`apps/web/src/lib/vorhaben/payout-plan.ts`:

```ts
import type { Asset, LineRole, Rail } from "./constants";
import { feeAtto, fromAtto, toAtto } from "./money";

export interface LineDraft {
  role: LineRole;
  recipient_wallet: string | null;
  recipient_label: string;
  amount: string;
  asset: Asset;
  rail: Rail;
  reference_type: "proposal" | "task" | "wahlhelfer";
  reference_id: string;
}
export interface FeeConfig { bps: number; platformSafe: string; budgetFeeRail: Rail }

export function railForAsset(asset: Asset): Rail {
  switch (asset) {
    case "MUENZEN": return "funder_muenzen";
    case "XDAI": return "funder_xdai";
    case "EURe": return "safe_eure";
    case "EURC": return "safe_eurc_base";
  }
}

const assetForRail = (rail: Rail, fallback: Asset): Asset =>
  rail === "funder_xdai" ? "XDAI" : rail === "funder_muenzen" ? "MUENZEN" : fallback;

/** The platform fee always sits on top of `main` and shares its reference. */
function feeLine(main: LineDraft, fee: FeeConfig, rail: Rail): LineDraft[] {
  const amount = feeAtto(toAtto(main.amount), fee.bps);
  if (amount === 0n) return [];
  return [{
    role: "plattform",
    recipient_wallet: fee.platformSafe.toLowerCase(),
    recipient_label: "Plattform",
    amount: fromAtto(amount),
    asset: assetForRail(rail, main.asset),
    rail,
    reference_type: main.reference_type,
    reference_id: main.reference_id,
  }];
}

export function planWahlhelferLines(
  i: { wahlhelferId: string; wallet: string; label: string; amount: string; asset: Asset }, fee: FeeConfig,
): LineDraft[] {
  const main: LineDraft = {
    role: "wahlhelfer", recipient_wallet: i.wallet.toLowerCase(), recipient_label: i.label,
    amount: fromAtto(toAtto(i.amount)), asset: i.asset, rail: railForAsset(i.asset),
    reference_type: "wahlhelfer", reference_id: i.wahlhelferId,
  };
  return [main, ...feeLine(main, fee, main.rail)];
}

export function planTaskLines(
  i: { taskId: string; wallet: string; label: string; amount: string; asset: Asset }, fee: FeeConfig,
): LineDraft[] {
  const main: LineDraft = {
    role: "aufgabe", recipient_wallet: i.wallet.toLowerCase(), recipient_label: i.label,
    amount: fromAtto(toAtto(i.amount)), asset: i.asset, rail: railForAsset(i.asset),
    reference_type: "task", reference_id: i.taskId,
  };
  return [main, ...feeLine(main, fee, main.rail)];
}

export function planBudgetLines(
  i: { proposalId: string; beneficiary: string; amount: string; asset: Asset }, fee: FeeConfig,
): LineDraft[] {
  const main: LineDraft = {
    role: "empfaenger", recipient_wallet: null, recipient_label: i.beneficiary,
    amount: fromAtto(toAtto(i.amount)), asset: i.asset, rail: "manual_safe",
    reference_type: "proposal", reference_id: i.proposalId,
  };
  return [main, ...feeLine(main, fee, fee.budgetFeeRail)];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:web`
Expected: the new vorhaben tests PASS (other suites unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/vorhaben/constants.ts apps/web/src/lib/vorhaben/money.ts apps/web/src/lib/vorhaben/payout-plan.ts apps/expo/supabase/functions/_shared/payout-amount.ts apps/web/tests/vorhaben-money.test.ts apps/web/tests/vorhaben-payout-plan.test.ts
git commit -m "feat(web): payout maths and line planning for proposal contracts"
git push
```

---

### Task 4: Task state machine and lifecycle stage derivation

Pure logic used by Phase 2's task service and by Phase 1's sync (stage derivation). Built now so sync can derive stages.

**Files:**
- Create: `apps/web/src/lib/vorhaben/task-machine.ts`, `apps/web/src/lib/vorhaben/stage.ts`
- Test: `apps/web/tests/vorhaben-task-machine.test.ts`, `apps/web/tests/vorhaben-stage.test.ts`

**Interfaces:**
- Produces `task-machine.ts`:
  ```ts
  export type TaskStatus = "offen" | "vergeben" | "in_arbeit" | "eingereicht" | "abgenommen" | "ausgezahlt" | "abgebrochen";
  export type TaskAction = "apply" | "withdraw" | "assign" | "start" | "comment" | "proof" | "submit" | "approve" | "request_changes" | "cancel";
  export interface TaskCtx {
    status: TaskStatus; actor: string; proposer: string; assignee: string | null;
    actorIsAttester: boolean; applicants: string[]; firstApplicationAt: number | null; nowSec: number;
    hasProof: boolean; comment: string | null; target: string | null; // assign: applicant wallet
    proposalStage: Stage;
  }
  export type Decision = { ok: true; next: TaskStatus } | { ok: false; code: string; message: string };
  export function decideTaskAction(action: TaskAction, c: TaskCtx): Decision;
  export const PROPOSER_INACTIVE_SEC = 7 * 24 * 3600;
  ```
  All wallets in `TaskCtx` are lowercase. `next === status` means "no status change" (apply/withdraw/comment/proof).
- Produces `stage.ts`:
  ```ts
  export interface StageInput { chainState: number; nowSec: number; deadlineSec: number; tallyPublished: boolean;
    taskStatuses: string[]; lineStatuses: string[]; hasBudget: boolean; budgetLineConfirmed: boolean; }
  export function deriveStage(i: StageInput): Stage;
  ```

- [ ] **Step 1: Write the failing tests**

`apps/web/tests/vorhaben-task-machine.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { decideTaskAction, PROPOSER_INACTIVE_SEC, type TaskCtx } from "../src/lib/vorhaben/task-machine";

const base: TaskCtx = {
  status: "offen", actor: "0xcitizen", proposer: "0xproposer", assignee: null, actorIsAttester: false,
  applicants: [], firstApplicationAt: null, nowSec: 1_000_000, hasProof: false, comment: null, target: null,
  proposalStage: "abstimmung",
};
const ok = (d: ReturnType<typeof decideTaskAction>, next: string) => { assert.equal(d.ok, true, JSON.stringify(d)); if (d.ok) assert.equal(d.next, next); };
const no = (d: ReturnType<typeof decideTaskAction>, code: string) => { assert.equal(d.ok, false); if (!d.ok) assert.equal(d.code, code); };

test("anyone may apply to an open task, once", () => {
  ok(decideTaskAction("apply", base), "offen");
  no(decideTaskAction("apply", { ...base, applicants: ["0xcitizen"] }), "ALREADY_APPLIED");
  no(decideTaskAction("apply", { ...base, status: "vergeben" }), "BAD_STATUS");
});

test("no applications once the proposal is rejected", () => {
  no(decideTaskAction("apply", { ...base, proposalStage: "abgelehnt" }), "PROPOSAL_CLOSED");
});

test("proposer assigns an applicant", () => {
  ok(decideTaskAction("assign", { ...base, actor: "0xproposer", applicants: ["0xa"], target: "0xa" }), "vergeben");
  no(decideTaskAction("assign", { ...base, actor: "0xproposer", applicants: ["0xa"], target: "0xb" }), "NOT_AN_APPLICANT");
  no(decideTaskAction("assign", { ...base, actor: "0xother", applicants: ["0xa"], target: "0xa" }), "FORBIDDEN");
});

test("proposer who applied cannot assign themselves; an other Attester must", () => {
  const c = { ...base, applicants: ["0xproposer", "0xa"], target: "0xproposer" };
  no(decideTaskAction("assign", { ...c, actor: "0xproposer", actorIsAttester: true }), "SELF_ASSIGN");
  ok(decideTaskAction("assign", { ...c, actor: "0xattester", actorIsAttester: true }), "vergeben");
  // Even assigning someone else: once the proposer applied, only an Attester picks.
  no(decideTaskAction("assign", { ...c, actor: "0xproposer", target: "0xa" }), "FORBIDDEN");
});

test("an Attester may assign after the proposer has been inactive 7 days", () => {
  const c = { ...base, actor: "0xattester", actorIsAttester: true, applicants: ["0xa"], target: "0xa" };
  no(decideTaskAction("assign", { ...c, firstApplicationAt: base.nowSec - 100 }), "FORBIDDEN");
  ok(decideTaskAction("assign", { ...c, firstApplicationAt: base.nowSec - PROPOSER_INACTIVE_SEC - 1 }), "vergeben");
});

test("assignee works the task", () => {
  const c = { ...base, status: "vergeben" as const, assignee: "0xa", actor: "0xa" };
  ok(decideTaskAction("start", c), "in_arbeit");
  ok(decideTaskAction("proof", c), "in_arbeit");
  no(decideTaskAction("start", { ...c, actor: "0xb" }), "FORBIDDEN");
  no(decideTaskAction("submit", { ...c, status: "in_arbeit" }), "PROOF_REQUIRED");
  ok(decideTaskAction("submit", { ...c, status: "in_arbeit", hasProof: true }), "eingereicht");
});

test("approval: Attester who is not the assignee", () => {
  const c = { ...base, status: "eingereicht" as const, assignee: "0xa" };
  ok(decideTaskAction("approve", { ...c, actor: "0xatt", actorIsAttester: true }), "abgenommen");
  no(decideTaskAction("approve", { ...c, actor: "0xa", actorIsAttester: true }), "SELF_APPROVE");
  no(decideTaskAction("approve", { ...c, actor: "0xproposer" }), "FORBIDDEN");
  no(decideTaskAction("request_changes", { ...c, actor: "0xatt", actorIsAttester: true }), "COMMENT_REQUIRED");
  ok(decideTaskAction("request_changes", { ...c, actor: "0xatt", actorIsAttester: true, comment: "Quittung fehlt" }), "in_arbeit");
});

test("cancel needs proposer or Attester and a comment; final states stay final", () => {
  no(decideTaskAction("cancel", { ...base, actor: "0xproposer" }), "COMMENT_REQUIRED");
  ok(decideTaskAction("cancel", { ...base, actor: "0xproposer", comment: "Nicht mehr nötig" }), "abgebrochen");
  no(decideTaskAction("cancel", { ...base, actor: "0xx", comment: "x" }), "FORBIDDEN");
  no(decideTaskAction("cancel", { ...base, status: "abgenommen", actor: "0xproposer", comment: "x" }), "BAD_STATUS");
});

test("comments: anyone, but not empty", () => {
  ok(decideTaskAction("comment", { ...base, comment: "Frage" }), "offen");
  no(decideTaskAction("comment", base), "COMMENT_REQUIRED");
});
```

`apps/web/tests/vorhaben-stage.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveStage, type StageInput } from "../src/lib/vorhaben/stage";

const base: StageInput = { chainState: 1, nowSec: 100, deadlineSec: 200, tallyPublished: false,
  taskStatuses: [], lineStatuses: [], hasBudget: false, budgetLineConfirmed: false };

test("voting and counting", () => {
  assert.equal(deriveStage(base), "abstimmung");
  assert.equal(deriveStage({ ...base, nowSec: 300 }), "auszaehlung");
  // Governor reports Active until the tally lands; still counting.
  assert.equal(deriveStage({ ...base, nowSec: 300, chainState: 1, tallyPublished: false }), "auszaehlung");
});

test("rejected outcomes", () => {
  for (const s of [2, 3, 6]) assert.equal(deriveStage({ ...base, nowSec: 300, tallyPublished: true, chainState: s }), "abgelehnt");
});

test("accepted, in progress, done", () => {
  const won = { ...base, nowSec: 300, tallyPublished: true, chainState: 4 };
  assert.equal(deriveStage(won), "angenommen");
  assert.equal(deriveStage({ ...won, taskStatuses: ["offen"] }), "in_umsetzung");
  assert.equal(deriveStage({ ...won, lineStatuses: ["gesendet"] }), "in_umsetzung");
  assert.equal(deriveStage({ ...won, hasBudget: true }), "in_umsetzung");
  assert.equal(deriveStage({ ...won, chainState: 7, hasBudget: true, budgetLineConfirmed: true,
    taskStatuses: ["ausgezahlt", "abgebrochen"], lineStatuses: ["bestaetigt", "bestaetigt"] }), "umgesetzt");
  // All tasks cancelled and nothing paid except Wahlhelfer: still done once lines are confirmed.
  assert.equal(deriveStage({ ...won, taskStatuses: ["abgebrochen"], lineStatuses: ["bestaetigt"] }), "umgesetzt");
});

test("a failed line keeps the proposal in progress", () => {
  const won = { ...base, nowSec: 300, tallyPublished: true, chainState: 4 };
  assert.equal(deriveStage({ ...won, taskStatuses: ["ausgezahlt"], lineStatuses: ["fehlgeschlagen"] }), "in_umsetzung");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:web` → FAIL (`Cannot find module '../src/lib/vorhaben/task-machine'`).

- [ ] **Step 3: Implement**

`apps/web/src/lib/vorhaben/task-machine.ts`:

```ts
import type { Stage } from "./constants";

export type TaskStatus = "offen" | "vergeben" | "in_arbeit" | "eingereicht" | "abgenommen" | "ausgezahlt" | "abgebrochen";
export type TaskAction = "apply" | "withdraw" | "assign" | "start" | "comment" | "proof" | "submit" | "approve" | "request_changes" | "cancel";

export interface TaskCtx {
  status: TaskStatus;
  actor: string;
  proposer: string;
  assignee: string | null;
  actorIsAttester: boolean;
  applicants: string[];
  firstApplicationAt: number | null;
  nowSec: number;
  hasProof: boolean;
  comment: string | null;
  target: string | null;
  proposalStage: Stage;
}
export type Decision = { ok: true; next: TaskStatus } | { ok: false; code: string; message: string };

export const PROPOSER_INACTIVE_SEC = 7 * 24 * 3600;
const FINAL: TaskStatus[] = ["abgenommen", "ausgezahlt", "abgebrochen"];

const allow = (next: TaskStatus): Decision => ({ ok: true, next });
const deny = (code: string, message: string): Decision => ({ ok: false, code, message });
const hasText = (s: string | null) => !!s && s.trim().length > 0;

export function decideTaskAction(action: TaskAction, c: TaskCtx): Decision {
  const isProposer = c.actor === c.proposer;
  const isAssignee = !!c.assignee && c.actor === c.assignee;

  switch (action) {
    case "apply":
      if (c.proposalStage === "abgelehnt") return deny("PROPOSAL_CLOSED", "Der Vorschlag wurde abgelehnt.");
      if (c.status !== "offen") return deny("BAD_STATUS", "Diese Aufgabe ist schon vergeben.");
      if (c.applicants.includes(c.actor)) return deny("ALREADY_APPLIED", "Du hast dich schon beworben.");
      return allow(c.status);

    case "withdraw":
      if (c.status !== "offen") return deny("BAD_STATUS", "Die Aufgabe ist schon vergeben.");
      if (!c.applicants.includes(c.actor)) return deny("NOT_AN_APPLICANT", "Du hast dich nicht beworben.");
      return allow(c.status);

    case "assign": {
      if (c.status !== "offen") return deny("BAD_STATUS", "Diese Aufgabe ist schon vergeben.");
      if (!c.target || !c.applicants.includes(c.target)) return deny("NOT_AN_APPLICANT", "Nur Bewerber:innen können ausgewählt werden.");
      const proposerApplied = c.applicants.includes(c.proposer);
      if (c.actor === c.target) return deny("SELF_ASSIGN", "Du kannst dir eine Aufgabe nicht selbst geben.");
      if (proposerApplied) {
        return c.actorIsAttester && !isProposer ? allow("vergeben")
          : deny("FORBIDDEN", "Da die Antragsteller:in sich beworben hat, wählt eine Attester:in aus.");
      }
      if (isProposer) return allow("vergeben");
      const inactive = c.firstApplicationAt !== null && c.nowSec - c.firstApplicationAt > PROPOSER_INACTIVE_SEC;
      return c.actorIsAttester && inactive ? allow("vergeben") : deny("FORBIDDEN", "Nur die Antragsteller:in kann die Aufgabe vergeben.");
    }

    case "start":
      if (c.status !== "vergeben") return deny("BAD_STATUS", "Die Aufgabe läuft schon.");
      return isAssignee ? allow("in_arbeit") : deny("FORBIDDEN", "Nur die zuständige Person kann starten.");

    case "proof":
      if (!isAssignee) return deny("FORBIDDEN", "Nur die zuständige Person kann Nachweise anhängen.");
      if (c.status === "vergeben") return allow("in_arbeit");
      if (c.status === "in_arbeit") return allow("in_arbeit");
      return deny("BAD_STATUS", "Für diese Aufgabe können keine Nachweise mehr angehängt werden.");

    case "comment":
      return hasText(c.comment) ? allow(c.status) : deny("COMMENT_REQUIRED", "Bitte schreibe einen Kommentar.");

    case "submit":
      if (c.status !== "in_arbeit") return deny("BAD_STATUS", "Die Aufgabe ist nicht in Arbeit.");
      if (!isAssignee) return deny("FORBIDDEN", "Nur die zuständige Person kann einreichen.");
      return c.hasProof ? allow("eingereicht") : deny("PROOF_REQUIRED", "Bitte hänge zuerst einen Nachweis an.");

    case "approve":
    case "request_changes":
      if (c.status !== "eingereicht") return deny("BAD_STATUS", "Die Aufgabe wartet nicht auf Abnahme.");
      if (!c.actorIsAttester) return deny("FORBIDDEN", "Nur Attester:innen nehmen Aufgaben ab.");
      if (isAssignee) return deny("SELF_APPROVE", "Du kannst deine eigene Aufgabe nicht abnehmen.");
      if (action === "request_changes" && !hasText(c.comment)) return deny("COMMENT_REQUIRED", "Bitte beschreibe, was fehlt.");
      return allow(action === "approve" ? "abgenommen" : "in_arbeit");

    case "cancel":
      if (FINAL.includes(c.status)) return deny("BAD_STATUS", "Diese Aufgabe ist schon abgeschlossen.");
      if (!isProposer && !c.actorIsAttester) return deny("FORBIDDEN", "Nur Antragsteller:in oder Attester:innen können abbrechen.");
      return hasText(c.comment) ? allow("abgebrochen") : deny("COMMENT_REQUIRED", "Bitte gib einen Grund an.");
  }
}
```

`apps/web/src/lib/vorhaben/stage.ts`:

```ts
import type { Stage } from "./constants";

export interface StageInput {
  chainState: number;      // OZ ProposalState
  nowSec: number;
  deadlineSec: number;
  tallyPublished: boolean; // Tally.totalTallyResults() > 0
  taskStatuses: string[];
  lineStatuses: string[];
  hasBudget: boolean;
  budgetLineConfirmed: boolean;
}

const REJECTED = new Set([2, 3, 6]); // Canceled, Defeated, Expired
const ACCEPTED = new Set([4, 5, 7]); // Succeeded, Queued, Executed
const TASK_DONE = new Set(["ausgezahlt", "abgebrochen"]);

export function deriveStage(i: StageInput): Stage {
  if (i.nowSec < i.deadlineSec) return "abstimmung";
  if (REJECTED.has(i.chainState) && (i.tallyPublished || i.chainState !== 3)) return "abgelehnt";
  if (!i.tallyPublished || !ACCEPTED.has(i.chainState)) return "auszaehlung";
  if (i.taskStatuses.length === 0 && i.lineStatuses.length === 0 && !i.hasBudget) return "angenommen";
  const openTask = i.taskStatuses.some((s) => !TASK_DONE.has(s));
  const openLine = i.lineStatuses.some((s) => s !== "bestaetigt");
  const budgetOpen = i.hasBudget && !i.budgetLineConfirmed;
  return openTask || openLine || budgetOpen ? "in_umsetzung" : "umgesetzt";
}
```

Note: a Defeated state without a published tally cannot occur after the grace period override, but the guard keeps a "Defeated because nobody tallied" proposal (`chainState 3`, `tallyPublished false`) in `auszaehlung` until either the tally lands or the governor reports Expired/Canceled.

- [ ] **Step 4: Run tests** — `pnpm test:web` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/vorhaben/task-machine.ts apps/web/src/lib/vorhaben/stage.ts apps/web/tests/vorhaben-task-machine.test.ts apps/web/tests/vorhaben-stage.test.ts
git commit -m "feat(web): task state machine and proposal lifecycle stages"
git push
```

---

### Task 5: Chain reads and the co-sign message

**Files:**
- Create: `apps/web/src/lib/vorhaben/chain.ts`, `apps/web/src/lib/vorhaben/tally-message.ts`
- Test: `apps/web/tests/vorhaben-chain.test.ts`, `apps/web/tests/vorhaben-tally-message.test.ts`

**Interfaces:**
- Produces `chain.ts`:
  ```ts
  export type ContractReader = { readContract: (args: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] }) => Promise<unknown> };
  export interface ProposalOutcome { state: number; deadlineSec: number; tallyAddress: `0x${string}` | null;
    tallyPublished: boolean; forVotes: bigint; againstVotes: bigint; abstainVotes: bigint; }
  export function gnosisReader(): ContractReader;                       // viem public client on GNOSIS_RPC_URL
  export async function readProposalOutcome(r: ContractReader, proposalId: bigint): Promise<ProposalOutcome>;
  export async function isAttester(r: ContractReader, wallet: string): Promise<boolean>;
  export async function listAttesters(r: ContractReader, maxScan?: number): Promise<string[]>; // lowercase, deduped
  ```
- Produces `tally-message.ts`:
  ```ts
  export interface TallyFacts { proposalId: bigint; proposalNumber: number; title: string; forVotes: bigint;
    againstVotes: bigint; abstainVotes: bigint; tallyAddress: `0x${string}`; }
  export function tallyResultHash(f: TallyFacts): `0x${string}`;
  export function buildTallyConfirmMessage(f: TallyFacts): string;
  ```

- [ ] **Step 1: Write the failing tests**

`apps/web/tests/vorhaben-chain.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { listAttesters, readProposalOutcome, type ContractReader } from "../src/lib/vorhaben/chain";

const TALLY = "0x00000000000000000000000000000000000000aa";

function fakeReader(map: Record<string, (args: readonly unknown[]) => unknown>): ContractReader {
  return {
    readContract: async ({ functionName, args = [] }) => {
      const fn = map[functionName];
      if (!fn) throw new Error(`unexpected ${functionName}`);
      return fn(args);
    },
  };
}

test("reads a published tally", async () => {
  const r = fakeReader({
    state: () => 4,
    proposalDeadline: () => 1791122615n,
    proposalPolls: () => [1n, "0x01", "0x02", TALLY, 1791122615n],
    totalTallyResults: () => 3n,
    tallyResults: ([opt]) => (opt === 1n ? [7n, true] : opt === 0n ? [2n, true] : [1n, true]),
  });
  const o = await readProposalOutcome(r, 42n);
  assert.deepEqual(o, { state: 4, deadlineSec: 1791122615, tallyAddress: TALLY, tallyPublished: true,
    forVotes: 7n, againstVotes: 2n, abstainVotes: 1n });
});

test("unpublished tally reports zero votes", async () => {
  const r = fakeReader({
    state: () => 1, proposalDeadline: () => 10n,
    proposalPolls: () => [1n, "0x01", "0x02", TALLY, 10n],
    totalTallyResults: () => 0n,
  });
  const o = await readProposalOutcome(r, 42n);
  assert.equal(o.tallyPublished, false);
  assert.equal(o.forVotes, 0n);
});

test("lists attesters by scanning token ids, skipping burned ones", async () => {
  const owners: Record<string, string> = { "0": "0xAA", "2": "0xBB", "3": "0xCC" }; // 1 burned
  const r = fakeReader({
    attesterCount: () => 3n,
    ownerOf: ([id]) => { const o = owners[String(id)]; if (!o) throw new Error("ERC721NonexistentToken"); return o; },
    hasAttesterNFT: () => true,
  });
  assert.deepEqual(await listAttesters(r), ["0xaa", "0xbb", "0xcc"]);
});
```

`apps/web/tests/vorhaben-tally-message.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTallyConfirmMessage, tallyResultHash, type TallyFacts } from "../src/lib/vorhaben/tally-message";

const facts: TallyFacts = { proposalId: 42n, proposalNumber: 3, title: "150 € Spende für den Vereinsbus",
  forVotes: 7n, againstVotes: 2n, abstainVotes: 1n, tallyAddress: "0x00000000000000000000000000000000000000aa" };

test("message is stable German text containing every fact", () => {
  const m = buildTallyConfirmMessage(facts);
  assert.equal(m,
    `Ich bestätige das Auszählungsergebnis von Vorschlag #3 „150 € Spende für den Vereinsbus“: ` +
    `Ja 7, Nein 2, Enthaltung 1. Auszählungsvertrag 0x00000000000000000000000000000000000000aa auf Gnosis. ` +
    `Ergebnis-Hash ${tallyResultHash(facts)}.`);
});

test("hash changes when any count changes", () => {
  assert.notEqual(tallyResultHash(facts), tallyResultHash({ ...facts, forVotes: 8n }));
  assert.match(tallyResultHash(facts), /^0x[0-9a-f]{64}$/);
});
```

- [ ] **Step 2: Run** `pnpm test:web` → FAIL (modules missing).

- [ ] **Step 3: Implement**

`apps/web/src/lib/vorhaben/chain.ts`:

```ts
import { createPublicClient, http, parseAbi } from "viem";
import { gnosis } from "viem/chains";
import { ATTESTER_NFT, GOVERNOR, VOTE_OPTION } from "./constants";

export type ContractReader = {
  readContract: (args: { address: `0x${string}`; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] }) => Promise<unknown>;
};

export interface ProposalOutcome {
  state: number;
  deadlineSec: number;
  tallyAddress: `0x${string}` | null;
  tallyPublished: boolean;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
}

const governorAbi = parseAbi([
  "function state(uint256 proposalId) view returns (uint8)",
  "function proposalDeadline(uint256 proposalId) view returns (uint256)",
  "function proposalPolls(uint256 proposalId) view returns (uint256 pollId, address poll, address messageProcessor, address tally, uint256 deadline)",
]);
const tallyAbi = parseAbi([
  "function totalTallyResults() view returns (uint256)",
  "function tallyResults(uint256 index) view returns (uint256 value, bool isSet)",
]);
const attesterAbi = parseAbi([
  "function attesterCount() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function hasAttesterNFT(address account) view returns (bool)",
]);

const ZERO = "0x0000000000000000000000000000000000000000";

export function gnosisReader(): ContractReader {
  // batch:false — publicnode/gnosischain RPCs have returned null for batched calls before.
  return createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com", { batch: false }) }) as unknown as ContractReader;
}

export async function readProposalOutcome(r: ContractReader, proposalId: bigint): Promise<ProposalOutcome> {
  const [state, deadline, polls] = await Promise.all([
    r.readContract({ address: GOVERNOR, abi: governorAbi, functionName: "state", args: [proposalId] }),
    r.readContract({ address: GOVERNOR, abi: governorAbi, functionName: "proposalDeadline", args: [proposalId] }),
    r.readContract({ address: GOVERNOR, abi: governorAbi, functionName: "proposalPolls", args: [proposalId] }),
  ]);
  const tally = (polls as readonly unknown[])[3] as `0x${string}`;
  const tallyAddress = tally && tally.toLowerCase() !== ZERO ? (tally.toLowerCase() as `0x${string}`) : null;
  const out: ProposalOutcome = {
    state: Number(state), deadlineSec: Number(deadline), tallyAddress, tallyPublished: false,
    forVotes: 0n, againstVotes: 0n, abstainVotes: 0n,
  };
  if (!tallyAddress) return out;
  const total = (await r.readContract({ address: tallyAddress, abi: tallyAbi, functionName: "totalTallyResults" })) as bigint;
  if (total === 0n) return out;
  const read = async (opt: bigint) =>
    ((await r.readContract({ address: tallyAddress, abi: tallyAbi, functionName: "tallyResults", args: [opt] })) as readonly [bigint, boolean])[0];
  const [f, a, ab] = await Promise.all([read(VOTE_OPTION.for), read(VOTE_OPTION.against), read(VOTE_OPTION.abstain)]);
  return { ...out, tallyPublished: true, forVotes: f, againstVotes: a, abstainVotes: ab };
}

export async function isAttester(r: ContractReader, wallet: string): Promise<boolean> {
  return Boolean(await r.readContract({ address: ATTESTER_NFT, abi: attesterAbi, functionName: "hasAttesterNFT", args: [wallet as `0x${string}`] }));
}

/** AttesterNFTv2 is soulbound and not enumerable: token ids are sequential, burned ids revert. */
export async function listAttesters(r: ContractReader, maxScan = 500): Promise<string[]> {
  const count = Number(await r.readContract({ address: ATTESTER_NFT, abi: attesterAbi, functionName: "attesterCount" }));
  const found = new Set<string>();
  for (let start = 0; start < maxScan && found.size < count; start += 20) {
    const ids = Array.from({ length: 20 }, (_, k) => BigInt(start + k));
    const owners = await Promise.all(ids.map((id) =>
      r.readContract({ address: ATTESTER_NFT, abi: attesterAbi, functionName: "ownerOf", args: [id] }).catch(() => null)));
    for (const o of owners) if (typeof o === "string") found.add(o.toLowerCase());
  }
  const holders = [...found];
  const still = await Promise.all(holders.map((w) => isAttester(r, w)));
  return holders.filter((_, i) => still[i]);
}
```

`apps/web/src/lib/vorhaben/tally-message.ts`:

```ts
import { encodeAbiParameters, keccak256 } from "viem";

export interface TallyFacts {
  proposalId: bigint;
  proposalNumber: number;
  title: string;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  tallyAddress: `0x${string}`;
}

export function tallyResultHash(f: TallyFacts): `0x${string}` {
  return keccak256(encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }],
    [f.proposalId, f.forVotes, f.againstVotes, f.abstainVotes, f.tallyAddress],
  ));
}

/** The exact text an Attester signs. Rebuilt server-side from chain data on submit. */
export function buildTallyConfirmMessage(f: TallyFacts): string {
  return (
    `Ich bestätige das Auszählungsergebnis von Vorschlag #${f.proposalNumber} „${f.title}“: ` +
    `Ja ${f.forVotes}, Nein ${f.againstVotes}, Enthaltung ${f.abstainVotes}. ` +
    `Auszählungsvertrag ${f.tallyAddress.toLowerCase()} auf Gnosis. ` +
    `Ergebnis-Hash ${tallyResultHash(f)}.`
  );
}
```

- [ ] **Step 4: Run** `pnpm test:web` → PASS.

- [ ] **Step 5: Live read smoke test (read-only)**

Run from repo root:

```bash
cd apps/web && npx tsx -e '
import { gnosisReader, readProposalOutcome, listAttesters } from "./src/lib/vorhaben/chain";
const r = gnosisReader();
readProposalOutcome(r, 83936816927993181433112977625644073498853616904143141665771570278092516935482n).then((o) => console.log(o));
listAttesters(r).then((a) => console.log(a.length, "attesters"));
'
```

Expected: #3 shows `state: 1`, `deadlineSec: 1791122615`, `tallyPublished: false`; attester count equals `AttesterNFTv2.attesterCount()` (5 at time of writing). Record the output in the task report.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/vorhaben/chain.ts apps/web/src/lib/vorhaben/tally-message.ts apps/web/tests/vorhaben-chain.test.ts apps/web/tests/vorhaben-tally-message.test.ts
git commit -m "feat(web): governor/tally/attester reads and the tally co-sign message"
git push
```

---

### Task 6: Settings, repository and notifications (incl. push hub)

**Files:**
- Create: `apps/web/src/lib/vorhaben/settings.ts`, `apps/web/src/lib/vorhaben/repo.ts`, `apps/web/src/lib/vorhaben/notify.ts`
- Create: `supabase/migrations/20261001_vorhaben_push.sql`
- Test: `apps/web/tests/vorhaben-settings.test.ts`

**Interfaces:**
- Produces `settings.ts`:
  ```ts
  export interface VorhabenSettings { platformFeeBps: number; platformSafe: string; wahlhelferAsset: Asset;
    wahlhelferAmount: string; budgetFeeRail: Rail; windowDays: number; dispatchEnabled: boolean; }
  export function parseSettings(rows: { key: string; value: string }[]): VorhabenSettings; // throws on missing/invalid
  export async function loadSettings(db: Db): Promise<VorhabenSettings>;
  ```
- Produces `repo.ts` (`type Db = SupabaseClient` from `@supabase/supabase-js`):
  ```ts
  export type ProposalRow = { id: string; proposal_id: string; proposal_number: number; title: string; proposer_address: string;
    blockchain_proposal_id: string | null; vorhaben_enabled: boolean; budget_amount: string | null; budget_asset: Asset | null;
    beneficiary_name: string | null; lifecycle_stage: Stage; tally_confirm_opened_at: string | null;
    tally_confirm_until: string | null; tally_address: string | null; };
  export type LineRow = { id: string; contract_id: string; proposal_id: string; role: LineRole; recipient_wallet: string | null;
    recipient_label: string; amount: string; asset: Asset; rail: Rail; reference_type: string; reference_id: string;
    status: LineStatus; error: string | null; attempt_started_at: string | null; safe_tx_hash: string | null;
    safe_nonce: number | null; tx_hash: string | null; };
  export async function listActiveProposals(db: Db): Promise<ProposalRow[]>;  // vorhaben_enabled and (stage not final or open lines)
  export async function getProposal(db: Db, id: string): Promise<ProposalRow | null>;
  export async function ensureContract(db: Db, proposalId: string, s: VorhabenSettings): Promise<{ id: string; platform_fee_bps: number; platform_safe_address: string }>;
  export async function insertLines(db: Db, contractId: string, proposalId: string, drafts: LineDraft[]): Promise<void>; // ON CONFLICT DO NOTHING
  export async function linesForProposal(db: Db, proposalId: string): Promise<LineRow[]>;
  export async function openLines(db: Db): Promise<LineRow[]>;           // status <> 'bestaetigt'
  export async function updateLine(db: Db, id: string, patch: Partial<LineRow>): Promise<void>;
  export async function displayNames(db: Db, wallets: string[]): Promise<Map<string, string>>; // lowercase wallet → name, fallback "Unbekannt"
  ```
- Produces `notify.ts`:
  ```ts
  export type VorhabenNotice = { wallet: string; kind: "vorhaben_tally" | "vorhaben_task" | "vorhaben_payout" | "vorhaben_safe";
    title: string; body: string; screen: "auszaehlung" | "aufgabe" | "vertrag" | "proposal"; proposalKey: string; taskId?: string; };
  export async function notify(db: Db, notices: VorhabenNotice[]): Promise<void>; // inserts into public.notifications
  ```
  `proposalKey` is `proposals.proposal_id` (the tx hash Expo routes use).
- Push payload produced by the trigger for these types: `{ type: "vorhaben", screen, proposalId, taskId }`.

- [ ] **Step 1: Write the failing test**

`apps/web/tests/vorhaben-settings.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSettings } from "../src/lib/vorhaben/settings";

const rows = [
  { key: "platform_fee_bps", value: "500" },
  { key: "platform_safe_address", value: "0xbcabbaa26420e0a4771808f9639d4176355e5d4b" },
  { key: "wahlhelfer_reward_asset", value: "MUENZEN" },
  { key: "wahlhelfer_reward_amount", value: "10" },
  { key: "budget_fee_rail", value: "funder_xdai" },
  { key: "tally_confirm_window_days", value: "7" },
  { key: "dispatch_enabled", value: "false" },
];

test("parses the seeded settings", () => {
  assert.deepEqual(parseSettings(rows), {
    platformFeeBps: 500, platformSafe: "0xbcabbaa26420e0a4771808f9639d4176355e5d4b", wahlhelferAsset: "MUENZEN",
    wahlhelferAmount: "10", budgetFeeRail: "funder_xdai", windowDays: 7, dispatchEnabled: false,
  });
});

test("rejects a missing or malformed key instead of defaulting", () => {
  assert.throws(() => parseSettings(rows.filter((r) => r.key !== "platform_safe_address")));
  assert.throws(() => parseSettings(rows.map((r) => (r.key === "platform_fee_bps" ? { ...r, value: "abc" } : r))));
  assert.throws(() => parseSettings(rows.map((r) => (r.key === "platform_safe_address" ? { ...r, value: "0x123" } : r))));
});
```

- [ ] **Step 2: Run** `pnpm test:web` → FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/lib/vorhaben/settings.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Asset, Rail } from "./constants";

export type Db = SupabaseClient;
export interface VorhabenSettings {
  platformFeeBps: number;
  platformSafe: string;
  wahlhelferAsset: Asset;
  wahlhelferAmount: string;
  budgetFeeRail: Rail;
  windowDays: number;
  dispatchEnabled: boolean;
}

const ASSETS: Asset[] = ["EURe", "EURC", "MUENZEN", "XDAI"];
const RAILS: Rail[] = ["funder_muenzen", "funder_xdai", "safe_eure", "manual_safe", "safe_eurc_base"];

export function parseSettings(rows: { key: string; value: string }[]): VorhabenSettings {
  const m = new Map(rows.map((r) => [r.key, r.value.trim()]));
  const get = (k: string) => { const v = m.get(k); if (v === undefined || v === "") throw new Error(`vorhaben_settings.${k} missing`); return v; };
  const int = (k: string) => { const n = Number(get(k)); if (!Number.isInteger(n) || n < 0) throw new Error(`vorhaben_settings.${k} invalid`); return n; };
  const platformSafe = get("platform_safe_address").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(platformSafe)) throw new Error("vorhaben_settings.platform_safe_address invalid");
  const asset = get("wahlhelfer_reward_asset") as Asset;
  if (!ASSETS.includes(asset)) throw new Error("vorhaben_settings.wahlhelfer_reward_asset invalid");
  const rail = get("budget_fee_rail") as Rail;
  if (!RAILS.includes(rail)) throw new Error("vorhaben_settings.budget_fee_rail invalid");
  const amount = get("wahlhelfer_reward_amount");
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error("vorhaben_settings.wahlhelfer_reward_amount invalid");
  const bps = int("platform_fee_bps");
  if (bps > 10000) throw new Error("vorhaben_settings.platform_fee_bps invalid");
  return {
    platformFeeBps: bps, platformSafe, wahlhelferAsset: asset, wahlhelferAmount: amount, budgetFeeRail: rail,
    windowDays: int("tally_confirm_window_days"), dispatchEnabled: get("dispatch_enabled") === "true",
  };
}

export async function loadSettings(db: Db): Promise<VorhabenSettings> {
  const { data, error } = await db.from("vorhaben_settings").select("key, value");
  if (error) throw new Error(`vorhaben_settings read failed: ${error.message}`);
  return parseSettings((data ?? []) as { key: string; value: string }[]);
}
```

`apps/web/src/lib/vorhaben/repo.ts`:

```ts
import type { Asset, LineRole, LineStatus, Rail, Stage } from "./constants";
import type { LineDraft } from "./payout-plan";
import type { Db, VorhabenSettings } from "./settings";

export type ProposalRow = {
  id: string; proposal_id: string; proposal_number: number; title: string; proposer_address: string;
  blockchain_proposal_id: string | null; vorhaben_enabled: boolean; budget_amount: string | null;
  budget_asset: Asset | null; beneficiary_name: string | null; lifecycle_stage: Stage;
  tally_confirm_opened_at: string | null; tally_confirm_until: string | null; tally_address: string | null;
};
export type LineRow = {
  id: string; contract_id: string; proposal_id: string; role: LineRole; recipient_wallet: string | null;
  recipient_label: string; amount: string; asset: Asset; rail: Rail; reference_type: string; reference_id: string;
  status: LineStatus; error: string | null; attempt_started_at: string | null; safe_tx_hash: string | null;
  safe_nonce: number | null; tx_hash: string | null;
};

const PROPOSAL_COLS =
  "id, proposal_id, proposal_number, title, proposer_address, blockchain_proposal_id, vorhaben_enabled, budget_amount, " +
  "budget_asset, beneficiary_name, lifecycle_stage, tally_confirm_opened_at, tally_confirm_until, tally_address";
const LINE_COLS =
  "id, contract_id, proposal_id, role, recipient_wallet, recipient_label, amount, asset, rail, reference_type, reference_id, " +
  "status, error, attempt_started_at, safe_tx_hash, safe_nonce, tx_hash";

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
}

export async function listActiveProposals(db: Db): Promise<ProposalRow[]> {
  const rows = must(await db.from("proposals").select(PROPOSAL_COLS).eq("vorhaben_enabled", true), "proposals") as unknown as ProposalRow[];
  const open = must(await db.from("proposal_payout_lines").select("proposal_id").neq("status", "bestaetigt"), "open lines") as { proposal_id: string }[];
  const withOpen = new Set(open.map((l) => l.proposal_id));
  return rows.filter((p) => !["umgesetzt", "abgelehnt"].includes(p.lifecycle_stage) || withOpen.has(p.id) || !p.tally_confirm_until || new Date(p.tally_confirm_until).getTime() > Date.now());
}

export async function getProposal(db: Db, id: string): Promise<ProposalRow | null> {
  return must(await db.from("proposals").select(PROPOSAL_COLS).eq("id", id).maybeSingle(), "proposal") as unknown as ProposalRow | null;
}

export async function ensureContract(db: Db, proposalId: string, s: VorhabenSettings) {
  await db.from("proposal_contracts").upsert(
    { proposal_id: proposalId, platform_fee_bps: s.platformFeeBps, platform_safe_address: s.platformSafe },
    { onConflict: "proposal_id", ignoreDuplicates: true },
  );
  return must(await db.from("proposal_contracts").select("id, platform_fee_bps, platform_safe_address").eq("proposal_id", proposalId).single(), "contract") as
    { id: string; platform_fee_bps: number; platform_safe_address: string };
}

export async function insertLines(db: Db, contractId: string, proposalId: string, drafts: LineDraft[]): Promise<void> {
  if (drafts.length === 0) return;
  const rows = drafts.map((d) => ({ ...d, contract_id: contractId, proposal_id: proposalId }));
  const { error } = await db.from("proposal_payout_lines").upsert(rows, { onConflict: "role,reference_type,reference_id", ignoreDuplicates: true });
  if (error) throw new Error(`insert lines: ${error.message}`);
}

export async function linesForProposal(db: Db, proposalId: string): Promise<LineRow[]> {
  return must(await db.from("proposal_payout_lines").select(LINE_COLS).eq("proposal_id", proposalId), "lines") as unknown as LineRow[];
}

export async function openLines(db: Db): Promise<LineRow[]> {
  return must(await db.from("proposal_payout_lines").select(LINE_COLS).neq("status", "bestaetigt").order("created_at"), "open lines") as unknown as LineRow[];
}

export async function updateLine(db: Db, id: string, patch: Partial<LineRow>): Promise<void> {
  const { error } = await db.from("proposal_payout_lines").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`update line ${id}: ${error.message}`);
}

export async function displayNames(db: Db, wallets: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(wallets.map((w) => w.toLowerCase()))];
  const out = new Map(uniq.map((w) => [w, "Unbekannt"]));
  if (uniq.length === 0) return out;
  const { data } = await db.from("users").select("wallet_address, display_name, username").in("wallet_address", uniq);
  for (const u of (data ?? []) as { wallet_address: string; display_name: string | null; username: string | null }[]) {
    const name = u.display_name || u.username;
    if (name) out.set(u.wallet_address.toLowerCase(), name);
  }
  return out;
}
```

Note on `listActiveProposals`: users rows may store checksummed wallets; `displayNames` uses `.in()` on lowercase. Before finishing the task, run `select count(*) from users where wallet_address <> lower(wallet_address);` via MCP. If non-zero, change the query to `.or(uniq.map(w => \`wallet_address.ilike.${w}\`).join(","))` and keep the lowercase map key.

`apps/web/src/lib/vorhaben/notify.ts`:

```ts
import type { Db } from "./settings";

export type VorhabenNotice = {
  wallet: string;
  kind: "vorhaben_tally" | "vorhaben_task" | "vorhaben_payout" | "vorhaben_safe";
  title: string;
  body: string;
  screen: "auszaehlung" | "aufgabe" | "vertrag" | "proposal";
  proposalKey: string;
  taskId?: string;
};

/** Inbox row + push (the notifications trigger forwards these types to send-notification). */
export async function notify(db: Db, notices: VorhabenNotice[]): Promise<void> {
  if (notices.length === 0) return;
  const rows = notices.map((n) => ({
    recipient_wallet: n.wallet.toLowerCase(),
    type: n.kind,
    title: n.title.slice(0, 80),
    body: n.body.slice(0, 200),
    metadata: { screen: n.screen, proposal_id: n.proposalKey, task_id: n.taskId ?? null },
  }));
  const { error } = await db.from("notifications").insert(rows);
  if (error) console.error("[vorhaben] notify failed", error.message);
}
```

- [ ] **Step 4: Push hub migration**

First read the live function body (it may have changed since 2026-08-30) via MCP `execute_sql`:

```sql
select prosrc from pg_proc where proname = 'notify_user_notification_push';
```

Write `supabase/migrations/20261001_vorhaben_push.sql` as `CREATE OR REPLACE FUNCTION public.notify_user_notification_push()` with the **live body copied exactly**, plus two additions:
1. Append `'vorhaben_tally', 'vorhaben_task', 'vorhaben_payout', 'vorhaben_safe'` to the `IF NEW.type NOT IN (...)` whitelist.
2. Add this branch before the final `ELSE`:

```sql
  ELSIF NEW.type IN ('vorhaben_tally', 'vorhaben_task', 'vorhaben_payout', 'vorhaben_safe') THEN
    v_data := jsonb_build_object(
      'type', 'vorhaben',
      'screen', NEW.metadata->>'screen',
      'proposalId', NEW.metadata->>'proposal_id',
      'taskId', NEW.metadata->>'task_id'
    );
```

Keep the header comment style of `20260830_forum_vote_push.sql` ("Preserves the live body … read via prosrc immediately before this migration was written"). End with `REVOKE EXECUTE ON FUNCTION public.notify_user_notification_push() FROM PUBLIC, anon, authenticated;`. Apply with MCP `apply_migration` (name `20261001_vorhaben_push`).

Verify: `select prosrc like '%vorhaben_tally%' from pg_proc where proname='notify_user_notification_push';` → `true`.

- [ ] **Step 5: Run** `pnpm test:web` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/vorhaben/settings.ts apps/web/src/lib/vorhaben/repo.ts apps/web/src/lib/vorhaben/notify.ts apps/web/tests/vorhaben-settings.test.ts supabase/migrations/20261001_vorhaben_push.sql
git commit -m "feat(web): vorhaben settings, repository, notifications and push routing"
git push
```

---

### Task 7: Funder payout edge function

**Files:**
- Create: `apps/expo/supabase/functions/vorhaben-payout-send/index.ts`
- Create: `apps/expo/supabase/functions/_shared/funder-float.ts` (import-free decision helper)
- Test: `apps/web/tests/vorhaben-funder-float.test.ts`

**Interfaces:**
- Consumes: `claim_payout_line`, `release_payout_line` (Task 2); `_shared/payout-amount.ts` (Task 3).
- Produces: `POST /functions/v1/vorhaben-payout-send` with `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` and body `{ lineId: string }` → `{ status: "gesendet" | "bestaetigt" | "skipped" | "float_low" | "failed", txHash?: string, reason?: string }`. Handles rails `funder_muenzen` and `funder_xdai` only.
- Produces `_shared/funder-float.ts`: `export const XDAI_GAS_RESERVE_ATTO: bigint; export function floatDecision(rail: "funder_muenzen" | "funder_xdai", amountAtto: bigint, muenzenBal: bigint, xdaiBal: bigint): "ok" | "float_low";`

- [ ] **Step 1: Write the failing test**

`apps/web/tests/vorhaben-funder-float.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { floatDecision, XDAI_GAS_RESERVE_ATTO } from "../../expo/supabase/functions/_shared/funder-float";

const E = 10n ** 18n;

test("Münzen: needs the amount in Münzen and a gas reserve in xDAI", () => {
  assert.equal(floatDecision("funder_muenzen", 10n * E, 139n * E, 2n * E), "ok");
  assert.equal(floatDecision("funder_muenzen", 10n * E, 9n * E, 2n * E), "float_low");
  assert.equal(floatDecision("funder_muenzen", 10n * E, 139n * E, XDAI_GAS_RESERVE_ATTO - 1n), "float_low");
});

test("xDAI: keeps the gas reserve back", () => {
  assert.equal(floatDecision("funder_xdai", 75n * E / 10n, 0n, 8n * E), "ok");
  assert.equal(floatDecision("funder_xdai", 75n * E / 10n, 0n, 2n * E), "float_low");
  assert.equal(floatDecision("funder_xdai", 75n * E / 10n, 0n, 75n * E / 10n + XDAI_GAS_RESERVE_ATTO - 1n), "float_low");
});
```

- [ ] **Step 2: Run** `pnpm test:web` → FAIL.

- [ ] **Step 3: Implement the helper**

`apps/expo/supabase/functions/_shared/funder-float.ts`:

```ts
// Import-free: decides whether the funder hot wallet can cover a payout.
// Tested from apps/web/tests/vorhaben-funder-float.test.ts.
export const XDAI_GAS_RESERVE_ATTO = 5n * 10n ** 17n; // 0.5 xDAI stays for gas

export function floatDecision(
  rail: "funder_muenzen" | "funder_xdai", amountAtto: bigint, muenzenBal: bigint, xdaiBal: bigint,
): "ok" | "float_low" {
  if (rail === "funder_muenzen") return muenzenBal >= amountAtto && xdaiBal >= XDAI_GAS_RESERVE_ATTO ? "ok" : "float_low";
  return xdaiBal >= amountAtto + XDAI_GAS_RESERVE_ATTO ? "ok" : "float_low";
}
```

- [ ] **Step 4: Implement the edge function**

`apps/expo/supabase/functions/vorhaben-payout-send/index.ts`:

```ts
// Edge Function: vorhaben-payout-send
// Sends one proposal payout line from the funder hot wallet (Röbel Münzen or xDAI on Gnosis).
// Called by the web app (cron + immediate dispatch) with the service-role key.
//
// SECURITY: amount, asset and recipient come from the payout line ROW, never from the body.
// claim_payout_line flips geplant → sendend atomically, so two callers can never both send.
//
// Secrets: FUNDER_PRIVKEY (shared with claim-reward), optional GNOSIS_RPC_URL.
// Auto: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createPublicClient, createWalletClient, http, getAddress } from "https://esm.sh/viem@2.21.0";
import { privateKeyToAccount } from "https://esm.sh/viem@2.21.0/accounts";
import { gnosis } from "https://esm.sh/viem@2.21.0/chains";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { toAtto } from "../_shared/payout-amount.ts";
import { floatDecision } from "../_shared/funder-float.ts";

const HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const GROUP_TOKEN_ID = BigInt("0xAc2CeCdBead594F97358a0d3132454f24F3E470c");
const hubAbi = [
  { type: "function", name: "safeTransferFrom", stateMutability: "nonpayable", inputs: [
    { name: "from", type: "address" }, { name: "to", type: "address" },
    { name: "id", type: "uint256" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" },
  ], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [
    { name: "a", type: "address" }, { name: "id", type: "uint256" },
  ], outputs: [{ type: "uint256" }] },
] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY, { auth: { persistSession: false } });

async function release(lineId: string, reason: string) {
  await db.rpc("release_payout_line", { p_line_id: lineId, p_error: reason });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (req.headers.get("authorization") !== `Bearer ${SERVICE_KEY}`) return json({ error: "unauthorized" }, 401);

  let lineId: string | undefined;
  try { ({ lineId } = await req.json()); } catch { return json({ error: "invalid_json" }, 400); }
  if (!lineId) return json({ error: "missing lineId" }, 400);

  const { data: claimed, error: claimErr } = await db.rpc("claim_payout_line", { p_line_id: lineId });
  if (claimErr) return json({ status: "failed", reason: claimErr.message }, 500);
  const line = (claimed as Array<Record<string, unknown>> | null)?.[0];
  if (!line) return json({ status: "skipped", reason: "line not geplant" });

  const rail = String(line.rail);
  if (rail !== "funder_muenzen" && rail !== "funder_xdai") {
    await release(lineId, `rail ${rail} is not a funder rail`);
    return json({ status: "failed", reason: "wrong rail" }, 400);
  }

  const pk = Deno.env.get("FUNDER_PRIVKEY");
  if (!pk) { await release(lineId, "funder_not_configured"); return json({ status: "failed", reason: "funder not configured" }, 500); }
  const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);

  let recipient: `0x${string}`;
  let amountAtto: bigint;
  try {
    recipient = getAddress(String(line.recipient_wallet));
    amountAtto = toAtto(String(line.amount));
  } catch (e) {
    await release(lineId, `invalid line: ${e instanceof Error ? e.message : String(e)}`);
    return json({ status: "failed", reason: "invalid line" }, 400);
  }

  const rpc = Deno.env.get("GNOSIS_RPC_URL") || "https://rpc.gnosischain.com";
  const pub = createPublicClient({ chain: gnosis, transport: http(rpc) });
  const [muenzenBal, xdaiBal] = await Promise.all([
    pub.readContract({ address: HUB, abi: hubAbi, functionName: "balanceOf", args: [account.address, GROUP_TOKEN_ID] }) as Promise<bigint>,
    pub.getBalance({ address: account.address }),
  ]);
  if (floatDecision(rail, amountAtto, muenzenBal, xdaiBal) === "float_low") {
    await release(lineId, "float_low");
    return json({ status: "float_low" });
  }

  const wallet = createWalletClient({ account, chain: gnosis, transport: http(rpc) });
  let hash: `0x${string}`;
  try {
    hash = rail === "funder_muenzen"
      ? await wallet.writeContract({ address: HUB, abi: hubAbi, functionName: "safeTransferFrom",
          args: [account.address, recipient, GROUP_TOKEN_ID, amountAtto, "0x"] })
      : await wallet.sendTransaction({ to: recipient, value: amountAtto });
  } catch (e) {
    // Nothing was broadcast (viem throws before returning a hash) → safe to put back.
    await release(lineId, `send failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
    return json({ status: "failed", reason: "send failed" }, 502);
  }

  // Store the hash before anything else can fail.
  await db.from("proposal_payout_lines").update({ status: "gesendet", tx_hash: hash, updated_at: new Date().toISOString() }).eq("id", lineId);
  await db.from("funder_ledger").insert({ direction: "payout", wallet: recipient, amount_atto: amountAtto.toString(), ref: `vorhaben:${lineId}`, tx_hash: hash });

  try {
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 45_000 });
    const status = receipt.status === "success" ? "bestaetigt" : "fehlgeschlagen";
    await db.from("proposal_payout_lines").update({ status, error: status === "fehlgeschlagen" ? "reverted" : null, updated_at: new Date().toISOString() }).eq("id", lineId);
    return json({ status, txHash: hash });
  } catch {
    // Receipt not seen yet; the web cron confirms gesendet lines later.
    return json({ status: "gesendet", txHash: hash });
  }
});
```

Check `funder_ledger` columns before deploying (`select column_name from information_schema.columns where table_name='funder_ledger';`). If `ref` or `direction` differ, adapt the insert to the real columns; if the table is missing, drop the insert.

- [ ] **Step 5: Run** `pnpm test:web` → PASS.

- [ ] **Step 6: Deploy and smoke-test**

Deploy with Supabase MCP `deploy_edge_function` (name `vorhaben-payout-send`, files `index.ts`, `../_shared/payout-amount.ts`, `../_shared/funder-float.ts` — mirror how other functions with `_shared` imports were deployed; set `verify_jwt: false` because the function checks the service key itself).

Smoke test with no real line (expect `skipped`):

```bash
curl -s -X POST "https://wwbeqhkslxdxhktqzqti.supabase.co/functions/v1/vorhaben-payout-send" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "content-type: application/json" \
  -d '{"lineId":"00000000-0000-0000-0000-000000000000"}'
```

Expected: `{"status":"skipped","reason":"line not geplant"}`. And without the header → `401`. (Take `SUPABASE_SERVICE_ROLE_KEY` from `apps/web/.env.local`; never echo it.)

- [ ] **Step 7: Commit**

```bash
git add apps/expo/supabase/functions/vorhaben-payout-send/index.ts apps/expo/supabase/functions/_shared/funder-float.ts apps/web/tests/vorhaben-funder-float.test.ts
git commit -m "feat(edge): funder payout rail for proposal payout lines"
git push
```

---

### Task 8: Dispatcher (funder + manual rails) and reconciliation

**Files:**
- Create: `apps/web/src/lib/vorhaben/rails/funder.ts`, `apps/web/src/lib/vorhaben/dispatch.ts`
- Test: `apps/web/tests/vorhaben-dispatch.test.ts`

**Interfaces:**
- Consumes: `repo.ts`, `notify.ts`, `settings.ts` (Task 6); edge fn (Task 7).
- Produces `rails/funder.ts`: `export async function sendViaFunder(lineId: string): Promise<{ status: string; txHash?: string; reason?: string }>;`
- Produces `dispatch.ts`:
  ```ts
  export interface DispatchDeps {
    db: Db;
    sendFunder: (lineId: string) => Promise<{ status: string; txHash?: string }>;
    proposeSafe: (lines: LineRow[]) => Promise<void>;          // Task 13; Phase 1 passes a no-op
    pollSafe: (line: LineRow) => Promise<void>;                 // Task 13; Phase 1 passes a no-op
    receiptStatus: (txHash: string) => Promise<"success" | "reverted" | "pending">;
    nowMs: () => number;
  }
  export async function dispatchLines(deps: DispatchDeps, lines: LineRow[]): Promise<void>;   // only status 'geplant'
  export async function reconcile(deps: DispatchDeps): Promise<void>;                          // gesendet / sendend / vorgeschlagen
  export async function afterLineSettled(db: Db, line: LineRow, proposalKey: string): Promise<void>; // task → ausgezahlt, notify
  export const UNKLAR_AFTER_MS = 10 * 60 * 1000;
  ```

- [ ] **Step 1: Write the failing test**

`apps/web/tests/vorhaben-dispatch.test.ts` — uses a tiny in-memory fake of the Supabase calls the dispatcher makes. Keep the fake in the test file:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchLines, reconcile, UNKLAR_AFTER_MS, type DispatchDeps } from "../src/lib/vorhaben/dispatch";
import type { LineRow } from "../src/lib/vorhaben/repo";

function line(p: Partial<LineRow>): LineRow {
  return { id: "l1", contract_id: "c1", proposal_id: "p1", role: "wahlhelfer", recipient_wallet: "0xaa", recipient_label: "Anna",
    amount: "10", asset: "MUENZEN", rail: "funder_muenzen", reference_type: "wahlhelfer", reference_id: "w1", status: "geplant",
    error: null, attempt_started_at: null, safe_tx_hash: null, safe_nonce: null, tx_hash: null, ...p };
}

/** Minimal chainable fake covering update().eq() and select().eq().maybeSingle(). */
function fakeDb(rows: LineRow[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const db = {
    updates,
    from(_table: string) {
      return {
        update(patch: Record<string, unknown>) {
          // Thenable that also allows a second .eq() (afterLineSettled filters by id AND status).
          return { eq: (_c: string, id: string) => {
            const done = Promise.resolve().then(() => { updates.push({ id, patch }); const r = rows.find((x) => x.id === id); if (r) Object.assign(r, patch); return { error: null }; });
            return Object.assign(done, { eq: () => done });
          } };
        },
        select() { return { eq: () => ({ maybeSingle: async () => ({ data: { proposal_id: "0xkey" }, error: null }) }), neq: () => ({ order: async () => ({ data: rows.filter((r) => r.status !== "bestaetigt"), error: null }) }) }; },
        insert: async () => ({ error: null }),
      };
    },
  };
  return db;
}

function deps(db: ReturnType<typeof fakeDb>, over: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    db: db as never,
    sendFunder: async () => ({ status: "bestaetigt", txHash: "0xhash" }),
    proposeSafe: async () => {}, pollSafe: async () => {},
    receiptStatus: async () => "success",
    nowMs: () => 1_000_000_000,
    ...over,
  };
}

test("funder lines go to the edge function once each", async () => {
  const db = fakeDb([line({})]);
  const calls: string[] = [];
  await dispatchLines(deps(db, { sendFunder: async (id) => { calls.push(id); return { status: "bestaetigt", txHash: "0xh" }; } }), [line({}), line({ id: "l2", status: "bestaetigt" })]);
  assert.deepEqual(calls, ["l1"]);
});

test("two concurrent dispatchers: the edge claim decides, second call is a skip", async () => {
  let claimed = false;
  const send = async () => { if (claimed) return { status: "skipped" }; claimed = true; return { status: "bestaetigt", txHash: "0xh" }; };
  const db = fakeDb([line({})]);
  const results = await Promise.all([dispatchLines(deps(db, { sendFunder: send }), [line({})]), dispatchLines(deps(db, { sendFunder: send }), [line({})])]);
  assert.equal(results.length, 2);
  assert.equal(claimed, true);
});

test("manual and EURC lines are never sent automatically", async () => {
  const calls: string[] = [];
  const db = fakeDb([]);
  await dispatchLines(deps(db, { sendFunder: async (id) => { calls.push(id); return { status: "x" }; } }),
    [line({ id: "m", rail: "manual_safe" }), line({ id: "e", rail: "safe_eurc_base" })]);
  assert.deepEqual(calls, []);
});

test("reconcile: gesendet + mined → bestaetigt; reverted → fehlgeschlagen", async () => {
  const rows = [line({ id: "a", status: "gesendet", tx_hash: "0x1" }), line({ id: "b", status: "gesendet", tx_hash: "0x2" })];
  const db = fakeDb(rows);
  await reconcile(deps(db, { receiptStatus: async (h) => (h === "0x1" ? "success" : "reverted") }));
  assert.equal(rows[0].status, "bestaetigt");
  assert.equal(rows[1].status, "fehlgeschlagen");
});

test("reconcile: a funder line stuck in sendend without hash becomes unklar, never re-sent", async () => {
  const old = new Date(1_000_000_000 - UNKLAR_AFTER_MS - 1).toISOString();
  const rows = [line({ id: "s", status: "sendend", attempt_started_at: old })];
  const db = fakeDb(rows);
  const calls: string[] = [];
  await reconcile(deps(db, { sendFunder: async (id) => { calls.push(id); return { status: "x" }; } }));
  assert.equal(rows[0].status, "unklar");
  assert.deepEqual(calls, []);
});
```

- [ ] **Step 2: Run** `pnpm test:web` → FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/lib/vorhaben/rails/funder.ts`:

```ts
/** Calls the vorhaben-payout-send edge function (the funder key lives only in Supabase). */
export async function sendViaFunder(lineId: string): Promise<{ status: string; txHash?: string; reason?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { status: "failed", reason: "supabase not configured" };
  try {
    const res = await fetch(`${url}/functions/v1/vorhaben-payout-send`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ lineId }),
      signal: AbortSignal.timeout(60_000),
    });
    return (await res.json()) as { status: string; txHash?: string; reason?: string };
  } catch (e) {
    // A timeout here may still have sent: the line is sendend/gesendet in the DB and reconcile handles it.
    return { status: "unknown", reason: e instanceof Error ? e.message : String(e) };
  }
}
```

`apps/web/src/lib/vorhaben/dispatch.ts`:

```ts
import type { LineRow } from "./repo";
import type { Db } from "./settings";
import { notify } from "./notify";

export interface DispatchDeps {
  db: Db;
  sendFunder: (lineId: string) => Promise<{ status: string; txHash?: string }>;
  proposeSafe: (lines: LineRow[]) => Promise<void>;
  pollSafe: (line: LineRow) => Promise<void>;
  receiptStatus: (txHash: string) => Promise<"success" | "reverted" | "pending">;
  nowMs: () => number;
}

export const UNKLAR_AFTER_MS = 10 * 60 * 1000;
const FUNDER = new Set(["funder_muenzen", "funder_xdai"]);

async function setStatus(db: Db, id: string, patch: Record<string, unknown>) {
  await db.from("proposal_payout_lines").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

export async function dispatchLines(deps: DispatchDeps, lines: LineRow[]): Promise<void> {
  const todo = lines.filter((l) => l.status === "geplant");
  // Funder rail: one at a time keeps the funder nonce sane.
  for (const l of todo.filter((x) => FUNDER.has(x.rail))) {
    const r = await deps.sendFunder(l.id);
    if (r.status === "bestaetigt") await afterLineSettled(deps.db, { ...l, status: "bestaetigt", tx_hash: r.txHash ?? null });
  }
  // Safe rail: one batched Safe tx per reference (task line + its platform fee).
  const safe = todo.filter((x) => x.rail === "safe_eure");
  const groups = new Map<string, LineRow[]>();
  for (const l of safe) groups.set(`${l.reference_type}:${l.reference_id}`, [...(groups.get(`${l.reference_type}:${l.reference_id}`) ?? []), l]);
  for (const g of groups.values()) await deps.proposeSafe(g);
  // manual_safe waits for a recorded hash; safe_eurc_base is not implemented yet.
}

export async function reconcile(deps: DispatchDeps): Promise<void> {
  const { data } = await deps.db.from("proposal_payout_lines").select("*").neq("status", "bestaetigt").order("created_at");
  const lines = (data ?? []) as LineRow[];
  for (const l of lines) {
    if (l.status === "gesendet" && l.tx_hash) {
      const s = await deps.receiptStatus(l.tx_hash);
      if (s === "success") { await setStatus(deps.db, l.id, { status: "bestaetigt", error: null }); l.status = "bestaetigt"; await afterLineSettled(deps.db, l); }
      if (s === "reverted") await setStatus(deps.db, l.id, { status: "fehlgeschlagen", error: "reverted" });
    } else if (l.status === "sendend" && FUNDER.has(l.rail) && !l.tx_hash) {
      const started = l.attempt_started_at ? new Date(l.attempt_started_at).getTime() : 0;
      if (deps.nowMs() - started > UNKLAR_AFTER_MS) {
        await setStatus(deps.db, l.id, { status: "unklar", error: "no tx hash after send attempt — check the funder history before resolving" });
        console.error(`[vorhaben] payout line ${l.id} is unklar; resolve manually`);
      }
    } else if (l.status === "sendend" || l.status === "vorgeschlagen") {
      if (l.rail === "safe_eure") await deps.pollSafe(l);
    }
  }
}

/** Side effects once a line is confirmed on-chain: task → ausgezahlt, recipient push. */
export async function afterLineSettled(db: Db, line: LineRow, proposalKeyOverride?: string): Promise<void> {
  if (line.role === "aufgabe") {
    await db.from("proposal_tasks").update({ status: "ausgezahlt", updated_at: new Date().toISOString() })
      .eq("id", line.reference_id).eq("status", "abgenommen");
  }
  if (line.rail === "safe_eure" || line.rail === "manual_safe") {
    if (line.tx_hash) await db.from("treasury_tx_links").upsert({ tx_hash: line.tx_hash.toLowerCase(), proposal_id: line.proposal_id }, { onConflict: "tx_hash", ignoreDuplicates: true });
  }
  if (!line.recipient_wallet || line.role === "plattform") return;
  let proposalKey = proposalKeyOverride;
  if (!proposalKey) {
    const { data } = await db.from("proposals").select("proposal_id").eq("id", line.proposal_id).maybeSingle();
    proposalKey = (data as { proposal_id: string } | null)?.proposal_id;
  }
  if (!proposalKey) return;
  const unit = line.asset === "MUENZEN" ? "Röbel Münzen" : line.asset === "XDAI" ? "xDAI" : "€";
  await notify(db, [{
    wallet: line.recipient_wallet, kind: "vorhaben_payout", screen: "vertrag", proposalKey,
    title: "Auszahlung angekommen",
    body: `${line.amount.replace(".", ",")} ${unit} sind bei dir angekommen.`,
  }]);
}
```

- [ ] **Step 4: Run** `pnpm test:web` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/vorhaben/rails/funder.ts apps/web/src/lib/vorhaben/dispatch.ts apps/web/tests/vorhaben-dispatch.test.ts
git commit -m "feat(web): payout dispatcher and reconciliation for proposal contracts"
git push
```

---

### Task 9: Lifecycle sync and the cron route

**Files:**
- Create: `apps/web/src/lib/vorhaben/sync.ts`
- Create: `apps/web/src/app/api/cron/vorhaben/route.ts`
- Modify: `apps/web/vercel.json` (add cron)
- Test: `apps/web/tests/vorhaben-sync.test.ts`

**Interfaces:**
- Consumes: `chain.ts`, `stage.ts`, `payout-plan.ts`, `repo.ts`, `notify.ts`, `dispatch.ts`, `settings.ts`.
- Produces `sync.ts`:
  ```ts
  export interface SyncDeps { db: Db; reader: ContractReader; settings: VorhabenSettings; nowMs: () => number;
    listAttesters: (r: ContractReader) => Promise<string[]>; }
  export interface SyncResult { stage: Stage; openedWindow: boolean; newLines: number; }
  export async function syncProposal(deps: SyncDeps, p: ProposalRow): Promise<SyncResult | null>; // null = skipped (not enabled / no chain id)
  ```
- Produces `GET /api/cron/vorhaben` (Bearer `CRON_SECRET`) → `{ synced: number, dispatched: boolean, errors: string[] }`.

Sync steps per proposal (in order):
1. Skip unless `vorhaben_enabled` and `blockchain_proposal_id`.
2. `readProposalOutcome`; update `proposals.state`, `for_votes`, `against_votes`, `abstain_votes`, `tally_address`, `last_synced_at` (also fixes the never-updated mirror).
3. `ensureContract`.
4. If `tallyPublished` and `tally_confirm_opened_at` is null: set `tally_confirm_opened_at = now`, `tally_confirm_until = now + windowDays`; `listAttesters` → upsert `proposal_wahlhelfer` rows (ignore duplicates); notify each Attester (`vorhaben_tally`, screen `auszaehlung`, title "Auszählung bestätigen", body `Vorschlag #N ist ausgezählt. Bitte bestätige das Ergebnis als Wahlhelfer:in.`).
5. If window open, `now - opened > 3 days`, and unconfirmed rows have `reminded_at` null: notify again ("Erinnerung: Auszählung bestätigen"), set `reminded_at`.
6. If outcome state ∈ {4,5,7} (accepted): if `budget_amount` → `insertLines(planBudgetLines(...))`; for every task with status `abgenommen` and no `aufgabe` line → `insertLines(planTaskLines(...))` (label via `displayNames`).
7. If stage resolves to `abgelehnt`: tasks not in (`abgenommen`,`ausgezahlt`,`abgebrochen`) → `abgebrochen` with a `task_activity` row (`kind: status_change`, body `Vorschlag wurde abgelehnt.`, actor `system`).
8. Load tasks + lines, `deriveStage`; if it differs from `lifecycle_stage`, update and insert `proposal_stage_events`.

- [ ] **Step 1: Write the failing test**

`apps/web/tests/vorhaben-sync.test.ts` — exercises the disabled no-op and window opening with a recording fake db. Write the fake so each `from(table)` returns chainable methods recording `{table, op, payload}` into an array and resolving reads from a seeded map:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { syncProposal, type SyncDeps } from "../src/lib/vorhaben/sync";
import type { ProposalRow } from "../src/lib/vorhaben/repo";
import type { ContractReader } from "../src/lib/vorhaben/chain";

type Op = { table: string; op: string; payload?: unknown };

function recordingDb(seed: Record<string, unknown[]>) {
  const ops: Op[] = [];
  const chain = (table: string, op: string, payload?: unknown) => {
    ops.push({ table, op, payload });
    const result = { data: seed[table] ?? [], error: null };
    const self: Record<string, unknown> = {
      eq: () => self, neq: () => self, in: () => self, is: () => self, order: () => self, lt: () => self,
      select: () => self,
      single: async () => ({ data: (seed[table] ?? [])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (seed[table] ?? [])[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => res(result),
    };
    return self;
  };
  return {
    ops,
    from: (table: string) => ({
      select: () => chain(table, "select"),
      update: (p: unknown) => chain(table, "update", p),
      insert: (p: unknown) => chain(table, "insert", p),
      upsert: (p: unknown) => chain(table, "upsert", p),
    }),
  };
}

const settings = { platformFeeBps: 500, platformSafe: "0xbcabbaa26420e0a4771808f9639d4176355e5d4b", wahlhelferAsset: "MUENZEN" as const,
  wahlhelferAmount: "10", budgetFeeRail: "funder_xdai" as const, windowDays: 7, dispatchEnabled: false };

const proposal: ProposalRow = { id: "p1", proposal_id: "0xkey", proposal_number: 3, title: "Spende", proposer_address: "0xprop",
  blockchain_proposal_id: "42", vorhaben_enabled: true, budget_amount: "150", budget_asset: "EURe", beneficiary_name: "Seglerverein",
  lifecycle_stage: "abstimmung", tally_confirm_opened_at: null, tally_confirm_until: null, tally_address: null };

const reader = (state: number, published: boolean): ContractReader => ({
  readContract: async ({ functionName }) => ({
    state, proposalDeadline: 100n, proposalPolls: [1n, "0x1", "0x2", "0x00000000000000000000000000000000000000aa", 100n],
    totalTallyResults: published ? 3n : 0n, tallyResults: [5n, true],
  } as Record<string, unknown>)[functionName],
});

test("a proposal without vorhaben_enabled is never touched", async () => {
  const db = recordingDb({});
  const r = await syncProposal({ db: db as never, reader: reader(4, true), settings, nowMs: () => 200_000, listAttesters: async () => ["0xa"] },
    { ...proposal, vorhaben_enabled: false });
  assert.equal(r, null);
  assert.equal(db.ops.length, 0);
});

test("published tally opens the window once and snapshots Attesters", async () => {
  const db = recordingDb({ proposal_contracts: [{ id: "c1", platform_fee_bps: 500, platform_safe_address: settings.platformSafe }] });
  const r = await syncProposal({ db: db as never, reader: reader(4, true), settings, nowMs: () => 200_000, listAttesters: async () => ["0xa", "0xb"] }, proposal);
  assert.ok(r);
  assert.equal(r!.openedWindow, true);
  const wahl = db.ops.find((o) => o.table === "proposal_wahlhelfer" && o.op === "upsert");
  assert.deepEqual((wahl!.payload as { attester_wallet: string }[]).map((x) => x.attester_wallet), ["0xa", "0xb"]);
  assert.equal(db.ops.filter((o) => o.table === "notifications" && o.op === "insert").length, 1);
  // accepted with budget → budget lines planned
  const lines = db.ops.find((o) => o.table === "proposal_payout_lines" && o.op === "upsert");
  assert.ok(lines, "budget lines inserted");
});

test("window already open → no second snapshot", async () => {
  const db = recordingDb({ proposal_contracts: [{ id: "c1", platform_fee_bps: 500, platform_safe_address: settings.platformSafe }] });
  await syncProposal({ db: db as never, reader: reader(4, true), settings, nowMs: () => 200_000, listAttesters: async () => ["0xa"] },
    { ...proposal, tally_confirm_opened_at: new Date(199_000).toISOString(), tally_confirm_until: new Date(199_000 + 7 * 86400_000).toISOString() });
  assert.equal(db.ops.filter((o) => o.table === "proposal_wahlhelfer" && o.op === "upsert").length, 0);
});

test("still voting → no window, no lines", async () => {
  const db = recordingDb({ proposal_contracts: [{ id: "c1", platform_fee_bps: 500, platform_safe_address: settings.platformSafe }] });
  const r = await syncProposal({ db: db as never, reader: reader(1, false), settings, nowMs: () => 50_000, listAttesters: async () => ["0xa"] }, proposal);
  assert.equal(r!.stage, "abstimmung");
  assert.equal(db.ops.filter((o) => o.table === "proposal_payout_lines").length, 0);
});
```

(`nowMs` is in ms; `proposalDeadline` 100n is seconds → 100_000 ms. 200_000 ms = after deadline; 50_000 ms = before.)

- [ ] **Step 2: Run** `pnpm test:web` → FAIL.

- [ ] **Step 3: Implement `sync.ts`**

```ts
import { readProposalOutcome, type ContractReader } from "./chain";
import type { Stage } from "./constants";
import { notify } from "./notify";
import { planBudgetLines, planTaskLines } from "./payout-plan";
import { displayNames, ensureContract, insertLines, type ProposalRow } from "./repo";
import type { Db, VorhabenSettings } from "./settings";
import { deriveStage } from "./stage";

export interface SyncDeps {
  db: Db;
  reader: ContractReader;
  settings: VorhabenSettings;
  nowMs: () => number;
  listAttesters: (r: ContractReader) => Promise<string[]>;
}
export interface SyncResult { stage: Stage; openedWindow: boolean; newLines: number }

const DAY_MS = 86_400_000;
const ACCEPTED = new Set([4, 5, 7]);

export async function syncProposal(deps: SyncDeps, p: ProposalRow): Promise<SyncResult | null> {
  if (!p.vorhaben_enabled || !p.blockchain_proposal_id) return null;
  const { db, settings } = deps;
  const now = deps.nowMs();
  const nowIso = new Date(now).toISOString();
  const o = await readProposalOutcome(deps.reader, BigInt(p.blockchain_proposal_id));

  await db.from("proposals").update({
    state: o.state, for_votes: o.forVotes.toString(), against_votes: o.againstVotes.toString(),
    abstain_votes: o.abstainVotes.toString(), tally_address: o.tallyAddress, last_synced_at: nowIso,
  }).eq("id", p.id);

  const contract = await ensureContract(db, p.id, settings);
  const fee = { bps: contract.platform_fee_bps, platformSafe: contract.platform_safe_address, budgetFeeRail: settings.budgetFeeRail };
  let openedWindow = false;
  let newLines = 0;

  // Wahlhelfer window
  if (o.tallyPublished && !p.tally_confirm_opened_at) {
    const until = new Date(now + settings.windowDays * DAY_MS).toISOString();
    await db.from("proposals").update({ tally_confirm_opened_at: nowIso, tally_confirm_until: until }).eq("id", p.id);
    const attesters = await deps.listAttesters(deps.reader);
    await db.from("proposal_wahlhelfer").upsert(
      attesters.map((w) => ({ proposal_id: p.id, attester_wallet: w })),
      { onConflict: "proposal_id,attester_wallet", ignoreDuplicates: true },
    );
    await notify(db, attesters.map((w) => ({
      wallet: w, kind: "vorhaben_tally" as const, screen: "auszaehlung" as const, proposalKey: p.proposal_id,
      title: "Auszählung bestätigen",
      body: `Vorschlag #${p.proposal_number} ist ausgezählt. Bitte bestätige das Ergebnis als Wahlhelfer:in.`,
    })));
    openedWindow = true;
  } else if (p.tally_confirm_opened_at && p.tally_confirm_until) {
    const opened = new Date(p.tally_confirm_opened_at).getTime();
    const until = new Date(p.tally_confirm_until).getTime();
    if (now - opened > 3 * DAY_MS && now < until) {
      const { data } = await db.from("proposal_wahlhelfer").select("id, attester_wallet")
        .eq("proposal_id", p.id).is("confirmed_at", null).is("reminded_at", null);
      const due = (data ?? []) as { id: string; attester_wallet: string }[];
      if (due.length) {
        await notify(db, due.map((d) => ({
          wallet: d.attester_wallet, kind: "vorhaben_tally" as const, screen: "auszaehlung" as const, proposalKey: p.proposal_id,
          title: "Erinnerung: Auszählung bestätigen",
          body: `Die Bestätigung für Vorschlag #${p.proposal_number} ist noch offen.`,
        })));
        for (const d of due) await db.from("proposal_wahlhelfer").update({ reminded_at: nowIso }).eq("id", d.id);
      }
    }
  }

  // Budget + approved task lines once accepted
  if (o.tallyPublished && ACCEPTED.has(o.state)) {
    if (p.budget_amount && p.budget_asset) {
      await insertLines(db, contract.id, p.id, planBudgetLines(
        { proposalId: p.id, beneficiary: p.beneficiary_name ?? "Empfänger", amount: String(p.budget_amount), asset: p.budget_asset }, fee));
      newLines += 2;
    }
    const { data: approved } = await db.from("proposal_tasks").select("id, assignee_wallet, reward_amount, reward_asset")
      .eq("proposal_id", p.id).eq("status", "abgenommen");
    const tasks = (approved ?? []) as { id: string; assignee_wallet: string; reward_amount: string; reward_asset: "EURe" | "EURC" }[];
    if (tasks.length) {
      const names = await displayNames(db, tasks.map((t) => t.assignee_wallet));
      for (const t of tasks) {
        await insertLines(db, contract.id, p.id, planTaskLines(
          { taskId: t.id, wallet: t.assignee_wallet, label: names.get(t.assignee_wallet) ?? "Unbekannt", amount: String(t.reward_amount), asset: t.reward_asset }, fee));
        newLines += 2;
      }
    }
  }

  // Stage
  const { data: taskRows } = await db.from("proposal_tasks").select("id, status").eq("proposal_id", p.id);
  const { data: lineRows } = await db.from("proposal_payout_lines").select("role, status").eq("proposal_id", p.id);
  const tasksNow = (taskRows ?? []) as { id: string; status: string }[];
  const linesNow = (lineRows ?? []) as { role: string; status: string }[];
  const stage = deriveStage({
    chainState: o.state, nowSec: Math.floor(now / 1000), deadlineSec: o.deadlineSec, tallyPublished: o.tallyPublished,
    taskStatuses: tasksNow.map((t) => t.status), lineStatuses: linesNow.map((l) => l.status),
    hasBudget: !!p.budget_amount, budgetLineConfirmed: linesNow.some((l) => l.role === "empfaenger" && l.status === "bestaetigt"),
  });

  if (stage === "abgelehnt") {
    for (const t of tasksNow.filter((x) => !["abgenommen", "ausgezahlt", "abgebrochen"].includes(x.status))) {
      await db.from("proposal_tasks").update({ status: "abgebrochen", updated_at: nowIso }).eq("id", t.id);
      await db.from("task_activity").insert({ task_id: t.id, actor_wallet: "system", kind: "status_change",
        body: "Vorschlag wurde abgelehnt.", from_status: t.status, to_status: "abgebrochen" });
    }
  }
  if (stage !== p.lifecycle_stage) {
    await db.from("proposals").update({ lifecycle_stage: stage }).eq("id", p.id);
    await db.from("proposal_stage_events").insert({ proposal_id: p.id, from_stage: p.lifecycle_stage, to_stage: stage });
  }
  return { stage, openedWindow, newLines };
}
```

- [ ] **Step 4: Implement the cron route**

`apps/web/src/app/api/cron/vorhaben/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { gnosis } from "viem/chains";
import { createAdminClient } from "@/lib/supabase/admin";
import { gnosisReader, listAttesters } from "@/lib/vorhaben/chain";
import { dispatchLines, reconcile, type DispatchDeps } from "@/lib/vorhaben/dispatch";
import { sendViaFunder } from "@/lib/vorhaben/rails/funder";
import { listActiveProposals, openLines } from "@/lib/vorhaben/repo";
import { loadSettings } from "@/lib/vorhaben/settings";
import { syncProposal } from "@/lib/vorhaben/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  const errors: string[] = [];
  const settings = await loadSettings(db);
  const reader = gnosisReader();

  let synced = 0;
  for (const p of await listActiveProposals(db)) {
    try {
      if (await syncProposal({ db, reader, settings, nowMs: Date.now, listAttesters }, p)) synced++;
    } catch (e) {
      errors.push(`sync ${p.proposal_number}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (settings.dispatchEnabled) {
    const pub = createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com", { batch: false }) });
    const deps: DispatchDeps = {
      db, sendFunder: sendViaFunder, nowMs: Date.now,
      proposeSafe: async () => {}, pollSafe: async () => {}, // wired in Task 13
      receiptStatus: async (hash) => {
        const r = await pub.getTransactionReceipt({ hash: hash as `0x${string}` }).catch(() => null);
        return !r ? "pending" : r.status === "success" ? "success" : "reverted";
      },
    };
    try {
      await dispatchLines(deps, await openLines(db));
      await reconcile(deps);
    } catch (e) {
      errors.push(`dispatch: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length) console.error("[cron/vorhaben]", errors);
  return NextResponse.json({ synced, dispatched: settings.dispatchEnabled, errors });
}
```

Add to `apps/web/vercel.json` `crons`: `{ "path": "/api/cron/vorhaben", "schedule": "*/5 * * * *" }`.

- [ ] **Step 5: Run** `pnpm test:web` → PASS. Then typecheck the touched files: `cd apps/web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p . 2>&1 | grep -E "vorhaben|cron/vorhaben" ` → no output.

- [ ] **Step 6: Local dry run against prod data (dispatch is off)**

```bash
cd apps/web && pnpm dev   # separate terminal
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/vorhaben
```

Expected: `{"synced":1,"dispatched":false,"errors":[]}`. Then MCP: `select lifecycle_stage, state, last_synced_at from proposals where proposal_number=3;` → `abstimmung`, state `1`, fresh `last_synced_at`; `select count(*) from proposal_payout_lines;` → `0`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/vorhaben/sync.ts apps/web/src/app/api/cron/vorhaben/route.ts apps/web/vercel.json apps/web/tests/vorhaben-sync.test.ts
git commit -m "feat(web): proposal lifecycle sync cron with Wahlhelfer window"
git push
```

---

### Task 10: Tally co-sign API

**Files:**
- Create: `apps/web/src/lib/vorhaben/tally-service.ts`
- Create: `apps/web/src/app/api/vorhaben/tally-confirm/route.ts`
- Test: `apps/web/tests/vorhaben-tally-service.test.ts`

**Interfaces:**
- Produces `tally-service.ts`:
  ```ts
  export interface TallyView { proposalId: string; proposalNumber: number; title: string; message: string;
    forVotes: string; againstVotes: string; abstainVotes: string; tallyAddress: string; until: string;
    eligible: boolean; confirmedAt: string | null; reward: { amount: string; asset: Asset }; }
  export interface TallyDeps { db: Db; reader: ContractReader; settings: VorhabenSettings; nowMs: () => number;
    verify: (wallet: string, message: string, signature: string) => Promise<boolean>;
    dispatch: (lineIds: string[]) => Promise<void>; }
  export async function getTallyView(deps: TallyDeps, proposalUuid: string, wallet: string): Promise<TallyView | { error: string; status: number }>;
  export async function submitTallyConfirmation(deps: TallyDeps, proposalUuid: string, wallet: string, signature: string):
    Promise<{ ok: true; lineIds: string[] } | { ok: false; status: number; code: string; message: string }>;
  ```
- Produces route: `GET /api/vorhaben/tally-confirm?proposalId=<uuid>&wallet=<0x…>` → `{ ok: true, data: TallyView }`; `POST /api/vorhaben/tally-confirm` body `{ proposalId, wallet, signature }` → `{ ok: true, data: { lineIds } }` or `{ ok: false, code, message }`.

Submit rules (in order): proposal exists and `vorhaben_enabled`; window open (`tally_confirm_until > now`); a `proposal_wahlhelfer` row exists for the wallet; not yet confirmed; tally still published; rebuild the message from fresh chain data; `verify` must be true; conditional update `confirmed_at IS NULL`; plan + insert Wahlhelfer lines; dispatch them if `dispatchEnabled`.

- [ ] **Step 1: Write the failing test**

`apps/web/tests/vorhaben-tally-service.test.ts` (reuse the `recordingDb` idea; seed `proposals`, `proposal_wahlhelfer`, `proposal_contracts`, `users`):

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { submitTallyConfirmation, type TallyDeps } from "../src/lib/vorhaben/tally-service";
import type { ContractReader } from "../src/lib/vorhaben/chain";

const NOW = 2_000_000_000;
const proposalRow = { id: "p1", proposal_id: "0xkey", proposal_number: 3, title: "Spende", proposer_address: "0xprop",
  blockchain_proposal_id: "42", vorhaben_enabled: true, budget_amount: "150", budget_asset: "EURe", beneficiary_name: "S",
  lifecycle_stage: "angenommen", tally_confirm_opened_at: new Date(NOW - 1000).toISOString(),
  tally_confirm_until: new Date(NOW + 86400_000).toISOString(), tally_address: "0x00000000000000000000000000000000000000aa" };

function db(seed: Record<string, unknown[]>, updated = { rows: 1 }) {
  const ops: Array<{ table: string; op: string; payload?: unknown }> = [];
  const q = (table: string, op: string, payload?: unknown) => {
    ops.push({ table, op, payload });
    const res = { data: op === "update" ? (updated.rows ? [{ id: "w1" }] : []) : seed[table] ?? [], error: null };
    const self: Record<string, unknown> = {
      eq: () => self, is: () => self, in: () => self, select: () => self,
      single: async () => ({ data: (seed[table] ?? [])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (seed[table] ?? [])[0] ?? null, error: null }),
      then: (r: (v: unknown) => unknown) => r(res),
    };
    return self;
  };
  return { ops, from: (t: string) => ({ select: () => q(t, "select"), update: (p: unknown) => q(t, "update", p), upsert: (p: unknown) => q(t, "upsert", p), insert: (p: unknown) => q(t, "insert", p) }) };
}

const reader = (forVotes: bigint): ContractReader => ({
  readContract: async ({ functionName, args }) => ({
    state: 4, proposalDeadline: 100n, proposalPolls: [1n, "0x1", "0x2", "0x00000000000000000000000000000000000000aa", 100n],
    totalTallyResults: 3n, tallyResults: [args?.[0] === 1n ? forVotes : 1n, true],
  } as Record<string, unknown>)[functionName],
});

const settings = { platformFeeBps: 500, platformSafe: "0xbcabbaa26420e0a4771808f9639d4176355e5d4b", wahlhelferAsset: "MUENZEN" as const,
  wahlhelferAmount: "10", budgetFeeRail: "funder_xdai" as const, windowDays: 7, dispatchEnabled: true };

const seed = () => ({ proposals: [proposalRow], proposal_wahlhelfer: [{ id: "w1", attester_wallet: "0xa", confirmed_at: null }],
  proposal_contracts: [{ id: "c1", platform_fee_bps: 500, platform_safe_address: settings.platformSafe }], users: [] });

function deps(d: ReturnType<typeof db>, over: Partial<TallyDeps> = {}): TallyDeps {
  return { db: d as never, reader: reader(5n), settings, nowMs: () => NOW, verify: async () => true, dispatch: async () => {}, ...over };
}

test("valid signature stores the confirmation and creates two lines", async () => {
  const d = db(seed());
  const r = await submitTallyConfirmation(deps(d), "p1", "0xA", "0xsig");
  assert.equal(r.ok, true);
  const lines = d.ops.find((o) => o.table === "proposal_payout_lines" && o.op === "upsert");
  assert.equal((lines!.payload as unknown[]).length, 2);
});

test("the server rebuilds the message from the chain: a mismatching signature is rejected", async () => {
  let signedFor = "";
  const d = db(seed());
  const r = await submitTallyConfirmation(deps(d, { verify: async (_w, m) => { signedFor = m; return false; } }), "p1", "0xa", "0xsig");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "BAD_SIGNATURE");
  assert.match(signedFor, /Ja 5,/);
  assert.equal(d.ops.some((o) => o.table === "proposal_payout_lines"), false);
});

test("not eligible, closed window and double confirm are refused", async () => {
  const notEligible = db({ ...seed(), proposal_wahlhelfer: [] });
  const r1 = await submitTallyConfirmation(deps(notEligible), "p1", "0xz", "0xsig");
  assert.equal(r1.ok, false); if (!r1.ok) assert.equal(r1.code, "NOT_ELIGIBLE");

  const closed = db({ ...seed(), proposals: [{ ...proposalRow, tally_confirm_until: new Date(NOW - 1).toISOString() }] });
  const r2 = await submitTallyConfirmation(deps(closed), "p1", "0xa", "0xsig");
  assert.equal(r2.ok, false); if (!r2.ok) assert.equal(r2.code, "WINDOW_CLOSED");

  const done = db({ ...seed(), proposal_wahlhelfer: [{ id: "w1", attester_wallet: "0xa", confirmed_at: "2026-10-05T00:00:00Z" }] });
  const r3 = await submitTallyConfirmation(deps(done), "p1", "0xa", "0xsig");
  assert.equal(r3.ok, false); if (!r3.ok) assert.equal(r3.code, "ALREADY_CONFIRMED");
});

test("lost race on the conditional update creates no lines", async () => {
  const d = db(seed(), { rows: 0 });
  const r = await submitTallyConfirmation(deps(d), "p1", "0xa", "0xsig");
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.code, "ALREADY_CONFIRMED");
  assert.equal(d.ops.some((o) => o.table === "proposal_payout_lines"), false);
});
```

- [ ] **Step 2: Run** `pnpm test:web` → FAIL.

- [ ] **Step 3: Implement `tally-service.ts`**

```ts
import { readProposalOutcome, type ContractReader } from "./chain";
import type { Asset } from "./constants";
import { planWahlhelferLines } from "./payout-plan";
import { displayNames, ensureContract, insertLines, type ProposalRow } from "./repo";
import type { Db, VorhabenSettings } from "./settings";
import { buildTallyConfirmMessage, tallyResultHash, type TallyFacts } from "./tally-message";

export interface TallyView {
  proposalId: string; proposalNumber: number; title: string; message: string;
  forVotes: string; againstVotes: string; abstainVotes: string; tallyAddress: string; until: string;
  eligible: boolean; confirmedAt: string | null; reward: { amount: string; asset: Asset };
}
export interface TallyDeps {
  db: Db; reader: ContractReader; settings: VorhabenSettings; nowMs: () => number;
  verify: (wallet: string, message: string, signature: string) => Promise<boolean>;
  dispatch: (lineIds: string[]) => Promise<void>;
}
type Fail = { ok: false; status: number; code: string; message: string };
const fail = (status: number, code: string, message: string): Fail => ({ ok: false, status, code, message });

async function loadFacts(deps: TallyDeps, proposalUuid: string): Promise<{ p: ProposalRow; facts: TallyFacts } | Fail> {
  const { data } = await deps.db.from("proposals").select("*").eq("id", proposalUuid).maybeSingle();
  const p = data as ProposalRow | null;
  if (!p || !p.vorhaben_enabled || !p.blockchain_proposal_id) return fail(404, "NOT_FOUND", "Vorschlag nicht gefunden.");
  if (!p.tally_confirm_until) return fail(409, "NOT_OPEN", "Die Auszählung ist noch nicht veröffentlicht.");
  const o = await readProposalOutcome(deps.reader, BigInt(p.blockchain_proposal_id));
  if (!o.tallyPublished || !o.tallyAddress) return fail(409, "NOT_OPEN", "Die Auszählung ist noch nicht veröffentlicht.");
  return { p, facts: { proposalId: BigInt(p.blockchain_proposal_id), proposalNumber: p.proposal_number, title: p.title,
    forVotes: o.forVotes, againstVotes: o.againstVotes, abstainVotes: o.abstainVotes, tallyAddress: o.tallyAddress } };
}

export async function getTallyView(deps: TallyDeps, proposalUuid: string, wallet: string): Promise<TallyView | { error: string; status: number }> {
  const loaded = await loadFacts(deps, proposalUuid);
  if ("ok" in loaded) return { error: loaded.message, status: loaded.status };
  const { p, facts } = loaded;
  const { data } = await deps.db.from("proposal_wahlhelfer").select("id, confirmed_at")
    .eq("proposal_id", p.id).eq("attester_wallet", wallet.toLowerCase()).maybeSingle();
  const row = data as { id: string; confirmed_at: string | null } | null;
  return {
    proposalId: p.id, proposalNumber: p.proposal_number, title: p.title, message: buildTallyConfirmMessage(facts),
    forVotes: facts.forVotes.toString(), againstVotes: facts.againstVotes.toString(), abstainVotes: facts.abstainVotes.toString(),
    tallyAddress: facts.tallyAddress, until: p.tally_confirm_until!, eligible: !!row, confirmedAt: row?.confirmed_at ?? null,
    reward: { amount: deps.settings.wahlhelferAmount, asset: deps.settings.wahlhelferAsset },
  };
}

export async function submitTallyConfirmation(deps: TallyDeps, proposalUuid: string, walletIn: string, signature: string):
  Promise<{ ok: true; lineIds: string[] } | Fail> {
  const wallet = walletIn.toLowerCase();
  const loaded = await loadFacts(deps, proposalUuid);
  if ("ok" in loaded) return loaded;
  const { p, facts } = loaded;
  if (new Date(p.tally_confirm_until!).getTime() <= deps.nowMs()) return fail(409, "WINDOW_CLOSED", "Die Bestätigungsfrist ist abgelaufen.");

  const { data } = await deps.db.from("proposal_wahlhelfer").select("id, attester_wallet, confirmed_at")
    .eq("proposal_id", p.id).eq("attester_wallet", wallet).maybeSingle();
  const row = data as { id: string; confirmed_at: string | null } | null;
  if (!row) return fail(403, "NOT_ELIGIBLE", "Du bist für diese Auszählung nicht als Wahlhelfer:in eingetragen.");
  if (row.confirmed_at) return fail(409, "ALREADY_CONFIRMED", "Du hast bereits bestätigt.");

  const message = buildTallyConfirmMessage(facts);
  if (!(await deps.verify(wallet, message, signature))) return fail(401, "BAD_SIGNATURE", "Die Signatur passt nicht zum Ergebnis.");

  const { data: won } = await deps.db.from("proposal_wahlhelfer")
    .update({ message, result_hash: tallyResultHash(facts), signature, confirmed_at: new Date(deps.nowMs()).toISOString() })
    .eq("id", row.id).is("confirmed_at", null).select("id");
  if (!won || (won as unknown[]).length === 0) return fail(409, "ALREADY_CONFIRMED", "Du hast bereits bestätigt.");

  const contract = await ensureContract(deps.db, p.id, deps.settings);
  const names = await displayNames(deps.db, [wallet]);
  const drafts = planWahlhelferLines(
    { wahlhelferId: row.id, wallet, label: names.get(wallet) ?? "Unbekannt", amount: deps.settings.wahlhelferAmount, asset: deps.settings.wahlhelferAsset },
    { bps: contract.platform_fee_bps, platformSafe: contract.platform_safe_address, budgetFeeRail: deps.settings.budgetFeeRail });
  await insertLines(deps.db, contract.id, p.id, drafts);

  const { data: lineRows } = await deps.db.from("proposal_payout_lines").select("id")
    .eq("reference_type", "wahlhelfer").eq("reference_id", row.id);
  const lineIds = ((lineRows ?? []) as { id: string }[]).map((l) => l.id);
  if (deps.settings.dispatchEnabled && lineIds.length) await deps.dispatch(lineIds);
  return { ok: true, lineIds };
}
```

- [ ] **Step 4: Implement the route**

`apps/web/src/app/api/vorhaben/tally-confirm/route.ts`:

```ts
import { NextRequest } from "next/server";
import { createPublicClient, http } from "viem";
import { gnosis } from "viem/chains";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonFail, jsonOk } from "@/lib/signed-request/verify";
import { verifyWalletSignature, VerifierUnavailableError } from "@/lib/signed-request/signature";
import { gnosisReader } from "@/lib/vorhaben/chain";
import { dispatchLines } from "@/lib/vorhaben/dispatch";
import { sendViaFunder } from "@/lib/vorhaben/rails/funder";
import { loadSettings } from "@/lib/vorhaben/settings";
import { getTallyView, submitTallyConfirmation, type TallyDeps } from "@/lib/vorhaben/tally-service";
import type { LineRow } from "@/lib/vorhaben/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

async function deps(): Promise<TallyDeps> {
  const db = createAdminClient();
  const settings = await loadSettings(db);
  const pub = createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com", { batch: false }) });
  return {
    db, settings, reader: gnosisReader(), nowMs: Date.now,
    verify: (w, m, s) => verifyWalletSignature(w, m, s),
    dispatch: async (ids) => {
      const { data } = await db.from("proposal_payout_lines").select("*").in("id", ids);
      await dispatchLines({
        db, sendFunder: sendViaFunder, nowMs: Date.now, proposeSafe: async () => {}, pollSafe: async () => {},
        receiptStatus: async (h) => { const r = await pub.getTransactionReceipt({ hash: h as `0x${string}` }).catch(() => null); return !r ? "pending" : r.status === "success" ? "success" : "reverted"; },
      }, (data ?? []) as LineRow[]);
    },
  };
}

export async function GET(req: NextRequest) {
  const proposalId = req.nextUrl.searchParams.get("proposalId") ?? "";
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "";
  if (!UUID_RE.test(proposalId) || !WALLET_RE.test(wallet)) return jsonFail(400, "BAD_REQUEST", "proposalId/wallet malformed");
  const view = await getTallyView(await deps(), proposalId, wallet);
  return "error" in view ? jsonFail(view.status, "UNAVAILABLE", view.error) : jsonOk(view);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { proposalId?: string; wallet?: string; signature?: string } | null;
  if (!body || !UUID_RE.test(body.proposalId ?? "") || !WALLET_RE.test(body.wallet ?? "") || !/^0x[0-9a-fA-F]+$/.test(body.signature ?? "")) {
    return jsonFail(400, "BAD_REQUEST", "proposalId/wallet/signature malformed");
  }
  try {
    const r = await submitTallyConfirmation(await deps(), body.proposalId!, body.wallet!, body.signature!);
    return r.ok ? jsonOk({ lineIds: r.lineIds }) : jsonFail(r.status, r.code, r.message);
  } catch (e) {
    if (e instanceof VerifierUnavailableError) return jsonFail(503, "VERIFY_UNAVAILABLE", "Signaturprüfung gerade nicht erreichbar. Bitte später erneut versuchen.");
    console.error("[vorhaben/tally-confirm]", e);
    return jsonFail(500, "INTERNAL", "Bestätigung fehlgeschlagen.");
  }
}
```

Note: the confirmation's `signature` is a signature over the human-readable message itself, so the route does **not** use the `roebel-*` signed-request grammar. Replay is harmless: the text names one proposal and one result, and the row is single-use.

- [ ] **Step 5: Run** `pnpm test:web` → PASS; tsc filter as in Task 9 → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/vorhaben/tally-service.ts apps/web/src/app/api/vorhaben/tally-confirm/route.ts apps/web/tests/vorhaben-tally-service.test.ts
git commit -m "feat(web): Wahlhelfer tally co-sign API with immediate Münzen payout"
git push
```

---

### Task 11: Expo — data layer, co-sign screen and profile duty card

**Files:**
- Create: `apps/expo/lib/vorhaben-labels.ts`, `apps/expo/lib/vorhaben.ts`
- Create: `apps/expo/app/auszaehlung/[proposalId].tsx`
- Create: `apps/expo/components/profile/TallyDutyCard.tsx`
- Modify: `apps/expo/app/profile.tsx` (insert card after `<ProfileCompletionCard user={user} />`)
- Modify: `apps/expo/app/_layout.tsx` (both notification branches), `apps/expo/app/notifications/index.tsx` (switch)
- Test: `apps/expo/lib/__tests__/vorhaben-labels.test.ts`

**Interfaces:**
- Produces `vorhaben-labels.ts`:
  ```ts
  export type Stage = 'abstimmung' | 'auszaehlung' | 'angenommen' | 'abgelehnt' | 'in_umsetzung' | 'umgesetzt';
  export type TaskStatus = 'offen' | 'vergeben' | 'in_arbeit' | 'eingereicht' | 'abgenommen' | 'ausgezahlt' | 'abgebrochen';
  export type LineStatus = 'geplant' | 'sendend' | 'vorgeschlagen' | 'gesendet' | 'bestaetigt' | 'unklar' | 'fehlgeschlagen';
  export const STAGE_STEPS: Stage[];            // ['abstimmung','auszaehlung','angenommen','in_umsetzung','umgesetzt']
  export const STAGE_LABELS: Record<Stage, string>;
  export const TASK_STATUS_LABELS: Record<TaskStatus, string>;
  export const LINE_STATUS_LABELS: Record<LineStatus, string>;
  export const ROLE_LABELS: Record<'empfaenger' | 'aufgabe' | 'wahlhelfer' | 'plattform', string>;
  export function formatAmount(amount: string | number, asset: 'EURe' | 'EURC' | 'MUENZEN' | 'XDAI'): string; // "5,00 €", "10 Röbel Münzen", "7,5 xDAI"
  export function nextStepFor(task: { status: TaskStatus; assignee_wallet: string | null }, wallet: string): string | null;
  export function timeLeft(untilIso: string, nowMs: number): string; // "noch 6 Tage", "noch 5 Stunden", "abgelaufen"
  ```
- Produces `vorhaben.ts`:
  ```ts
  export interface TallyDuty { proposalUuid: string; proposalKey: string; proposalNumber: number; title: string; until: string }
  export async function resolveProposalUuid(proposalKey: string): Promise<string | null>;
  export async function fetchOpenTallyDuties(wallet: string): Promise<TallyDuty[]>;
  export async function fetchTallyView(proposalUuid: string, wallet: string): Promise<ApiResult<TallyView>>;
  export async function submitTally(account: SigningAccount, proposalUuid: string, message: string): Promise<ApiResult<{ lineIds: string[] }>>;
  ```
  `TallyView` matches the web type from Task 10.

- [ ] **Step 1: Write the failing test**

`apps/expo/lib/__tests__/vorhaben-labels.test.ts`:

```ts
import { formatAmount, nextStepFor, timeLeft, STAGE_STEPS, STAGE_LABELS } from '../vorhaben-labels';

describe('vorhaben labels', () => {
  test('amounts in German format, Münzen never as euro', () => {
    expect(formatAmount('5', 'EURe')).toBe('5,00 €');
    expect(formatAmount('0.25', 'EURe')).toBe('0,25 €');
    expect(formatAmount('10', 'MUENZEN')).toBe('10 Röbel Münzen');
    expect(formatAmount('0.5', 'MUENZEN')).toBe('0,5 Röbel Münzen');
    expect(formatAmount('7.5', 'XDAI')).toBe('7,5 xDAI');
  });

  test('next step depends on status and who is looking', () => {
    expect(nextStepFor({ status: 'vergeben', assignee_wallet: '0xa' }, '0xA')).toBe('Aufgabe starten');
    expect(nextStepFor({ status: 'in_arbeit', assignee_wallet: '0xa' }, '0xa')).toBe('Fortschritt melden');
    expect(nextStepFor({ status: 'eingereicht', assignee_wallet: '0xa' }, '0xa')).toBe('Wartet auf Abnahme');
    expect(nextStepFor({ status: 'abgenommen', assignee_wallet: '0xa' }, '0xa')).toBe('Auszahlung läuft');
    expect(nextStepFor({ status: 'in_arbeit', assignee_wallet: '0xa' }, '0xb')).toBeNull();
  });

  test('time left', () => {
    const now = Date.UTC(2026, 9, 5, 12);
    expect(timeLeft(new Date(now + 6 * 86400_000 + 1000).toISOString(), now)).toBe('noch 6 Tage');
    expect(timeLeft(new Date(now + 5 * 3600_000 + 1000).toISOString(), now)).toBe('noch 5 Stunden');
    expect(timeLeft(new Date(now - 1).toISOString(), now)).toBe('abgelaufen');
  });

  test('every stepper stage has a label', () => {
    for (const s of STAGE_STEPS) expect(STAGE_LABELS[s]).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run** `cd apps/expo && npx jest lib/__tests__/vorhaben-labels.test.ts` → FAIL.

- [ ] **Step 3: Implement `vorhaben-labels.ts`**

```ts
// Pure labels and small decisions for the proposal lifecycle UI (German copy).
export type Stage = 'abstimmung' | 'auszaehlung' | 'angenommen' | 'abgelehnt' | 'in_umsetzung' | 'umgesetzt';
export type TaskStatus = 'offen' | 'vergeben' | 'in_arbeit' | 'eingereicht' | 'abgenommen' | 'ausgezahlt' | 'abgebrochen';
export type LineStatus = 'geplant' | 'sendend' | 'vorgeschlagen' | 'gesendet' | 'bestaetigt' | 'unklar' | 'fehlgeschlagen';
export type Asset = 'EURe' | 'EURC' | 'MUENZEN' | 'XDAI';

export const STAGE_STEPS: Stage[] = ['abstimmung', 'auszaehlung', 'angenommen', 'in_umsetzung', 'umgesetzt'];
export const STAGE_LABELS: Record<Stage, string> = {
  abstimmung: 'Abstimmung', auszaehlung: 'Auszählung', angenommen: 'Angenommen',
  abgelehnt: 'Abgelehnt', in_umsetzung: 'In Umsetzung', umgesetzt: 'Umgesetzt',
};
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  offen: 'Offen', vergeben: 'Vergeben', in_arbeit: 'In Arbeit', eingereicht: 'Wartet auf Abnahme',
  abgenommen: 'Abgenommen', ausgezahlt: 'Ausgezahlt', abgebrochen: 'Abgebrochen',
};
export const LINE_STATUS_LABELS: Record<LineStatus, string> = {
  geplant: 'Geplant', sendend: 'Wird gesendet', vorgeschlagen: 'Wartet auf Freigabe', gesendet: 'Gesendet',
  bestaetigt: 'Bestätigt', unklar: 'Wird geprüft', fehlgeschlagen: 'Fehlgeschlagen',
};
export const ROLE_LABELS = { empfaenger: 'Empfänger', aufgabe: 'Aufgabe', wahlhelfer: 'Wahlhelfer:in', plattform: 'Plattform' } as const;

const de = (n: number, min: number, max: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max });

export function formatAmount(amount: string | number, asset: Asset): string {
  const n = Number(amount);
  if (asset === 'EURe' || asset === 'EURC') return `${de(n, 2, 2)} €`;
  if (asset === 'MUENZEN') return `${de(n, 0, 2)} Röbel Münzen`;
  return `${de(n, 0, 4)} xDAI`;
}

export function nextStepFor(task: { status: TaskStatus; assignee_wallet: string | null }, wallet: string): string | null {
  if (!task.assignee_wallet || task.assignee_wallet.toLowerCase() !== wallet.toLowerCase()) return null;
  switch (task.status) {
    case 'vergeben': return 'Aufgabe starten';
    case 'in_arbeit': return 'Fortschritt melden';
    case 'eingereicht': return 'Wartet auf Abnahme';
    case 'abgenommen': return 'Auszahlung läuft';
    default: return null;
  }
}

export function timeLeft(untilIso: string, nowMs: number): string {
  const ms = new Date(untilIso).getTime() - nowMs;
  if (ms <= 0) return 'abgelaufen';
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return days === 1 ? 'noch 1 Tag' : `noch ${days} Tage`;
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return hours === 1 ? 'noch 1 Stunde' : `noch ${hours} Stunden`;
}
```

- [ ] **Step 4: Run** the jest test → PASS.

- [ ] **Step 5: Implement `vorhaben.ts` (Phase 1 part)**

```ts
// Proposal lifecycle data for the app. Reads go straight to Supabase (public tables);
// writes go to the web API (apps/web/src/app/api/vorhaben/*).
import { supabase } from './supabase';
import { getApiBaseUrl, type ApiResult, type SigningAccount } from './signed-request';
import type { Asset } from './vorhaben-labels';

export interface TallyDuty { proposalUuid: string; proposalKey: string; proposalNumber: number; title: string; until: string }
export interface TallyView {
  proposalId: string; proposalNumber: number; title: string; message: string;
  forVotes: string; againstVotes: string; abstainVotes: string; tallyAddress: string; until: string;
  eligible: boolean; confirmedAt: string | null; reward: { amount: string; asset: Asset };
}

async function getJson<T>(path: string): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`, { signal: controller.signal });
    return (await res.json()) as ApiResult<T>;
  } catch (err) {
    return { ok: false, code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Netzwerkfehler' };
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveProposalUuid(proposalKey: string): Promise<string | null> {
  const { data } = await supabase.from('proposals').select('id').eq('proposal_id', proposalKey).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function fetchOpenTallyDuties(wallet: string): Promise<TallyDuty[]> {
  const { data, error } = await supabase
    .from('proposal_wahlhelfer')
    .select('proposal_id, proposals!inner(proposal_id, proposal_number, title, tally_confirm_until)')
    .eq('attester_wallet', wallet.toLowerCase())
    .is('confirmed_at', null);
  if (error || !data) return [];
  const now = Date.now();
  return (data as any[])
    .map((r) => ({ proposalUuid: r.proposal_id, proposalKey: r.proposals.proposal_id, proposalNumber: r.proposals.proposal_number,
      title: r.proposals.title, until: r.proposals.tally_confirm_until }))
    .filter((d) => d.until && new Date(d.until).getTime() > now);
}

export function fetchTallyView(proposalUuid: string, wallet: string): Promise<ApiResult<TallyView>> {
  return getJson<TallyView>(`/api/vorhaben/tally-confirm?proposalId=${proposalUuid}&wallet=${wallet.toLowerCase()}`);
}

export async function submitTally(account: SigningAccount, proposalUuid: string, message: string): Promise<ApiResult<{ lineIds: string[] }>> {
  let signature: string;
  try {
    signature = await account.signMessage({ message });
  } catch (err) {
    return { ok: false, code: 'SIGN_FAILED', message: err instanceof Error ? err.message : 'Signatur abgebrochen' };
  }
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/vorhaben/tally-confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalId: proposalUuid, wallet: account.address.toLowerCase(), signature }),
    });
    return (await res.json()) as ApiResult<{ lineIds: string[] }>;
  } catch (err) {
    return { ok: false, code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Netzwerkfehler' };
  }
}
```

Before writing `fetchOpenTallyDuties`, check that `proposal_wahlhelfer.proposal_id` → `proposals` is the only FK between the two tables (it is; `!inner` embed is unambiguous). If PostgREST returns PGRST201, pin the embed with `proposals!proposal_wahlhelfer_proposal_id_fkey(...)`.

- [ ] **Step 6: Co-sign screen** `apps/expo/app/auszaehlung/[proposalId].tsx`

The route param is the **proposal key** (tx hash) like `/proposal/[id]`. Behaviour:
- Resolve uuid → `fetchTallyView(uuid, account.address)`.
- Loading: header + `ActivityIndicator`. Error: header + `MeckyNotFound` with the error message.
- Not eligible → info text "Du bist für diese Auszählung nicht als Wahlhelfer:in eingetragen." and a button "Zum Vorschlag".
- Already confirmed → success state "Danke, du hast das Ergebnis bestätigt." + "Zum Vertrag" button (→ `/vertrag/[proposalKey]`).
- Open: title "Auszählung bestätigen", proposal "#N Titel", a result card with three rows Ja/Nein/Enthaltung, line "Frist: {timeLeft}", a bordered box headed "Du unterschreibst:" with the exact `message` text (selectable), reward line "Als Dank erhältst du {formatAmount(reward)}.", primary button "Bestätigen und signieren" (disabled while busy). On success → success state "Danke, Wahlhelfer:in. {formatAmount(reward)} sind unterwegs." On `ok:false` → show `message` in an error banner.

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { useGoBack } from '@/hooks/useGoBack';
import { ChevronLeftIcon } from '@/components/icons';
import MeckyNotFound from '@/components/MeckyNotFound';
import { fetchTallyView, resolveProposalUuid, submitTally, type TallyView } from '@/lib/vorhaben';
import { formatAmount, timeLeft } from '@/lib/vorhaben-labels';

export default function TallyConfirmScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const goBack = useGoBack();
  const account = useActiveAccount();
  const { proposalId: proposalKey } = useLocalSearchParams<{ proposalId: string }>();
  const [uuid, setUuid] = useState<string | null>(null);
  const [view, setView] = useState<TallyView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    if (!proposalKey || !account) return;
    setError(null);
    const id = await resolveProposalUuid(proposalKey);
    if (!id) { setError('Vorschlag nicht gefunden'); return; }
    setUuid(id);
    const r = await fetchTallyView(id, account.address);
    if (r.ok) setView(r.data); else setError(r.message);
  }, [proposalKey, account]);

  useEffect(() => { load(); }, [load]);

  const confirm = async () => {
    if (!account || !uuid || !view) return;
    setBusy(true);
    setError(null);
    const r = await submitTally(account, uuid, view.message);
    setBusy(false);
    if (r.ok) setDone(true); else setError(r.message);
  };

  const header = (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <Pressable onPress={goBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Zurück">
        <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Auszählung bestätigen</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (error && !view) {
    return <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>{header}<MeckyNotFound title={error} /></SafeAreaView>;
  }
  if (!view) {
    return <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>{header}<ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /></SafeAreaView>;
  }

  const confirmed = done || !!view.confirmedAt;
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.kicker, { color: colors.textSecondary }]}>Vorschlag #{view.proposalNumber}</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{view.title}</Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[['Ja', view.forVotes], ['Nein', view.againstVotes], ['Enthaltung', view.abstainVotes]].map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
              <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{value}</Text>
            </View>
          ))}
        </View>

        {!view.eligible ? (
          <>
            <Text style={[styles.body, { color: colors.textSecondary }]}>Du bist für diese Auszählung nicht als Wahlhelfer:in eingetragen.</Text>
            <Pressable style={[styles.secondary, { borderColor: colors.border }]} onPress={() => router.replace(`/proposal/${proposalKey}` as any)}>
              <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Zum Vorschlag</Text>
            </Pressable>
          </>
        ) : confirmed ? (
          <>
            <Text style={[styles.success, { color: colors.success }]}>
              {done ? `Danke, Wahlhelfer:in. ${formatAmount(view.reward.amount, view.reward.asset)} sind unterwegs.` : 'Danke, du hast das Ergebnis bestätigt.'}
            </Text>
            <Pressable style={[styles.secondary, { borderColor: colors.border }]} onPress={() => router.replace(`/vertrag/${proposalKey}` as any)}>
              <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Zum Vertrag</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.body, { color: colors.textSecondary }]}>Frist: {timeLeft(view.until, Date.now())}</Text>
            <View style={[styles.quote, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.quoteHead, { color: colors.textSecondary }]}>Du unterschreibst:</Text>
              <Text selectable style={[styles.quoteText, { color: colors.textPrimary }]}>{view.message}</Text>
            </View>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Als Dank erhältst du {formatAmount(view.reward.amount, view.reward.asset)}.
            </Text>
            {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
            <Pressable disabled={busy} onPress={confirm}
              style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}
              accessibilityRole="button">
              {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Bestätigen und signieren</Text>}
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  kicker: { fontFamily: fontFamily.medium, fontSize: 13 },
  title: { fontFamily: fontFamily.heading, fontSize: 22, lineHeight: 28 },
  card: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  rowLabel: { fontFamily: fontFamily.regular, fontSize: 15 },
  rowValue: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21 },
  quote: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  quoteHead: { fontFamily: fontFamily.medium, fontSize: 12 },
  quoteText: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  error: { fontFamily: fontFamily.medium, fontSize: 14 },
  success: { fontFamily: fontFamily.semiBold, fontSize: 16, lineHeight: 22 },
  primary: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  secondary: { height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fontFamily.medium, fontSize: 15 },
});
```

Before using them, confirm the import paths exist: `grep -rn "export.*useGoBack" apps/expo/hooks`, `grep -rn "ChevronLeftIcon" apps/expo/components/icons* | head -2`, `grep -rn "export default.*MeckyNotFound" apps/expo/components`. Use the paths `app/proposal/[id].tsx` uses for the same three imports.

- [ ] **Step 7: Profile duty card** `apps/expo/components/profile/TallyDutyCard.tsx`

Same visual shell as `ProfileCompletionCard` (card, head, rows). Loads `fetchOpenTallyDuties(wallet)` on mount and on focus (`useFocusEffect` from `expo-router`); renders nothing when empty. Title "Auszählung bestätigen", each row: title `Vorschlag #N`, subtitle `{title} · {timeLeft(until)}`, press → `/auszaehlung/{proposalKey}`.

```tsx
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { softShadow } from '@/lib/shadow';
import { fetchOpenTallyDuties, type TallyDuty } from '@/lib/vorhaben';
import { timeLeft } from '@/lib/vorhaben-labels';

export default function TallyDutyCard({ wallet }: { wallet: string | undefined }) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [duties, setDuties] = useState<TallyDuty[]>([]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    if (wallet) fetchOpenTallyDuties(wallet).then((d) => { if (alive) setDuties(d); });
    return () => { alive = false; };
  }, [wallet]));

  if (duties.length === 0) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.background }, softShadow(2, isDark)]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Auszählung bestätigen</Text>
      <Text style={[styles.lead, { color: colors.textSecondary }]}>Als Wahlhelfer:in bestätigst du das Ergebnis.</Text>
      {duties.map((d, i) => (
        <Pressable key={d.proposalUuid} onPress={() => router.push(`/auszaehlung/${d.proposalKey}` as any)}
          accessibilityRole="button" accessibilityLabel={`Vorschlag ${d.proposalNumber} bestätigen`}
          style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, { opacity: pressed ? 0.7 : 1 }]}>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>Vorschlag #{d.proposalNumber}</Text>
            <Text numberOfLines={1} style={[styles.rowSubtitle, { color: colors.textSecondary }]}>{d.title} · {timeLeft(d.until, Date.now())}</Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, marginHorizontal: 16, marginTop: 16 },
  title: { fontFamily: fontFamily.semiBold, fontSize: 18, lineHeight: 24 },
  lead: { fontFamily: fontFamily.regular, fontSize: 13, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 20 },
  rowSubtitle: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  chevron: { fontFamily: fontFamily.regular, fontSize: 24, lineHeight: 26 },
});
```

In `apps/expo/app/profile.tsx`, after `<ProfileCompletionCard user={user} />` add:

```tsx
{hasAttesterNFT && <TallyDutyCard wallet={account?.address} />}
```

with `import TallyDutyCard from '@/components/profile/TallyDutyCard';`.

- [ ] **Step 8: Push deep links**

In `apps/expo/app/_layout.tsx`, add to **both** if/else chains (live listener and cold start), before the `org_invite` branch:

```tsx
} else if (data?.type === 'vorhaben' && data?.proposalId) {
  router.push(vorhabenRoute(data) as any);
```

and define once near the top of the file:

```tsx
function vorhabenRoute(data: { screen?: string; proposalId?: string; taskId?: string }): string {
  if (data.screen === 'auszaehlung') return `/auszaehlung/${data.proposalId}`;
  if (data.screen === 'aufgabe' && data.taskId) return `/aufgabe/${data.taskId}`;
  if (data.screen === 'vertrag') return `/vertrag/${data.proposalId}`;
  return `/proposal/${data.proposalId}`;
}
```

In `apps/expo/app/notifications/index.tsx` add to the `switch (data?.type)` — the inbox row stores `metadata` (`screen`, `proposal_id`, `task_id`), so map from those keys:

```tsx
case 'vorhaben_tally':
case 'vorhaben_task':
case 'vorhaben_payout':
case 'vorhaben_safe': {
  const m = item.metadata ?? {};
  if (m.screen === 'auszaehlung') router.push(`/auszaehlung/${m.proposal_id}` as any);
  else if (m.screen === 'aufgabe' && m.task_id) router.push(`/aufgabe/${m.task_id}` as any);
  else if (m.screen === 'vertrag') router.push(`/vertrag/${m.proposal_id}` as any);
  else router.push(`/proposal/${m.proposal_id}` as any);
  break;
}
```

Read lines 140–180 of `notifications/index.tsx` first to match the variable names actually used there (`item`, `data`, `metadata`); adapt the snippet to them.

- [ ] **Step 9: Verify**

Run `cd apps/expo && npx jest lib/__tests__/vorhaben-labels.test.ts` → PASS. Typecheck only the new/changed files: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p . 2>&1 | grep -E "vorhaben|auszaehlung|TallyDutyCard|profile.tsx|_layout.tsx|notifications/index"` → no new errors (compare with `git stash` baseline if anything shows). Grep: `grep -rn "@react-navigation/native" apps/expo/app/auszaehlung apps/expo/components/profile/TallyDutyCard.tsx` → nothing.

- [ ] **Step 10: Commit**

```bash
git add apps/expo/lib/vorhaben-labels.ts apps/expo/lib/vorhaben.ts apps/expo/lib/__tests__/vorhaben-labels.test.ts "apps/expo/app/auszaehlung/[proposalId].tsx" apps/expo/components/profile/TallyDutyCard.tsx apps/expo/app/profile.tsx apps/expo/app/_layout.tsx apps/expo/app/notifications/index.tsx
git commit -m "feat(expo): Wahlhelfer tally co-sign screen, profile duty card and push links"
git push
```

---

### Task 12: Phase 1 go-live checklist (no code)

- [ ] **Step 1:** Confirm Vercel production deployed the commits (MCP `list_deployments` for the web project, newest `READY` contains Task 10's sha). Confirm `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` exist for production (MCP `filter_project_envs`, names only — never decrypt).
- [ ] **Step 2:** Hit the production cron once: `curl -s -H "Authorization: Bearer $CRON_SECRET" https://www.roebel.app/api/cron/vorhaben` → `errors: []`.
- [ ] **Step 3:** Verify the platform Safe accepts Röbel Münzen (ERC-1155): MCP `execute_sql` cannot do this — instead run from `apps/web`: `npx tsx -e` with viem `readContract` of the Safe's `getStorageAt` fallback-handler slot `0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5`; non-zero → handler set (Safe's CompatibilityFallbackHandler implements `onERC1155Received`). If zero, set `platform_safe_address` fee lines on Münzen to wait: tell Max before enabling dispatch.
- [ ] **Step 4:** Report to Max: what is live, that `dispatch_enabled` is still `false`, the funder needs ≥ 8 xDAI, and that he must run the EAS update for the Expo screens. **Max flips** `update vorhaben_settings set value='true' where key='dispatch_enabled';` (or asks for it) once funded.

---

# Phase 2 — Tasks, Safe rail and the contract screen

### Task 13: Safe rail via proposer delegate

**Files:**
- Create: `apps/web/src/lib/vorhaben/rails/safe.ts`
- Create: `apps/web/src/lib/vorhaben/rails/safe-batch.ts` (pure: builds meta-transactions)
- Create: `apps/web/scripts/vorhaben-add-safe-delegate.mjs`
- Modify: `apps/web/src/app/api/cron/vorhaben/route.ts`, `apps/web/src/app/api/vorhaben/tally-confirm/route.ts` (wire `proposeSafe`/`pollSafe`)
- Test: `apps/web/tests/vorhaben-safe.test.ts`

**Interfaces:**
- Produces `safe-batch.ts`: `export function buildEureTransfers(lines: { recipient_wallet: string | null; amount: string; asset: string }[]): { to: string; value: "0"; data: `0x${string}` }[];` (throws if any line lacks a wallet or is not EURe)
- Produces `safe.ts`:
  ```ts
  export interface SafeRailDeps { db: Db; kit: SafeKit; nowMs: () => number; onchainNonce: () => Promise<number>;
    notifyOwners: (proposalId: string) => Promise<void>; }
  export interface SafeKit {
    nextNonce(): Promise<number>;
    hashFor(txs: { to: string; value: string; data: string }[], nonce: number): Promise<{ safeTxHash: string; safeTransactionData: Record<string, unknown> }>;
    propose(safeTxHash: string, safeTransactionData: Record<string, unknown>): Promise<void>;
    getTx(safeTxHash: string): Promise<{ isExecuted: boolean; isSuccessful: boolean | null; transactionHash: string | null } | null>;
  }
  export function realSafeKit(): SafeKit;   // api-kit + protocol-kit + GK_PROPOSER_DELEGATE_PRIVKEY
  export async function proposeSafeBatch(deps: SafeRailDeps, lines: LineRow[]): Promise<void>;
  export async function pollSafeLine(deps: SafeRailDeps, line: LineRow): Promise<void>;
  ```

Flow of `proposeSafeBatch`: claim every line with `claim_payout_line` (skip the batch if any claim returns 0 rows — release the others); `nonce = kit.nextNonce()`; `{safeTxHash, data} = kit.hashFor(buildEureTransfers(lines), nonce)`; store `safe_tx_hash`, `safe_nonce` on all lines **before** proposing; `kit.propose(...)`; set `vorgeschlagen`; `notifyOwners`. If propose throws: keep the stored hash, status stays `sendend` — `pollSafeLine` resolves it.

Flow of `pollSafeLine`: `tx = kit.getTx(safe_tx_hash)`.
- `tx` null and line `sendend` older than 10 min → `release`-style reset (`status geplant, safe_tx_hash null, safe_nonce null, error 'propose_failed'`).
- `tx` exists and line `sendend` → `vorgeschlagen`.
- `tx.isExecuted && tx.isSuccessful` → `tx_hash = transactionHash`, `bestaetigt`, `afterLineSettled`.
- `tx.isExecuted && !tx.isSuccessful` → `fehlgeschlagen`.
- not executed and `onchainNonce() > safe_nonce` → replaced → `fehlgeschlagen`, `error 'replaced'`, `console.error` alert.

- [ ] **Step 1: Write the failing test** `apps/web/tests/vorhaben-safe.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeFunctionData, parseAbi } from "viem";
import { buildEureTransfers } from "../src/lib/vorhaben/rails/safe-batch";
import { pollSafeLine, type SafeKit, type SafeRailDeps } from "../src/lib/vorhaben/rails/safe";
import type { LineRow } from "../src/lib/vorhaben/repo";

test("builds one EURe transfer per line with 18-decimal amounts", () => {
  const txs = buildEureTransfers([
    { recipient_wallet: "0x00000000000000000000000000000000000000bb", amount: "5", asset: "EURe" },
    { recipient_wallet: "0xbcabbaa26420e0a4771808f9639d4176355e5d4b", amount: "0.25", asset: "EURe" },
  ]);
  assert.equal(txs.length, 2);
  assert.equal(txs[0].to.toLowerCase(), "0x420ca0f9b9b604ce0fd9c18ef134c705e5fa3430");
  const d = decodeFunctionData({ abi: parseAbi(["function transfer(address,uint256)"]), data: txs[1].data });
  assert.equal(d.args[1], 25n * 10n ** 16n);
});

test("refuses lines without a wallet or with another asset", () => {
  assert.throws(() => buildEureTransfers([{ recipient_wallet: null, amount: "5", asset: "EURe" }]));
  assert.throws(() => buildEureTransfers([{ recipient_wallet: "0x00000000000000000000000000000000000000bb", amount: "5", asset: "MUENZEN" }]));
});

function line(p: Partial<LineRow>): LineRow {
  return { id: "l1", contract_id: "c", proposal_id: "p", role: "aufgabe", recipient_wallet: "0xbb", recipient_label: "Ben", amount: "5",
    asset: "EURe", rail: "safe_eure", reference_type: "task", reference_id: "t1", status: "vorgeschlagen", error: null,
    attempt_started_at: null, safe_tx_hash: "0xsafe", safe_nonce: 7, tx_hash: null, ...p };
}

function deps(tx: Awaited<ReturnType<SafeKit["getTx"]>>, onchain: number, rows: LineRow[]): SafeRailDeps {
  const kit: SafeKit = { nextNonce: async () => 7, hashFor: async () => ({ safeTxHash: "0xsafe", safeTransactionData: {} }), propose: async () => {}, getTx: async () => tx };
  return {
    kit, nowMs: () => 1e12, onchainNonce: async () => onchain, notifyOwners: async () => {},
    db: { from: () => ({ update: (patch: Record<string, unknown>) => ({ eq: (_c: string, id: string) => {
        const done = Promise.resolve().then(() => { const r = rows.find((x) => x.id === id); if (r) Object.assign(r, patch); return { error: null }; });
        return Object.assign(done, { eq: () => done });
      } }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { proposal_id: "0xkey" }, error: null }) }) }),
      upsert: async () => ({ error: null }), insert: async () => ({ error: null }) }) } as never,
  };
}

test("executed successfully → bestaetigt with the execution hash", async () => {
  const rows = [line({})];
  await pollSafeLine(deps({ isExecuted: true, isSuccessful: true, transactionHash: "0xexec" }, 8, rows), rows[0]);
  assert.equal(rows[0].status, "bestaetigt");
  assert.equal(rows[0].tx_hash, "0xexec");
});

test("nonce used by another tx → fehlgeschlagen (replaced)", async () => {
  const rows = [line({})];
  await pollSafeLine(deps({ isExecuted: false, isSuccessful: null, transactionHash: null }, 8, rows), rows[0]);
  assert.equal(rows[0].status, "fehlgeschlagen");
  assert.equal(rows[0].error, "replaced");
});

test("still pending at the current nonce → unchanged", async () => {
  const rows = [line({})];
  await pollSafeLine(deps({ isExecuted: false, isSuccessful: null, transactionHash: null }, 7, rows), rows[0]);
  assert.equal(rows[0].status, "vorgeschlagen");
});
```

- [ ] **Step 2: Run** `pnpm test:web` → FAIL.

- [ ] **Step 3: Implement `safe-batch.ts`**

```ts
import { encodeFunctionData, getAddress, parseAbi } from "viem";
import { EURE } from "../constants";
import { toAtto } from "../money";

const erc20 = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

export function buildEureTransfers(lines: { recipient_wallet: string | null; amount: string; asset: string }[]) {
  return lines.map((l) => {
    if (l.asset !== "EURe") throw new Error(`safe_eure line with asset ${l.asset}`);
    if (!l.recipient_wallet) throw new Error("safe_eure line without recipient wallet");
    return {
      to: EURE as string,
      value: "0" as const,
      data: encodeFunctionData({ abi: erc20, functionName: "transfer", args: [getAddress(l.recipient_wallet), toAtto(l.amount)] }),
    };
  });
}
```

- [ ] **Step 4: Implement `safe.ts`**

```ts
import SafeApiKit from "@safe-global/api-kit";
import Safe from "@safe-global/protocol-kit";
import { privateKeyToAccount } from "viem/accounts";
import { ATTESTER_SAFE, CHAIN_ID } from "../constants";
import { afterLineSettled } from "../dispatch";
import type { LineRow } from "../repo";
import type { Db } from "../settings";
import { buildEureTransfers } from "./safe-batch";

export interface SafeKit {
  nextNonce(): Promise<number>;
  hashFor(txs: { to: string; value: string; data: string }[], nonce: number): Promise<{ safeTxHash: string; safeTransactionData: Record<string, unknown> }>;
  propose(safeTxHash: string, safeTransactionData: Record<string, unknown>): Promise<void>;
  getTx(safeTxHash: string): Promise<{ isExecuted: boolean; isSuccessful: boolean | null; transactionHash: string | null } | null>;
}
export interface SafeRailDeps {
  db: Db; kit: SafeKit; nowMs: () => number; onchainNonce: () => Promise<number>;
  notifyOwners: (proposalId: string) => Promise<void>;
}
const STALE_MS = 10 * 60 * 1000;

export function realSafeKit(): SafeKit {
  const apiKey = process.env.SAFE_API_KEY;
  const pk = process.env.GK_PROPOSER_DELEGATE_PRIVKEY;
  if (!apiKey || !pk) throw new Error("SAFE_API_KEY / GK_PROPOSER_DELEGATE_PRIVKEY not set");
  const delegate = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`);
  const api = new SafeApiKit({ chainId: BigInt(CHAIN_ID), apiKey });
  const rpc = process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com";
  return {
    nextNonce: async () => Number(await api.getNextNonce(ATTESTER_SAFE)),
    hashFor: async (txs, nonce) => {
      const safe = await Safe.init({ provider: rpc, safeAddress: ATTESTER_SAFE });
      const tx = await safe.createTransaction({ transactions: txs, options: { nonce } }); // >1 tx → MultiSend
      return { safeTxHash: await safe.getTransactionHash(tx), safeTransactionData: tx.data as unknown as Record<string, unknown> };
    },
    propose: async (safeTxHash, safeTransactionData) => {
      const senderSignature = await delegate.signMessage({ message: { raw: safeTxHash as `0x${string}` } });
      await api.proposeTransaction({
        safeAddress: ATTESTER_SAFE, safeTransactionData: safeTransactionData as never, safeTxHash,
        senderAddress: delegate.address, senderSignature, origin: "Röbel App – Vorschlags-Auszahlung",
      });
    },
    getTx: async (safeTxHash) => {
      try {
        const t = await api.getTransaction(safeTxHash);
        return { isExecuted: !!t.isExecuted, isSuccessful: t.isSuccessful ?? null, transactionHash: t.transactionHash ?? null };
      } catch { return null; }
    },
  };
}

async function patch(db: Db, id: string, p: Record<string, unknown>) {
  await db.from("proposal_payout_lines").update({ ...p, updated_at: new Date().toISOString() }).eq("id", id);
}

export async function proposeSafeBatch(deps: SafeRailDeps, lines: LineRow[]): Promise<void> {
  const claimed: LineRow[] = [];
  for (const l of lines) {
    const { data } = await deps.db.rpc("claim_payout_line", { p_line_id: l.id });
    if ((data as unknown[] | null)?.length) claimed.push(l);
  }
  if (claimed.length !== lines.length) {
    for (const l of claimed) await deps.db.rpc("release_payout_line", { p_line_id: l.id, p_error: "batch_incomplete" });
    return;
  }
  const nonce = await deps.kit.nextNonce();
  const { safeTxHash, safeTransactionData } = await deps.kit.hashFor(buildEureTransfers(lines), nonce);
  for (const l of lines) await patch(deps.db, l.id, { safe_tx_hash: safeTxHash, safe_nonce: nonce });
  await deps.kit.propose(safeTxHash, safeTransactionData); // throws → stays sendend; pollSafeLine resolves
  for (const l of lines) await patch(deps.db, l.id, { status: "vorgeschlagen" });
  await deps.notifyOwners(lines[0].proposal_id);
}

export async function pollSafeLine(deps: SafeRailDeps, line: LineRow): Promise<void> {
  if (!line.safe_tx_hash) return;
  const tx = await deps.kit.getTx(line.safe_tx_hash);
  if (!tx) {
    const started = line.attempt_started_at ? new Date(line.attempt_started_at).getTime() : 0;
    if (line.status === "sendend" && deps.nowMs() - started > STALE_MS) {
      await patch(deps.db, line.id, { status: "geplant", safe_tx_hash: null, safe_nonce: null, error: "propose_failed" });
    }
    return;
  }
  if (tx.isExecuted) {
    if (tx.isSuccessful && tx.transactionHash) {
      await patch(deps.db, line.id, { status: "bestaetigt", tx_hash: tx.transactionHash, error: null });
      await afterLineSettled(deps.db, { ...line, status: "bestaetigt", tx_hash: tx.transactionHash });
    } else {
      await patch(deps.db, line.id, { status: "fehlgeschlagen", error: "reverted" });
    }
    return;
  }
  if (line.safe_nonce !== null && (await deps.onchainNonce()) > line.safe_nonce) {
    await patch(deps.db, line.id, { status: "fehlgeschlagen", error: "replaced" });
    console.error(`[vorhaben] Safe tx ${line.safe_tx_hash} was replaced at nonce ${line.safe_nonce}`);
    return;
  }
  if (line.status === "sendend") await patch(deps.db, line.id, { status: "vorgeschlagen" });
}
```

Check the installed api-kit v5 signatures before running: `grep -n "getNextNonce\|proposeTransaction\|getTransaction(" apps/web/node_modules/@safe-global/api-kit/dist/src/SafeApiKit.d.ts`. If `getNextNonce` returns a string, the `Number()` already handles it.

- [ ] **Step 5: Wire into the cron and tally route**

In both route files, replace `proposeSafe: async () => {}, pollSafe: async () => {}` with:

```ts
proposeSafe: (lines) => proposeSafeBatch(safeDeps, lines),
pollSafe: (line) => pollSafeLine(safeDeps, line),
```

where (built only if `SAFE_API_KEY` and `GK_PROPOSER_DELEGATE_PRIVKEY` are set; otherwise keep the no-ops and log once):

```ts
const safeDeps: SafeRailDeps = {
  db, kit: realSafeKit(), nowMs: Date.now,
  onchainNonce: async () => Number(await pub.readContract({ address: ATTESTER_SAFE, abi: parseAbi(["function nonce() view returns (uint256)"]), functionName: "nonce" })),
  notifyOwners: async (proposalUuid) => {
    const owners = (await pub.readContract({ address: ATTESTER_SAFE, abi: parseAbi(["function getOwners() view returns (address[])"]), functionName: "getOwners" })) as string[];
    const { data } = await db.from("proposals").select("proposal_id, proposal_number").eq("id", proposalUuid).maybeSingle();
    if (!data) return;
    await notify(db, owners.map((w) => ({ wallet: w, kind: "vorhaben_safe" as const, screen: "vertrag" as const, proposalKey: (data as any).proposal_id,
      title: "Auszahlung freigeben", body: `Für Vorschlag #${(data as any).proposal_number} wartet eine Auszahlung auf deine Signatur in der Gemeinschaftskasse.` })));
  },
};
```

- [ ] **Step 6: Delegate registration script** `apps/web/scripts/vorhaben-add-safe-delegate.mjs`

```js
// One-time: registers the server's proposer key as a delegate of the Attester Safe in the
// Safe Transaction Service. A delegate can QUEUE transactions only — never sign or execute.
// Run by a Safe owner (Max) locally:
//   OWNER_PRIVKEY=0x… DELEGATE_ADDRESS=0x… SAFE_API_KEY=… node apps/web/scripts/vorhaben-add-safe-delegate.mjs
// The owner key is read from the env of this one command and never stored.
import SafeApiKit from "@safe-global/api-kit";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { gnosis } from "viem/chains";

const SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa";
const { OWNER_PRIVKEY, DELEGATE_ADDRESS, SAFE_API_KEY } = process.env;
if (!OWNER_PRIVKEY || !DELEGATE_ADDRESS || !SAFE_API_KEY) {
  console.error("OWNER_PRIVKEY, DELEGATE_ADDRESS and SAFE_API_KEY are required");
  process.exit(1);
}
const owner = privateKeyToAccount(OWNER_PRIVKEY);
const signer = createWalletClient({ account: owner, chain: gnosis, transport: http("https://rpc.gnosischain.com") });
const api = new SafeApiKit({ chainId: 100n, apiKey: SAFE_API_KEY });
await api.addSafeDelegate({ safeAddress: SAFE, delegateAddress: DELEGATE_ADDRESS, delegatorAddress: owner.address, label: "Röbel App Auszahlungen", signer });
console.log("delegates:", (await api.getSafeDelegates({ safeAddress: SAFE })).results.map((d) => d.delegate));
```

Verify against the installed api-kit types that `addSafeDelegate` accepts a viem `WalletClient` as `signer` (`grep -n "addSafeDelegate" -A 12 apps/web/node_modules/@safe-global/api-kit/dist/src/types/safeTransactionServiceTypes.d.ts`). If it expects an ethers `Signer`, switch the script to `new ethers.Wallet(OWNER_PRIVKEY)` (ethers v6 is a web dependency). Generate the delegate key with `node -e "console.log(require('viem/accounts').generatePrivateKey())"` — **hand it to Max** to store as Vercel secret `GK_PROPOSER_DELEGATE_PRIVKEY`; never commit it, never print it into a file.

- [ ] **Step 7: Run** `pnpm test:web` → PASS; tsc filter clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/vorhaben/rails/safe.ts apps/web/src/lib/vorhaben/rails/safe-batch.ts apps/web/scripts/vorhaben-add-safe-delegate.mjs apps/web/src/app/api/cron/vorhaben/route.ts apps/web/src/app/api/vorhaben/tally-confirm/route.ts apps/web/tests/vorhaben-safe.test.ts
git commit -m "feat(web): EURe task payouts queued on the treasury Safe via proposer delegate"
git push
```

---

### Task 14: Signed scope for vorhaben actions + task API

**Files:**
- Modify: `apps/web/src/lib/signed-request/message.ts`, `apps/web/src/lib/signed-request/verify.ts`
- Modify: `apps/expo/lib/signed-request.ts`
- Create: `apps/web/src/lib/vorhaben/rails/manual.ts`, `apps/web/src/lib/vorhaben/task-service.ts`
- Create: `apps/web/src/app/api/vorhaben/tasks/route.ts`
- Test: extend `apps/web/src/lib/signed-request/message.test.ts`; create `apps/web/tests/vorhaben-task-service.test.ts`

**Interfaces:**
- `message.ts` adds `export const VORHABEN_SCOPE = "roebel-vorhaben-v1" as const;` and `export type VorhabenAction = "task_create" | "task_apply" | "task_withdraw" | "task_assign" | "task_start" | "task_comment" | "task_proof" | "task_submit" | "task_approve" | "task_request_changes" | "task_cancel" | "payout_record_manual";`
- `verifySignedRequest<A extends string = TicketAction>(body, opts: { actions: readonly A[]; scope?: string; headers?; bearerAuth?; requireSignature? }): Promise<VerifyOk<A> | VerifyFail>` — `scope` defaults to `SIGNED_SCOPE`. Existing callers compile unchanged.
- Expo `signed-request.ts`: `postSigned<T>(path, account, action, payload, scope = SIGNED_SCOPE)`; `buildSignedMessage(action, wallet, ts, payload, scope = SIGNED_SCOPE)`; action type widened to `TicketAction | VorhabenAction` (export `VorhabenAction` with the same union).
- `task-service.ts`:
  ```ts
  export interface TaskDeps { db: Db; isAttester: (wallet: string) => Promise<boolean>; nowMs: () => number;
    settings: VorhabenSettings; verifyManualTx: (txHash: string, amount: string) => Promise<boolean>;
    dispatch: (lineIds: string[]) => Promise<void>; }
  export async function handleVorhabenAction(deps: TaskDeps, wallet: string, action: VorhabenAction, payload: Record<string, unknown>):
    Promise<{ ok: true; data: unknown } | { ok: false; status: number; code: string; message: string }>;
  ```
- `rails/manual.ts`: `export async function verifyManualSafeTransfer(txHash: string, amount: string): Promise<boolean>;` — receipt success, and one EURe `Transfer` log with `from == ATTESTER_SAFE` and `value == toAtto(amount)`.

Payload contracts per action (all ids uuid, strings trimmed, validated in the service):
- `task_create`: `{ proposalId, title (3–140), description (≤4000), criteria: string[] (1–10, each ≤200), rewardAmount: "\d+(\.\d{1,2})?" > 0, rewardAsset: "EURe", deadline?: ISO }` — actor is proposer or Attester; proposal `vorhaben_enabled`, stage not `abgelehnt`/`umgesetzt`.
- `task_apply` `{ taskId, note ≤1000 }`; `task_withdraw` `{ taskId }`; `task_assign` `{ taskId, applicant }`; `task_start` `{ taskId }`;
- `task_comment` `{ taskId, body }`; `task_proof` `{ taskId, body?, attachments: [{type:'image'|'pdf'|'tx', url?|hash?}] (1–5) }`; `task_submit` `{ taskId }`;
- `task_approve` `{ taskId }`; `task_request_changes` `{ taskId, body }`; `task_cancel` `{ taskId, body }`;
- `payout_record_manual` `{ lineId, txHash }` — actor must be an Attester; line `role empfaenger`, `rail manual_safe`, status `geplant`; `verifyManualTx` true → `tx_hash`, `bestaetigt`, `afterLineSettled`.

Every state-changing action writes one `task_activity` row (`status_change` with from/to, or `comment`/`proof`) and updates `proposal_tasks.updated_at`. Status updates are conditional (`.eq("status", current)`) so a race loses cleanly (`CONFLICT`). `task_assign` sets `assignee_wallet`, `assigned_by_wallet`, marks that application `angenommen` and the others `abgelehnt`. `task_approve` sets `approved_by_wallet`; if the proposal is accepted (`lifecycle_stage` in `angenommen`/`in_umsetzung`), plan + insert task lines and `dispatch` them; otherwise the cron creates them on acceptance. Notifications: `task_apply` → proposer (`vorhaben_task`, "Neue Bewerbung"); `task_assign` → assignee ("Aufgabe an dich vergeben"); `task_submit` → all Attesters except assignee ("Aufgabe wartet auf Abnahme", via `listAttesters`); `task_request_changes`/`task_approve` → assignee.

- [ ] **Step 1: Failing tests**

Extend `apps/web/src/lib/signed-request/message.test.ts`:

```ts
import { VORHABEN_SCOPE } from "./message";
test("vorhaben scope produces a distinct message", () => {
  assert.equal(buildSignedMessage(VORHABEN_SCOPE, "task_apply", "0xABC", 1700000000, {}).startsWith("roebel-vorhaben-v1:task_apply:0xabc:"), true);
});
```

Create `apps/web/tests/vorhaben-task-service.test.ts` covering (with the same recording-db pattern as Task 9/10; seed `proposal_tasks`, `proposals`, `task_applications`, `task_activity`):
1. `task_apply` by a fresh wallet → `ok`, inserts one `task_applications` row and one notification to the proposer.
2. `task_assign` by the proposer for a wallet that did not apply → `NOT_AN_APPLICANT`, no update.
3. `task_assign` when the proposer applied, actor = proposer → `FORBIDDEN`; actor = Attester (isAttester true) → ok, update payload has `status: "vergeben"` and `assignee_wallet`.
4. `task_approve` by the assignee who is also an Attester → `SELF_APPROVE`.
5. `task_approve` on an accepted proposal → inserts 2 payout lines (`aufgabe` 5 EURe + `plattform` 0.25 EURe on `safe_eure`) and calls `dispatch`.
6. `task_create` with `rewardAmount: "5.123"` → `BAD_REQUEST`.
7. `payout_record_manual` with `verifyManualTx` false → `BAD_TX`, line unchanged.

Write each as a concrete `test(...)` with seeded rows and asserted ops, mirroring Task 10's test style.

- [ ] **Step 2: Run** `pnpm test:web` and `cd apps/web && npx tsx --test src/lib/signed-request/message.test.ts` → FAIL.

- [ ] **Step 3: Implement the scope changes**

`message.ts`: add `VORHABEN_SCOPE` and `VorhabenAction` exactly as in Interfaces. `verify.ts`: make the function generic, replace `scope !== SIGNED_SCOPE` with `scope !== (opts.scope ?? SIGNED_SCOPE)`, and build the message with `opts.scope ?? SIGNED_SCOPE`. Types: `VerifyOk<A extends string = TicketAction> = { ok: true; wallet: string; action: A; payload: Record<string, unknown> }`.

Expo `signed-request.ts`: add `export type VorhabenAction = …` (same union), `export const VORHABEN_SCOPE = 'roebel-vorhaben-v1';`, thread an optional `scope: string = SIGNED_SCOPE` parameter through `buildSignedMessage`, `postWithSignature`, `postSigned` (and into the body `scope` fields). `TicketAction` call sites stay valid. Run the existing `apps/expo/lib/__tests__/signed-request.test.ts` → still PASS.

- [ ] **Step 4: Implement `rails/manual.ts`, `task-service.ts`, the route**

`rails/manual.ts`:

```ts
import { createPublicClient, http, parseEventLogs, parseAbi } from "viem";
import { gnosis } from "viem/chains";
import { ATTESTER_SAFE, EURE } from "../constants";
import { toAtto } from "../money";

const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

export async function verifyManualSafeTransfer(txHash: string, amount: string): Promise<boolean> {
  const pub = createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL ?? "https://rpc.gnosischain.com", { batch: false }) });
  const r = await pub.getTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => null);
  if (!r || r.status !== "success") return false;
  const logs = parseEventLogs({ abi: transferAbi, logs: r.logs.filter((l) => l.address.toLowerCase() === EURE.toLowerCase()) });
  return logs.some((l) => l.args.from.toLowerCase() === ATTESTER_SAFE.toLowerCase() && l.args.value === toAtto(amount));
}
```

`task-service.ts` — implement `handleVorhabenAction` as a `switch (action)` that: loads the task (+ proposal via `proposal_id`) for task actions; builds a `TaskCtx` (`applicants` from `task_applications` with status `offen`, `firstApplicationAt` = min `created_at`, `hasProof` = any `task_activity.kind = 'proof'`, `actorIsAttester` via `deps.isAttester` only when the decision needs it — call it once up front for `assign`/`approve`/`request_changes`/`cancel`/`task_create`/`payout_record_manual`); calls `decideTaskAction`; on `ok` performs the writes listed above with conditional updates; returns `{ ok: true, data: { status: next } }`. Validation failures return `{ ok:false, status:400, code:"BAD_REQUEST", message:<German> }`. Map decision denials to HTTP 403 (`FORBIDDEN`, `SELF_*`), 409 (`BAD_STATUS`, `ALREADY_APPLIED`, `PROPOSAL_CLOSED`, `CONFLICT`), 400 otherwise.

`apps/web/src/app/api/vorhaben/tasks/route.ts`:

```ts
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VORHABEN_SCOPE, type VorhabenAction } from "@/lib/signed-request/message";
import { failResponse, jsonFail, jsonOk, verifySignedRequest } from "@/lib/signed-request/verify";
import { gnosisReader, isAttester } from "@/lib/vorhaben/chain";
import { verifyManualSafeTransfer } from "@/lib/vorhaben/rails/manual";
import { loadSettings } from "@/lib/vorhaben/settings";
import { handleVorhabenAction } from "@/lib/vorhaben/task-service";
import { buildDispatch } from "@/lib/vorhaben/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ACTIONS: readonly VorhabenAction[] = ["task_create", "task_apply", "task_withdraw", "task_assign", "task_start", "task_comment",
  "task_proof", "task_submit", "task_approve", "task_request_changes", "task_cancel", "payout_record_manual"];
const SIGNATURE_REQUIRED: VorhabenAction[] = ["task_approve", "payout_record_manual"];

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const action = (body as { action?: string } | null)?.action as VorhabenAction | undefined;
  const v = await verifySignedRequest(body, {
    scope: VORHABEN_SCOPE, actions: ACTIONS, headers: request.headers,
    requireSignature: !!action && SIGNATURE_REQUIRED.includes(action),
  });
  if (!v.ok) return failResponse(v);
  const db = createAdminClient();
  const reader = gnosisReader();
  try {
    const r = await handleVorhabenAction({
      db, settings: await loadSettings(db), nowMs: Date.now,
      isAttester: (w) => isAttester(reader, w), verifyManualTx: verifyManualSafeTransfer, dispatch: buildDispatch(db),
    }, v.wallet, v.action, v.payload);
    return r.ok ? jsonOk(r.data) : jsonFail(r.status, r.code, r.message);
  } catch (e) {
    console.error("[vorhaben/tasks]", e);
    return jsonFail(500, "INTERNAL", "Aktion fehlgeschlagen.");
  }
}
```

Create `apps/web/src/lib/vorhaben/runtime.ts` exporting `buildDispatch(db): (lineIds: string[]) => Promise<void>` and `buildDispatchDeps(db): DispatchDeps` — move the deps construction duplicated in the cron route and tally route (Tasks 9, 10, 13) here, and make both routes use it. This removes the three copies.

- [ ] **Step 5: Run** all web tests + the message test + Expo signed-request test → PASS. tsc filter clean (include `signed-request` and `tickets` in the grep to catch caller breakage).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/signed-request/message.ts apps/web/src/lib/signed-request/verify.ts apps/web/src/lib/signed-request/message.test.ts apps/expo/lib/signed-request.ts apps/web/src/lib/vorhaben/rails/manual.ts apps/web/src/lib/vorhaben/task-service.ts apps/web/src/lib/vorhaben/runtime.ts apps/web/src/app/api/vorhaben/tasks/route.ts apps/web/src/app/api/cron/vorhaben/route.ts apps/web/src/app/api/vorhaben/tally-confirm/route.ts apps/web/tests/vorhaben-task-service.test.ts
git commit -m "feat(web): task actions API with signed vorhaben scope and manual payout records"
git push
```

---

### Task 15: Expo — proposal section, task ticket, create form and Aufgabenbörse

**Files:**
- Modify: `apps/expo/lib/vorhaben.ts` (add task reads + actions)
- Create: `apps/expo/components/vorhaben/StatusChip.tsx`, `VorhabenStepper.tsx`, `TaskCard.tsx`, `VorhabenSection.tsx`
- Create: `apps/expo/app/aufgabe/[id].tsx`, `apps/expo/app/aufgabe/neu.tsx`, `apps/expo/app/aufgaben/index.tsx`
- Create: `apps/expo/components/profile/MyTasksCard.tsx`
- Modify: `apps/expo/app/proposal/[id].tsx` (insert `<VorhabenSection>` after `ProposalTimeline`, wrapped in `InlineErrorBoundary label="VorhabenSection"`), `apps/expo/app/governance.tsx` (Aufgabenbörse row at the top of the ScrollView), `apps/expo/app/profile.tsx` (`<MyTasksCard wallet=… />` after `TallyDutyCard`, for everyone)
- Modify: `apps/expo/lib/forum-attachments.ts` — add an optional `bucket` parameter to `uploadForumFileFromBase64` (default unchanged) so task PDFs reuse the picker; task proofs go to bucket `forum-attachments` folder `vorhaben/`.

**Interfaces (additions to `vorhaben.ts`):**
```ts
export interface TaskRow { id: string; proposal_id: string; title: string; description: string;
  acceptance_criteria: { id: string; text: string }[]; reward_amount: string; reward_asset: 'EURe' | 'EURC';
  deadline: string | null; status: TaskStatus; assignee_wallet: string | null; created_by_wallet: string; updated_at: string }
export interface ApplicationRow { id: string; applicant_wallet: string; note: string; status: string; created_at: string }
export interface ActivityRow { id: string; actor_wallet: string; kind: string; body: string | null;
  attachments: { type: 'image' | 'pdf' | 'tx'; url?: string; hash?: string }[]; from_status: string | null; to_status: string | null; created_at: string }
export interface VorhabenOverview { proposalUuid: string; stage: Stage; tasks: TaskRow[];
  wahlhelfer: { wallet: string; confirmed: boolean }[]; lineCount: number; totals: { asset: Asset; amount: number }[] }
export async function fetchVorhabenOverview(proposalKey: string): Promise<VorhabenOverview | null>;
export async function fetchTaskDetail(taskId: string): Promise<{ task: TaskRow; proposal: { key: string; number: number; title: string; proposer: string; stage: Stage }; applications: ApplicationRow[]; activity: ActivityRow[] } | null>;
export async function fetchMyTasks(wallet: string): Promise<(TaskRow & { proposalNumber: number })[]>; // assignee, status not final
export async function fetchBoard(): Promise<{ proposal: { key: string; number: number; title: string; stage: Stage }; tasks: TaskRow[] }[]>;
export async function displayNames(wallets: string[]): Promise<Map<string, string>>;
export function vorhabenAction(account: SigningAccount, action: VorhabenAction, payload: Record<string, unknown>): Promise<ApiResult<{ status?: string }>>;
// = postSigned('/api/vorhaben/tasks', account, action, payload, VORHABEN_SCOPE)
```

UI behaviour (German copy, theme tokens, no wallet addresses):
- **StatusChip** `{ label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'error' }` — pill like `OrgRoleBadge` (paddingH 8, paddingV 2, radius 6, 11px `fontFamily.medium`), colors `colors.<tone>Background` / `colors.<tone>` (`neutral` → `surfaceSecondary`/`textSecondary`). Task tone map: offen→info, vergeben/in_arbeit→neutral, eingereicht→warning, abgenommen/ausgezahlt→success, abgebrochen→error.
- **VorhabenStepper** `{ stage: Stage }` — horizontal dots + labels over `STAGE_STEPS`; reached = `colors.primary`; `abgelehnt` renders a single error pill "Abgelehnt" instead of steps.
- **TaskCard** `{ task: TaskRow; assigneeName: string | null; onPress }` — title, chip, reward via `formatAmount`, "Zuständig: {name}" or "Noch offen – jetzt bewerben", criteria count "3 Kriterien".
- **VorhabenSection** `{ proposalKey: string; proposerWallet: string }` — loads `fetchVorhabenOverview`; renders nothing for proposals without `vorhaben_enabled` (overview null). Sections: stepper; "Aufgaben" heading with `TaskCard`s and, for the proposer or an Attester, a "+ Aufgabe" button → `/aufgabe/neu?proposalKey=…`; "Wahlhelfer:innen" row "4 von 5 haben bestätigt" (names on tap not needed); "Vertrag" card "Gesamt: {totals per asset joined by ' · '} · {lineCount} Positionen" → `/vertrag/{proposalKey}`. Refetch on focus.
- **Task ticket `app/aufgabe/[id].tsx`** — header (back, "Aufgabe"); title, chip, reward, deadline ("bis 12. Okt."), link "Zu Vorschlag #N"; description; criteria list (bullets); role actions as primary/secondary buttons, each calling `vorhabenAction` then reloading:
  - not involved & status offen & not applied → "Bewerben" opens a `BottomDrawer` with a note `TextInput` (placeholder "Warum passt du dazu?") and "Bewerbung senden".
  - applied & offen → "Bewerbung zurückziehen".
  - can assign (proposer, or Attester when proposer applied / inactive) & offen → applicant list (name, note, "Auswählen" → `task_assign`).
  - assignee & vergeben → "Aufgabe starten".
  - assignee & in_arbeit → "Fortschritt melden" drawer (text + "Foto anhängen" via `expo-image-picker` + `uploadMediaFile(uri, wallet, 'image', 'vorhaben')`, "Datei anhängen" via `FilePickerSheet` + `uploadForumFileFromBase64(..., 'forum-attachments')`, "Transaktions-Hash" text field) → `task_proof`; "Zur Abnahme einreichen" → `task_submit`.
  - Attester ≠ assignee & eingereicht → "Abnehmen" (ConfirmationDrawer "Aufgabe abnehmen? Danach wird die Auszahlung freigegeben.") / "Nachbesserung anfordern" (drawer with required comment).
  - proposer/Attester & non-final → overflow "Aufgabe abbrechen" (drawer with required reason).
  - everyone signed in → comment box at the bottom ("Kommentar schreiben…") → `task_comment`.
  - Activity thread: newest last; each entry: name, relative time, body; status changes as "Status: In Arbeit → Wartet auf Abnahme"; attachments as tappable rows (image thumbnail, "PDF öffnen" via `Linking.openURL`, tx → `https://gnosisscan.io/tx/{hash}`).
  - Errors from `ApiResult` shown in an inline error text above the buttons.
- **Create form `app/aufgabe/neu.tsx`** — fields: Titel, Beschreibung (multiline), Kriterien (dynamic list, "+ Kriterium", 1–10), Vergütung in € (numeric, comma accepted → convert to dot, max 2 decimals), Frist (optional; three quick chips "1 Woche", "2 Wochen", "Keine"); "Aufgabe anlegen" → `task_create` with `rewardAsset: 'EURe'` → `router.replace('/aufgabe/{id}')` (return the new id from the API as `data.id` — add it to the service's `task_create` result).
- **Aufgabenbörse `app/aufgaben/index.tsx`** — header "Aufgabenbörse"; segmented tabs Offen / In Arbeit / Erledigt (offen = `offen`; in arbeit = `vergeben|in_arbeit|eingereicht|abgenommen`; erledigt = `ausgezahlt|abgebrochen`); grouped by proposal with heading "#N Titel", a progress bar (`done/total`, `colors.primary` on `colors.border`) and "3 von 4 erledigt"; `TaskCard`s; pull-to-refresh; empty state "Gerade keine Aufgaben in dieser Liste."
- **Governance entry** — a pressable row at the top of the ScrollView in `governance.tsx`: icon-free card "Aufgabenbörse" / "Hilf mit, beschlossene Vorschläge umzusetzen" → `/aufgaben`.
- **MyTasksCard** — `ProfileCompletionCard` shell; title "Meine Aufgaben"; rows: task title + `nextStepFor(task, wallet)` subtitle (fallback status label) → `/aufgabe/{id}`; hidden when empty.

- [ ] **Step 1:** Add a pure helper + test first: in `vorhaben-labels.ts` add

```ts
export type BoardTab = 'offen' | 'in_arbeit' | 'erledigt';
export function boardTabFor(status: TaskStatus): BoardTab {
  if (status === 'offen') return 'offen';
  if (status === 'ausgezahlt' || status === 'abgebrochen') return 'erledigt';
  return 'in_arbeit';
}
export function progressOf(statuses: TaskStatus[]): { done: number; total: number } {
  return { done: statuses.filter((s) => s === 'ausgezahlt' || s === 'abgebrochen').length, total: statuses.length };
}
export function parseEuroInput(raw: string): string | null {
  const s = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s) || Number(s) <= 0) return null;
  return s;
}
```

and tests in `vorhaben-labels.test.ts`:

```ts
import { boardTabFor, progressOf, parseEuroInput } from '../vorhaben-labels';
test('board tabs and progress', () => {
  expect(boardTabFor('eingereicht')).toBe('in_arbeit');
  expect(boardTabFor('abgebrochen')).toBe('erledigt');
  expect(progressOf(['ausgezahlt', 'offen', 'abgebrochen', 'in_arbeit'])).toEqual({ done: 2, total: 4 });
});
test('euro input', () => {
  expect(parseEuroInput('5')).toBe('5');
  expect(parseEuroInput('5,50')).toBe('5.50');
  expect(parseEuroInput('5,555')).toBeNull();
  expect(parseEuroInput('0')).toBeNull();
  expect(parseEuroInput('abc')).toBeNull();
});
```

Run jest → FAIL, implement, → PASS.

- [ ] **Step 2:** Implement the `vorhaben.ts` additions. `fetchVorhabenOverview` = resolve uuid → `proposals(lifecycle_stage, vorhaben_enabled)` (null if not enabled) → `proposal_tasks` by proposal → `proposal_wahlhelfer(attester_wallet, confirmed_at)` → `proposal_payout_lines(amount, asset)` summed per asset. `displayNames` mirrors the web helper (`users` by lowercase wallet, fallback "Unbekannt").
- [ ] **Step 3:** Implement the four components and three screens per the behaviour list. Copy the header pattern from `auszaehlung/[proposalId].tsx`. Use `BottomDrawer` and `ConfirmationDrawer` from `@/components`. Ask: the `+ Aufgabe` visibility needs Attester status — use `useVerificationContext().hasAttesterNFT`.
- [ ] **Step 4:** Wire `VorhabenSection` into `proposal/[id].tsx` after the `ProposalTimeline` boundary:

```tsx
{proposalId && (
  <InlineErrorBoundary label="VorhabenSection">
    <VorhabenSection proposalKey={proposalId} proposerWallet={proposal.proposer} />
  </InlineErrorBoundary>
)}
```

Add the Aufgabenbörse row in `governance.tsx` and `MyTasksCard` in `profile.tsx`.
- [ ] **Step 5: Verify** — jest labels test PASS; tsc grep for the new/changed files clean; `grep -rn "@react-navigation/native" apps/expo/app/aufgabe apps/expo/app/aufgaben apps/expo/components/vorhaben` → nothing; `grep -rn "0x\${\|shortenAddress" apps/expo/components/vorhaben apps/expo/app/aufgabe apps/expo/app/aufgaben` → nothing (no addresses in UI).
- [ ] **Step 6: Run the app** with the `run` skill on the Android emulator (preview env pointing at prod Supabase): open proposal #3 → section visible with the seeded task; open the task; open the Aufgabenbörse. One screenshot pass per screen, fix obvious layout bugs, then stop (Max reviews visuals himself).
- [ ] **Step 7: Commit**

```bash
git add apps/expo/lib/vorhaben.ts apps/expo/lib/vorhaben-labels.ts apps/expo/lib/__tests__/vorhaben-labels.test.ts apps/expo/lib/forum-attachments.ts apps/expo/components/vorhaben "apps/expo/app/aufgabe/[id].tsx" apps/expo/app/aufgabe/neu.tsx apps/expo/app/aufgaben/index.tsx apps/expo/components/profile/MyTasksCard.tsx "apps/expo/app/proposal/[id].tsx" apps/expo/app/governance.tsx apps/expo/app/profile.tsx
git commit -m "feat(expo): proposal tasks — ticket screen, create form, Aufgabenbörse, my tasks"
git push
```

---

### Task 16: Expo — Vertrag screen and transaction context

**Files:**
- Modify: `apps/expo/lib/vorhaben.ts` (`fetchContract`)
- Create: `apps/expo/app/vertrag/[proposalId].tsx`
- Modify: `apps/expo/app/transaction.tsx` (optional `context` param banner)

**Interfaces:**
```ts
export interface ContractLine { id: string; role: 'empfaenger' | 'aufgabe' | 'wahlhelfer' | 'plattform'; recipientName: string;
  recipientWallet: string | null; amount: string; asset: Asset; status: LineStatus; txHash: string | null;
  referenceType: string; referenceId: string; createdAt: string }
export interface ContractView { proposalKey: string; proposalNumber: number; title: string; stage: Stage;
  feeBps: number; lines: ContractLine[]; totals: { asset: Asset; amount: number }[] }
export async function fetchContract(proposalKey: string): Promise<ContractView | null>;
```
`recipientName`: for `plattform` "Plattform (Röbel App)", for `empfaenger` the stored label, otherwise display name via `displayNames` (fallback stored label).

Screen layout: header "Vertrag"; contract head card — "Vorschlag #N", title, stage chip, "Plattformanteil: 5 % zusätzlich" (from `feeBps`), totals per asset ("150,00 € · 5,25 € · 52,5 Röbel Münzen · 7,5 xDAI"); then one group per role in order Empfänger, Aufgaben, Wahlhelfer:innen, Plattform with heading + rows. Row: name (left), "für: {Aufgabe title | 'Bestätigung der Auszählung' | proposal beneficiary | 'Anteil an {role}'}" subtitle, amount right, status chip. Tap a row with `txHash` → `router.push({ pathname: '/transaction', params: { direction: 'out', title: ROLE_LABELS[role], amountText: <amount number string>, currency: asset === 'MUENZEN' ? 'muenzen' : 'eur', txHash, name: recipientName, context: `Teil des Vertrags zu Vorschlag #${n}` } })`. For `XDAI` pass `currency: 'eur'` is wrong — add `currency: 'xdai'` support in transaction.tsx (label "xDAI"). Rows without hash are not pressable.

Attester-only: on an `empfaenger` line with status `geplant` and rail `manual_safe`, show "Überweisung eintragen" → drawer with a tx-hash input → `vorhabenAction(account, 'payout_record_manual', { lineId, txHash })`.

`transaction.tsx` changes: read `const context = first(params.context);` and `currency` accepts `'xdai'` (`currencyLabel` "xDAI"); render, between the summary and the info card, when `context` is non-empty:

```tsx
{context ? (
  <View style={[styles.contextBanner, { backgroundColor: colors.infoBackground }]}>
    <Text style={[styles.contextText, { color: colors.infoForeground }]}>{context}</Text>
  </View>
) : null}
```

with styles `contextBanner: { marginHorizontal: 20, marginTop: 12, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }`, `contextText: { fontFamily: fontFamily.medium, fontSize: 14 }` (match how `makeStyles` builds styles in that file).

- [ ] **Step 1:** Add a pure `contractPurpose(line, taskTitles: Map<string,string>, beneficiary: string): string` to `vorhaben-labels.ts` with a jest test (aufgabe → task title; wahlhelfer → "Bestätigung der Auszählung"; empfaenger → beneficiary; plattform → "Plattformanteil"). Fail → implement → pass.
- [ ] **Step 2:** Implement `fetchContract`, the screen, the manual-record drawer and the `transaction.tsx` change.
- [ ] **Step 3: Verify** — jest PASS; tsc grep clean; run the app, open `/vertrag/{#3 key}` (lines appear only after acceptance — before that the screen shows the head card and "Noch keine Auszahlungen."); screenshot once.
- [ ] **Step 4: Commit**

```bash
git add apps/expo/lib/vorhaben.ts apps/expo/lib/vorhaben-labels.ts apps/expo/lib/__tests__/vorhaben-labels.test.ts "apps/expo/app/vertrag/[proposalId].tsx" apps/expo/app/transaction.tsx
git commit -m "feat(expo): proposal payout contract screen with per-line proof"
git push
```

---

### Task 17: Web proposal creation fields, spec notes and handover

**Files:**
- Modify: `apps/web/src/components/proposals/CreateProposalForm.tsx`, `apps/web/src/app/api/proposals/store/route.ts`, `apps/web/src/lib/supabase.ts` (`createProposal` input)
- Modify: `docs/superpowers/specs/2026-10-01-proposal-tasks-payouts-design.md` (append "Implementation notes")

- [ ] **Step 1:** In `CreateProposalForm.tsx` add an optional "Budget" block: "Betrag in €" (same euro parsing rules as `parseEuroInput` — write a tiny local copy, the web cannot import Expo), "Empfänger" (text). Send `budgetAmount`, `beneficiaryName` with the store POST. In `/api/proposals/store`, validate (`/^\d+(\.\d{1,2})?$/`, beneficiary ≤ 140 chars) and pass through; `createProposal` inserts `vorhaben_enabled: true`, `budget_amount`, `budget_asset: budgetAmount ? 'EURe' : null`, `beneficiary_name`. All new proposals get `vorhaben_enabled: true` (they get Wahlhelfer + tasks), budget or not.
- [ ] **Step 2:** Run `pnpm test:web`, web tsc grep for the touched files, then `pnpm --filter web build` is **not** required (Vercel builds); the tsc check suffices.
- [ ] **Step 3:** Append to the spec:

```markdown
## Implementation notes (2026-10-01, from the plan)

- The engine runs in the **web app** (API routes + Vercel cron), not in edge functions: the Safe kit,
  signature verification and crons already live there. Only Münzen/xDAI sends run in the edge function
  `vorhaben-payout-send`, because `FUNDER_PRIVKEY` must never leave Supabase.
- Identity is the **wallet** (lowercase) everywhere instead of account ids; names come from `users`.
- `tally_confirmations` is merged into `proposal_wahlhelfer` (eligibility snapshot + co-signature).
- Eligible Wahlhelfer = current AttesterNFTv2 holders **when the tally is first seen on-chain** (historical
  balance reads would need an archive RPC).
- The co-signed text names the **Tally contract address**, not the tally tx hash (no log scan needed).
- Settings live in `vorhaben_settings` (service-role write only) — `app_settings` is anon-writable.
- Kill switch `vorhaben_settings.dispatch_enabled` (default false) gates every automatic payout.
- `unklar` funder lines are resolved by hand (admin alert), not by automatic log scanning.
- Only proposals with `proposals.vorhaben_enabled` take part (#3 backfilled; all new proposals on).
- The sync cron also fixes the proposals mirror (`state`, vote counts), which was never updated before.
```

- [ ] **Step 4:** Update memory: create `/Users/maxbrych/.claude/projects/-Users-maxbrych-Documents-privat-side-projects-DAO-test/memory/project_proposal_tasks_payouts.md` (type project: what shipped, kill switch, delegate gate, OTA pending) and add a one-line pointer to `MEMORY.md` (keep it under 200 chars; the index is over its size limit — also shorten two existing long lines while there).
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/proposals/CreateProposalForm.tsx apps/web/src/app/api/proposals/store/route.ts apps/web/src/lib/supabase.ts docs/superpowers/specs/2026-10-01-proposal-tasks-payouts-design.md
git commit -m "feat(web): budget fields on new proposals; spec implementation notes"
git push
```

- [ ] **Step 6: Handover to Max** — list: (1) run the EAS update for the Expo screens; (2) top up the funder with ≥ 8 xDAI; (3) flip `dispatch_enabled`; (4) generate + register the Safe delegate (`vorhaben-add-safe-delegate.mjs`) and set `GK_PROPOSER_DELEGATE_PRIVKEY` on Vercel; (5) after the #3 tally: paste the 150 € Safe tx hash on the Vertrag screen.
