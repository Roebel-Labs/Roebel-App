# Röbel × Circles v2 — Feature Vision

> A plain-language explainer of **what each proposed feature does and why it makes sense**,
> plus an honest answer to "can we build all of them?". This is a *vision* document, not an
> implementation spec — it exists so we can agree on the shape of the whole before picking one
> piece to design and build.
>
> Companions:
> - [`CIRCLES_V2_INTEGRATION_RESEARCH.md`](CIRCLES_V2_INTEGRATION_RESEARCH.md) — the research/mapping.
> - [`CIRCLES_V2_CHAIN_STRATEGY.md`](CIRCLES_V2_CHAIN_STRATEGY.md) — the Base↔Gnosis build gate.
>
> Date: 2026-06-16.

---

## 1. The vision in one paragraph

Röbel verifies real humans through a soulbound, dual-attested `CitizenNFT`. Circles v2 gives
real humans the right to **mint their own money** and make it valuable through a **trust graph**.
Put them together and Röbel becomes a **credibly-neutral local currency with built-in sybil
resistance** — a "Röbeltaler" that lives inside the town, is earned by being a verified citizen,
is spent at local shops and between neighbours, and *decays slightly over time so it keeps
circulating instead of sitting idle*. It is, almost exactly, the project's founding promise: a
replicable blueprint a small German town can actually run.

---

## 2. Can we build all of them? — the honest answer

**Yes — but they are not 12 independent projects.** They share one foundation and then become
cheap surfaces on top of it. Think of it as a spine with ribs.

```
            ┌─────────────────────────────────────────────────┐
            │  FOUNDATION (build once)                         │
            │  • Smart wallet on Gnosis Chain (seedless)       │
            │  • Citizenship bridge: CitizenNFT → mint right   │
            │  • Röbeltaler group currency + treasury          │
            │  • One reusable "send Röbeltaler" payment action │
            └───────────────┬─────────────────────────────────┘
                            │  (every feature below reuses the same payment action)
   ┌──────────┬─────────────┼──────────────┬─────────────┬──────────────┐
   ▼          ▼             ▼              ▼             ▼              ▼
 Merchant   Marketplace   Mutual aid     Tipping      Event         Trust edges
 QR pay     settlement    (Hilfe)        creators     economy       (Vertrauen)
   │                                                                  │
   └──────────────────────────────┬───────────────────────────────────┘
                                   ▼
                  HIGHER-ORDER (depend on the graph + treasury)
                  • Participatory budgeting (MACI → treasury payout)
                  • Native reputation (trust-graph PageRank)
                  • Gnosis Pay / Visa exit ramp (long-term)
```

So the realistic plan is: **build the foundation once, ship one spend surface, then add the
others incrementally** — each is days, not months, because they all call the same primitive.

The true constraints are not engineering:
- **Regulation** (real money in Germany — see §6). This gates *what the currency may legally do*.
- **Chain split** (Base vs Gnosis — see chain-strategy doc). This gates *the foundation*.
- **Bootstrapping** (an empty trust graph is worthless). This gates *adoption*.

---

## 3. The foundation (must exist before anything else)

### 3.1 Seedless smart wallet on Gnosis Chain
**What:** Each user gets a thirdweb smart wallet on Gnosis Chain (chain ID 100), reusing the
same email/social login they already have — no seed phrase, matching Circles' own Metri UX.
**Why:** Circles v2 only exists on Gnosis. Röbel's identity/governance is on Base. The wallet is
the bridge that lets a Röbel user actually hold and move Circles money. Gnosis gas is near-free,
so this is cheap to operate.

### 3.2 Citizenship → mint-right bridge
**What:** A verified citizen (`is_verified_citizen`, derived from `CitizenNFT` on Base) is
authorized to register a Circles avatar on Gnosis. Initially via a trusted backend attestation;
later via a proper cross-chain proof.
**Why:** This is the whole thesis. It turns Circles' open sybil problem into Röbel's strength —
only attested humans get to mint, so the money has real anti-fraud guarantees from day one.

