# Röbel Münzen Economy — Design Spec

**Date:** 2026-06-20
**Status:** Phase 1 (payout rail) IMPLEMENTED & deployed — 2 ops steps remain (see below)
**Author:** Max + Claude

## Implementation status (Phase 1 — 2026-06-20)

Built & deployed to prod (Supabase MCP):
- DB: `reward_config`, `reward_claims` (unique anti-double-pay), `funder_ledger` (RLS on, service-role only). Seeded `proposal_vote` (1 Münze) + `event_submit` (3 Münzen). Migration: [`supabase/migrations/20260620_roebel_muenzen_reward_rail.sql`](../../../supabase/migrations/20260620_roebel_muenzen_reward_rail.sql).
- Edge fn `claim-reward` (ACTIVE, verify_jwt): config → daily-cap → reserve claim (unique lock) → verify → pay (funder `safeTransferFrom` ERC-1155) → ledger. Source: [`apps/expo/supabase/functions/claim-reward/index.ts`](../../../apps/expo/supabase/functions/claim-reward/index.ts). Verifiers: `proposal_vote` (DB `vote_history` — participation only, **dodges the Gnosis-MACI dependency**), `event_submit` (`events`→`account_owners`).
- Client: [`apps/expo/lib/rewards-claim.ts`](../../../apps/expo/lib/rewards-claim.ts) `claimReward(wallet, action, referenceId)`.

**Two ops steps to go live (require you — key custody + Safe funds):**
1. **Create the funder + set the secret.** Run `pnpm exec tsx scripts/circles/gen-funder-wallet.ts`, set Supabase secret `FUNDER_PRIVKEY`, fund the printed address with a little xDAI for gas.
2. **Seed the float.** Send some Röbel Münzen to the funder address (from your wallet or the Stadtkasse Safe). Until then payouts return `failed: insufficient funder float` (no double-pay risk — claims just retry).

Then wire `claimReward(wallet, "proposal_vote", proposalId)` into the vote-success path to see it end-to-end. Tune amounts anytime in `reward_config` (no deploy).

## 1. Goal

Migrate the Röbel app's off-chain "points" economy (Missions, Schatzkammer keys,
lootboxes, civic-action rewards) onto the on-chain Circles group token **Röbel Münzen**
(ERC-1155, Gnosis). End state: **Münzen-only** — points cease to be a parallel currency;
every earn and spend is real, backed money that also works in Metri / the wider Circles
network and can later bridge to a physical economy.

This spec covers the **foundation (Phase 1): the payout rail** in full, and sketches the
later phases so Phase 1 is built to extend cleanly.

## 2. Decisions locked in brainstorming

| Decision | Choice |
|---|---|
| Economy model | **Full replacement** — Münzen only, no parallel points currency (reached via phased rollout) |
| Funder | **Dedicated hot wallet (cashier) backed by the Stadtkasse Safe (vault)** |
| Daily reward faucet | The existing **daily mint** ("Heute abholen" = personalMint→groupMint) — users mint their *own* Münzen; the funder is NOT involved in daily basic income |
| Funder's job | Pay only the *extra* civic-action rewards (missions, events, proposal participation); refills from lootbox spend (closed loop) + periodic Safe top-ups |
| Governance rewards | Reward **participation, never the vote choice** (MACI votes are encrypted; pay a flat once-per-proposal civic bonus — no scaling, no vote-buying) |

## 3. Economic model & constraints (the part that drives everything)

- **Münzen are collateral-backed, not printable.** Each Münze = 1 personal CRC locked in
  the group vault (`0x0476fd3b…`). New supply only appears when a citizen deposits their
  daily personal mint (`groupMint`). Community-wide "new money" per day ≈ Σ citizens' daily
  mint (~24 CRC/citizen/day ceiling). This is the binding constraint on the whole economy.
- **The daily mint is the basic-income faucet** and needs no funder. The funder only covers
  rewards *beyond* daily income.
- **The funder is a circulating pool, not a draining faucet.** Reward payouts flow out;
  lootbox/sink spend flows back in. Balanced design ≈ self-sustaining; the Safe is the
  reserve/backstop.
