# Röbel Münzen — Tokenomics & Economy (Circles v2 on Gnosis)

**Status:** live, 2026-06 · **Chain:** Gnosis (100) · **Protocol:** Circles v2

A parallel, human-scale money system for Röbel. Two tokens, one trust graph, a citizen-gated
community currency backed 1:1 by personal issuance, plus an off-chain-free reward economy
funded by a circulating operational wallet.

---

## 1. The two tokens

| | **Personal CRC** — in app: "Münzen" | **Röbel Münzen (RCRC)** — the group token |
|---|---|---|
| What | Each Circles human's own hourly issuance (~1/hour) | The town's group currency (a *group CRC* / gCRC) |
| Who creates it | every registered human (citizen *or* tourist) | **only citizens** (mint-gated, see §4) |
| Backing | the protocol's demurraged issuance | **1:1 by personal CRC locked in the group vault** |
| Holdable by | the human themselves | **anyone** (permissionless ERC-1155 transfer) |
| Role | basic income / onboarding | the spendable local currency + web-of-trust signal |

"Heute abholen" = `personalMint()` (personal CRC) → `groupMint()` (locks it as collateral,
mints RCRC). A citizen ends up holding **RCRC**; the personal CRC sits in the vault as backing.

---

## 2. Addresses (on-chain proof)

Circles avatars → `explorer.aboutcircles.com/avatar/<addr>` · contracts → `gnosisscan.io/address/<addr>`

| Role | Address |
|---|---|
| Circles Hub v2 | `0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8` |
| **Röbel Münzen group (RCRC)** | `0xAc2CeCdBead594F97358a0d3132454f24F3E470c` |
| Group vault (BaseTreasury — holds collateral) | `0x0476fd3bD5EbCE0Af18C70dE221eC47F508e8763` |
| Group mint handler (BaseMintHandler) | `0x910A0C7Ae84E745B06eC6362Fa29Cd3779e0b96b` |
| **Stadtkasse Safe** (group owner / reserve) | `0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa` |
| Group **service** (auto-invite bot) | `0xd5028284017A32C672CbD73Fe35aCD897bA874cf` |
| **Operational funder** (rewards + lootbox sink) | `0x5ac82fD7f576c86aed8d174074bA707eC1979D9B` |
| CitizenNFT (Gnosis, soulbound) | `0x6FF3dC7974a990425DE79F4B21FB0a39F3B04DD4` |
| AttesterNFT (Gnosis) | `0x7bD6Fd97385BCCf6000380ADd3BF19737c6063C4` |
| **CitizenMembershipCondition** (mint gate) | `0x10644F137cDBE9Af5651C8607A6FBa8AfA5276f6` |
| NameRegistry (avatar profiles) | `0xA27566fD89162cC3D40Cb59c87AAaA49B85F3474` |
| Operator (Circles invite; key = `OPERATOR_PRIVKEY`) | server-held |

**Live state (2026-06-20):** RCRC supply **≈137.98**, fully collateral-backed (vault holds the
matching personal CRC, verified). Holders: 2 citizens (joined of 15) + funder + the town Metri
wallet. `group.getMembershipConditions()` = `[0x10644…]` → **mint gate ACTIVE**.

---

## 3. The economy — flows

```
                 personalMint (~1/h)        groupMint (1:1, locks collateral)
   citizen ───────────────────────▶ personal CRC ───────────────────────▶ RCRC (holds)
                                                              │
   EARN (claim-reward, funder pays RCRC):                     │ collateral
     vote 1 · checkpoint 0.5 · event_submit 3 ·               ▼
     referral 2 · event_attend 5     ┌──────────────── group vault (0x0476fd…)
            │ funder → user           │
            ▼                         │
   ┌─────────────────┐  top up   ┌────┴───────────┐  lootbox key payment (RCRC)
   │ Stadtkasse Safe │ ────────▶ │  Funder (hot)  │ ◀───────────────────────── user
   │ (reserve/vault) │ ◀──sweep  │  RCRC float    │ ──────────▶ rewards out
   └─────────────────┘           └────────────────┘
```

- **Earn** — `claim-reward` edge fn: a verified action → the **funder** sends RCRC, **once** per
  action (idempotent via a `reward_claims` unique row). Verifiers: `proposal_vote` (participation
  only — no vote-buying), `checkpoint`, `event_submit`, `referral` (pays the referrer),
  `event_attend` (5 RCRC, see §5). Amounts live in `reward_config` (tunable, no deploy).
- **Spend / sink** — `spend-muenzen` edge fn: user pays the **funder** RCRC for a lootbox key
  (`safeTransferFrom` verified on-chain), key granted. Spend recycles into the same pool the
  rewards pay from → **closed loop**. *(Backend live; Schatzkammer buy-button cutover pending — see §7.)*
- **Daily mint** is the self-faucet (citizens mint their own); the funder only covers the *extra*
  civic rewards and is refilled by the lootbox loop + Safe top-ups.