### 3.3 The Röbeltaler group currency + treasury
**What:** A Circles **group currency** (ERC-20 on Gnosis) for the town. Citizens back it by
converting their personal CRC into Röbeltaler. The treasury is governed by the AttesterNFT
committee (and/or MACI votes).
**Why:** A group currency is fungible and town-wide — unlike raw personal currencies, everyone
accepts it, so it can act as the local medium of exchange. It cleanly replaces today's off-chain
`roebel_points` (which are dead Supabase integers) with real, circulating, community money.

### 3.4 One reusable payment action
**What:** A single, well-bounded "send Röbeltaler to X" function (with QR, amount, memo) that
every feature below calls.
**Why:** Isolation. Build payment once, test it once, and every "rib" feature becomes a thin UI
on top instead of reinventing money movement.

---

## 4. The features — what each does and why it makes sense

For each: **What it does · Why it makes sense · Röbel assets reused · Depends on · Rough effort.**

### Tier 1 — the core economic loop

#### 4.1 Civic UBI (personal CRC for citizens)
- **What:** Every `CitizenNFT` holder gains the Circles right to mint personal currency (~24/day),
  the raw input that backs the Röbeltaler.
- **Why:** Makes "being a verified citizen" a continuous, tangible benefit — a civic dividend.
  It is the faucet that fills the whole economy; without minting there is nothing to spend.
- **Reuses:** `CitizenNFT`, the `guest/tourist/citizen` tier system, `VerificationContext` polling.
- **Depends on:** Foundation §3.1–3.2.
- **Effort:** Medium (part of the foundation).

#### 4.2 Röbeltaler — the town currency
- **What:** The group currency citizens spend with each other and at shops.
- **Why:** A single fungible unit everyone trusts is what makes a *local economy* rather than a
  collection of personal IOUs. Demurrage (~7%/yr) keeps it circulating in town instead of hoarded.
- **Reuses:** `/roebel-card/` balance screens (reskin onto a real balance), `roebel_points_ledger` UI patterns.
- **Depends on:** §4.1.
- **Effort:** Medium (part of the foundation).

#### 4.3 Merchant QR payment (your original idea, elevated)
- **What:** Gastro/business `accounts` become Circles **organization avatars** that *accept
  Röbeltaler* at the point of sale via QR. Spending also seeds trust edges → emergent credibility.
- **Why:** This is what makes the currency *useful* — somewhere to spend it. Reframes your QR idea
  from "scan to receive tokens" (a gimmick) to "scan to pay" (a real payment rail) plus a natural,
  un-gameable reputation signal (you actually visited and transacted).
- **Reuses:** the org `accounts` model, existing `/roebel-card/` QR check-in plumbing, `menu_items`, `account_ratings`.
- **Depends on:** Foundation + §4.2.
- **Effort:** Low–medium once the payment action exists.

### Tier 2 — high value, thin once the spine exists

#### 4.4 Marketplace settlement rail
- **What:** Pay for `marketplace_listings` in Röbeltaler instead of only "contact seller via DM".
- **Why:** Keeps C2C value circulating locally; enables simple treasury-backed escrow.
- **Reuses:** `marketplace_listings`, DM flow, the payment action.
- **Depends on:** payment action. **Effort:** Low.

#### 4.5 Mutual aid / neighbour favours (Hilfe-Ökonomie)
- **What:** Wire the existing `hilfe_gebraucht` and `im_angebot` post categories to Röbeltaler
  payments — a light time-banking economy ("mow my lawn for 20 Röbeltaler").
- **Why:** The most *socially* on-brand civic use case; demurrage makes it feel like a flowing
  favour economy, not savings. Strengthens the trust graph with real reciprocity.
- **Reuses:** existing post categories, feed, DM. **Depends on:** payment action. **Effort:** Low.

#### 4.6 Trust as a first-class social action ("Vertrauen")
- **What:** A trust button on profiles that creates a real Circles trust edge. Today the feed has
  likes/comments/bookmarks but **no follow/trust graph**.
- **Why:** Converts Röbel from "an app with a wallet" into a Circles-native community — the social
  graph *becomes* the economic graph, and the pathfinder uses it to route payments between people
  who don't directly trust each other.
- **Reuses:** profile screens, social UI. **Depends on:** Foundation. **Effort:** Low–medium.
- **Note:** This can ship *before* the currency as a pure social feature, then "light up" economically later.