- **Demurrage (~7%/yr) is a tailwind** — idle balances decay, nudging circulation (spend
  → back to funder) over hoarding.
- **Amounts must be re-modelled.** Current point amounts (key = 200, check-in = 20) assume
  an infinite DB and cannot carry over 1:1. See §7.

## 4. Architecture overview

```
                       periodic top-up (occasional M-of-N multisig tx)
   ┌─────────────────┐  ───────────────────────────────────────────►  ┌──────────────────┐
   │ Stadtkasse Safe │                                                  │  Funder hot wallet│
   │ (3-of-5, VAULT) │  ◄───────────────────────────────────────────   │ (CASHIER, float) │
   └─────────────────┘            drain / sweep on demand               └────────┬─────────┘
                                                                                  │ safeTransferFrom (ERC-1155)
   user action (vote / event / post / mission)                                    │ gasless-ish (xDAI gas)
        │                                                                         ▼
        ▼                                                              ┌──────────────────┐
   app or DB trigger ──► claim-reward edge fn ──► verify ──► idempotency check ──► PAY ──► │ Citizen wallet   │
                          (holds funder key)      (per-action)  (reward_claims)            └──────────────────┘
   lootbox/sink spend:  user safeTransferFrom(user → funder)  ──► backend confirms receipt ──► grant key
```

- **Safe = vault** holds the reserve and governs; **hot wallet = cashier** holds a small
  capped float and does automated per-action payouts. If the hot key leaks, only the float
  is at risk and the Safe can sweep it instantly.
- **One generic payout service** (`claim-reward`) with pluggable per-action **verifiers**.
  New reward types = new verifier + a config row, no new infra.

## 5. Components

### 5.1 Funder hot wallet + Safe top-up
- A new Gnosis wallet (thirdweb smart account or plain EOA — EOA is simpler for a server
  signer and pays its own xDAI gas). Holds a **working float** of Münzen (target: ~1–2
  weeks of expected payouts) + a little xDAI for gas.
- **Key custody:** `FUNDER_PRIVKEY` as a Supabase secret (same model as `OPERATOR_PRIVKEY`
  in [`circles-invite`](../../../apps/expo/supabase/functions/circles-invite/index.ts)).
  Never in client, never logged.
- **Does the funder need to be a Circles human?** No — to *send* an existing group token it
  only needs to hold it (ERC-1155 transfer). It does NOT need to be registered or trusted.
  (It only would if we wanted it to *mint* its own Münzen — out of scope; refill comes from
  the Safe + closed loop.)
- **Top-up runbook:** when float < threshold, owners execute a Safe tx
  `Hub.safeTransferFrom(Safe → funder, münzenId, amount)`. Documented as an ops runbook.
  Safe can also sweep the funder back to itself anytime (`safeTransferFrom(funder→Safe)` is
  signed by the funder; or rotate the key).
- The Safe must first *hold* Münzen (today it holds 0). Seeding: an initial top-up from a
  citizen wallet (you) → Safe, or Safe acquires Münzen via the group. Tracked as Phase-1 ops.

### 5.2 Database schema (Supabase)

```sql
-- Per-action reward configuration (admin-editable, mirrors rewards_tasks style)
create table reward_config (
  action          text primary key,         -- 'proposal_vote' | 'event_submit' | 'post' | mission key …
  amount_atto     numeric not null,          -- payout in atto-Münzen (18 dp), modelled in §7
  enabled         boolean not null default true,
  per_reference   boolean not null default true,  -- true = once per (wallet, reference_id); false = once per wallet ever
  cooldown_hours  integer,                   -- for repeatable actions
  daily_cap       integer,                   -- max claims/wallet/day for this action (anti-farm)
  description     text,
  updated_at      timestamptz default now()
);

-- Idempotency + audit of every payout attempt
create table reward_claims (
  id            uuid primary key default gen_random_uuid(),
  wallet        text not null,
  action        text not null references reward_config(action),
  reference_id  text,                        -- pollId / event id / post id … (nullable)
  amount_atto   numeric not null,
  status        text not null,               -- 'pending' | 'paid' | 'failed' | 'rejected'
  tx_hash       text,
  error         text,
  created_at    timestamptz default now(),
  paid_at       timestamptz,
  unique (wallet, action, reference_id)       -- the core dup-guard (NULLs handled per-action)
);

-- Operational ledger of the funder float (mirror of on-chain, for dashboards/alerts)
create table funder_ledger (
  id           uuid primary key default gen_random_uuid(),
  direction    text not null,                -- 'payout' | 'charge' | 'topup' | 'sweep'
  wallet       text,                          -- counterparty
  amount_atto  numeric not null,
  ref          text,                          -- claim id / lootbox id / safe tx
  tx_hash      text,
  created_at   timestamptz default now()
);
```

