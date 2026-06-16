# Röbeltaler — Circles v2 Group Currency (Design Spec v2)

> **Status:** Draft for review (supersedes v1).
> **What changed vs v1:** v1 assumed a *split* architecture (identity/governance stays on Base,
> Circles on Gnosis, joined by a backend bridge). With only **15 verified citizens (4 Attesters)**,
> a full migration to Gnosis is now cheap and is the long-term-correct home. This v2 is therefore
> **two-phase**: Phase 0 migrates the identity/governance stack to Gnosis; Phase 1 builds the
> Röbeltaler slice **natively, same-chain, with no cross-chain bridge**. The deletion of the bridge
> removes an entire risky component and several edge cases.
> **Date:** 2026-06-17.
>
> Background docs:
> - `CIRCLES_V2_FEATURE_VISION.md` — full feature landscape.
> - `CIRCLES_V2_INTEGRATION_RESEARCH.md` — protocol ↔ codebase mapping.
> - `CIRCLES_V2_CHAIN_STRATEGY.md` — Base↔Gnosis decision (now resolved: **consolidate on Gnosis**).

---

## 0. Why this is now two phases (read first)

The single most important correction over v1: **we migrate, we do not bridge.** The cross-chain
machinery in v1 existed only because `CitizenNFT` was live on Base while Circles is Gnosis-only.
At 15 citizens / 4 Attesters this is the cheapest the migration will ever be, and Gnosis is the
natural long-term home for the entire Netizen Stack (Safe is Gnosis-native; Circles, EURe/Monerium,
and Gnosis Pay are all native there; Base's consumer-liquidity advantages are irrelevant to an
invisible-crypto civic app).

Consequence: once `CitizenNFT` lives on Gnosis, the Röbeltaler group's membership condition reads
citizenship **directly on-chain, same chain**. The v1 backend bridge (`§4.2`), the two-address
problem, and the future cross-chain treasury-execution problem all disappear.

- **Phase 0** — Migrate identity + governance to Gnosis. (Own runbook; summarized in `§4`.)
- **Phase 1** — Röbeltaler thin vertical slice, native on Gnosis. (Primary scope of this doc.)

Phase 1's Circles spikes (`§10`) are chain-local and use throwaway accounts, so they can be run on
Gnosis **immediately**, in parallel with Phase 0 preparation. We build the Circles integration once.

---

## 1. Goal & success criteria (Phase 1)

Enable a pilot cohort (the Attesters + a handful of test citizens) to go, end-to-end, from
*verified Röbel citizen* to *holding and sending a real, collateral-backed Röbeltaler*, on Gnosis
Chain, with the existing seedless/gasless UX preserved.

**Done when**, for a pilot user:
1. A verified `CitizenNFT` holder (now on Gnosis) taps "Join Röbeltaler" and is registered as a
   Circles **human**, gated by an **on-chain** citizenship check (no backend attestation, no bridge).
