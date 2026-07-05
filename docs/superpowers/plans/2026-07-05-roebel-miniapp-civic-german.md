# Röbel-Münzen Mini-App — Civic/German/No-Crypto Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refocus the mini-app's first tab on real citizen-verification data, move the coin/economy content to the Economy tab, and translate the whole app to German with zero crypto/Circles wording.

**Architecture:** Port the `apps/web` ReactFlow verification graph into the mini-app as a `@xyflow/react` component fed by a new `viem` data hook (extending the existing `citizens-onchain.ts`). Rebuild `TownView` around civic KPIs + a personal "Dein Beitrag" card + the ported graph. Relocate the current "Your impact" card and the radial group-trust graph into `PulseView` (Economy). Do a repo-wide German + de-crypto string pass.

**Tech Stack:** Vite + React 19, TypeScript, Tailwind v4, `@xyflow/react` v12 (already a dep), `viem` (already a dep). **No new npm dependencies.**

## Global Constraints

- All user-facing copy in **German**. No "Circles / CRC / on-chain / onchain / Gnosis / Mint(ing) / collateral" wording anywhere a user can see it.
- Currency label is **Röbel-Münzen** everywhere (replace "Röbel Coins" / "Röbel Coin" / "Röbel Münzen" variants).
- Never render raw `0x…` wallet addresses as the primary label where a name is available; short-address fallback is acceptable inside the graph nodes (matches existing behavior).
- No new npm dependencies; reuse `@xyflow/react` and `viem`.
- Primary navy `#00498B`; muted text via existing `text-muted-foreground`.
- **No test runner exists** in `circles-roebel-mini-app` (no `test` script). The verification gate for every task is: `pnpm typecheck` (tsc) passes, `pnpm build` (vite) passes, and the stated manual/grep check. Run all pnpm commands from inside `circles-roebel-mini-app/` (standalone, `--ignore-workspace`).
- Commit after each task. Do **not** push or redeploy until the final task (deploy is a manual Vercel step the user will trigger).

---

### Task 1: Verification-graph data hook — `lib/citizen-graph.ts`

**Files:**
- Create: `circles-roebel-mini-app/src/lib/citizen-graph.ts`

**Interfaces:**
- Consumes: the `publicClient`, `CITIZEN_NFT_V2`, `ATTESTER_NFT_V2`, `DEPLOY_BLOCK`, and chunked-`getLogs` pattern from `lib/citizens-onchain.ts` (replicate the client/constants locally or import — prefer importing `CITIZEN_NFT_V2`/`ATTESTER_NFT_V2` and re-using `GNOSIS_RPC` from `lib/circles`).
- Produces (relied on by Tasks 2 & 3):
  - `type CgStatus = "active" | "pending" | "revoked"`
  - `interface CgNode { id: string; address: string; type: "attester" | "citizen"; isFounder: boolean; status: CgStatus; verifiedBy?: string[] }`
  - `interface CgEdge { id: string; source: string; target: string; type: "attester_approved" | "citizen_approved" }`
  - `interface CgCounts { citizens: number; attesters: number; verifications: number; pending: number; revoked: number }`
  - `function useCitizenGraph(): { nodes: CgNode[]; edges: CgEdge[]; counts: CgCounts; isLoading: boolean; error: string | null; refresh: () => void }`
  - `function myContribution(wallet: string | null, nodes: CgNode[], edges: CgEdge[]): { isCitizen: boolean; isAttester: boolean; verifiedCount: number }`

- [ ] **Step 1: Implement the event reads + graph builder.**

Model the data build on `apps/web/src/hooks/useSocialGraph.ts` (nodes from mint events, `isFounder = first 3`, pending from `AttestationRequestCreated`, revoked from the Revoked events, edges from `RequestApproved` matched to a mint `requestId`, and `verifiedBy` accumulation). Use `viem` `parseAbiItem` + chunked `getLogs` (reuse the `CHUNK`/backoff loop from `citizens-onchain.ts`). Event signatures (Gnosis, v2):

