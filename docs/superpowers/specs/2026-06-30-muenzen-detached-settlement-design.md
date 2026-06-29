# Detached on-chain settlement for Röbel-Münzen rewards

**Date:** 2026-06-30
**App:** `apps/expo`
**Status:** Design — approved direction, pending spec review

## Problem

Every Röbel-Münzen reward that involves an on-chain transaction blocks the
success reveal on that transaction. The reward screen
([`MuenzenRewardView`](../../../apps/expo/components/rewards/MuenzenRewardView.tsx))
opens instantly in a loading state via
[`celebratePending()`](../../../apps/expo/context/RewardCelebrationContext.tsx),
but the headline ("+5 Münzen") is gated on the `await`, so the user watches a
spinner with rotating reassurance labels for the full settlement time.

The two blocking flows:

- **Daily mint** ([`onDailyMint`](../../../apps/expo/app/rewards/index.tsx)) —
  [`dailyMint()`](../../../apps/expo/hooks/useRoebelTaler.ts) fires **two**
  sequential gasless txs on Gnosis (personalMint → groupMint) then re-reads the
  balance. ~20-30s.
- **Voting** ([`castVote`](../../../apps/expo/components/VoteButtons.tsx)) — a
  MACI `publishMessage` transaction plus a `coordinatorPubKey()` read. ~20-30s.

The wait *feels broken* even though it isn't. The checkpoint/QR path
([`explorer.tsx`](../../../apps/expo/app/explorer.tsx)) is already fire-and-forget
(snackbar now, celebration when the funder pays) and is **not** a blocking
offender.

## Goal

Decouple the celebration UI from on-chain settlement. The reward screen reveals
the (already-known) amount after a short beat; the transaction settles
invisibly in the background with retry; the balance updates optimistically and
reconciles to chain truth when the tx lands. A genuine, unrecoverable failure
surfaces only as a soft, non-blocking notice.

## Decisions (locked)

| Question | Decision |
| --- | --- |
| Background-mint hard failure after we showed success | **Silent retry + soft notice** only on terminal failure |
| Pacing of the reward moment | **Short anticipation beat** (~1500-2000ms loading), then reveal, then settle in background |
| Balance during the ~20-30s settle | **Optimistic bump + reconcile** to chain truth |
| Where shared optimistic state lives | **Approach A — lift `useRoebelTaler` into `RoebelTalerProvider`** |
| Checkpoint/QR path | **Phase 2** (already non-blocking; migrate later for consistency) |

## Architecture

Three concerns, three pieces.

### 1. `RoebelTalerProvider` (shared balance + optimistic delta)

`useRoebelTaler` is currently a per-component hook instantiated in ~7 places
(`rewards/index`, `rewards/schatzkammer`, `rewards/lootbox/[id]`, `rewards/send`,
`e/[id]`, `profile/CoinsCard`, …), each polling `getMintableTaler` on its own
60s interval and refreshing independently. Lift the hook body into a single
`RoebelTalerProvider` mounted just below `GnosisWalletProvider` in
`app/_layout.tsx`. Call sites keep the **identical return shape** — only the
import path changes (`useRoebelTaler()` now reads context). This:

- collapses 7 independent pollers into one,
- gives the optimistic delta and settlement queue a single home,
- removes the momentary cross-screen balance inconsistency.

New state in the provider:

- `pendingDeltas: Map<settlementId, number>` — optimistic balance contributions.
- Displayed balance everywhere = `realBalance + Σ pendingDeltas`.
- `talerBalance` / `balanceRaw` getters incorporate the deltas so every consumer
  shows the optimistic number with no per-call-site change.

On `refresh()` (reconcile) the real balance is replaced with chain truth and the
settled delta is removed in the same commit — no double-count, no flicker.

### 2. Settlement queue

A method on the provider (or a thin `MuenzenSettlementProvider` colocated with
it — implementation detail for the plan):

```ts
enqueueSettlement({
  label: string,                 // "Münzen" | "Stimme" — soft-notice copy
  amount: number,                // optimistic balance delta (0 for a vote)
  settle: () => Promise<void>,   // the detached slow on-chain work
  onConfirmed?: () => void,      // after success (advance streak from real state)
  onFailed?: () => void,         // terminal-failure rollback (clear cooldown, …)
}): void
```

Behaviour:

1. Register an optimistic delta of `amount` under a fresh `settlementId`.
2. Run `settle()` with up to **3 attempts**, exponential backoff (e.g. 0 / 3s /
   9s). Retries cover transient RPC / receipt-null / gas hiccups.
3. **Success** → `refresh()` (folds amount into real balance, drops the delta),
   then `onConfirmed()`.
4. **Terminal failure** (all retries exhausted) → drop the delta, run
   `onFailed()`, and show a **soft snackbar** (never a blocking alert):
   *"Deine {label} sind noch unterwegs — wir versuchen es gleich erneut."*
   Copy stays de-jargoned — never "CRC"/"Circles"/"Token".

The queue runs settlements concurrently (rewards are independent); each owns its
own delta and lifecycle.

### 3. Pacing — anticipation beat

A new declarative call on the reward-celebration context collapses today's
`celebratePending → try/await/resolve/fail` boilerplate:

