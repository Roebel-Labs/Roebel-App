# Proposal tasks, Wahlhelfer co-signing and payout contracts — design

Date: 2026-10-01 · Status: APPROVED by Max 2026-10-01 · Parts 1 + 2 of the proposal-lifecycle program

## 1. Context and intent

Today a proposal is: created (web) → citizens vote (MACI) → tallied → Attesters move money by hand in the
Gemeinschaftskasse dashboard. Nothing in between is visible to citizens: who does the work, who counts the
votes, who got paid what.

The broader program has four parts:

1. **Tasks + payout contract** — tasks on a proposal, apply/assign, ticket thread, job board, "Umgesetzt"
   status, one payout contract per proposal with a detail screen. ← this spec
2. **Tally duty + Wahlhelfer pay** — Attesters are prompted to co-sign the tally result and are paid
   immediately; platform fee line. ← this spec
3. Discussion before the proposal (forum thread with traction → "Antrag stellen", linked both ways). Later spec.
4. Mecky as participant (pros/cons, suggested tasks, @Mecky in forum/proposals, progress answers). Later spec.

**What Max asked for (parts 1 + 2):**
- Tasks on a proposal, clickable like tickets with acceptance criteria; one person applies, is assigned,
  reports progress, and is paid by the treasury after the job is finished.
- Attesters who take part in the tally are paid like "Wahlhelfer"; when voting ends, eligible Attesters
  get a push notification and a profile card reminding them.
- The platform earns a percentage, paid to a separate platform Safe.
- Progress after the vote is trackable in a job board; when all tasks are done the proposal is "done".
- Every payout has a contract-style detail screen: who got paid, for what, how much — as part of the
  proposal's overall payout.
- A citizen's open tasks always appear on their profile, where they report/comment like in a ticket.

**Decisions taken during brainstorming:**

| Topic | Decision |
|---|---|
| Proposal #3 (150 € Seglerverein) real money | Max transfers it manually from the Attester Safe; it is recorded as a `manual_safe` line with its tx hash. |
| Everything else in this first run | Runs for real: Wahlhelfer pay on the Münzen rail, task pay in EURe from the treasury Safe, platform fees alongside. No "test" labelling in the UI. |
| Payment rails | Pluggable per payout line: `funder_muenzen` (Wahlhelfer), `safe_eure` (tasks, auto-proposed Safe tx), `funder_xdai` (first-run budget fee), `manual_safe` (hand transfers), `safe_eurc_base` later. |
| Wahlhelfer step | A **real** co-signature of the published tally result (EIP-191 via smart account, ERC-1271 verified). Not a simulated key-share submission. When the 3-of-5 ceremony runs, the same screen also collects the share and the payout trigger moves to share submission. |
| Wahlhelfer reward currency | Röbel Münzen while the step is a result co-signature (civic thank-you). **Switches to stablecoin once the Attesters have run the 3-of-5 key ceremony** and the step includes real share submission — a settings change (`wahlhelfer_reward_asset`, `wahlhelfer_reward_amount`, rail), no schema change. |
| Task done gate | One Attester who is not the task holder approves ("Abnehmen"); the payout is then proposed to the treasury Safe automatically and goes out once the Safe threshold signs. |
| Task pay | Stablecoin (EURe on Gnosis now, EURC on Base later), amount set per task by the proposer. Task applicants need **not** be verified citizens or Münzen holders — any app account may apply. #3's transfer task pays 5 €. |
| Who creates/assigns tasks | Proposer creates tasks and assigns. The proposer may apply to their own task; then an Attester assigns that task. |
| Platform fee | `platform_fee_bps` charged **on top** of the proposal amount and on top of every work payout (task + Wahlhelfer), in the same asset as the line it is a fee on. Recipient never loses anything. Paid to a separate platform Safe. |

**Success criteria:**
- Proposal #3 shows a stage stepper, its task(s), its Wahlhelfer, and a contract with every line and proof.
- All current Attesters receive the push + profile card when voting on #3 ends, can co-sign, and receive
  Münzen within a minute of signing.
- Any app user can apply, get assigned, report progress, submit, be approved and get paid without anyone
  touching SQL (the only manual step is the Safe owners signing the queued payout).
- No payout line can ever be sent twice.

## 2. Approach