**Wallet model:** the **Funder** (`0x5ac82f…`, hot, edge-function-signed) is the circulating till —
holds the RCRC float, pays rewards, receives lootbox spend. The **Safe** (`0x3A08…`, multisig) is
the reserve/vault and group owner; it tops up the funder and holds xDAI/EURe. The **operator**
holds personal CRC and funds tourist invites.

---

## 4. Mint policy — only citizens create RCRC (hold is open)

- To **mint** RCRC you must (a) be a Circles human with personal CRC, and (b) be **trusted by the
  group**. The group only trusts CitizenNFT holders.
- This is now enforced **on-chain**: the group has `CitizenMembershipCondition` (`0x10644…`) set,
  so even the service/bot path (`trustBatchWithConditions`) can only ever trust CitizenNFT holders.
- **Holding RCRC is permissionless** — anyone (incl. tourists) can *receive* it. So tourists can be
  *paid/rewarded* in RCRC (a "was in Röbel" badge) but can never *create* it.

---

## 5. Smart Event QR

One operator-funded QR (created by a citizen in the mini-app, time-limited + selectable, with an
A4-printable PDF). Scanned in the Röbel app (`roebel.app/e/<id>` → `/e/[id]`) it branches:

| Scanner | Outcome | Funded by |
|---|---|---|
| First-timer (not a Circles human) | operator invites → `registerHuman` → starts minting own **Münzen** + the event badge | operator (personal CRC) |
| Already onboarded (tourist or citizen) | **5 RCRC** "war in Röbel" attendance badge, once per event | funder (RCRC) |

Gated to active, in-window events (`reward_events` registry). Event creation is CitizenNFT-gated.

---

## 6. Defense-in-depth

The CitizenNFT mint gate exists at **two independent layers**, so a failure/compromise of one
doesn't open RCRC minting to non-citizens:

1. **Operational layer (off-chain):** the auto-invite bot only ever calls `trustBatchWithConditions`
   for addresses it has verified hold a CitizenNFT.
2. **Protocol layer (on-chain):** the group's `CitizenMembershipCondition` re-checks `hasCitizenNFT`
   inside the contract on every service-path trust — so **even if the service key leaks**, it
   cannot trust a non-citizen into minting.

Same principle elsewhere: the **funder is a small hot float** (blast radius capped) backed by the
**Safe reserve**; rewards are **idempotent** (unique `reward_claims` row created *before* payment,
so a crash/retry never double-pays); `proposal_vote` rewards **participation, never the choice**
(MACI secrecy intact, no vote-buying); event invites are **gated to valid events** so the operator
only ever pays for real attendees.

---

## 7. Current status (honest)

**Live:** RCRC mint (1:1 backed) · on-chain mint gate · earn rail (5 verifiers, funder funded
with 20 RCRC) · daily/hourly mint · Circles avatar profiles · Smart Event QR (create+scan+A4 PDF,
edge fns deployed) · tourist onboarding primitive · **lootbox keys bought with RCRC** (Schatzkammer
buy flow + top-right balance tag now show/charge Röbel Münzen → spend recycles to the funder).

**Pending:**
- **Adoption:** 2 of 15 citizens have joined+minted; onboarding the rest is operational.
- **Operator CRC budget** — keep the operator funded with personal CRC for tourist/event invites.
- **Phase 4:** retire off-chain points entirely (needs a balance-migration policy decision).

---

## 8. Expansion ideas (parallel human-money system)

- **Merchant acceptance** — shops accept RCRC via a payment QR (the inverse of the receive QR);
  settlement spread captured in EURe for the Safe (real-money revenue, vs taxing minting).
- **EURe on/off-ramp** — bridge RCRC↔EURe at the edges so the Stadtkasse holds hard money while
  the currency stays 1:1 internally.
- **Tipping & creator rewards** — peer RCRC tips on posts/events; a "support local" button.
- **Raffles / public-goods pools** — citizens pool RCRC; demurrage funds a commons.
- **Proof-of-attendance graph** — event RCRC badges become a queryable "who was where" social
  layer (and a Sybil signal for governance weighting).
- **Group mint fee → Safe** — migrate to a fee-capable group so a small % of each mint funds the
  treasury (deliberate, vs the current 1:1 no-fee); revisit once circulation justifies it.
- **Streak/lootbox in RCRC** — once points are retired, gamification rewards become real currency.
- **Cross-town federation** — other Circles towns trust Röbel citizens; RCRC becomes regionally
  spendable while each town keeps its own citizen gate.
- **Automatic citizen→RCRC invite** — every newly verified CitizenNFT holder auto-trusted by the
  group (the auto-invite bot already does this; make it event-driven).

---

*Sources of truth: `docs/CIRCLES_ROEBEL_MUENZEN_STATE.md`, `docs/superpowers/specs/2026-06-20-roebel-muenzen-economy-design.md`, `contracts/governor-contract/deployments/gnosis.json`, and the on-chain addresses above.*