```ts
celebrateSettling({
  amount,        // known up front (talerMintable for mint, fixed for vote)
  coin,          // 'single' | 'many'
  subtitle,
  settle,        // detached slow work, handed to enqueueSettlement
  onConfirmed?,
  onFailed?,
})
```

State machine:

```
open screen (loading beat) ──max(beat, prepare)──▶ reveal known amount ──▶ Weiter
   │                                                     │
   │ prepare = fast, gated preconditions                 │ enqueueSettlement(settle)
   │   throws → NO celebration, real error               │   fires here; slow tx detached
   └─ beat ≈ 1500-2000ms                                 └─ optimistic delta registered
```

- **Prepare phase** (synchronous, gated, fast, fail-able): preconditions that
  must still block — account ready, `mintable > 0`; for votes: read
  `coordinatorPubKey`, build + sign the MACI message, prepare the tx. If prepare
  throws it is a *real* error → abort, no celebration, surface it (today's
  behaviour preserved). Honesty is kept: only the slow, retryable send is made
  optimistic.
- **Reveal**: at `max(beat, prepare-done)` the amount slides in (existing
  animation) and the optimistic delta is applied. A hard cap (~4s) guards
  against a pathologically slow prepare so the user is never trapped.
- **Settle phase** (detached): only the slow `sendTransaction` call(s) run in the
  background queue.

The reward screen shows **no** chain status after reveal — the whole point is to
abstract settlement away. The soft notice is the only failure surface.

## Per-flow behaviour

### Daily mint
- `prepare`: assert `gnosisAccount` ready and `received = max(1, round(talerMintable))`.
- On reveal: optimistically set local cooldown (`rtClaimKey`) and advance the
  streak (`rtStreakKey`) so the "Heute abholen" button flips immediately.
- `settle`: `sendTransaction(prepareDailyMint())` → `getPersonalCrcBalance` →
  `sendTransaction(prepareContributeToRoebelTaler(...))` → `refresh()`.
- `onConfirmed`: re-derive streak from real state if needed (no-op in the common
  path).
- `onFailed`: clear the optimistic cooldown + streak bump so the user can retry;
  the mintable accrual is still on-chain, so the next refresh shows it again.

### Vote
- `prepare`: existing input validation — `coordinatorPubKey()` read,
  `buildVoteMessage`, `prepareContractCall`. These stay synchronous and gated.
- The privacy bottom sheet now opens on close **unconditionally** — the vote is
  *committed* once enqueued (today it gates on `voteSucceeded`, which is no
  longer known at close time). Changing an existing vote stays reward-free and
  skips the celebration, as today.
- `settle`: the `publishMessage` send, then the Supabase mirror, then
  `claimReward` (chained in that order, as today).
- The vote's Münzen payout is **unknown up front** (it comes from `claimReward`
  after the tx), so there is **no optimistic delta** (`amount = 0`) and the
  reward screen reveals a number-less thank-you headline ("Stimme abgegeben")
  instead of a count. The payout, if any, lands in the balance via the
  post-settle reconcile — not an optimistic bump.

### Checkpoint / QR — Phase 2
Already detached. Migrate `claimReward` through `enqueueSettlement` in a
follow-up so it shares optimistic balance + soft-notice consistency. Not in this
change.

### Tasks via `celebrate()` — unchanged
Supabase RPC, already instant. No on-chain settle.

## Visual / copy

- **Amount headline font** → `MonaSansSemiCondensed-Bold` (the `heading` token),
  replacing `Inter-Bold` in
  [`MuenzenRewardView.tsx`](../../../apps/expo/components/rewards/MuenzenRewardView.tsx)
  `styles.amount`. Reads tighter and cleaner at the 60px amount size.
- Loading-beat label: since the beat is short and time-boxed, a single line is
  enough (e.g. "Münzen werden abgeholt…"); the existing rotating-list / pixel
  `ScrambleText` component is retained but typically shows one label.
- Soft-notice snackbar copy (terminal failure only): de-jargoned, reassuring,
  never exposes CRC/Circles/Token wording.

## Out of scope

- Reward illustrations and the gradient treatment.
- The MACI / Circles contract logic itself.
- Privacy-sheet copy (only the *gating condition* changes for votes).
- Task rewards.
- The checkpoint/QR migration (phase 2).

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Optimistic balance double-counts on reconcile | Display = `real + Σ deltas`; reconcile replaces real **and** drops the delta atomically |
| Daily-mint cooldown set but mint hard-fails | `onFailed` clears local cooldown/streak; on-chain mintable still present → user retries |
| Prepare-phase failure after we "committed" | Prepare stays synchronous/gated → no celebration on precondition failure |
| Lifting the hook regresses a call site | Provider exposes the identical return shape; change is import-only per consumer |
| Two quick rewards race | Existing `RewardCelebration` visual queue + per-settlement ids in the settle queue |

## Success criteria

- Tapping "Heute abholen" reveals the amount within ~2s and returns the user to a
  usable screen while the mint settles in the background.
- The displayed balance reflects the reward immediately and matches chain truth
  after settlement, with no flicker or double-count.
- A forced settlement failure produces a single soft snackbar and a corrected
  balance — never a blocking alert mid-flow.
- Voting reveals the celebration within ~2s; the privacy sheet appears on
  dismiss; the ballot still lands on-chain.
- No call site shows a different balance than another for the same account.
