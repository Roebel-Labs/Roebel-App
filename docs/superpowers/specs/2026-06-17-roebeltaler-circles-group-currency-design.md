# Röbeltaler — Circles v2 Group Currency (Design Spec)

> **Status:** Draft for review.
> **Scope:** Spec #1 — a *thin, end-to-end vertical slice* of a collateral-backed Circles v2
> group currency ("Röbeltaler") for a small pilot cohort. Proves every link in the chain on
> real Gnosis before scaling to all citizens.
> **Date:** 2026-06-17.
>
> Background docs:
> - [`CIRCLES_V2_FEATURE_VISION.md`](../../CIRCLES_V2_FEATURE_VISION.md) — the full feature landscape.
> - [`CIRCLES_V2_INTEGRATION_RESEARCH.md`](../../CIRCLES_V2_INTEGRATION_RESEARCH.md) — protocol ↔ codebase mapping.
> - [`CIRCLES_V2_CHAIN_STRATEGY.md`](../../CIRCLES_V2_CHAIN_STRATEGY.md) — Base↔Gnosis decision.

---

## 1. Goal & success criteria

Enable a pilot cohort (the 5 Attesters + a handful of test citizens) to go, end-to-end, from
*verified Röbel citizen* to *holding and sending a real, collateral-backed Röbeltaler*, on Gnosis
Chain, with the existing seedless/gasless UX preserved.

**Done when**, for a pilot user:
1. A verified `CitizenNFT` holder taps "Join Röbeltaler" and is registered as a Circles **human**
   on Gnosis, gated by their citizenship (the invite is the sybil bridge).
2. Their **personal CRC** accrues and is claimable.
3. They convert some personal CRC into **Röbeltaler** (collateral deposited to the group treasury).
4. They **send Röbeltaler** to another pilot user, who sees the balance arrive.
5. Balances reflect **demurrage** (live, never cached stale).
6. The off-chain `roebel_points` system is **untouched** (kept as a backup, no migration).

**Explicitly out of scope for spec #1** (deferred to later specs): merchant QR payment, marketplace
settlement, mutual aid, tipping, participatory budgeting, full citizen rollout, points migration.

---

## 2. Non-negotiable constraints

- **No redeployment of the existing stack.** `CitizenNFT`, `AttesterNFT`, MACI, Governor, Timelock
  remain on Base, unchanged. No MACI key ceremony is repeated.
- **Circles is not deployed by us.** Circles v2 (Hub v2, Base Mint Policy, Standard Treasury, Name
  Registry) is already live on Gnosis. We *register against* it; we do not deploy a token.
- **Wallet addresses never shown in UI** (existing rule) — resolve to display name.
- **Regulatory posture:** Röbeltaler is an **experimental community currency, NOT 1:1
  euro-redeemable**, and is kept separate from the existing `roebel_card` euro voucher. No real-euro
  redemption in this slice. (Legal review precedes any future merchant/real-goods phase.)

---

## 3. Architecture & chain layout

```
 BASE (unchanged)                         GNOSIS (new, thin)
 ─────────────────                        ──────────────────────────────
 CitizenNFT (soulbound) ──┐               Circles Hub v2 (existing, by Circles team)
 AttesterNFT             │                 ├─ human avatars (pilot citizens)
 MACI / Governor         │                 ├─ Röbeltaler group  ── owned by ──► Attester Safe (3-of-5)
                         │                 │    ├─ Base Mint Policy
                         │                 │    └─ Standard Treasury (holds pCRC collateral)
                         │                 └─ Röbel operator avatar (issues invites)
                         │
                         ▼
              Backend bridge (Supabase Edge Function)
              reads CitizenNFT on Base → operator invites user on Gnosis
```

**Happy path:** citizen taps "Join Röbeltaler" → Edge Function confirms `CitizenNFT` on Base →
operator avatar invites the user's Gnosis address → client registers the human avatar → personal
CRC accrues → user converts chosen pCRC to collateral → receives Röbeltaler → sends to a neighbour.

---

## 4. Components (isolated units)

Each unit lists: **what it does · how it's used · what it depends on.**

### 4.1 Gnosis wallet provider (client)
- **Does:** Auto-connects a smart account on Gnosis (chain 100) derived from the *same* thirdweb
  in-app login the user already has on Base. Persists the Gnosis address to Supabase. Hidden from UI.