Notes:
- `unique (wallet, action, reference_id)` is the single anti-double-pay guarantee. For
  actions with `per_reference=false`, use a sentinel `reference_id = action` so the unique
  index still applies "once per wallet ever".
- `reward_config` lets you tune the whole price/reward sheet without a deploy — essential
  given §7 recalibration is iterative.

### 5.3 `claim-reward` edge function

Interface:
```
POST /functions/v1/claim-reward
body: { wallet: string, action: string, referenceId?: string, proof?: { txHash?: string, ... } }
→ 200 { status: 'paid', amountAtto, txHash }
→ 200 { status: 'already_claimed' }
→ 4xx { status: 'rejected', reason }
```

Flow:
1. Load `reward_config[action]`; reject if missing/disabled.
2. Insert a `reward_claims` row `status='pending'` — **the unique index is the lock**; a
   duplicate insert → return `already_claimed` (idempotent, race-safe).
3. Enforce `cooldown_hours` / `daily_cap` from `reward_claims` history.
4. **Verify** the action via the per-action verifier (§5.4). On fail → `status='rejected'`.
5. **Pay**: load `FUNDER_PRIVKEY`, send `Hub.safeTransferFrom(funder, wallet, münzenId,
   amount, "0x")` (reuse the [`prepareSendRoebelTaler`](../../../apps/expo/lib/roebel-taler.ts)
   shape; server-signed via viem like the auto-invite bot). Wait for receipt.
6. Update claim `status='paid', tx_hash, paid_at`; append `funder_ledger`.
7. On send failure → `status='failed'` (retryable by a sweeper job; NOT re-paid because the
   unique row already exists — retry updates the same row).

Idempotency is the spine: the unique `reward_claims` row is created **before** payment, so a
crash/retry never double-pays.

### 5.4 Verifiers (pluggable, per action)

A verifier is `(wallet, referenceId, proof) → {ok: boolean, reason?}`.

- **`proposal_vote`** (first verifier): confirm `wallet` submitted a MACI message for
  `referenceId` (pollId) on the Gnosis MACI contract — read the message-submission
  log/tx; do NOT (cannot) inspect the encrypted choice. Reward = flat civic bonus, once per
  poll. *Dependency:* Gnosis MACI/Governor must be live (Base→Gnosis migration; tracked as a
  risk in §11).
- **`event_submit`**: DB-only — verify a row exists in the events table authored by `wallet`
  and (optionally) approved by an admin. No on-chain check.
- **`post` / `comment`**: DB-only + strict `daily_cap` + admin/curation gate to prevent
  content farming. (Default: ship gated or disabled until anti-spam is proven.)
- **Mission tasks**: reuse existing eligibility logic (`isTaskEligible`) as the verifier;
  the existing `complete_reward_task` RPC becomes a thin caller of the payout instead of
  `increment_roebel_points`.

### 5.5 Sink / "charge" mechanics (Phase 2 preview)
- To spend (buy a lootbox key), the **user** signs `safeTransferFrom(user → funder,
  münzenId, price)` from the app (gasless via their smart account). The backend confirms the
  inbound transfer (tx receipt or Circles RPC), then grants the key (existing
  `user_lootbox_keys`). Spend returns to the funder → closes the loop.
- Lootbox `coin_bundle` drops become small funder→user payouts (a sink that occasionally
  pays out; budget for it).

## 6. Phased roadmap

