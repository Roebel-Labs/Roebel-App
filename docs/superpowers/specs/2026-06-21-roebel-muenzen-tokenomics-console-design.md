# Röbel Münzen — Tokenomics & Economy Console (apps/web admin)

**Date:** 2026-06-21 · **Status:** approved design · **Scope:** new admin section in `apps/web`

A new admin section at `/admin/dashboard/muenzen` that turns the on-chain RCRC (Röbel
Münzen) economy on Gnosis + the Supabase reward/sink rails into live analytics, plus an
operational console. Source of truth for the economy: `docs/CIRCLES_TOKENOMICS.md` and
`docs/CIRCLES_ROEBEL_MUENZEN_STATE.md`.

Decisions locked with the user:
- **Scope:** full operational console (analytics + writes).
- **Data freshness:** server-cached snapshots (~60s) via Next.js API routes.
- **Layout:** new multi-tab section under the admin dashboard.
- **Reputation:** all four signals (web-of-trust degree, proof-of-attendance, civic
  activity, economic footprint).
- **Key handling:** the web app never holds operator/funder private keys. Key-signed
  actions either trigger existing Supabase edge functions or are surfaced as alerts.
- **Trust graph:** `d3-force` + a small custom canvas/SVG renderer (recharts + reactflow
  already installed cover everything else).

---

## 1. Architecture

```
Browser (admin, gated)
  └─ /admin/dashboard/muenzen/* (5 tab pages, "use client")
        │  fetch (SWR-style, manual refresh)
        ▼
  Next.js API routes  /api/muenzen/*   (server, re-check admin session)
        ├─ lib/muenzen/gnosis.ts       → viem public client, Gnosis chain 100
        ├─ lib/muenzen/circles-rpc.ts  → circles_query @ rpc.aboutcircles.com
        ├─ lib/muenzen/cache.ts        → module-level TTL cache (~60s)
        ├─ lib/muenzen/constants.ts    → addresses / roles / ABIs (single source)
        ├─ lib/muenzen/reputation.ts   → composite scoring model
        └─ lib/supabase/admin.ts       → service-role reads + CRUD writes
```

Why server-side: Circles RPC is POST `circles_query` (no browser fetch-cache, CORS risk,
rate limits on graph queries); the service-role Supabase key must stay server-only; one
clean cached data layer keeps the client thin.

### 1.1 Data-layer modules (`apps/web/src/lib/muenzen/`)

- **`constants.ts`** — single source of truth. Addresses + role labels for: Circles Hub
  v2 `0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8`, Röbel Münzen group (RCRC)
  `0xAc2CeCdBead594F97358a0d3132454f24F3E470c`, group vault (BaseTreasury)
  `0x0476fd3bD5EbCE0Af18C70dE221eC47F508e8763`, group mint handler
  `0x910A0C7Ae84E745B06eC6362Fa29Cd3779e0b96b`, Stadtkasse Safe (multisig reserve/owner)
  `0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa`, group service (auto-invite bot)
  `0xd5028284017A32C672CbD73Fe35aCD897bA874cf`, operational funder (hot float)
  `0x5ac82fD7f576c86aed8d174074bA707eC1979D9B`, CitizenNFT
  `0x6FF3dC7974a990425DE79F4B21FB0a39F3B04DD4`, AttesterNFT
  `0x7bD6Fd97385BCCf6000380ADd3BF19737c6063C4`, NameRegistry
  `0xA27566fD89162cC3D40Cb59c87AAaA49B85F3474`, EURe token (Gnosis). Group ERC-1155
  token id = `uint256(groupAddress)`. Minimal ABIs (Hub `balanceOf`, group
  `totalSupply`, Hub `calculateIssuance`/`isHuman`, NFT `balanceOf`, ERC-20 `balanceOf`
  for EURe). Each wallet entry: `{ key, address, role, label, kind }`.

- **`gnosis.ts`** — viem `createPublicClient` on chain 100, RPC from `GNOSIS_RPC_URL`
  (server env) with public fallback (`https://rpc.gnosischain.com`). Reads: group token
  `balanceOf(addr, id)`, group `totalSupply`, personal-CRC `calculateIssuance`,
  `isHuman`, NFT ownership, native xDAI balance, EURe ERC-20 balance. Blockscout
  (`https://gnosis.blockscout.com/api/v2`) for wallet tx history fallback.

