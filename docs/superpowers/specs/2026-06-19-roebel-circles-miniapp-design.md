# Röbel Circles Mini-App — Design Spec

> Extends the existing inviter (`/circles-inviter`) into a multi-view **Röbel Circles**
> Circles mini-app: invite citizens + visualize the town's on-chain economy and the
> network-of-towns vision. Date: 2026-06-19. Approved in brainstorming.

## Goal
A single Circles mini-app (Vite + React 19 + TS + Tailwind v4, runs in the Circles iframe)
that, alongside inviting citizens, shows the town as a living on-chain graph — fulfilling the
data/visualization gap in the network-of-towns vision and giving a strong hackathon demo.
All visual data is **read-only** from the Circles RPC, so dashboards render without a connected
wallet and populate as citizens verify.

## Architecture
- Keep the Vite SPA. Add a state-based top-tab nav (no router).
- The current inviter UI becomes the **Invite** view (`views/InviteView.tsx`), reusing
  `lib/circles.ts` + `miniapp-sdk`.
- New read-only data layer `lib/circlesData.ts` wrapping the Circles RPC
  (`https://rpc.aboutcircles.com`). Graceful failure → empty states, never throws to the UI.
- New `lib/towns.ts` config (Röbel = real; placeholders for future towns).
- `react-force-graph-2d` for the trust graph + network map; inline SVG for stat charts.

## Views
1. **Invite** — existing flow (quota, citizen list, `generateInvites`). Unchanged.
2. **Town** — stat cards (verified humans X/15 · Röbel-Taler supply · holders · collateral in
   vault · demurrage) + **town trust graph** (citizens + group nodes, trust edges; color =
   attester/verified, size = balance).
3. **Flow** — recent Röbel-Taler transfers (from→to, amount, time) + a velocity stat.
4. **Network** — network-of-towns map: Röbel (real, live citizen count) → meta-group, plus
   labeled "future town" placeholders. Data-driven from `towns.ts`.

## Data layer (`circlesData.ts`)
Confident sources:
- **Trust graph:** `circles_query` `V_Crc.TrustRelations` (version=2) around the citizen set +
  group → `{nodes, links}`. (Same query shape already used in `apps/expo/lib/roebel-taler.ts`.)
- **Holders/balances:** `circles_getTokenBalances(addr)` per citizen; the Röbel-Taler holding =
  the entry whose tokenId == group address.
- **Verified humans:** `Hub.isHuman` per citizen (viem read; already in `circles.ts`).
Best-effort (verify table names live; degrade to empty state if unavailable):
- **Transfers:** `circles_query` on the v2 transfers table filtered to the group token id.
- **Supply / collateral:** group-token total supply (sum of holders) and the StandardTreasury
  vault balance for the group.

## Sparse-data / honesty
Every view degrades gracefully (empty states say "fills as citizens join"). The trust graph
looks intentional with few nodes. Network clearly marks placeholder towns. Manual **Refresh**
(no live sockets).

## Build order
1. Nav shell + extract InviteView (no behavior change).
2. `circlesData.ts` + verify RPC query shapes.
3. Town view (stats + trust graph).
4. Flow view (transfers).
5. Network view (towns map).
6. Build smoke-test → redeploy to Vercel (same project/URL → registry entry unchanged).

## Out of scope (YAGNI)
Live websockets, Sankey flow, real multi-town data (only Röbel exists), EURe/card rail (Stage 3),
auth/server. Related: [[project_circles_human_onboarding]], the network-of-towns essay.