**Supabase ledger + pluggable payment rails.** Lifecycle state lives in new Supabase tables; money moves
through rail adapters; proofs are on-chain (tx hashes, ERC-1271 signatures). Rejected alternatives: an
on-chain escrow per proposal (new contract + audit, awkward with Circles ERC-1155, overkill for this run);
reusing `dev_tickets` (wrong shape: admin-only, no applicants/assignee).

Lifecycle transitions may later be mirrored to Nostr via NSP-12 (`packages/protocol/src/decisions.ts`);
not part of this spec.

## 3. Lifecycle

New column `proposals.lifecycle_stage` (text, CHECK), alongside the on-chain `state`:

```
abstimmung → auszaehlung → angenommen ─→ in_umsetzung → umgesetzt
                         ↘ abgelehnt
```

- `abstimmung`: voting period open.
- `auszaehlung`: voting ended, tally not yet on-chain.
- `angenommen` / `abgelehnt`: from the on-chain result.
- `in_umsetzung`: at least one task or payout line is still open.
- `umgesetzt` (only after `angenommen`): every task is `ausgezahlt` or `abgebrochen`, every payout line
  is `bestaetigt`, and — if the proposal has a budget — its `empfaenger` line exists and is `bestaetigt`.

The Wahlhelfer confirmation window is **not a stage**: when the tally lands on-chain, the cron sets
`proposals.tally_confirm_until = now() + tally_confirm_window_days`. The stepper shows it as a sub-step
of "Ausgezählt" ("4 von 5 Wahlhelfer:innen haben bestätigt"); it never blocks execution.

On `abgelehnt`: all tasks not yet `abgenommen` become `abgebrochen`. Wahlhelfer are still paid.

A single SQL function `recompute_proposal_stage(proposal_id)` derives the stage; it is called after every
task, confirmation or payout change and by the cron. Stage changes are appended to
`proposal_stage_events` (proposal_id, from, to, at, actor) for the stepper and Mecky later.

## 4. Data model

All amounts are `numeric(38,18)` in the asset's display unit; `asset` is `'EURe' | 'MUENZEN' | 'EURC'`.

**`proposals` (extended)**
- `budget_amount numeric`, `budget_asset text`, `beneficiary_name text`, `beneficiary_ref text`
  (free text: IBAN-free description or org account id), `lifecycle_stage text`,
  `tally_confirm_until timestamptz null`.

**`proposal_tasks`**
- `id uuid pk`, `proposal_id`, `title`, `description`, `acceptance_criteria jsonb` (array of
  `{id, text, done}`), `reward_amount`, `reward_asset`, `deadline timestamptz null`,
  `status` CHECK in (`offen`, `vergeben`, `in_arbeit`, `eingereicht`, `abgenommen`, `ausgezahlt`,
  `abgebrochen`), `assignee_account_id null`, `created_by_account_id`, `assigned_by_account_id null`,
  `approved_by_account_id null`, timestamps.

**`task_applications`**
- `id`, `task_id`, `applicant_account_id`, `note`, `status` (`offen`, `angenommen`, `abgelehnt`,
  `zurueckgezogen`), timestamps. UNIQUE (task_id, applicant_account_id).

**`task_activity`** (the ticket thread)
- `id`, `task_id`, `actor_account_id`, `kind` (`comment`, `status_change`, `proof`, `criteria_check`),
  `body text null`, `attachments jsonb` (`[{type:'image'|'pdf'|'tx', url|hash}]`),
  `from_status`, `to_status`, `created_at`.

**`tally_confirmations`**
- `id`, `proposal_id`, `attester_address`, `attester_account_id`, `message text` (exact signed text),
  `result_hash bytea` (keccak of the canonical result payload), `signature text`, `verified_chain_id int`,
  `verified_at`, `created_at`. UNIQUE (proposal_id, attester_address).

**`proposal_contracts`** (one per proposal — the "Vertrag")
- `id`, `proposal_id unique`, `platform_fee_bps int` (frozen at creation), `platform_safe_address`
  (frozen), `created_at`.

**`proposal_payout_lines`**
- `id`, `contract_id`, `role` (`empfaenger`, `aufgabe`, `wahlhelfer`, `plattform`),
  `recipient_account_id null`, `recipient_address`, `recipient_label` (display name; never shown as 0x),
  `amount`, `asset`, `rail` (`funder_muenzen`, `funder_xdai`, `safe_eure`, `manual_safe`, `safe_eurc_base`),
  `reference_type` (`proposal`, `task`, `tally_confirmation`, `payout_line`), `reference_id`,
  `status` (`geplant`, `sendend`, `vorgeschlagen`, `gesendet`, `bestaetigt`, `unklar`, `fehlgeschlagen`),
  `attempt_started_at`, `safe_tx_hash null` (Safe rails), `tx_hash`, `error`, timestamps.