```ts
const CITIZEN_MINTED   = parseAbiItem("event CitizenNFTMinted(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId)");
const ATTESTER_MINTED  = parseAbiItem("event AttesterNFTMinted(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId)");
const CITIZEN_APPROVED  = parseAbiItem("event RequestApproved(uint256 indexed requestId, address indexed approver, bool signedAsAttester)");
const ATTESTER_APPROVED = parseAbiItem("event RequestApproved(uint256 indexed requestId, address indexed approver)");
const REQUEST_CREATED   = parseAbiItem("event AttestationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI)");
const CITIZEN_REVOKED   = parseAbiItem("event CitizenNFTRevoked(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId)");
const ATTESTER_REVOKED  = parseAbiItem("event AttesterNFTRevoked(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId)");
```

Reads: citizen contract → CITIZEN_MINTED, CITIZEN_APPROVED, REQUEST_CREATED, CITIZEN_REVOKED; attester contract → ATTESTER_MINTED, ATTESTER_APPROVED, REQUEST_CREATED, ATTESTER_REVOKED. Build the requestId→target maps from the mint events, then edges from approvals (skip `approver === target`, dedupe by `${approver}->${target}`). Compute `counts` = active citizen nodes / active attester nodes / edge count / pending nodes / revoked nodes. **Base historical-edge overlay is out of scope** (skip it — first cut is Gnosis-only).

- [ ] **Step 2: Implement `useCitizenGraph()`** — `useState` for nodes/edges/counts/isLoading/error; `fetchGraphData` guarded by an `inFlight` ref; `useEffect` runs it once on mount + a 30s interval + `visibilitychange` refresh (mirror `useSocialGraph`). **Fail-soft:** on any thrown error, fall back to nodes built from the static `ROEBEL_CITIZENS` list (attester flag → `type`; all `status: "active"`, no edges) so the graph never renders empty, and set `error`.

- [ ] **Step 3: Implement `myContribution`** — `isCitizen` = a node with `address === wallet` (lowercased) and `type === "citizen" || "attester"` and `status === "active"`; `isAttester` = that node is `type === "attester"`; `verifiedCount` = number of edges where `source === wallet` (lowercased).

- [ ] **Step 4: Verify** — `cd circles-roebel-mini-app && pnpm typecheck`. Expected: PASS (no errors in the new file).

- [ ] **Step 5: Commit**

```bash
git add circles-roebel-mini-app/src/lib/citizen-graph.ts
git commit -m "feat(miniapp): viem citizen-verification graph data hook"
```

---

### Task 2: Verification-graph view — `components/graph/CitizenGraphCanvas.tsx` (+ node components)

**Files:**
- Create: `circles-roebel-mini-app/src/components/graph/AttesterNode.tsx`
- Create: `circles-roebel-mini-app/src/components/graph/CitizenNode.tsx`
- Create: `circles-roebel-mini-app/src/components/graph/CitizenGraphCanvas.tsx`

**Interfaces:**
- Consumes: `useCitizenGraph`, `CgNode`, `CgEdge`, `CgStatus` from Task 1.
- Produces: `export default function CitizenGraphCanvas()` — a self-contained, bounded-height (`h-80`) React Flow graph. No props (it calls the hook itself).

- [ ] **Step 1: Port the node components.** Copy `apps/web/src/components/graph/AttesterNode.tsx` and `CitizenNode.tsx` into `components/graph/`. Adapt for `@xyflow/react` v12 and the mini-app:
  - Replace `import { Handle, Position, NodeProps } from "reactflow";` → `import { Handle, Position, type NodeProps } from "@xyflow/react";`.
  - Replace `import type { NodeStatus } from "@/hooks/useSocialGraph";` → `import type { CgStatus } from "../../lib/citizen-graph";` (use `CgStatus` in place of `NodeStatus`).
  - Change the signature to `function AttesterNode({ data }: NodeProps)` and, inside, `const d = data as unknown as { address: string; isFounder: boolean; status?: CgStatus; label?: string };` then use `d.*` (matches the `data`-cast pattern in `RadialGraph.tsx`, avoiding v12 generic friction). Keep all JSX/German strings/classes as-is.
  - The two node `<Handle>`s keep `type="target"/"source"`.

