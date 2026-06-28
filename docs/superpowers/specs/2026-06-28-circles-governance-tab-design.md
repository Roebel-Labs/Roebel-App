# Circles mini-app — Governance tab

**Date:** 2026-06-28
**App:** `circles-roebel-mini-app` (Vite 6 + React 19 + Tailwind v4 + viem, runs inside the Circles miniapp iframe)
**Status:** Approved — implementing

## Goal

Replace the **Network** tab with a new **Governance** tab (ballot-box icon) that surfaces everything
governance-related for Röbel citizens, read-only:

1. The **Gemeinschaftskasse** (town treasury) balance.
2. The full list of **proposals**, status-grouped.
3. A **proposal detail** view that renders the Irys rich-text content (HTML/markdown) correctly.

Voting stays in the Röbel mobile app (MACI-private); the mini-app is a read-only window with a
"vote in the app" call-to-action, matching the existing read-only web proposal page.

## Decisions (locked with the user)

- **Navigation:** drop the `network` tab + `NetworkView`; add a `governance` tab with a ballot-box
  icon. **Town** and **Economy** tabs are untouched. Tab order: `Town · Economy · Governance`.
- **Voting:** read-only. Show tallies + state; CTA deep-links to the Röbel app. No MACI wiring.
- **Proposal list:** show **all** proposals, status-grouped (Active/Pending first, then closed),
  newest-first within each group.
- **Treasury:** **balance only** — euro total + per-asset breakdown (xDAI / EURe / Röbel-Münzen).
  No transaction history (keeps external calls minimal).
- **Language:** English chrome (matches the mini-app's existing English UI); proposal content renders
  in its original language (German).
- **State/votes source:** Supabase `proposals` rows (same as the web *list* page). No live Governor
  reads — avoids pulling the Governor/MACI ABIs into the mini-app. Live enrichment is a noted future
  enhancement.

## Data sources (verified)

- **Treasury Safe:** `0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa` on Gnosis (chain 100), read-only via
  public RPC (`GNOSIS_RPC` from `lib/circles.ts`):
  - xDAI: `getBalance(SAFE)`
  - EURe: ERC-20 `balanceOf(SAFE)` at `0xcB444e90D8198415266c6a2724b7900fb12FC56E`
  - Röbel-Münzen: Circles Hub ERC-1155 `balanceOf(SAFE, uint256(ROEBEL_GROUP))` at `HUB`
  - `euro = xDAI·0.92 + EURe` (matches Expo/web `XDAI_EUR = 0.92`)
- **Proposals:** Supabase REST, `GET {SUPABASE_URL}/rest/v1/proposals?select=*&order=created_at.desc`
  with the existing anon `apikey` (`lib/supabase.ts`). RLS confirmed: *"Proposals are viewable by
  everyone"* (SELECT, `true`). Columns: `proposal_id` (tx hash, the route key), `title`, `summary`,
  `content` (jsonb: `{ markdown, version, metadata }`), `category`, `state` (int 0–7),
  `for_votes/against_votes/abstain_votes` (text), `irys_content_id`, `irys_url`, `proposer_address`,
  `created_at`.
- **Irys body:** fetch `irys_url` (or `https://gateway.irys.xyz/{irys_content_id}`); **fall back to
  `content.markdown`** on failure. Content is **HTML** (TipTap) or markdown — render through one path.

## Components (all new unless noted)

| File | Purpose |
|------|---------|
| `src/components/icons.tsx` (edit) | add `BallotBox` (lucide "vote" glyph), stroke style |
| `src/lib/treasury.ts` | `getTreasury(): Promise<{ euro, xdai, eure, muenzen }>` — best-effort RPC reads |
| `src/lib/proposals.ts` | `getProposals()`, `getProposalById(id)`, `fetchProposalBody(p)`, types, `STATE_LABEL`, `isActiveState`, `proposalSortKey` |
| `src/components/MarkdownRenderer.tsx` | `react-markdown` + `remark-gfm` + `rehype-raw`, navy/Mona-Sans element styles (no typography plugin) |
| `src/views/GovernanceView.tsx` | the tab: treasury card + governance KPIs + status-grouped proposal list; holds `selectedProposalId` |
| `src/views/ProposalDetailView.tsx` | back button, header, vote tallies (`SplitBar`), Irys body, read-only CTA, on-chain links |
| `src/App.tsx` (edit) | `Tab` type + `TABS` swap network→governance; render `GovernanceView`; remove `NetworkView` import + file |

State labels (Governor enum): `0 Pending, 1 Active, 2 Canceled, 3 Defeated, 4 Succeeded, 5 Queued,
6 Expired, 7 Executed`. Active group = {Pending, Active}; pill tone navy for active, gray otherwise.
When an active proposal has all-zero tallies → show "Voting in progress — encrypted" instead of empty bars.

## Routing

State-based, inside `GovernanceView` (`selectedProposalId` → detail else list, with `onBack`).
Optional `?proposal=<proposal_id>` deep-link parsed in `App.tsx` (it already reads `?inviter`/`?ref`)
to open the Governance tab onto a detail. Vote colors stay in-palette: for=navy `#00498B`,
against=`#94a3b8`, abstain=`#cbd5e1`.

## Errors / loading

Every fetch is best-effort (catch → empty/zero), `Promise.all` where independent, `Skeleton` loaders,
`EmptyHint` empty states — consistent with `TownView`/`circlesData.ts`.

## Dependencies

Add to `circles-roebel-mini-app` only: `react-markdown@^10`, `remark-gfm@^4`, `rehype-raw@^7`.

## Out of scope

Live Governor/MACI reads, in-app voting, treasury transaction history, treasury signing/payouts
(those stay in the auth-gated web admin dashboard).