2. Their **personal CRC** accrues and is claimable (auto-claimed in the background by the smart account).
3. They convert some personal CRC into **Röbeltaler** (collateral deposited to the group's collateral vault).
4. They **send Röbeltaler** to another pilot user, who sees the balance arrive.
5. Balances reflect **demurrage** (live, never cached stale).
6. The off-chain `roebel_points` system is **untouched** (kept as an independent backup, no migration).

**Explicitly out of scope for Phase 1** (deferred to later specs): merchant QR payment, marketplace
settlement, mutual aid, tipping, participatory budgeting, native reputation, full citizen rollout,
points migration, EURe/RöbelCard euro rail, transaction privacy.

---

## 2. Non-negotiable constraints

- **Consolidate on Gnosis (Phase 0).** `CitizenNFT`, `AttesterNFT`, MACI, Governor, Timelock, and
  the Coordinator are redeployed/repointed to Gnosis Chain (chain 100). After Phase 0 there is
  exactly one chain. (v1's "no redeployment" constraint is intentionally **reversed**.)
- **Circles is not deployed by us.** Circles v2 (Hub v2, Base Mint Policy, Standard Treasury, Name
  Registry) is already live on Gnosis. We *register against* it; we never deploy a token contract.
- **One human, one avatar, one address.** Same thirdweb in-app login derives the Gnosis smart
  account. No second chain, no address-binding problem.
- **Wallet addresses never shown in UI** (existing rule) — always resolve to display name.
- **Regulatory posture (firewall):** Röbeltaler is an **experimental community currency, minted
  from citizenship, NOT issued against euros and NOT 1:1 euro-redeemable.** This is deliberate: it
  keeps Röbeltaler outside the German E-Geld definition, whose trigger is *issuance against payment
  of a sum of money* (ZAG § 1 Abs. 2). No euro in, no euro out, in this slice. Kept strictly
  separate from the existing `roebel_card` euro voucher. The euro spending path is **not abandoned**
  — it is a *separate future layer* (RöbelCard = Gnosis Pay card settling in EURe, regulatory burden
  on Monerium/Monavate, not on us), also Gnosis-native. Legal review precedes any merchant/real-goods phase.
- **Points are not money.** `roebel_points` stay free, unregulated, and separate. Converting points
  into Röbeltaler would be the regulated-money event; we never do it. The separation is a firewall,
  not a convenience.

---

## 3. Architecture & chain layout (single chain)

```
 GNOSIS CHAIN (chain 100) — one chain, no bridge
 ────────────────────────────────────────────────────────────────────────────

  MIGRATED STACK (Phase 0)                CIRCLES v2 (existing, by Circles team)
  ─────────────────────────               ─────────────────────────────────────
  CitizenNFT (soulbound) ───reads───►     Hub v2
  AttesterNFT                              ├─ human avatars (pilot citizens, Safe smart accounts)
  MACI / Governor / Timelock               ├─ Röbeltaler GROUP
  Coordinator (Fly.io → Gnosis RPC)        │    ├─ Base Mint Policy (immutable once registered)
                                           │    ├─ Membership condition ──reads──► CitizenNFT (same chain!)
                                           │    ├─ Collateral Vault  (holds pCRC; mechanical; NOT spendable)
                                           │    └─ fee-collection-address ──► Stadt-Safe
                                           └─ Röbel operator avatar (Circles invite mechanic only)

  THREE MONEY POOLS — keep strictly separate:
   (A) Collateral Vault   : backs Röbeltaler, belongs to depositors, mechanical, demurrages, unspendable.
   (B) Group admin Safe   : 3-of-N Attester Safe; owns the GROUP (membership, trust, policy params, fee addr).
   (C) Stadt-Safe (civic) : the spendable civic treasury; funded by fees + grants + business fees + donations.
                            Empty/deferred in Phase 1. NOT funded by demurrage.
```

**Happy path:** citizen taps "Join Röbeltaler" → membership condition verifies `CitizenNFT`
on-chain → human avatar registered → personal CRC accrues (auto-claimed) → user converts chosen pCRC
to collateral → receives Röbeltaler → sends to a neighbour. No backend bridge anywhere in this path.

---

## 4. Phase 0 — Migration to Gnosis (summary; own runbook)

Scoped briefly here because it gates Phase 1; the full migration (especially MACI redeploy + key
ceremony) deserves its own detailed runbook/spec.

- **CitizenNFT + AttesterNFT:** redeploy soulbound contracts on Gnosis; re-issue to the 15 citizens
  / 4 Attesters. Because soulbound, this is a re-mint ceremony (cannot transfer), trivial at 15.
  Each citizen confirms their Gnosis smart account (same thirdweb login) during re-issuance.
- **MACI / Governor / Timelock:** redeploy on Gnosis. zKeys are circuit-specific, not chain-specific,
  so the production trusted-setup keys port unchanged. Past pilot proposals: restart fresh on Gnosis
  (little history worth migrating at this stage).
- **Coordinator key federation:** re-run the 3-of-5 Shamir key ceremony for the Gnosis deployment.
- **Coordinator service:** repoint the Fly.io machine to a reliable Gnosis RPC (config change).
- **Surfaces to update:** `roebel.app` contract addresses, the "live on Base" copy on `netizenlabs.xyz`,
  any indexers/subgraphs.
- **Migration done when:** all 15 citizens hold a Gnosis `CitizenNFT`, the committee holds AttesterNFTs,
  one test proposal completes a full private vote + tally + execution on Gnosis, and the coordinator
  finalizes on Gnosis.

> **Decouple new towns:** town #2 and onward launch on Gnosis from day one. They never inherit a
> Base legacy, so they never need a migration. Röbel's migration is legacy cleanup; the product
> default chain is Gnosis going forward.

---

## 5. Components (Phase 1, isolated units)

Each unit lists: **what it does · how it's used · what it depends on.**

### 5.1 Gnosis smart account provider (client)
- **Does:** Provisions/loads the user's Gnosis smart account derived from the same thirdweb in-app
  login. **Account type = Safe smart account** (Circles/Metri convention), managed via thirdweb.
  Persists the address to Supabase. Hidden from UI.
- **Used by:** every other client unit.
- **Depends on:** thirdweb SDK (as auth/management), Safe on Gnosis, existing `WalletBootContext`.
- **⚠️ Spike #1 (gating):** confirm a Safe (vs thirdweb-native 4337) smart account can be a Circles
  **human** avatar. Hypothesis: **Safe**, because it matches Circles/Metri and your existing 3-of-5
  federation. Resolve before any other unit is built.

### 5.2 On-chain citizenship gate (membership condition)
- **Does:** The Röbeltaler group's membership condition checks `CitizenNFT.hasCitizenNFT(gnosisWallet)`
  **directly on Gnosis**. Only verified citizens can join the group / have pCRC accepted as collateral.
  Replaces v1's backend Edge Function entirely.
- **Used by:** the "Join Röbeltaler" flow.
- **Depends on:** migrated `CitizenNFT` on Gnosis, the group's membership-condition contract.
- **Note:** the Circles *invite* mechanic (if human registration requires an inviter) is handled by
  the operator avatar (`§5.4`) — but citizenship *proof* is on-chain, not a trusted backend signature.

### 5.3 Circles registration + UBI (client)
- **Does:** Registers the user as a Circles human; surfaces "you're in" state; auto-claims accruing
  personal CRC (`personalMint`) in the background so the citizen never sees a "claim" chore and the
  minimum-activity requirement never silently stalls their faucet.
- **Depends on:** 5.1, 5.2, Circles SDK.

### 5.4 Röbeltaler group setup (one-time runbook)
- **Does:** Registers the Röbeltaler **group** on Hub v2 with the Base Mint Policy; sets name/symbol
  via Name Registry. Sets the **fee-collection-address → Stadt-Safe** (pilot fee rate = 0). Bootstrapped
  by a burner wallet, then ownership transferred to the **Attester Safe** (group admin, pool B).
- **Depends on:** burner wallet, Circles SDK, a deployed Gnosis Safe for the committee.
- **⚠️ Symbol must be ASCII/base58, ≤12 chars:** "ö" is not base58. On-chain symbol e.g. `ROBELTALER`
  or `RTLR`; display name stays "Röbeltaler".
- **⚠️ One-way commit:** the mint policy is **immutable once the group is registered.** Spike #5
  (`§10`) MUST be resolved before this unit runs.
- **Note:** operational setup, run once — documented runbook, not app code.

### 5.5 Membership / trust (setup + client)
- **Does:** Group trusts pilot members (their pCRC becomes acceptable collateral); members trust the
  group (they accept Röbeltaler). This is the "everyone auto-trusts the town hub" seeding, which is
  what lets any two citizens transact through the group vertex without trusting each other directly.
  Pilot cohort is an allowlist gated by `CitizenNFT`.
- **Depends on:** 5.4, Circles trust calls.

### 5.6 Mint Röbeltaler (client)
- **Does:** User chooses an amount of personal CRC to deposit as collateral → receives Röbeltaler
  via the collateral vault. UI copy: "X Guthaben → X Röbeltaler."
- **Depends on:** 5.3, 5.5, Circles SDK group-mint call.

### 5.7 Send + balance UI (client)
- **Does:** Reskins the existing `/roebel-card/` balance screens onto the live Röbeltaler balance;
  peer-to-peer send between pilot users. Demurrage framed gently (Mecky explains "warum schrumpft
  mein Guthaben?").
- **Depends on:** 5.6, Circles SDK transfer.
- **⚠️ Spike #4 detail:** confirm whether an **intra-group** Röbeltaler send is a plain gCRC ERC-20
  transfer or must route through the Circles flow-matrix/pathfinder. If plain transfer suffices for
  one shared group token, we do **not** need the pathfinder in this slice (a real simplification).

### 5.8 Supabase state
- **Does:** Columns/table for `gnosis_address`, Circles avatar/registration status, group membership,
  `pilot_cohort` flag.
- **Constraint:** existing `roebel_points_card` / `roebel_points_ledger` are **not modified**.

---

## 6. Treasury, fees & demurrage (the three-pool model)

This section did not exist in v1 and prevents the most expensive mental-model error.

- **(A) Collateral Vault.** Holds the pCRC that backs Röbeltaler. **Mechanical; belongs to the
  depositors; the committee does NOT control or spend it.** Citizens redeem Röbeltaler → pCRC out of
  this vault. (Legally good: we take no custody of value for our own use.) Demurrages in lockstep
  with Röbeltaler, so backing stays ~1:1; it is working capital, never a war chest.
- **(B) Group admin Safe.** The Attester Safe that *owns the group*: membership condition, trust
  edges, policy parameters, the fee-collection-address. This is "group admin," **not** "treasury."
- **(C) Stadt-Safe (civic treasury).** The spendable civic pot. **Empty/deferred in Phase 1.**
  Funded by: a redeem (and optionally mint) **fee** routed to its address; **grants** (GnosisDAO,
  EF/ESP, Gitcoin QF; EU digital-sovereignty, BMI "Smarte.Land.Regionen", MV/LEADER); **business
  listing fees** (clean euro-denominated B2B, doesn't touch the token-legal question); donations.

**Fee mechanics.** Set the fee on **redeem** (mirrors the Chiemgauer Rücktausch fee that funds local
causes), optionally on **mint**, and **never on P2P transfer** (transfer fees kill circulation;
demurrage already discourages hoarding). The fee-collection-address is set at group registration
(`§5.4`) → Stadt-Safe; pilot rate = 0. Spike #5 must confirm whether the *standard* Base Mint Policy
exposes a configurable fee or whether a thin fee-capable policy is needed — and whether a fee breaks
inter-group fungibility.

**Demurrage is not income.** Standard Circles demurrage shrinks nominal balances to keep value
circulating and to equalize holdings; it is **not collected** into any treasury. Do **not** plan
Stadt-Safe revenue on demurrage. (If demurrage-funded commons were ever wanted — the Chiemgauer
model — that's a custom mechanism that trades against the standard-policy fungibility we chose.)

---

## 7. Governance & committee (scales later)

- **Committee = Gnosis Safe, n-of-m, reconfigurable.** Phase 1 uses the existing committee threshold.
  Growing to e.g. 6-of-10 later is a single Safe transaction (no redeploy). Add/remove owners and
  change threshold as the community grows.
- **Three roles, deliberately aligned but distinct:** `AttesterNFT` holders (issue/revoke citizens),
  Safe owners (own the group + civic treasury), Shamir keyholders (split the MACI coordinator key).
  They may overlap; keep them explicitly mapped. *(Open: pin the canonical set — v1 said "5 Attesters"
  and "3-of-5"; current count is "4 Attesters". A 3-of-5 needs 5 owners, so clarify 3-of-4 vs a 5th
  non-Attester owner vs an actual 5th Attester.)*
- **Trajectory:** the Safe is an **execution layer**. The legitimacy source moves over time:
  committee discretion → committee executes **MACI** citizen votes (participatory budgeting, `§4.9`
  of the vision doc) → progressively more decentralized. "Who manages the treasury" evolves from
  "the committee" to "the citizens decide, the Safe executes."

---

## 8. Privacy posture (honest, with a real future workstream)

- **Today: public and permanent.** On Gnosis, every Röbeltaler transfer (amount, sender, receiver,
  time) is permanently visible and indexable. Addresses are pseudonymous, **but** in a town with a
  known `CitizenNFT` registry that pseudonymity is weak — once an address is linked to a citizen,
  their entire spending history is traceable by anyone. This is sharper in a 5,000-person town than
  on a global currency.
- **Brand tension to resolve:** Netizen Labs markets privacy (MACI secret ballots, "surveils no
  one"). A fully transparent money layer is inconsistent with that promise. Privacy for Röbeltaler is
  therefore an eventual **brand requirement**, not a flourish.
- **Future, achievable with tradeoffs (NOT in Phase 1):** Röbeltaler is an ERC-20, so it can be
  shielded via zk privacy on Gnosis — **0xbow Privacy Pools** (runs on Gnosis, ASP-based compliance)
  or **Railgun** (shielded ERC-20s). A principled fit: a **`CitizenNFT`-gated privacy pool** =
  compliant + sybil-resistant + private, reusing the same soulbound credential. Tradeoff: shielding
  fights Circles' transitive trust-graph routing (the pathfinder needs the visible graph), so the
  pattern is "shield for P2P privacy, unshield to touch the treasury / inter-city graph."
- **Phase 1 honesty:** the UI must not imply anonymity. State plainly that Röbeltaler is public.
  Minimize what links a citizenship identity to a spending address where cheaply possible. Don't
  promise privacy you can't yet deliver.

---

## 9. Wallet / AA integration (your existing stack)

- **thirdweb:** kept as the **login/SDK/management** layer. The on-chain *avatar* is a **Safe** smart
  account (Spike #1), which thirdweb can deploy and manage. Post-migration this unifies the whole AA
  stack on Safe (Gnosis-native) — cleaner than the current mixed picture.
- **WalletConnect:** works on Gnosis; used by Circles/Metri/Monerium/Gnosis Pay. No issue.
- **Paymaster / gasless:** confirm thirdweb paymaster on Gnosis (chain 100) in Spike #3; fallback is
  a Gnosis-native paymaster or funding accounts directly (sub-cent gas). Gasless is achievable either way.

---

## 10. Spike tasks (do FIRST, before plan execution)

1. **Safe vs thirdweb-4337 as Circles human avatar on Gnosis** — the gating unknown. Hypothesis: Safe.
2. **Circles invite mechanics & cost** — confirm invite flow, per-invite CRC cost, any bootstrap
   no-invite path; size the operator avatar's CRC funding.
3. **thirdweb paymaster on Gnosis (chain 100)** — confirm sponsorship or pick the funded-accounts fallback.
4. **Circles SDK group register + mint + transfer** — smallest working script (throwaway group) to
   validate the SDK surface, AND determine whether intra-group sends need the pathfinder (`§5.7`).
5. **(NEW) Circles-team questions before the immutable group registration** — ask the Circles/Gnosis
   team directly (you're at the conference):
   - Does a custom or fee-bearing mint policy **lose transitive fungibility** with other Circles
     groups (inter-city)? Is there a path (e.g. BaseTreasury-as-vertex) that preserves it?
   - Does the **standard** Base Mint Policy expose a configurable fee, or is a thin custom policy
     needed — and does that stay "standard enough" for fungibility?
   - Demurrage handling: pure decay vs any capture/redistribution (confirms `§6`).
6. **(NEW) Phase 0 migration dry-run** — re-issue one soulbound `CitizenNFT` on Gnosis to a test
   account and run one full MACI proposal → tally → execution on Gnosis, to size the real migration.

---

## 11. Error handling & edge cases

- **Smart-account incompatibility (Spike #1):** if Safe is required, all units use Safe accounts; gate
  the rest behind this result.
- **CitizenNFT revoked:** the on-chain membership condition refuses new joins automatically (same
  chain — no bridge lag). v1 does **not** auto-unwind an already-issued Circles membership; documented
  limitation for a later spec (revocation propagation is now trivial since it's same-chain).
- **Idempotency:** join + registration are idempotent; re-taps never double-register.
- **RPC reliability:** reliable Gnosis RPC; verify tx receipts (reapply the publicnode null-receipt
  lesson from the MACI rollout).
- **Demurrage drift:** UI always reads live balances; never displays a cached number.
- **Insufficient pCRC for collateral:** block mint with a clear message ("erst Guthaben sammeln").
- **Operator avatar runs out of invite CRC:** monitored; refill runbook.

---

## 12. Testing strategy

- **End-to-end script (Circles SDK):** register → claim pCRC → mint Röbeltaler → send → assert
  recipient balance. Runs against real Gnosis (cheap) with two pilot accounts.
- **Membership-condition tests:** holder / non-holder / revoked `CitizenNFT` on Gnosis; assert
  join refusal paths and idempotency.
- **Manual pilot acceptance:** the Attesters complete the full happy path on their own devices; UX
  checked for the two new concepts (the join step, and demurrage).

---

## 13. Decisions (resolved)

| Decision | Choice |
|---|---|
| Chain strategy | **Migrate to Gnosis (Phase 0)**, then Röbeltaler native same-chain. No bridge. |
| Currency model | Collateral-backed standard Circles group (pCRC → gCRC), redeemable to pCRC |
| First-build scope | Thin end-to-end vertical slice for a pilot cohort |
| Citizenship gating | **On-chain** `CitizenNFT` check in the group membership condition (no backend bridge) |
| Smart account | Safe smart account on Gnosis, managed via thirdweb (pending Spike #1) |
| Treasury model | Three pools: collateral vault (mechanical) / group admin Safe / Stadt-Safe (civic, deferred) |
| Fee | Redeem-fee → fee-collection-address → Stadt-Safe; pilot rate = 0; set at registration |
| Committee | Gnosis Safe, n-of-m, reconfigurable; later driven by MACI votes |
| Points migration | **None.** Off-chain points kept as an independent backup |
| Privacy | Public in Phase 1 (stated honestly in UX); zk privacy a real later workstream |
| Gas | thirdweb paymaster on Gnosis; fallback = fund accounts (sub-cent gas) |

---

## 14. What we are NOT doing (YAGNI)

- No backend cross-chain citizenship bridge (we migrated; gating is on-chain same-chain).
- No merchant QR pay, marketplace, mutual aid, tipping, events, participatory budgeting, reputation.
- No points migration / conversion.
- No EURe / RöbelCard euro rail in this slice (separate future layer on Gnosis Pay/Monerium).
- No transaction privacy in this slice (honest public-by-default; zk privacy is a later workstream).
- No full citizen rollout — pilot allowlist only.
