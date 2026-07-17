# Strategy Session 2026-07-17 — Index

**Status:** RESEARCH — not settled strategy, not legal advice, not a commitment to build.
**Origin:** Strategy conversation (Claude), 2026-07-17.
**Relationship to existing corpus:** Extends the Decade Strategy (Civic OS + Fiscal Constitution), the Product B Market Scan (governance gap in agentic payments), and the Legal Masterplan. Nothing here overrides the 2026-07-12 conclusion: **the binding next steps are human — found the e.V., recruit seven founding members, secure Gemeinde cooperation, onboard 1–2 Vereine.** These documents exist so the ideas are not lost, not so they get built now.

## Documents in this drop

| File | One-line summary |
|---|---|
| `BUSINESS_GOVERNANCE_PRODUCT.md` | B2B spin-out of the civic stack: verified-member governance for companies, AI agents as proposers, humans as deciders. Beachhead: Genossenschaften and Vereine, not GmbHs. |
| `SOVEREIGN_AI_FUTARCHY.md` | Sovereign local inference (LiteLLM routing tiers) + agent prediction markets (futarchy) as a scored forecasting layer feeding the MACI vote. AttesterNFT holders as outcome oracle. |
| `PHYSICAL_INFRA_ENERGY_SHARING.md` | Atoms strategy: § 42c EnWG Energy Sharing (in force 2026-06-01), Bürgerenergie eG, batteries, sovereign compute container with heat reuse, robots. Phased to real capital constraints. |

## Core thesis connecting all three

As AI collapses the cost of software, defensibility migrates to what AI cannot replicate: **land, grid connections, permits, installed hardware, regulatory licenses, and local trust graphs.** The winning structure is *software wrapped around owned atoms*. The Röbel App is the coordination layer; the eG-owned energy assets, the compute container, the robots, and the MüritzPhone storefront are the physical layer competitors cannot fork.

Fractal Kardashev framing (use sparingly, it is a narrative not a plan): capture energy → convert to compute → convert to coordination. A town that generates surplus power, turns part of it into sovereign compute, and governs the loop through its citizens is the smallest replicable unit of that stack. The blueprint being forkable matters more than Röbel's absolute scale.

## Standing caveats (apply to all three docs)

1. **Hostile-reader rule:** Like the Decade Strategy, these documents were produced inside a sympathetic conversation. Before any of them is treated as settled, they need a hostile external reader (ideally someone with GovTech sales, energy-market, or German corporate law experience).
2. **Legal review rule:** ZAG/MiCAR, GenG, EnWG, EU AI Act, DSGVO, and Betriebsverfassungsgesetz claims herein are research summaries, not legal advice. Fachanwalt + Steuerberater before founding anything or selling anything.
3. **Focus rule:** Every idea here is downstream of Röbel adoption. The cheapest way to keep all doors open: run the e.V.'s own internal governance on the existing stack, and treat every new layer (sovereign Mecky, one toy futarchy market, first rooftop PV) as a small proof point attached to work that must happen anyway.

## Housekeeping flags found during this session

- The public `README.md` still documents **Base Mainnet (8453)** as the current deployment. Per internal state, the stack fully consolidated to **Gnosis Chain (100)** on 2026-06-25 with `packages/blockchain/src/index.ts` as the source of truth. → Verify and update the README (addresses, chain id, Basescan→Gnosisscan links) or explicitly mark the README's address section as historical.
- `docs/FORKING_GUIDE.md` step 5 says "Deploy governance contracts on Base" — same fix needed.

**Resolution (verified 2026-07-17, Claude Code):** Both flags were stale. `packages/blockchain/src/index.ts` confirms `CHAIN_ID = 100` with the Gnosis v2 address set active and the Base stack archived under `legacyBase*` keys. The root `README.md` already documents Gnosis Mainnet (chain id 100) as the live deployment with Gnosisscan links, marks Base as archived, and its fork step 5 already reads "Deploy the identity + governance contracts on Gnosis." `docs/FORKING_GUIDE.md` is a TODO stub with no chain reference at all. No fixes were needed.

## Instructions for Claude Code

Place all four files in `docs/future-research/` (create the directory if it does not exist). Do not modify any existing documents in `docs/`. Add a link section "Future research (2026-07-17 session)" to any existing research index if one exists; otherwise this file serves as the index. Do not act on the housekeeping flags without confirming current chain state against `packages/blockchain/src/index.ts` first.