- UNIQUE (role, reference_type, reference_id) — the idempotency key. A platform line references the
  payout line it is a fee on (`reference_type='payout_line'`).
- Every `tx_hash` is also written to the existing `treasury_tx_links` with the proposal id, so the
  existing treasury history and `transaction.tsx` resolve it.

**RLS:** all new tables are publicly readable (transparency). No client INSERT/UPDATE/DELETE; writes go
through edge functions with the service role. Every new SQL function gets
`REVOKE EXECUTE … FROM anon, authenticated` explicitly.

**Settings (`app_settings`):** `platform_fee_bps` = 500 (5 %, confirmed),
`platform_safe_address` = `0xbCAbbAA26420e0A4771808F9639D4176355E5d4B` (Gnosis Safe, confirmed 2026-10-01;
if unset, platform lines stay `geplant`), `wahlhelfer_reward_asset` = `MUENZEN`, `wahlhelfer_reward_amount` = 10 (confirmed),
`tally_confirm_window_days` = 7.

## 5. Rules (server-enforced)

**Task state machine**

| From | To | Who |
|---|---|---|
| — | `offen` | proposer (any time after creation; also before the vote ends) |
| `offen` | `vergeben` | proposer, picking an applicant — **unless the proposer is an applicant**, then any Attester |
| `vergeben` | `in_arbeit` | assignee (first progress report or "Starten") |
| `in_arbeit` | `eingereicht` | assignee, with at least one `proof` activity |
| `eingereicht` | `abgenommen` | any Attester ≠ assignee |
| `eingereicht` | `in_arbeit` | any Attester ≠ assignee ("Nachbesserung anfordern", comment required) |
| `abgenommen` | `ausgezahlt` | system, when the task's payout line is `bestaetigt` |
| any non-final | `abgebrochen` | proposer or Attester (comment required); automatic on `abgelehnt` |

- Payout lines for a task are created at `abgenommen` and only if the proposal is `angenommen`.
- Any signed-in app account with a smart account may apply — no citizen verification, no Münzen
  needed (the pay is stablecoin). Creating tasks and assigning stay with proposer/Attesters.
- `reward_asset` for tasks is a stablecoin (`EURe` now, `EURC` later); the proposer sets the amount.
- If the proposer is inactive 7 days after applications open, any Attester may assign.

**Wahlhelfer**
- Eligible: addresses holding AttesterNFTv2 at the block where voting ended.
- Signed message (German, exact text stored), e.g.:
  `Ich bestätige das Auszählungsergebnis von Vorschlag #3 "<title>": Ja <n>, Nein <n>, Enthaltung <n>. Tally-Transaktion <hash>. Ergebnis-Hash <hash>.`
- Verification: ERC-1271 on the smart account, chain 100 first, fallback chainId 8453 for older
  signing behaviour (see the thirdweb signing-chain note).
- On success: insert confirmation → create `wahlhelfer` line (+ its `plattform` line) → dispatch.

**Contract creation and the platform fee**
- The contract row is created when the proposal enters `abstimmung` (or on first need), freezing
  `platform_fee_bps` and `platform_safe_address`.
