# Economy tab — data-rich & interactive (Circles mini-app)

**Date:** 2026-06-28
**Scope:** `circles-roebel-mini-app/` — the **Economy** tab (`PulseView`). Upgrade
every chart to be interactive and add new data-rich sections fed by on-chain
Circles v2 data. No changes to Town / Network tabs or the on-chain write paths.

## Goal

Turn the Economy tab from four static SVG charts into a professional,
information-dense, **interactive** economy dashboard for the Röbel Münze (RCRC)
group currency — the highest amount of legible on-chain data the public Circles
RPC can supply, on-brand and mobile-first inside the Circles iframe.

## Decisions (locked with the user)

- **Charting:** add **visx** (modular `@visx/*`) as the foundation; keep
  hand-built SVG/CSS only for primitives that don't need a lib (Donut, SplitBar,
  Sparkline). Rationale: visx gives pro scales/axes/crosshair/tooltips while
  preserving full control of the brand look; `@xyflow/react` already sets the
  precedent for a viz dependency.
- **Scope:** upgrade existing charts **and** add new sections.
- **Palette:** stay on-brand using the supplied four ramps, centralized in
  `src/lib/chartTheme.ts` (swappable in one file). New off-brand hues only if a
  ramp genuinely can't disambiguate a series.

### Brand palette (single source of truth → `chartTheme.ts`)

| ramp | values |
|---|---|
| Ink / neutral | `#051433` · `#6B7280` · `#B4B8C1` · `#F0F0F0` · `#FFFFFF` |
| Navy (primary) | `#00498B` · `#679AC8` · `#E5ECF3` |
| Sky (secondary) | `#7ABBF2` · `#BCDDF9` · `#E4F2FF` |
| Gold (highlight) | `#FDC705` · `#FEE382` · `#FFF4CD` |

Flow-kind mapping: `mint=#00498B (navy)`, `reward=#7ABBF2 (sky)`,
`spend=#FDC705 (gold)`, `transfer=#B4B8C1 (gray)`.

## Architecture

**One fetch, many charts.** `getEconomy()` loads supply, collateral, the full
holder set, and the transfer log (raise limit to ~1000 = effectively full town
history) in one batched pass. The global **range selector** (7d / 30d / 90d /
All) recomputes only **pure derived series** from that data — no refetch on range
change. Every RPC fn keeps the existing "catch → empty" contract so the UI never
throws; charts render `EmptyHint` when empty.

### Data layer (`src/lib/circlesData.ts`, additions)

| function | returns | powers |
|---|---|---|
| `getEconomy()` | `{ supply, collateral, holders[], transfers[], verified }` | one batched load |
| `cumulativeSupplySeries(transfers, currentSupply, range)` | net-supply over time, anchored to current supply, walking back via mint/burn classification | Supply chart |
| `flowsByDay(transfers, range)` | daily buckets per flow kind (generalizes `dailyVolume`) | Money-flows chart |
| `holderDistribution(holders)` | balance histogram buckets + **Gini** + Lorenz points + top-N share | Distribution chart |
| `velocitySeries(transfers, supply, range)` | volume÷supply + transfers/active-wallet over time | Velocity chart |
| `newHoldersSeries(transfers, range)` | first-seen per address → new holders/day | KPI + growth |
| `kpiDeltas(transfers, holders, supply, range)` | each KPI value + Δ% vs previous equal window + sparkline points | KPI strip |

`getHolders()` exposes the existing `GroupTokenHoldersBalance` rows as a typed
`Holder[] { address, balance }` (currently only consumed inside `getReputation`).

Net-supply reconstruction: `mint` (`from = 0x0 | group`) adds; `burn`
(`to = 0x0 | group`) subtracts. Anchor `supply(now) = currentSupply` and integrate
backwards so the line is correct for any window we hold transfers for. Backing is
point-in-time (vault history isn't indexed) → shown as a current gauge + note.

### Components

- `src/lib/chartTheme.ts` *(new)* — ramps, `FLOW_COLORS`, series palettes, helpers.
- `src/components/charts/` *(new)* — visx charts + shared tooltip:
  - `TimeSeriesChart` — line/area, crosshair, nearest-point tooltip.
  - `StackedAreaChart` — `AreaStack`, tappable legend toggles, tooltip.
  - `Histogram` — balance distribution bars, hover/tap highlight.
  - `LorenzCurve` — Lorenz line vs equality diagonal, Gini label.
  - `ChartTooltip` — shared floating tooltip card in the shadcn idiom.
  - keep `Donut`, `SplitBar` (made interactive), `Sparkline` from `charts.tsx`.
- `src/views/economy/` *(new)* — one small component per section + `RangeSelector`;
  `PulseView.tsx` becomes a thin shell (range state + `getEconomy` load + compose).

### Sections (final order)

1. **Header** — title, live dot, last-updated, global range selector, refresh.
2. **KPI strip** — ~8 tiles (Supply, Backing %, Volume, Transfers, Active wallets,
   Holders, Mints, New holders) each with mini-sparkline + Δ% vs previous window.
3. **Supply & backing** — interactive cumulative-supply area (navy) + backing band
   (sky) + current-backing Donut; crosshair tooltip.
4. **Money flows** — interactive stacked area (mint/reward/spend/transfer) with
   legend toggles + crosshair tooltip; treasury earn↔spend loop stat.
5. **Flow composition** — interactive SplitBar (hover/tap → amount · count · %).
6. **Holder distribution** — histogram + Lorenz curve + Gini + "top 5 hold X%".
7. **Velocity / circulation** — velocity + transfers/active-wallet over range.
8. **Reputation leaderboard** — kept; rows expand to a held/in/out breakdown bar.
9. **Flow feed** — kept; filterable, explorer links, repainted to the palette.

### Interactivity model
Crosshair + floating tooltip on hover/drag · global range selector · legend
show/hide · hover/tap highlight on bars & segments · expandable leaderboard rows ·
touch-friendly (tap = hover) for the ~360px iframe · respects
`prefers-reduced-motion`.

## Constraints / definition of done

- On-brand palette only · **English** copy · currency always "Röbel Münze/Coin",
  never "CRC"/Circles jargon · mobile-first ~360px.
- `pnpm typecheck` + `pnpm build` clean (no test runner in this app → verify by
  typecheck + build + manual check in the Circles Playground).
- Deploy is **not** git-connected: `cd circles-roebel-mini-app && npx -y vercel@latest --prod --yes`.
- No new heavy deps beyond the modular `@visx/*` set.

## Out of scope
Town/Network tabs, on-chain write/invite flows, Supabase analytics schema,
backing-over-time history (not indexed), Expo app.