| Phase | Scope | Visible to users? |
|---|---|---|
| **1 (this spec)** | Funder wallet + Safe top-up; `reward_config`/`reward_claims`/`funder_ledger`; `claim-reward` edge fn; `proposal_vote` verifier; admin dashboard read-out | One real reward (vote → Münzen) |
| 2 | Close the loop: lootbox keys charged in Münzen → funder; migrate `purchase_lootbox_key`/`open_lootbox` | Schatzkammer runs on Münzen |
| 3 | More earn verifiers (event_submit, invite-a-citizen, checkpoints, stamps), anti-abuse | Civic actions pay Münzen |
| 4 | Retire points: migrate remaining `increment_roebel_points` call-sites; one-time balance migration policy (TBD); remove points UI | Münzen only |
| 5 | Physical bridge: merchant acceptance (QR/Metri), EURe on/off-ramp, raffles, tipping | Real-world economy |

## 7. Reward & price recalibration (economic params)

A first-pass model to size amounts against the faucet ceiling (15 citizens × ~24/day ≈
**360 Münzen/day** theoretical max community income):
- Daily mint stays the dominant income (self-minted, not funder-paid).
- Funder-paid civic rewards sized **small** relative to daily income, e.g. vote bonus
  0.5–1 Münze, event submit 2–5, so total funder outflow ≪ daily community mint.
- Lootbox key price set so the **sink ≈ source** over a week (closed loop balances).
- All amounts live in `reward_config` and are tuned empirically post-launch. Exact starting
  numbers are an open item (§11) — modelled together before Phase 1 ships its first reward.

## 8. Security & anti-abuse
- Hot-wallet float capped to ~1–2 weeks of payouts; Safe holds the reserve; Safe can sweep
  the float instantly. Blast radius of a key leak = the float only.
- `FUNDER_PRIVKEY` is a Supabase secret; rotate-able; never client-side.
- Every action: unique `reward_claims` row (no double-pay), `daily_cap`, `cooldown_hours`.
- Governance: flat once-per-proposal participation bonus; never scaled by weight/choice
  (no vote-buying). MACI secrecy untouched.
- Content actions (post/comment) default gated/curated until spam-resistant.
- Edge function authenticates the caller wallet (JWT/owner-of-smart-account) so users can't
  claim for other wallets; verifiers re-check on-chain/DB truth regardless.

## 9. Error handling
- Pre-payment unique row ⇒ crashes/retries never double-pay.
- Failed send ⇒ `status='failed'`, retried by a sweeper (updates same row).
- Verifier indeterminate (RPC down) ⇒ leave `pending`, retry later; never pay on uncertainty.
- Funder out of float ⇒ `status='failed'` + ops alert; user can re-claim after top-up.

## 10. Testing
- Unit: cidless math, amount/atto conversions, verifier logic with mocked chain/DB.
- Integration: claim-reward against a Gnosis fork/testnet funder; assert idempotency (double
  POST → single payment), cap/cooldown enforcement, balance moves.
- Manual: real `proposal_vote` end-to-end on one poll; confirm participation-only (no choice
  leakage), once-per-poll, on-chain receipt, dashboard reflects it.

## 11. Open questions / risks
1. **Gnosis MACI/Governor liveness** — the `proposal_vote` verifier needs the migrated
   Gnosis governance stack. If not live, Phase 1's first verifier swaps to a DB-only action
   (e.g., `event_submit`) and `proposal_vote` waits for the governance cutover.
2. **Starting amounts** — the §7 numbers are placeholders; finalize the reward/price sheet
   before enabling the first reward.
3. **Safe seeding** — the Safe holds 0 Münzen today; decide the initial seed source/amount.
4. **Points balance migration** at Phase 4 — convert existing balances to Münzen, or sunset?
   (Policy decision; affects fairness/expectation.)
5. **Funder as EOA vs smart account** — EOA simpler for a server signer; confirm gas model.

## 12. Out of scope (for now)
- On-chain event-watcher/cron trigger (Phase 1 uses app-initiated + server-verified; watcher
  is a later hardening).
- Wrapping Münzen to ERC-20 / a custom ERC-1155 Safe Allowance Module.
- Merchant/physical rails and EURe ramps (Phase 5).
```
