# Product B Market Scan — Treasury · Identity · Agentic Commerce

> **STATUS: focused single-agent research pass (stopped early for cost).** Real citations, but *not* exhaustive
> — a first map, not a finished market report. Companion to [`DECADE_STRATEGY.md`](DECADE_STRATEGY.md) (Product B =
> the Fiscal Constitution layer). Research record, not investment advice; third-party market forecasts vary widely
> and are cited as-is.

## Executive summary

- **The wedge is validated by a gap, not a competitor.** The agentic-payments space is being built out fast, but
  the *governance* layer — budget constraints, spend limits, per-agent permission frameworks — is explicitly
  **unaddressed**. The open question in the market is exactly ours: *"when enterprises deploy 50 agents making
  autonomous purchases, who enforces per-call limits, category restrictions, and cumulative budgets in real
  time?"*<sup>[1]</sup> That is "money with a constitution / scoped agent budgets" restated by the market itself.
- **The money layer is settling; the control layer is open.** Stablecoins are becoming the default agent
  settlement rail (~$33T volume in 2025, projected ~$56T by 2030)<sup>[2]</sup> — confirming we should *not*
  compete on money/rails, and *should* sit above them.
- **Safe is a primitive, not a product.** The incumbent gives composable parts (Avatar/Modules/Modifiers/Guards +
  Timelock)<sup>[3]</sup>, not an opinionated, well-designed four-contract product for normal organizations — which
  is precisely the differentiation thesis.
- **The market is rotating toward substance.** Pure governance tooling is weakening (Tally shut down; a rotation
  "away from governance theater toward products with concrete cash flows, compliance, or RWA")<sup>[4]</sup> — good
  for an integrated value+compliance product, a warning against selling governance alone.
- **The EU/German legal wrapper is a scarce edge.** DAOs need a legal wrapper but it collides with MiCA's
  (undefined) "fully decentralized" carve-out; ESMA Level-3 guidance is expected in 2026, and Germany already leads
  the EU in MiCA licenses.<sup>[5]</sup> Knowing how to wrap this in German law is not something a Zug protocol team
  replicates.

## Market size — why now (forecasts vary; treat as directional)

| Metric | Figure | Source |
|---|---|---|
| Agentic commerce by 2030 | $1.5T (Juniper) · $1.7T @67% CAGR (Edgar Dunn) · $3–5T (McKinsey) | [6][7][8] |
| Agentic commerce (conservative) | $5.7B (2025) → $65.5B (2033), 35.7% CAGR | [9] |
| Morgan Stanley: share of US e-commerce by 2030 | 10–20% → $190B base / $385B bull | [7] |
| Agentic **payment infrastructure** market | $7B → ~$93B by 2032 | [2] |
| Stablecoin settlement volume | ~$33T (2025) → ~$56T (2030, Bloomberg) | [2] |
| Tokenized treasuries AUM | ~$15B (BlackRock BUIDL et al.) | [10] |

The point is not the exact number (they disagree by 3×) — it's that a very large, fast-growing flow is moving to
autonomous agents settling in stablecoins, into which **no one has shipped the org-level budget/governance layer.**

## The landscape

**Safe / Zodiac (incumbent primitive).** The Avatar (a Safe) holds assets; Modules add decision logic; Modifiers
add constraints like delays/roles; Guards inspect transactions; a Timelock is the executor that holds funds.<sup>[3]</sup>
This is the base we build on — powerful but developer-facing and unopinionated. *Implication:* differentiate on
integration + UX/design + legal wrapper, not on the treasury primitive.

**Agentic payments (fragmented, no governed-treasury layer).** Named players cluster by function, none owning the
integrated governed-budget layer:<sup>[1]</sup>
- Merchant/commerce bridges — **Rye, Crossmint, Octogen**
- Consumer shopping agents — **Daydream, Yutori** (vs OpenAI/Perplexity)
- Agentic wallets — **Albert, Kudos**
- B2B agentic billing/invoicing — **Nevermined, Lava Payments, Orb**
- (Card-network + framework moves in scope but under-covered here: Visa Intelligent Commerce, Mastercard Agent Pay,
  Coinbase x402 / AgentKit, Google AP2.)
