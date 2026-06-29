# Economy tab — "On-chain anatomy" intro section

**Date:** 2026-06-29
**Where:** `circles-roebel-mini-app` (Vite SPA, deployed standalone on Vercel)
**Branch:** `feat/gemeinschaftskasse-dashboard`

## Problem

The mini-app's **Economy** tab (`PulseView`, backed by `getEconomy()` + the
`src/views/economy/` visx sections) shows live Röbel-Taler metrics — supply,
backing, flows, holders, velocity, reputation, feed — but **never explains the
on-chain structure those numbers come from**. A citizen can't see, from this
tab, that Röbeltaler is a Circles v2 group currency, what the group token is,
what backs it, what governs minting, or how membership works — and there are no
links to verify any of it on-chain.

## Goal

Add one **intro section at the top of the Economy tab** that explains and
visualizes the Circles group structure, with explorer links to every contract.

## Decisions (from brainstorming)

- **Visualization:** an anatomy map **plus** a compact trust-relations graph.
- **Tone:** fully technical / transparency. This section deliberately uses
  Circles protocol terms (BaseGroup, group token RCRC, mint policy,
  BaseTreasury) with addresses + explorer links front and centre. This is a
  scoped exception to the app-wide rule of only saying "Röbel-Taler" and hiding
  Circles/CRC jargon — it applies **only to this anatomy section**; every other
  surface keeps the friendly "Röbel-Taler" name.
- **Placement:** top of the tab, above the live-status row and KPI strip.
- **Trust graph rendering:** lightweight, non-interactive mini-graph (NOT a
  second React Flow). The full interactive `RadialGraph` stays the Town tab's
  centrepiece; this section links to it ("See the full graph on Town →").

## On-chain facts (verified live, 2026-06-29)

| Role | Value | Source |
|---|---|---|
| Group (BaseGroup) | `0xAc2CeCdBead594F97358a0d3132454f24F3E470c` — name **Roebeltaler**, symbol **RTLR** | `ROEBEL_GROUP`; NameRegistry.name/symbol |
| Token (RCRC) | ERC-1155 id = `uint256(group)` = `982948278703902328494730380421841809564696987404` | `GROUP_TOKEN_ID` |
| Mint policy | `0xCDFc5135AEC0aFbf102C108e7f5C8A88C6112842` (group-specific — NOT the shared base policy) | `Hub.mintPolicies(group)` |
| Treasury / backing vault | `0x0476fd3bD5EbCE0Af18C70dE221eC47F508e8763` | `group.BASE_TREASURY()`; `ROEBEL_VAULT` |
| Owner | `0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa` (Attester 3-of-5 Safe) | `group.owner()` |
| Service | `0xd5028284017A32C672CbD73Fe35aCD897bA874cf` (auto-invite) | `group.service()` |

Addresses are immutable for the life of the group → stored as static constants,
no runtime RPC needed for the structure itself.

## Architecture

### New: `src/lib/groupAnatomy.ts`

Single typed source of truth for the structure + presentation metadata.