#### 4.7 Tipping creators, journalists & Vereine
- **What:** Inline tipping in posts and DMs.
- **Why:** Micro-support for local journalism (you have a `journalist` org type), event organizers,
  and `verein` clubs — money flows to the people producing civic value.
- **Reuses:** feed posts, DM, the payment action. **Depends on:** payment action. **Effort:** Low.

#### 4.8 Event economy
- **What:** Pay event entry, tip performers, reward `event_experience` reflections in Röbeltaler.
- **Why:** Gives events a built-in economic layer and rewards participation.
- **Reuses:** events, event-experience posts. **Depends on:** payment action. **Effort:** Low.

### Tier 3 — higher-order (build last)

#### 4.9 Participatory budgeting (MACI → treasury payout)
- **What:** A passing MACI proposal triggers a disbursement from the Röbeltaler **group treasury**;
  optionally quadratic funding for the "Röbeler Topf".
- **Why:** Genuinely novel — private, sybil-resistant voting that moves *real* community money to
  fund local projects. The strongest "blueprint" story.
- **Reuses:** `MaciAttesterGovernor`, treasury. **Depends on:** Foundation + governance wiring.
  **Effort:** Medium–high.

#### 4.10 Native reputation / credibility
- **What:** Surface the Circles trust-graph **PageRank** as a credibility score on profiles.
- **Why:** Solves your reputation goal *natively* — earned by being trusted and by transacting,
  inherently sybil-resistant. Far more robust than QR-scan counters.
- **Reuses:** profile UI. **Depends on:** §4.6 + transaction history. **Effort:** Medium.

#### 4.11 Rewards → currency bridge
- **What:** Lootboxes / daily check-in occasionally drop Röbeltaler instead of cosmetic stickers.
- **Why:** Gently onboards people into the currency before they ever think "crypto".
- **Reuses:** `lootboxes`, daily check-in. **Depends on:** §4.2. **Effort:** Low.

#### 4.12 Gnosis Pay / Visa exit ramp (long-term)
- **What:** Mature Röbeltaler becomes spendable beyond town via Gnosis Pay + Visa (as Metri does).
- **Why:** A credible exit ramp keeps the currency trusted. **Depends on:** maturity + legal.
  **Effort:** High / external.

---

## 5. Suggested build order (phased)

1. **Phase 0 — Foundation:** Gnosis smart wallet + citizenship bridge + Röbeltaler + payment action (§3, §4.1–4.2).
2. **Phase 1 — First spend surface:** Merchant QR pay at one pilot gastro partner (§4.3).
3. **Phase 2 — Social & peer money:** Trust button (§4.6), mutual aid (§4.5), tipping (§4.7), marketplace (§4.4).
4. **Phase 3 — Civic depth:** Participatory budgeting (§4.9), native reputation (§4.10), rewards bridge (§4.11).
5. **Phase 4 — External reach:** Gnosis Pay / Visa (§4.12).

Each phase is independently valuable and shippable; you can stop at any phase and still have something real.

---

## 6. Risks & realities (read before committing)

- **Regulation (the gate).** A token buying real goods/services in Germany approaches e-money /
  payment-services law (BaFin, possibly MiCA). Keep Röbeltaler explicitly an **experimental
  community currency, not 1:1 euro-redeemable**, and keep it separate from the existing
  `roebel_card` euro voucher. Get legal review *before* Phase 1 enables real purchases.
- **Chain split.** Base ↔ Gnosis (see chain-strategy doc) — this is the foundation's main cost.
- **Circles v2 is experimental** — group-currency backing/redemption is young; promise no price stability.
- **Demurrage confuses people** — "my balance shrank 7%?!" needs gentle German framing (Mecky is ideal).
- **Empty graph = worthless money** — seed every citizen with auto-trust to the town group on day one.

---

## 7. Why this is bigger than a feature

Every other town that forks Röbel inherits, for free, a **sybil-resistant local currency**: verified
citizens, a town currency, a merchant network, mutual aid, and participatory budgeting — the civic
economic stack in a box. That is the project's blueprint mission made literal.

---

## Next step

Read this, then tell me which feature to take into a real design + implementation plan first.
My recommendation: **Phase 0 foundation, expressed through the Röbeltaler group currency** —
because it's the spine every other feature hangs off, and nothing else can ship without it.