- [ ] **Step 2: Write `CitizenGraphCanvas.tsx`.** Port the layout + render from `apps/web/src/components/graph/GraphCanvas.tsx`, adapting:
  - Imports from `@xyflow/react` (not `reactflow`); CSS `import "@xyflow/react/dist/style.css";`.
  - `const { nodes: graphNodes, edges: graphEdges, counts, isLoading, refresh } = useCitizenGraph();`
  - Keep `calculateLayout` (founder ring + outer rings) and the `flowNodes`/`flowEdges` `useMemo`. Node `label` → German `Verifiziert von N Personen` (already German in source). Edge colors: `attester_approved` `#00498B`, `citizen_approved` `#3b82f6`, touches-revoked `#9ca3af` (keep). Edge labels `Bescheiniger ✓` / `Bürger ✓` (keep).
  - Container height `h-80` (not `h-[calc(100vh-140px)]`) so it fits in a card. Keep `<Background>`, `<Controls>`, `<MiniMap>`.
  - Keep the German loading/error/empty states ("Lade soziales Netzwerk…", "Fehler beim Laden", "Noch keine verifizierten Bürger:innen"). Drop the absolute-positioned Legend + Stats overlays (the Town KPI grid in Task 3 shows the counts instead) — or keep a compact legend only. Recommended: keep a small bottom-left legend, drop the stats box.
  - Use `counts` from the hook where the source used derived counts.