- When the proposal is `angenommen`: create the `empfaenger` line from `budget_amount`/`budget_asset`
  (rail `manual_safe` for #3) and its `plattform` line = budget × bps, always on top.
- Every `aufgabe` and `wahlhelfer` line gets its own `plattform` line = amount × bps, same asset/rail.

## 6. Payout engine

**Rail adapters** (`apps/expo/supabase/functions/_shared/payout-rails.ts`):
- `funder_muenzen`: server signs from the funder hot wallet `0x5ac8…9D9B` with `FUNDER_PRIVKEY`, reusing
  the transfer code path of `claim-reward` (already pays citizens' smart accounts).
- `funder_xdai`: native xDAI transfer from the same funder wallet (first-run platform fee on the budget;
  keeps ≥ 0.5 xDAI back for gas).
- `manual_safe`: never sends. An admin pastes the tx hash; the line goes to `gesendet` and is verified
  like any other.
- `safe_eure`: proposes **one batched Safe tx** (MultiSend) on the Attester Safe `0x3A08…` that pays the
  task line and its `plattform` line together (e.g. 5 EURe to the holder + 0.25 EURe to the platform Safe).
  - Proposing uses a **proposer delegate**: a server key (`GK_PROPOSER_DELEGATE_PRIVKEY`, Vercel secret)
    registered once by a Safe owner as delegate in the Safe Transaction Service. A delegate can only
    queue transactions — it can never sign or execute them. Owners sign and execute in the existing
    Gemeinschaftskasse dashboard (`/admin/dashboard/gemeinschaftskasse` → PendingQueue), where the
    queued tx shows the proposal, task and recipient names.
  - Runs in the web app (`apps/web`, next to `api/gemeinschaftskasse/*`, which already has `getApiKit`),
    called by `payout-dispatch` via an internal authenticated route.
  - Status: `geplant` → `sendend` (safeTxHash computed and stored *before* calling the service) →
    `vorgeschlagen` → `gesendet` (execution tx hash, read from the Safe Transaction Service) → `bestaetigt`.
  - Idempotency: before proposing, look up the stored `safe_tx_hash` in the service; if it already
    exists, only advance the status. A rejected/replaced Safe tx (same nonce executed with other data)
    → `fehlgeschlagen` + admin alert.
  - Attester Safe owners get the push `payout_needs_signature` when a tx is queued.
- `safe_eurc_base`: not implemented in this spec; same shape as `safe_eure` on Base.

**`payout-dispatch` edge function** — called right after each trigger and by a cron every 5 minutes:
1. Claim lines: `UPDATE … SET status='sendend', attempt_started_at=now() WHERE status='geplant' … FOR
   UPDATE SKIP LOCKED` (one line at a time per rail to keep the funder nonce sane).
2. Check the funder balance; if below `amount + FUNDER_LOW_RCRC` → revert to `geplant`, set
   `error='float_low'`, alert the admin (existing admin notification path). The citizen sees
   "Wird ausgezahlt, sobald die Betriebskasse aufgefüllt ist."
3. Send; store `tx_hash` immediately → `gesendet`; wait for the receipt → `bestaetigt`.
   Safe rails stop at `vorgeschlagen`; the cron advances them by polling the Safe Transaction Service.
4. A crash or timeout after broadcast leaves `sendend` with an `attempt_started_at` older than 10 minutes →
   `unklar`. `unklar` lines are **never retried blindly**: reconciliation looks up funder transfers to that
   recipient for that amount after `attempt_started_at`; found → `bestaetigt` with that hash; not found
   after 1 hour → `geplant` again.
5. After any status change: `recompute_proposal_stage`, push `payout_sent` to the recipient.

## 7. Triggers and notifications

- Extend the existing coordinator cron (`apps/web/src/app/api/coordinator/chain-listener`) to detect
  voting end and tally-on-chain per proposal, and to call `recompute_proposal_stage`.
- Tally on-chain (`tally_confirm_until` set) → push `tally_confirm_needed` to every eligible Attester that has not
  confirmed yet; one reminder after 3 days.
- New `send-notification` types: `tally_confirm_needed`, `task_application` (to proposer/Attesters),
  `task_assigned`, `task_submitted` (to Attesters), `task_changes_requested`, `task_approved`,
  `payout_sent`, `payout_needs_signature` (to Attester Safe owners). Deep links go to the screens below.

## 8. Screens (Expo only — the web app has no citizen users)

All German UI, `StyleSheet.create` + `useTheme`, display names instead of wallet addresses everywhere.

1. **Proposal page** (`app/proposal/[id].tsx`, extended):
   - Stage stepper.
   - "Aufgaben" ticket cards (status chip, reward, assignee, criteria progress).
   - "Wahlhelfer" row (avatars + "hat bestätigt").
   - "Vertrag" card (total, number of lines) → contract screen.
   - Proposer sees "+ Aufgabe".
2. **Task ticket** (`app/aufgabe/[id].tsx`):
   - Header: status, reward, deadline, parent proposal; then the criteria checklist.
   - Role-dependent actions: Bewerben (note) · applicant list + Vergeben · Fortschritt melden (text +
     photo/PDF/tx hash) · Zur Abnahme einreichen · Abnehmen / Nachbesserung anfordern · Abbrechen.
   - Full activity thread below.
3. **Aufgabenbörse** (`app/aufgaben/index.tsx`, entry from Governance):
   - Tabs Offen / In Arbeit / Erledigt.
   - Grouped by proposal, with a progress bar ("3 von 4 erledigt").
4. **Profile cards** (`apps/expo/components/profile/`, banner slot after `ProfileCompletionCard`):
   - "Auszählung bestätigen" (eligible Attesters during the window: result preview, countdown).
   - "Meine Aufgaben" (open tasks with their next step).
5. **Tally co-sign** (`app/auszaehlung/[proposalId].tsx`):
   - Result, quorum, link to the tally tx, and the exact text to be signed.
   - "Bestätigen und signieren" → success screen ("Danke, Wahlhelfer:in. 10 Röbel Münzen sind unterwegs.")
     with a proof link once `gesendet`.
6. **Vertrag** (`app/proposal/[id]/vertrag.tsx`):
   - Contract-style header (proposal, totals per asset, status).
   - Lines grouped by role. Each line: who, for what (link to task/confirmation), amount, status, proof.
   - Tap a line → existing `app/transaction.tsx` with a "Teil des Vertrags zu Vorschlag #3" banner.

Amounts on the Münzen rail are shown in Röbel Münzen only, never as a € figure; `manual_safe` lines in
EURe show €.

**Proposal creation (web):** `CreateProposalForm` gets optional budget amount/asset and beneficiary fields.
Tasks are added afterwards by the proposer in the app.

## 9. Proposal #3 back-fill

A migration sets #3's `budget_amount=150`, `budget_asset='EURe'`, beneficiary
"Röbeler Seglerverein – Spendenaktion Vereinsbus", `lifecycle_stage` per the current state, creates its
contract, and seeds one task:

- **"Spende an den Seglerverein überweisen und Quittung hochladen"**
- Criteria: Überweisung von 150 € aus der Gemeinschaftskasse ausgelöst · Zahlungsnachweis (Tx-Hash)
  angehängt · Spendenquittung des Vereins hochgeladen.
- Reward: 5 EURe (+ 0.25 EURe platform fee), rail `safe_eure`.
- Status `offen`, created by the proposer's account.

Max's manual Safe transfer becomes the `empfaenger` line (`manual_safe`) once he pastes the tx hash on the
contract screen (admin-only action).

## 10. Testing

- **Unit:** the task state machine and role rules (incl. proposer-as-applicant, approver ≠ assignee),
  fee maths (on top, rounding to token decimals), stage derivation, idempotent line creation.
- **Dispatch:** a double trigger produces one transfer; `unklar` reconciliation; low-float path.
- **Integration:** Attester eligibility and ERC-1271 verification against the burner-owned on-chain test
  environment (Gnosis); the full #3 flow on staging Supabase before prod.
- **Device:** Max does a device pass; Max runs the OTA. Grep for `useIsFocused` from
  `@react-navigation/native` before any OTA.

## 11. Out of scope

- Part 3 (discussion → proposal pipeline) and part 4 (Mecky participation and the
  `get_proposal_progress` tool). The tables above are shaped so that tool can read them directly.
- The `safe_eurc_base` rail implementation.
- Shamir share collection in the co-sign screen (comes with the next real 3-of-5 tally).
- Tax/legal treatment of payouts to citizens — needs advice before a euro rail goes live.
- NSP-12 Nostr mirroring of lifecycle transitions.

## 12. Open values for Max

Confirmed 2026-10-01: fee 5 %, Wahlhelfer reward 10 Münzen, platform Safe
`0xbCAbbAA26420e0A4771808F9639D4176355E5d4B` (Gnosis).

#3 transfer task reward: 5 € (EURe), confirmed 2026-10-01.

One-time setup by Max: register the proposer delegate on the Attester Safe (Safe owner signs once).

**First-run platform fee on the budget:** the platform line on #3's 150 € budget is paid on the
`funder_xdai` rail (native xDAI from the funder hot wallet, 5 % × 150 = 7.5 xDAI) to the platform Safe.
Platform lines on Münzen work lines (0.5 Münzen per Wahlhelfer) stay on `funder_muenzen`; the Safe must
accept ERC-1155 (Safe fallback handler) — verify with a 0-risk transfer first. On 2026-10-01 the funder held
~2 xDAI (gas float), so it needs a top-up of ≥ 8 xDAI before #3 passes, or the line waits as `float_low`.