```ts
export type AnatomyRole = "group" | "token" | "policy" | "treasury" | "owner";
export interface AnatomyPart {
  role: AnatomyRole;
  title: string;        // e.g. "Mint policy"
  address: `0x${string}`;
  tokenId?: string;     // only for the token part
  href: string;         // explorer deep link
  blurb: string;        // one-line technical description
}
// tokenId computed locally — GROUP_TOKEN_ID is module-private in circlesData.ts.
export const GROUP_META = { name: "Roebeltaler", symbol: "RTLR",
  group: ROEBEL_GROUP, tokenId: BigInt(ROEBEL_GROUP).toString() } as const;
export const GROUP_ANATOMY: AnatomyPart[]; // group, token, policy, treasury, owner
export const gnosisscan = (addr: string) => `https://gnosisscan.io/address/${addr}`;
```

Explorer link targets:
- **Group**, **Token** → Circles explorer (`explorer.aboutcircles.com/avatar/<group>`) — shows the group + its token holders.
- **Mint policy**, **Treasury**, **Owner Safe** → GnosisScan (`gnosisscan.io/address/<addr>`).

Addresses live in `src/lib/circles.ts` (single source — already holds
`ROEBEL_GROUP`, `ROEBEL_VAULT`; add `MINT_POLICY`, `GROUP_OWNER`,
`GROUP_SERVICE`). `groupAnatomy.ts` imports them and adds display metadata.

### New: `src/views/economy/AnatomySection.tsx`

A `ChartCard` (matches every other section). Renders, top → bottom:

1. **Technical intro paragraph** —
   > Röbeltaler (RTLR) is a Circles v2 **BaseGroup** on Gnosis. The group mints
   > a group token — **RCRC** — to its trusted members, backed 1:1 by personal
   > CRC locked in the **BaseTreasury**. A **mint policy** contract governs who
   > may mint. Membership is a **trust relation**: when the group trusts a
   > citizen, that citizen can mint and spend Röbel-Taler.

2. **Anatomy map** — compact CSS/SVG diagram: the **Group** as a central navy
   hub, with four connected role chips (**Token RCRC**, **Mint policy**,
   **Treasury / backing**, **Owner Safe**). Each chip = icon + role + short
   address and is a tappable explorer link. Lightweight (no React Flow), reads
   on a narrow phone iframe.

3. **Contract reference list** — the five parts as labelled rows (role ·
   one-line blurb · short address · `ExternalLink`). Live counts where free:
   members trusted (`getTrustGraph`), holders + supply (from the snapshot).

4. **Trust relations mini-graph** — a small non-interactive SVG radial: group
   hub in the centre, one dot per member (navy = verified/attester, grey =
   trusted-but-unverified), fed by `getTrustGraph(verified)`. Footer link:
   "See the full graph on Town →".

### Wiring in `PulseView.tsx`

- Render `<AnatomySection .../>` **above** the live-status row.
- It receives `verified`, `supply`, and holder count from the snapshot
  `PulseView` already loads (`getEconomy`).
- It **self-loads** the trust graph progressively (`getTrustGraph(verified)`,
  best-effort, like the existing profile enrichment) so it never blocks the rest
  of the tab. The anatomy map + reference list render immediately from static
  constants; only the mini-graph waits on the trust fetch.

## Data flow

```
getEconomy() (existing)  → snap.{supply, holders, verified}
                              │
PulseView ───────────────────┼──► AnatomySection
                              │      ├─ static GROUP_ANATOMY  → map + reference list (instant)
                              │      └─ getTrustGraph(verified) → mini-graph (progressive)
```

No new RPC method shapes — reuses the proven `getEconomy` / `getTrustGraph`.

## Components / boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `groupAnatomy.ts` | structure constants + explorer links | `circles.ts` (addresses; tokenId computed locally) |
| `AnatomySection.tsx` | render intro + map + list + mini-graph | `groupAnatomy.ts`, `getTrustGraph`, `ui.tsx`, `icons.tsx`, `chartTheme.ts` |
| `PulseView.tsx` | place section, pass snapshot data | `AnatomySection` |

## Error handling / edge cases

- `getTrustGraph` failure → mini-graph shows the static fallback citizen set
  (`ROEBEL_CITIZENS`) or an `EmptyHint`; the rest of the section is unaffected
  (it's all static constants).
- Zero members trusted → mini-graph shows the group hub alone + empty hint.
- All links open in a new tab (`target="_blank" rel="noreferrer"`).

## Testing / verification

- Build: `pnpm build` (Vite) and `pnpm typecheck` clean for the new files.
- Manual: load Economy tab → section renders at top; map + 5 contract links
  resolve to the correct explorer pages; mini-graph shows N member dots matching
  the trust count; intro copy reads correctly.
- Deploy is manual (not git-connected on Vercel):
  `cd circles-roebel-mini-app && npx -y vercel@latest --prod --yes`.

## Out of scope

- Live re-reading of the immutable addresses (static constants suffice).
- Changing the app-wide currency naming convention (this exception is scoped to
  the anatomy section only).
- Touching the Town tab's existing trust graph.