- [ ] **Step 3: Verify** — `pnpm typecheck && pnpm build`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add circles-roebel-mini-app/src/components/graph/AttesterNode.tsx circles-roebel-mini-app/src/components/graph/CitizenNode.tsx circles-roebel-mini-app/src/components/graph/CitizenGraphCanvas.tsx
git commit -m "feat(miniapp): port apps/web verification graph to xyflow"
```

---

### Task 3: Rebuild the Town tab — `views/TownView.tsx`

**Files:**
- Modify: `circles-roebel-mini-app/src/views/TownView.tsx`

**Interfaces:**
- Consumes: `useCitizenGraph`, `myContribution` (Task 1), `CitizenGraphCanvas` (Task 2). Keeps `connected: Address | null` + the `onOpenInvite/onOpenEvent/onOpenDocumentary` props from `App.tsx`.

- [ ] **Step 1: Strip removed sections.** Delete from `TownView`: the coin KPI grid (Verified/Supply/Holders/Collateral), the Backing donut + Verification bar block, the `<RadialGraph>` trust-graph card, the old "Your impact" card, the `<GrowCard>` usage, and the `<ExportCard>` usage + the whole `ExportCard` helper (it moves to Economy in Task 4). Remove now-unused imports (`getVerifiedSet`, `getTownStats`, `getTrustGraph`, `getReputation`, `getMyImpact`, `getRecentTransfers`, `RadialGraph`, `GrowCard`, `CsvFallbackSheet`, `Donut`, `ScoreBar`, `Lock`, `coinImg`, etc.) and their state/effects.

- [ ] **Step 2: Wire the graph data.** Add `const { counts, nodes, edges, isLoading } = useCitizenGraph();` and `const contrib = myContribution(connected, nodes, edges);`.

- [ ] **Step 3: New header + "Dein Beitrag" card.** `PageHeader` → title `"Gemeinde"`, description `"Verifizierte Bürger:innen aus Röbel – wer gehört dazu und wer bürgt für wen."` (no refresh needed, or keep `onRefresh` wired to the hook's `refresh`). Then, when `connected`, render a `ChartCard title="Dein Beitrag" subtitle="Deine Rolle in der Gemeinde"` containing:
  - A status row: badge `Verifizierte:r Bürger:in ✓` when `contrib.isCitizen` (else muted `Noch nicht verifiziert`), plus a navy badge `Bescheiniger:in` when `contrib.isAttester`.
  - A `KpiCard label="Mit-verifiziert" value={contrib.verifiedCount} sub="Bürger:innen"` (use the existing `Users`/`ShieldCheck` icon).

- [ ] **Step 4: Civic KPI grid** (always shown), a 2×2 `KpiCard` grid from `counts`:
  - `Verifizierte Bürger:innen` = `counts.citizens` (icon `Users`)
  - `Bescheiniger:innen` = `counts.attesters` (icon `ShieldCheck`)
  - `Verifizierungen` = `counts.verifications` (icon `Check`)
  - `Offene Anträge` = `counts.pending` (icon `Activity`)
  Show a `SkeletonGrid count={4}` while `isLoading && counts.citizens === 0`.

- [ ] **Step 5: Graph card + kept tool cards.** `ChartCard title="Verifizierungsnetz" subtitle="Wer für wen gebürgt hat"` wrapping `<CitizenGraphCanvas />`. Keep the two `ToolCard`s but German titles: `"Bürger:innen einladen"` (invite) and `"Event-Belohnungen"` (event). Keep the `VideoDocCard` (its button already says "Jetzt ansehen"; header → keep or German `"Video-Doku"`).

- [ ] **Step 6: Verify** — `pnpm typecheck && pnpm build`. Then `pnpm dev` and confirm the Town tab renders the civic KPIs + graph, with no Supply/Holders/Backing/Grow-Röbel remnants.

- [ ] **Step 7: Commit**

```bash
git add circles-roebel-mini-app/src/views/TownView.tsx
git commit -m "feat(miniapp): rebuild Town tab around citizen verification (German)"
```

---

### Task 4: Economy tab receives the moved pieces — `views/PulseView.tsx` + `App.tsx`

**Files:**
- Modify: `circles-roebel-mini-app/src/App.tsx`
- Modify: `circles-roebel-mini-app/src/views/PulseView.tsx`
- Reference (moved into PulseView): `components/RadialGraph.tsx`, `getTrustGraph`/`getVerifiedSet`/`getProfiles`/`getMyImpact` from `lib/circlesData`, and the `ExportCard` removed from TownView in Task 3.

**Interfaces:**
- `App.tsx` passes `connected` into `<PulseView connected={connected} />`.
- `PulseView` gains `{ connected }: { connected: Address | null }`.

- [ ] **Step 1: Thread `connected` + German chrome in `App.tsx`.** Change `{tab === "economy" && <PulseView />}` → `<PulseView connected={connected} />`. Tab labels → `Gemeinde` / `Wirtschaft` / `Mitbestimmung`. Footer left text `"Röbel / Müritz · Circles v2 on Gnosis"` → `"Röbel / Müritz"`. **Remove** the `On-chain proof` explorer `<a>` link (and the now-unused `ROEBEL_GROUP`/`explorerAvatar`/`ArrowUpRight` imports if nothing else uses them).

- [ ] **Step 2: "Dein Wirtschafts-Beitrag" at top of PulseView.** Accept `connected`. After the snapshot loads, compute `const impact = connected ? getMyImpact(connected, rep) : null;` (`rep` already computed via `reputationFrom(snap)`). Render, directly under the `PageHeader`, a `ChartCard title="Dein Wirtschafts-Beitrag"` with a 3-col `KpiCard` grid: `Deine Münzen` (`impact.balance`, coin icon), `Dein Rang` (`#${impact.rank}` of `impact.total`), `Bewegungen` (`${impact.inCount}↓ ${impact.outCount}↑`). Only when `connected && impact`.