- **`circles-rpc.ts`** — `circles_query` JSON-RPC wrapper, **porting the exact query
  shapes already proven in the Expo app** (`apps/expo/lib/circles-profile.ts`,
  `apps/expo/lib/roebel-taler.ts`, `apps/expo/hooks/useRoebelTalerHistory.ts`):
  - `getGroupTransfers({from,to})` → `V_CrcV2.Transfers` filtered by `tokenAddress` =
    group (full RCRC flow: from, to, value, timestamp, blockNumber, txHash).
  - `getTrustRelations()` → `V_Crc.TrustRelations` (truster, trustee, expiry) — group
    membership (truster = group) + the broader web-of-trust among holders.
  - `getAvatars(addresses)` → `V_CrcV2.Avatars` (name, cidV0Digest) for name resolution.
  - `getTokenBalances(addr)` → Circles RPC balances view for collateral on the vault.

- **`cache.ts`** — module-level `Map<string,{value,expires}>` TTL cache. On-chain/Circles
  ~60s, Supabase aggregates ~30s. `?fresh=1` bypasses (the "Aktualisieren" button).

- **`reputation.ts`** — composite score (see §5).

- **`identity.ts`** — name-first resolver: Circles avatar name → Supabase
  `account.display_name`/`username` → "Bürger:in". Returns `{ name, address, avatarUrl }`.
  Batched. Used by every name-resolved table/graph.

### 1.2 API routes (`apps/web/src/app/api/muenzen/`)

Every route calls `isAuthenticated()` (the existing HMAC-cookie session helper) first and
returns 401 otherwise — middleware only guards `/admin/dashboard/*` pages, not `/api`.

Reads (GET):
- `overview` — supply, collateralization ratio, holders, citizens joined/15, funder &
  Safe balances + health, 24h/7d/30d earned & spent, mint count, net flow, alerts.
- `flow?range=7d|30d|90d|all` — time-bucketed series (minted, earned-by-action, spent,
  net funder flow) + flow-diagram nodes/edges with RCRC totals + recent flows.
- `trust` — graph nodes (avatars: citizen/holder/operator/attester/group, name-resolved)
  + edges (trust relations) + per-node reputation score & breakdown.
- `wallets` — per system wallet: role, balances (RCRC, personal CRC, xDAI, EURe), health,
  last activity; vault collateral; treasury EUR value.
- `rewards` — `reward_config` rows, `reward_claims` aggregates (by action/status/day),
  `muenzen_charges` aggregates, lootbox key sales, `reward_events` list + attendance,
  referral funnel, top earners/spenders.

Writes (gated, full console):
- `reward-config` (POST/PATCH) — upsert amount_atto/daily_cap/cooldown_hours/enabled.
- `events` (POST/PATCH/DELETE) — CRUD `reward_events`.
- `lootboxes` (POST/PATCH/DELETE) — CRUD `lootboxes`.
- `invite` (POST) — trigger the deployed `circles-invite` edge fn for a citizen address
  (admin-authorised onboarding). No private key in web.

### 1.3 Navigation

- `apps/web/src/app/admin/dashboard/muenzen/layout.tsx` — sub-layout with a tab bar
  (Übersicht · Geldfluss · Vertrauen & Reputation · Wallets & Kasse · Belohnungen &
  Senken), each tab a nested route segment.
- Add one "Röbel Münzen" link (BarChart-style icon) to the `extraLinks` array in
  `apps/web/src/components/admin/admin-sidebar.tsx`.

---

## 2. Tabs & visualizations

### 2.1 Übersicht (Overview)
KPI cards: RCRC supply · **collateralization ratio** (vault personal-CRC ÷ supply, target
100%) · citizens joined / 15 · total holders · funder balance + health pill · Safe reserve
· 30d earned · 30d spent · net flow. Charts: supply growth (recharts area), **earn-vs-spend
over time** (the closed loop), activity sparkline. Top alert banner: funder low,
collateralization drift, operator CRC budget low, errored claims present.

### 2.2 Geldfluss (Token Flow)
- **Flow diagram** of the economy (Safe → Funder → 5 reward rails → users → lootbox spend
  → Funder) via **reactflow**, edges labeled with RCRC totals.
- Stacked-area earned-by-action over time; spend/sink over time; mint cadence
  (personalMint → groupMint); net funder inflow/outflow; recent-flows table
  (name-resolved, from `funder_ledger` + Circles transfers).

