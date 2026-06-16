# Circles v2 × Röbel — Integration Research

> Research deliverable. Maps the Gnosis **Circles v2** social-currency protocol onto the
> Röbel civic app's existing architecture (apps/expo, CitizenNFT identity, MACI governance,
> off-chain points). Date: 2026-06-16.
>
> Companion docs:
> - [`CIRCLES_V2_CHAIN_STRATEGY.md`](CIRCLES_V2_CHAIN_STRATEGY.md) — the Base↔Gnosis decision (build gate).

---

## TL;DR — the one insight

The Circles v2 launch post never explains **sybil resistance** — "1 CRC per person per hour"
only works if you can't fake people. Circles' answer is *the trust graph itself*: fake
accounts earn no trust edges, so their money is worthless. That works but bootstraps slowly.

**Röbel already solves this.** `CitizenNFT` is a soulbound, **dual-attested** (1 Attester +
1 Citizen signature) proof-of-personhood. That is precisely the primitive Circles leaves open.
So the framing is not "add a wallet feature" — it is:

> **Röbel = a credibly-neutral local currency with built-in, human-attested sybil resistance** —
> a replicable money layer for small towns. This is the project's stated blueprint mission.

---

## What Circles v2 actually is

- **Personal currencies** — every human mints their own token (~1 CRC/hour ≈ 24/day).
  Token standard: **ERC-1155** on **Gnosis Chain** (chain ID 100).
- **Trust graph** — "I trust you" = "I accept your personal CRC." A pathfinder routes
  **transitive payments** across trust edges, making distinct personal currencies fungible.
- **Group currencies** — **ERC-20**, fully fungible, backed by members converting their
  personal CRC into the group token. Has a **treasury** + a **mint policy**. This is the
  community-scale money primitive.
- **Organization avatars** — businesses/orgs join the graph; they don't mint UBI but can
  hold, trust, and transfer.
- **Demurrage** — balances decay **~7%/year**, penalizing hoarding and rewarding circulation
  (keeps money moving locally).
- **Metri wallet** — account abstraction, no seed phrase, CoW Swap fiat on/off-ramp,
  Gnosis Pay + Visa spend.
- **Sybil resistance** — emergent from the trust graph (and, in Röbel's case, anchored by
  CitizenNFT).

Sources: Gnosis "Introducing Circles V2"; docs.aboutcircles.com; github.com/aboutcircles/circles-contracts-v2.

---

## Röbel assets relevant to integration

| Layer | Detail (from codebase exploration) |
|---|---|
| **Identity** | `CitizenNFT` (soulbound, dual-attested, ERC721Votes) + `AttesterNFT` (3-of-5 Shamir committee), both on **Base mainnet**. |
| **Tiers** | `UserContext`: `guest → tourist → citizen`, auto-upgraded on CitizenNFT detection in `VerificationContext`. |
| **Money today** | **No on-chain token exists.** `roebel_points_card` / `roebel_points_ledger` are off-chain Supabase integers. Separate `roebel_card` is a euro-voucher ledger. |
| **Wallet** | thirdweb `inAppWallet` + smart account, **gasless ERC-4337 on Base**. Addresses never shown in UI (resolved to display name). |
| **Social graph** | Feed has likes/comments/bookmarks but **no explicit follow/trust edges** yet. |
| **Orgs** | `accounts` of type restaurant/unternehmen/verein/stadt/fraktion/journalist, with menus, ratings, opening hours, QR check-in plumbing in `/roebel-card/`. |
| **Commerce** | C2C `marketplace_listings` (settle via DM today); gastro menus; business deals. |
| **Governance** | MACI private voting (`MaciAttesterGovernor`), CitizenNFT-gated. |
| **Mutual aid** | Post categories `hilfe_gebraucht`, `im_angebot` already exist. |

---

## Primitive mapping

| Circles v2 | Röbel asset it maps onto |
|---|---|
| Personal currency (ERC-1155) | One per **CitizenNFT** holder — citizenship gates the mint right |
| Trust graph | Explicit "Vertrauen" action on profiles + auto-trust to town group on CitizenNFT detection |
| Group currency (ERC-20) | **Röbeltaler / Müritz-Taler** — augments/replaces off-chain points |
| Organization avatar | Gastro & business `accounts` |
| Demurrage | Local-velocity engine (money stays and circulates in town) |
| Metri AA UX | Already matched by gasless thirdweb smart wallets |
| Trust-graph PageRank | Native, sybil-resistant reputation/credibility score |

---

## Use cases, ranked

### Tier 1 — core thesis
1. **Citizenship-gated personal currency (civic UBI)** — CitizenNFT = the mint faucet key. Maps onto the existing tier system.
2. **The Röbeltaler — real local group currency** — backed by citizens' CRC, treasury governed by AttesterNFT/MACI. No collision (no on-chain token today). Reskin `/roebel-card/` balance screens.
3. **Merchant payments (the QR idea, elevated)** — gastro/business `accounts` as org avatars that *accept* Röbeltaler at point of sale via QR. Spending creates real trust edges → emergent credibility.

### Tier 2 — high value, moderate build
4. **Marketplace settlement rail** — pay-with-Röbeltaler for `marketplace_listings`; local money keeps marketplace value in town.
5. **Trust as a first-class social action** — "Vertrauen" button creates Circles trust edges; the social graph becomes the economic graph.
6. **Mutual aid / time-banking** — wire `hilfe_gebraucht` / `im_angebot` posts to Röbeltaler payments.
7. **Participatory budgeting** — MACI proposal passing → disbursement from a Circles group treasury; optional quadratic funding for the "Röbeler Topf".

### Tier 3 — delightful, lighter lift
8. **Tipping** creators/journalists/Vereine inline in posts & DMs.
9. **Event economy** — entry, performer tips, rewarded `event_experience` reflections.
10. **Native reputation** — surface Circles trust-graph PageRank as a credibility score.
11. **Lootbox/rewards → currency bridge** — occasionally drop Röbeltaler instead of cosmetics to onboard gently.
12. **Gnosis Pay bridge (long-term)** — Röbeltaler → Gnosis Pay → Visa exit ramp.

---

## Hard realities

- **Regulation (biggest).** Real-goods purchasing in Germany approaches e-money / payment-services
  (BaFin, possibly MiCA). Keep Röbeltaler explicitly an **experimental community currency, not
  1:1 euro-redeemable**, and keep it separate from the existing `roebel_card` euro voucher.
  Get legal review before any real-money flow.
- **Chain split.** Röbel = Base; Circles = Gnosis. See `CIRCLES_V2_CHAIN_STRATEGY.md`.
- **Circles v2 is experimental** — group-currency backing/redemption is young; promise no price stability.
- **Demurrage confuses users** — needs gentle German framing (Mecky can explain it).
- **Graph bootstrapping** — seed every CitizenNFT holder with auto-trust to the town group on day one.

---

## Recommended MVP path

1. Spike: deploy a thirdweb smart wallet + register a Circles personal avatar on Gnosis for one test citizen, gated by a backend `is_verified_citizen` check.
2. Create the **Röbeltaler** group currency; treasury controlled by the AttesterNFT committee.
3. Auto-trust: on CitizenNFT detection (already polled in `VerificationContext`), create the trust edge to the group.
4. One spend surface: Röbeltaler payment at one pilot gastro partner via QR (reuse `/roebel-card/` plumbing).
5. Expand to marketplace, mutual aid, tipping.