- **Used by:** every other client unit (registration, mint, send).
- **Depends on:** thirdweb SDK; existing `WalletBootContext`.
- **⚠️ Open (spike #1):** whether a thirdweb 4337 smart account can be a Circles **human** avatar, or
  whether we must use a **Safe** smart account (Metri/Circles convention). If the latter, this unit
  provisions a Safe smart account on Gnosis instead. *Resolve before any other unit is built.*

### 4.2 Citizenship→invite Edge Function (backend)
- **Does:** Given an authenticated user + their target Gnosis address, reads `CitizenNFT.hasCitizenNFT(baseWallet)`
  on Base; if true, has the **operator avatar** invite that Gnosis address into Circles. Idempotent
  (one invite per citizen; records state in Supabase).
- **Used by:** the "Join Röbeltaler" client flow.
- **Depends on:** Base RPC, packages/blockchain CitizenNFT ABI, operator avatar key (server-held),
  Circles SDK/contract calls on Gnosis.
- **Security:** server-held operator key is invite-only — it cannot move user funds or decrypt votes.

### 4.3 Circles registration + UBI (client)
- **Does:** After the invite, registers the user as a Circles human; surfaces "you're in" state;
  claims accruing personal CRC (`personalMint`).
- **Depends on:** 4.1, 4.2, Circles SDK.

### 4.4 Röbeltaler group setup (one-time, burner wallet → Safe)
- **Does:** Registers the Röbeltaler **group** on Hub v2 with the Base Mint Policy + Standard
  Treasury; sets name/symbol via Name Registry (≤12 chars, base58). Bootstrapped by a burner wallet,
  then ownership transferred to the **Attester 3-of-5 Safe**.
- **Depends on:** burner wallet (user-provided), Circles SDK, a deployed Gnosis Safe for the committee.
- **Note:** this is operational setup, run once — captured as a documented runbook, not app code.

### 4.5 Membership / trust (setup + client)
- **Does:** Group trusts pilot members (so their pCRC is acceptable collateral); members trust the
  group (so they accept Röbeltaler). Pilot cohort is an allowlist.
- **Depends on:** 4.4, Circles trust calls.

### 4.6 Mint Röbeltaler (client)
- **Does:** User chooses an amount of personal CRC to deposit as collateral → receives Röbeltaler via
  the Standard Treasury. UI copy: "X Guthaben → X Röbeltaler."
- **Depends on:** 4.3, 4.5, Circles SDK group-mint call.

### 4.7 Send + balance UI (client)
- **Does:** Reskins the existing `/roebel-card/` balance screens onto the live Röbeltaler balance;
  peer-to-peer send between pilot users via the Circles pathfinder (transitive transfer). Demurrage
  framed gently (Mecky can explain "warum schrumpft mein Guthaben?").
- **Depends on:** 4.6, Circles SDK pathfinder/transfer.

### 4.8 Supabase state
- **Does:** New columns/table for `gnosis_address`, Circles avatar/registration status, group
  membership, `pilot_cohort` flag.
- **Constraint:** existing `roebel_points_card` / `roebel_points_ledger` are **not modified**.

---

## 5. Data flow (happy path, sequence)

1. Pilot user (already a verified citizen) opens Röbeltaler screen → taps **Join**.
2. Client ensures Gnosis smart account exists (4.1) → sends Gnosis address to Edge Function (4.2).
3. Edge Function verifies `CitizenNFT` on Base → operator invites the Gnosis address.
4. Client registers human avatar (4.3) → personal CRC begins accruing; user claims it.
5. User taps **Convert** → deposits chosen pCRC → Treasury mints Röbeltaler to them (4.6).
6. User taps **Send** → pathfinder routes Röbeltaler to recipient (4.7) → recipient balance updates.

---

## 6. Decisions (resolved)

| Decision | Choice |
|---|---|
| Currency model | Collateral-backed standard Circles group (pCRC → gCRC), redeemable from treasury |
| First-build scope | Thin end-to-end vertical slice for a pilot cohort |
| Treasury governance | Attester committee as a **Gnosis Safe, 3-of-5** (mirrors Shamir 3-of-5); burner bootstraps then hands off |
| Points migration | **None.** Off-chain points kept as-is, independent backup |
| Invite operator | Dedicated Röbel operator avatar, funded with CRC to pay invite costs |
| Gas | Try thirdweb paymaster on Gnosis; fallback = fund accounts (sub-cent gas) |
| Identity gating | Backend attestation of `CitizenNFT` (Option A); on-chain bridge deferred |

---

## 7. Error handling & edge cases

- **Smart-account incompatibility (spike #1):** if thirdweb 4337 accounts can't be Circles humans,
  switch the Gnosis side to Safe smart accounts. Gate all other work behind this result.
- **CitizenNFT revoked:** Edge Function refuses new invites. v1 does **not** auto-unwind an
  already-issued Circles membership — documented limitation, handled in a later spec.
- **Idempotency:** invite + registration are idempotent; re-taps never double-invite or double-register.
- **RPC reliability:** use a reliable Gnosis RPC and verify tx receipts (reapply the publicnode
  null-receipt lesson from the MACI rollout).
- **Demurrage drift:** UI always reads live balances; never displays a cached number.
- **Insufficient pCRC for collateral:** block mint with a clear message ("erst Guthaben sammeln").
- **Operator avatar runs out of invite CRC:** monitored; refill runbook.

---

## 8. Testing strategy

- **End-to-end script (Circles SDK):** register → claim pCRC → mint Röbeltaler → send → assert
  recipient balance. Runs against real Gnosis (cheap) with two pilot accounts.
- **Edge Function unit tests:** mock `CitizenNFT` reads (holder / non-holder / revoked); assert
  invite idempotency and refusal paths.
- **Manual pilot acceptance:** the 5 Attesters complete the full happy path on their own devices;
  UX checked for the "two concepts" (invite step, demurrage).

---

## 9. Spike tasks (do FIRST, before plan execution)

1. **thirdweb vs Safe smart account as Circles human avatar on Gnosis** — the gating unknown.
2. **Circles invite mechanics & cost** — confirm invite flow, per-invite CRC cost, and whether any
   bootstrap-period no-invite path still applies; size the operator avatar's CRC funding.
3. **thirdweb paymaster availability on Gnosis (chain 100)** — confirm sponsorship or choose the
   funded-accounts fallback.
4. **Circles SDK group registration + mint + pathfinder transfer** — smallest working script to
   register a throwaway group, mint, and transfer, to validate the SDK surface we depend on.

---

## 10. What we are NOT doing (YAGNI)

- No merchant QR pay, marketplace, mutual aid, tipping, events, participatory budgeting, reputation —
  all later specs.
- No points migration / conversion.
- No on-chain cross-chain citizenship bridge (backend attestation suffices for the pilot).
- No MACI on Gnosis, no key ceremony.
- No full citizen rollout — pilot allowlist only.