- [ ] **Step 3: Radial trust-graph section.** Add state + a load effect that fetches `getVerifiedSet()` → `getTrustGraph(verified)` and `getProfiles(citizens)` (mirror the logic removed from TownView), map to `RadialNode[]`, and render a `ChartCard title="Vertrauensnetz der Röbel-Münzen" subtitle="Wer die Röbel-Münzen nutzt"` wrapping `<RadialGraph center={{ label: "Röbel-Münzen", … }} nodes={nodes} emptyLabel="noch keine Mitglieder" />`. Place it after `AnatomySection` (before the flow feed).

- [ ] **Step 4: Move the CSV `ExportCard`.** Paste the `ExportCard` helper (removed from TownView) into `PulseView.tsx` (or a new `views/economy/ExportCard.tsx`), reworded German ("Daten exportieren", "Letzte 7 Tage" / "Alle", "Übertragungen" / "Bürger:innen" / "Aktivität"), and render it at the bottom. It needs `verifiedSet`, `rep`, and the citizen list — source `verifiedSet` from Step 3's fetch, `rep` from `reputationFrom(snap)`, and `citizens` via `fetchRoebelCitizens()`.

- [ ] **Step 5: German-ize PulseView chrome.** `PageHeader` title `"Wirtschaft"`, description `"Die Röbel-Münzen der Gemeinde in Echtzeit."` (no chain names). Status line `"${n} Übertragungen · ${m} Halter:innen"` / `"Lade Daten…"`.

- [ ] **Step 6: Verify** — `pnpm typecheck && pnpm build`; `pnpm dev` → Economy tab shows the impact card on top, the radial trust graph mid-page, and the export card at the bottom; tabs read Gemeinde/Wirtschaft/Mitbestimmung.

- [ ] **Step 7: Commit**

```bash
git add circles-roebel-mini-app/src/App.tsx circles-roebel-mini-app/src/views/PulseView.tsx circles-roebel-mini-app/src/views/economy/ExportCard.tsx
git commit -m "feat(miniapp): move impact + trust graph + export into Economy; German chrome"
```

---

### Task 5: Whole-app German + de-crypto string pass

**Files (modify — user-facing strings only):**
- `circles-roebel-mini-app/src/views/economy/*.tsx` (KpiStrip, SupplyBackingSection, MoneyFlowsSection, FlowCompositionSection, HolderDistributionSection, VelocitySection, ReputationSection, AnatomySection, FlowFeedSection, RangeSelector)
- `circles-roebel-mini-app/src/lib/circlesData.ts` (the `KIND_LABEL` FlowKind labels + any `sub`/`label` strings; `centerLabel`)
- `circles-roebel-mini-app/src/lib/groupAnatomy.ts` (anatomy section copy)
- `circles-roebel-mini-app/src/views/GovernanceView.tsx`, `views/ProposalDetailView.tsx`, `lib/proposals.ts` (copy strings)
- `circles-roebel-mini-app/src/views/InviteView.tsx`, `views/EventInviteView.tsx`, `views/DocumentaryView.tsx`

**Translation mapping (apply consistently):**

| English / crypto | German (no-crypto) |
|---|---|
| Supply | Umlauf |
| Backing | Deckung |
| Collateral / personal CRC locked | Deckung / hinterlegte Röbel-Münzen |
| Holders / holder | Halter:innen |
| Volume | Volumen |
| Transfers | Übertragungen |
| Active | Aktiv |
| Mints / minted | Neue Münzen / neu ausgegeben |
| New holders | Neue Halter:innen |
| Reward | Belohnung |
| Lootbox / spend | Ausgabe |
| Transfer (peer) | Übertragung |
| Money flows | Geldflüsse |
| Velocity / circulation | Umlaufgeschwindigkeit |
| Reputation | Ansehen |
| Röbel Coins / Röbel Coin | Röbel-Münzen |
| Governance | Mitbestimmung |
| Town treasury | Gemeinschaftskasse |
| Proposals / proposal | Vorschläge / Vorschlag |
| Reserve balance | Kassenstand |
| on-chain / Circles v2 on Gnosis / Gnosis | *(delete — no chain names)* |

