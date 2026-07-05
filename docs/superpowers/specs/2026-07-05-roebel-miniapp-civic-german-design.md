# Röbel-Münzen mini-app — civic-friendly, German, no-crypto redesign

Date: 2026-07-05
Scope: `circles-roebel-mini-app/` (the Vite React mini-app embedded in the Röbel Expo app via WebView)

## Goal

Make the mini-app UX-friendly for an ordinary Röbel citizen: **everything in German**, with
**no crypto / Circles / CRC / on-chain / Gnosis wording anywhere**. Refocus the first tab
("Town") on real citizen-verification data, and relocate the coin/economy content to the
Economy tab.

## Decisions (locked)

- **Localization scope:** whole app now — Town, Economy, Governance tabs, plus shared
  header/footer chrome.
- **Currency label:** standardize to **Röbel-Münzen** everywhere (drop "Röbel Coins").
- **Town "Dein Beitrag" card:** verification contribution only. **Events-attended and
  proposals-participated are explicitly out of scope for this pass** (private MACI voting has
  no readable per-wallet record; deferred).

## 1. Town tab (`views/TownView.tsx`) — rebuilt around citizen verification

**Remove:**
- The four coin KPI cards: Verified, Supply, Holders, Collateral.
- The **Backing** donut card and the **Verification** bar card.
- The **Grow Röbel** referral card (`components/GrowCard.tsx` usage).
- The group→citizen radial trust graph (moves to Economy — see §3).
- The CSV **Export data** card (moves to Economy — it is economy data and exposes raw
  addresses, which do not belong on the civic Town tab).

**Add — "Dein Beitrag"** (shown only when a wallet is connected): the connected citizen's
civic standing, derived from the ported verification-graph data:
- Status badge **Verifizierte:r Bürger:in ✓** (holds CitizenNFT).
- Badge **Bescheiniger:in** when the wallet is an attester.
- **Mit-verifiziert:** count of fellow citizens this wallet helped verify (graph edges where
  it is the approver / `verifiedBy` membership).
- (No events-attended, no proposals stat — deferred.)

**Add — civic KPI grid** (town-wide, always shown), all from the ported graph data:
- **Verifizierte Bürger:innen** (active citizen nodes)
- **Bescheiniger:innen** (active attester nodes)
- **Verifizierungen** (edge count)
- **Offene Anträge** (pending request nodes)

**Keep (reworded German):** Invite tool card → "Bürger:innen einladen"; Event tool card →
"Event-Belohnungen"; the Video-Dokumentation card.

## 2. Verification graph ported from `apps/web` into the mini-app

The Town graph becomes the `apps/web` social/verification graph (attester + citizen nodes,
"wer-hat-wen-verifiziert" edges) instead of the radial group star.

- **Data:** new `lib/citizen-graph.ts` exposing a `useCitizenGraph()` hook built on `viem`
  (extends the existing `lib/citizens-onchain.ts` client + chunked `getLogs`). Reads on Gnosis:
  `CitizenNFTMinted`, `AttesterNFTMinted`, `AttestationRequestCreated`, `RequestApproved`
  (v2 sig `(requestId, approver, signedAsAttester)`), `CitizenNFTRevoked`, `AttesterNFTRevoked`.
  Builds `{ nodes, edges }` with the same shape as the web `useSocialGraph` (active/pending/
  revoked status, `verifiedBy`, founder flag). Fail-soft: on RPC failure fall back to nodes
  built from the static `ROEBEL_CITIZENS` list (no edges). Base historical-edge overlay is
  optional and best-effort; may be skipped in the first cut.
- **View:** port `apps/web/src/components/graph/{GraphCanvas,AttesterNode,CitizenNode}.tsx`
  into `components/graph/` in the mini-app. Convert `reactflow` (v11) imports to
  `@xyflow/react` (v12, already a dependency; CSS `@xyflow/react/dist/style.css`). German
  legend + stats already present in the source; keep them, theme colors to the navy palette
  (`#00498B`). No new npm dependencies.
- The graph is embedded in a `ChartCard` on the Town tab (not a full-screen page). Height is
  bounded (e.g. `h-72`/`h-80`) so it sits inside the mini-app scroll flow.

## 3. Economy tab (`views/PulseView.tsx`) — receives the two moved pieces

- Move the **current "Your impact"** card (coins / rank / flows) to the **top** of the Economy
  tab, reworded German → "Dein Wirtschafts-Beitrag": *Deine Münzen / Dein Rang / Bewegungen*.
  Its data (`getMyImpact` over the reputation list) already exists; wire it from the economy
  snapshot's `reputationFrom(snap)` + the connected wallet (thread `connected` into `PulseView`).
- Move the **radial group-trust graph** (`components/RadialGraph.tsx` + `getTrustGraph`) into
  Economy as a section titled "Vertrauensnetz der Röbel-Münzen".
- Move the **CSV Export data** card here (reworded German), keeping its transfers / citizens /
  reputation exports.

## 4. Whole-app German + de-crypto pass

Audit and translate every user-facing string; strip Circles/CRC/on-chain/Gnosis wording.

- **Chrome (`App.tsx`):** tab labels → **Gemeinde / Wirtschaft / Mitbestimmung**. Footer
  "Röbel / Müritz · Circles v2 on Gnosis" → "Röbel / Müritz". Remove the Circles-explorer
  "On-chain proof" link.
- **Economy (`PulseView` + `views/economy/*`):** headers, KPI labels (Supply→Umlauf,
  Backing→Deckung, Volume→Volumen, Transfers→Übertragungen, Active→Aktiv, Holders→Halter:innen,
  Mints→Neue Münzen, New holders→Neue Halter:innen), section titles/subtitles, FlowKind labels
  (Mint / Reward / Lootbox / Transfer → German), "personal CRC locked / collateral" →
  "hinterlegte Röbel-Münzen / Deckung".
- **Governance (`GovernanceView`, `ProposalDetailView`, `lib/proposals.ts` copy):** "Governance"
  → "Mitbestimmung"; "Town treasury … on Gnosis" → German without chain names; button/empty
  strings.
- **Invite / Event / Documentary views:** translate remaining English strings; keep them free
  of crypto jargon (per existing copy rules — never say CRC/Circles).
- Currency label **Röbel-Münzen** applied consistently in all of the above.

## 5. Out of scope (this pass)

- Events-attended and proposals-participated stats (deferred).
- Base historical-edge overlay on the verification graph (best-effort; acceptable to skip).
- Any change to on-chain contracts, edge functions, or the Expo host shell.

## Verification

- `pnpm --dir circles-roebel-mini-app typecheck` (tsc) passes.
- `pnpm --dir circles-roebel-mini-app build` (vite) passes.
- Manual: dev server renders Town tab with the ported graph + civic KPIs, Economy tab shows the
  moved impact card at top and the radial trust graph, and a repo-wide grep for
  `circles|crc|on-chain|gnosis` finds no user-facing occurrences.
- Deploy: the mini-app is NOT git-connected on Vercel — redeploy manually with
  `cd circles-roebel-mini-app && npx -y vercel@latest --prod --yes` (use `--ignore-workspace`
  for any dependency changes). Deferred until the user asks to ship.