*Implication:* the governed, auditable **agent-budget-inside-an-org-treasury** is a whitespace, not a crowded lane.

**DAO tooling (rotating).** Tally's shutdown signals a market moving from governance theater toward cash-flow /
compliance / RWA-linked products.<sup>[4]</sup> *Implication:* lead with the treasury+agent value and compliance,
not voting UI.

**Legal wrapper / MiCA (the moat material).** A legal wrapper protects members from liability but undercuts the
"decentralized" claim; MiCA Recital 22 excludes "fully decentralized" services without a test, ESMA Level-3
guidance is due 2026, Germany's Kryptomärkte-Aufsichtsgesetz empowers BaFin, and Germany leads EU MiCA
licensing.<sup>[5]</sup> *Implication:* the German/EU wrapper knowledge is the durable, non-copyable edge — pair it
with an e.V./eG/gGmbH wrapper per [`LEGAL_MASTERPLAN.md`](LEGAL_MASTERPLAN.md).

## Defensibility read (honest)

The integration + UX + legal thesis is credible **because the gap is real and the incumbents are mispositioned**
(Safe = primitive; payment players = point solutions without governance; DAO tools = weakening). But it is a
**race**, not a moat yet: the category is well-funded and the card networks + Coinbase + Stripe are moving into
agentic payments. The durable defensibility is the *combination* no one else has — **opinionated four-contract
integration + superior UX + EU/German legal wrapper + a real organization (Röbel) as proof** — not any single
layer, all of which can be commoditized alone.

## Open threads (for a deeper pass)

- Under-covered: card-network agentic products, Coinbase AgentKit/x402 spend-permissions, Google AP2 specifics,
  and direct competitors building *governed agent budgets* (if any emerge).
- Verify the market-size figures against primary reports (the ranges are wide and vendor-sourced).
- Map which players already carry an EU/MiCA compliance posture vs. US-only.

## Sources

1. [Agentic payments landscape + the governance gap](https://www.edgardunn.com/articles/agentic-commerce-the-future-of-payments) · [Nevermined B2B agentic billing stats](https://nevermined.ai/blog/agent-to-agent-payment-statistics)
2. [Stablecoin payments for AI agents (Nevermined)](https://nevermined.ai/blog/stablecoin-payments-ai-agents-statistics) · [Agentic payments & stablecoins 2026](https://stablecoininsider.org/agentic-payments-and-stablecoins-how-ai-agents-are-revolutionizing-autonomous-machine-to-machine-transactions-in-2026/)
3. [DAO treasury management: Zodiac / Safe model (Eco)](https://eco.com/support/en/articles/14799687-dao-treasury-management-onchain-governance-spend) · [Onchain governance & timelocks (Chainlink)](https://chain.link/article/onchain-governance)
4. [DAO governance market rotation / Tally](https://www.cube.exchange/what-is/treasury-management-dao)
5. [MiCA — ESMA](https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica) · [Decentralized services under MiCAR (CMS)](https://cms.law/en/int/publication/legal-experts-on-markets-in-crypto-assets-mica-regulation/performing-services-in-a-decentralised-manner-under-micar) · [Germany leads MiCA licenses](https://thecurrencyanalytics.com/regulations/eu-issues-230-mica-licenses-as-germany-leads-crypto-approvals-across-the-bloc-270618)
6. [$1.5T agent payment market](https://agentpaytrend.com/ai-agent-payment-market-forces-2030/)
7. [Market forecasts — McKinsey/Gartner/Bain synthesis](https://stellagent.ai/insights/agentic-commerce-market-size-forecast-2030) · [Edgar Dunn](https://www.edgardunn.com/articles/agentic-commerce-the-future-of-payments)
8. [McKinsey agentic-commerce range (via Stellagent)](https://stellagent.ai/insights/agentic-commerce-market-size-forecast-2030)
9. [Agentic Commerce Market Size 2026–2033 (Grand View)](https://www.grandviewresearch.com/industry-analysis/agentic-commerce-market-report)
10. [Tokenized treasuries $15B / BlackRock BUIDL](https://intellectia.ai/blog/tokenized-treasuries-2026-blackrock-buidl)