- [ ] **Step 1: Economy sections.** In each `views/economy/*.tsx`, replace every visible English string per the mapping (titles, subtitles, axis/legend labels, empty states, tooltips). In `lib/circlesData.ts` set `KIND_LABEL` = `{ mint: "Neue Münzen", reward: "Belohnung", spend: "Ausgabe", transfer: "Übertragung" }` and `centerLabel: "Röbel-Münzen"`. Verify: `grep -rniE 'circles|crc|on-chain|onchain|gnosis' circles-roebel-mini-app/src/views/economy circles-roebel-mini-app/src/lib/circlesData.ts` returns only non-user-facing code comments (comments may keep technical terms; strings must not).

- [ ] **Step 2: Governance.** `GovernanceView` header title `"Mitbestimmung"`, description without chain names (e.g. `"Gemeinschaftskasse und Vorschläge – stimme in der Röbel-App privat ab."`), `"Town treasury"` → `"Gemeinschaftskasse"` (subtitle drop "Safe multisig on Gnosis"), `"Reserve balance"` → `"Kassenstand"`, empty hints → German ("Noch keine Vorschläge. …"), "No votes recorded" → "Noch keine Stimmen". Apply the same to `ProposalDetailView` and any copy in `lib/proposals.ts`.

- [ ] **Step 3: Invite / Event / Documentary.** Translate remaining English user-facing strings in `InviteView`, `EventInviteView`, `DocumentaryView`, keeping them crypto-free (never say CRC/Circles/wallet). Currency → Röbel-Münzen.

- [ ] **Step 4: Full de-crypto sweep.** Run `grep -rniE 'circles|crc|on-chain|onchain|gnosis|röbel coin' circles-roebel-mini-app/src --include='*.tsx'` and confirm no matches are user-facing JSX text (matches inside code identifiers/imports/comments are fine, but audit each). Fix any stragglers.

- [ ] **Step 5: Verify** — `pnpm typecheck && pnpm build`; `pnpm dev` → click through all three tabs + Invite/Event/Documentary sub-pages and confirm German throughout, no crypto words visible.

- [ ] **Step 6: Commit**

```bash
git add circles-roebel-mini-app/src/views circles-roebel-mini-app/src/lib
git commit -m "feat(miniapp): full German + de-crypto copy pass (Röbel-Münzen)"
```

---

### Task 6: Final verification + push

- [ ] **Step 1:** `cd circles-roebel-mini-app && pnpm typecheck && pnpm build`. Expected: both PASS.
- [ ] **Step 2:** Manual smoke via `pnpm dev`: Town tab (Dein Beitrag + 4 civic KPIs + verification graph, no coin cards/Grow-Röbel), Economy tab (impact on top, radial trust graph, export at bottom, German KPIs), Mitbestimmung tab (German). Confirm `?inviter=` / `?proposal=` deep links still route.
- [ ] **Step 3:** Final grep gate: no user-facing `circles/crc/on-chain/gnosis/Röbel Coin` strings remain.
- [ ] **Step 4: Push.**

```bash
git push
```

- [ ] **Step 5:** Tell the user the mini-app is NOT git-connected on Vercel; to deploy: `cd circles-roebel-mini-app && npx -y vercel@latest --prod --yes` (use `--ignore-workspace` for any dep changes). Ask before deploying.

---

## Self-Review notes

- **Spec coverage:** Town rework (T3) ✓; verification graph port (T1+T2) ✓; move impact + radial graph + export to Economy (T4) ✓; whole-app German + de-crypto + Röbel-Münzen (T4 chrome + T5) ✓; Grow Röbel removed (T3) ✓; events/proposals stats deferred (not in plan) ✓.
- **Type consistency:** `CgNode/CgEdge/CgStatus/CgCounts/useCitizenGraph/myContribution` names are used identically in T1→T2→T3. `PulseView` prop `connected: Address | null` matches `App.tsx`.
- **No test runner:** verification is typecheck/build/grep/manual by design (documented in Global Constraints).