### 2.3 Vertrauen & Reputation
- **Web-of-trust network graph** (`d3-force` layout + custom canvas/SVG, zoom/pan): nodes
  = avatars (group hub central; citizen / tourist-holder / operator / attester
  color-coded), edges = trust relations, node size = reputation.
- Reputation **leaderboard** with per-signal breakdown bars; reputation distribution
  histogram; attester-coverage view.

### 2.4 Wallets & Kasse
Role-labeled cards for every system wallet with live balances (RCRC, personal CRC, xDAI,
EURe):
- **Stadtkasse Safe** — multisig reserve / group owner.
- **Funder** — hot float / circulating till, with a health gauge vs threshold.
- **Operator** — invite fuel (personal CRC budget) + health.
- **Group vault (BaseTreasury)** — collateral held, collateralization gauge vs RCRC supply.
- **Service** — auto-invite bot.
Plus: treasury value in EUR (xDAI×0.92 + EURe + RCRC≈1), balance-composition chart,
funder-balance-over-time, name-resolved wallet tx history, top-up alert.

### 2.5 Belohnungen & Senken (+ operational CRUD)
- **`reward_config` inline editor** (amount / daily_cap / cooldown / enabled).
- Earn analytics: claims by action / status / day, RCRC paid per action, **errored-claims
  monitor**, top earners.
- Spend analytics: lootbox key sales over time, funder revenue, per-lootbox sales,
  charges by status.
- **Lootbox manager** (CRUD: name, price_atto, image, published, order).
- **`reward_events` manager** (CRUD) + per-event attendance counts.
- Referral funnel.

---

## 3. Operational writes — key-handling constraint

The web app **must not hold the operator/funder private keys** (they live only in Supabase
edge-function secrets / the Safe). The console therefore splits:
- **Pure Supabase CRUD** (service role, safe from web): `reward_config`, `reward_events`,
  `lootboxes`.
- **Trigger existing edge functions** for key-signed actions: onboarding invite → the
  deployed `circles-invite` edge fn.
- **Funder/Safe top-ups**: surfaced as an alert + address/copy + explorer link, never a
  web-signed transfer.

---

## 4. Privacy & naming

- **Name-first everywhere**: Circles avatar name → Supabase `account.display_name` /
  `username` → "Bürger:in"; raw `0x…` only as a small monospace secondary with copy
  (internal, gated, admin-only tool whose subject is wallets).
- Currency labeled **"Röbel Münzen (RCRC)"**. Technical terms (personal CRC, gCRC,
  collateral) are acceptable in *this admin console* (the tokenomics doc uses them),
  unlike the citizen-facing Expo app.

---

## 5. Reputation model (all four signals)

Composite 0–100 per wallet, each component normalized to 0–1 then weighted:

| Signal | Weight | Source |
|---|---|---|
| Web-of-trust degree | 0.35 | in-degree of Circles `TrustRelations` |
| Proof-of-attendance | 0.20 | `event_attend` claims (`reward_claims`) |
| Civic activity | 0.30 | vote + checkpoint + event_submit + referral claims |
| Economic footprint | 0.15 | RCRC minted + sent + received + spent (log-scaled) |

Weights are named constants in `reputation.ts` (easy to tune). Doubles as the
Sybil/governance-weighting signal from tokenomics §8.

---

## 6. Dependencies

- Add **`d3-force`** (+ small custom renderer) for the trust graph.
- Reuse installed **recharts 3.8** (all standard charts) and **reactflow 11** (flow
  diagram), shadcn/Radix UI primitives, existing `card`/`badge`/`skeleton` components and
  the DAO-page chart patterns (`components/admin/dao/*`) for visual consistency.

---

## 7. Styling

Tailwind tokens already in `tailwind.config.ts`; primary navy `#194383`; reuse
`components/ui/card.tsx` + the `components/admin/dao/colors.ts` palette and the existing
KPI-card / chart-card patterns. Dark-mode class-based.

---

## 8. Phasing (single spec; plan implements in order)

1. **Data layer + Übersicht + Wallets & Kasse** — covers the explicit asks (wallets,
   balances, core flows) first.
2. **Geldfluss + Vertrauen & Reputation** — flow diagram + trust/reputation graph.
3. **Belohnungen & Senken + operational CRUD** — analytics + the write console.

---

## 9. Out of scope

- Web-signed on-chain transfers (no keys in web).
- Changes to the Expo app or edge functions (the console only *reads* Supabase/on-chain
  and *triggers* the already-deployed `circles-invite`).
- Retiring off-chain points (tokenomics Phase 4 — separate decision).
