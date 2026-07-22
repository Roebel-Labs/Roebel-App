# Netizen — Business Plan (v0.1)

> **2026-07-22 · DRAFT for review.** The company plan that operationalizes the
> [Netizen Stack blueprint](../superpowers/specs/2026-07-21-netizen-stack-design.md) and the
> [verified sovereign-stack research](2026-07-22_NETIZEN_SOVEREIGN_STACK_RESEARCH.md), consistent
> with the [Decade Strategy](DECADE_STRATEGY.md), the
> [Business Governance Product](BUSINESS_GOVERNANCE_PRODUCT.md) thesis, the
> [Product B Market Scan](PRODUCT_B_MARKET_SCAN.md), and the
> [Legal Masterplan](LEGAL_MASTERPLAN.md) (whose gates apply to everything financial/legal here).
> Numbers marked *modelled* come from the [field study](../SOVEREIGN_AI_COMMUNITY_WEALTH_STUDY.md)'s
> base scenario — models, not forecasts. Not investment or legal advice.

---

## 1. Mission

> **Netizen builds the operating system for self-governing communities — identity, governance,
> treasury, currency, and intelligence as one open, legally grounded stack — so that any town,
> cooperative, association, or organization can own its institutions, its money, and its AI.**

Vision, one sentence per horizon: prove it on one real town (Röbel); become the software German
civil society already runs on; become procurable public infrastructure and the org-technology of
the agent era — adopted into the existing order, never an exit from it.

Three commitments that shape every product decision:

1. **Credible neutrality.** The protocol is open, forkable, and eventually not ours. We sell
   convenience, integration, operations, and accountability — never lock-in.
2. **Land first.** Real neighbors before ideology; adoption one Satzung at a time (the Decidim
   path). We convert neighbors, not ideologues.
3. **Structural techno-optimism.** Automation gains flow to the community that hosts them.
   Netizen's own margin comes from operating the machinery, not extracting from it.

## 2. What the company sells

Open-core model (Discourse/Ghost/Supabase shape): the stack is open source; the company earns on
**hosting, integration, operations, legal scaffolding, and intelligence.** Four product lines and
one service line, all shipping from the *same* stack — sequenced, not parallel:

| # | Product | What the customer buys | Buyer | Stage |
|---|---|---|---|---|
| P1 | **Netizen Cloud** (Civic OS hosting) | A managed community node: apps, feed, orgs, events, identity, governance, treasury, currency, mini-apps — deployed from a manifest, operated with SLAs, GDPR-clean (data controller = the community) | Vereine → eGs → towns → international communities | H1 → |
| P2 | **Fiscal Constitution** (governed agent budgets) | Money with a constitution: scoped, auditable, MACI/leadership-bounded budgets for humans *and* AI agents on a Safe treasury (Zodiac Roles + our policy templates + audit UI). The verified market whitespace: everyone builds agent *payments*, nobody ships agent *authorization* | agent-native startups, eGs, treasuries of P1 customers | H1 experiment → H2 product |
| P3 | **Verified-member governance** | One-human-one-vote with coercion-resistant secret ballots for organizations where token-voting is illegal or illegitimate: eGs (1M1V is statutorily mandated), Vereine, works-adjacent bodies. Coordinator-as-a-service (our Shamir MACI ops) is the recurring backbone | Genossenschaften (~7,000 in DE), Vereine (~600k), DAO-native orgs | H2 (gated, §7) |
| P4 | **Sovereign AI** | A managed community/SME intelligence rail: open-weight German-capable model (EuroLLM-class today, SOOFI-S when released) behind LiteLLM with per-member quotas, hosted on German infrastructure (Hetzner/IONOS), frontier fallback by policy; plus the **Fördermittel agent** as the flagship application that pays for itself in grant euros | P1 communities, German SMEs/Mittelstand, Kommunen | H1 bootstrap → H2 |
| S1 | **Deployment & legal scaffolding services** | Paid onboarding: Satzung templates, DSGVO design, treasury/agent-policy setup, migration, training ("Network Builders"). The layer that does not commoditize | every P1–P3 customer | H1 → |

**What we never sell:** stablecoins or payment rails (we sit above Monerium/EURe/x402), personhood
(we consume proofs — EUDI, attestation, Semaphore — communities choose the policy), user data
(the compute-to-data pattern exists precisely so data never leaves the community), and governance
theater (the market scan's warning: voting UIs alone are a dying category — we lead with treasury,
compliance, and cash-flow value).

## 3. Why now (verified)

- **The stack is finally assemblable vendor-free** — the 2026-07-22 research confirmed every layer
  (Safe+passkeys wallets, self-hosted 4337 rails, Zodiac agent budgets, MiCA-compliant EURe,
  Semaphore on Gnosis, €232–1,197/mo sovereign AI). The blocking dependencies of 2023-era civic
  crypto are gone.
- **The agent-authorization gap is open.** Agentic-commerce forecasts disagree by 3× but all point
  at a very large flow settling in stablecoins with *no* org-level budget/governance layer shipped.
  Card networks and Coinbase build payments; nobody ships the constitution around them.
- **The state is building our on-ramp.** eIDAS 2.0 forces an EUDI wallet (German sandbox open now,
  citizens' wallets early 2027); our identity layer is positioned to consume it the day it exists.
- **Regulatory clarity is becoming a moat.** MiCA licensing runs through Germany; EU AI Act duties
  land August 2026. Compliance capability is now product, and a Zug/US protocol team cannot
  replicate German Vereinsrecht + GenG + DSGVO scaffolding.
- **Röbel exists.** A live town with encrypted votes, a real treasury, a community currency, and
  fiat rails is a credential no competitor can buy.

## 4. Customers and the local→global ladder

Each rung funds and de-risks the next; each is a strict subset of what Röbel already demands.

**Rung 0 — Röbel (now, customer zero).** The e.V. runs its own governance on the stack; the
Gemeinschaftskasse becomes Fiscal Constitution v1; the first scoped-agent budget (Fördermittel
agent) runs under it. Nothing is sold; everything is proven and documented in public.

**Rung 1 — the Röbel mesh (first paying-ish customers, 2026–2027).** 3–5 local Vereine + the
planned Bürgerenergie eG as tenants on Röbel's node (the blueprint's hybrid tenancy). Price
nominal-to-free; the payment is Satzung amendments, testimonials, and the multi-tenant forcing
function ("deployment #2 is config").

**Rung 2 — Mecklenburg-Vorpommern / German civil society (first real revenue, 2027–2028).**
Neighboring towns' meshes, regional Vereine/eGs, first white-label deployments; first **Gemeinde
procurement pilot** (participatory budgeting or transparent treasury as an *official* tool —
the Decidim move; compatibility work: OZG/eIDAS/BITV/procurement). Sovereign-AI SME service and
Fördermittel agent sell here as standalone wedges — legible euros with no crypto conversation.

**Rung 3 — EU + agent-native (product-led, 2028–2031).** Fiscal Constitution as a standalone for
agent-heavy organizations (denomination-agnostic over EURe/USDC); eG governance SaaS at category
scale; EUDI-verified onboarding; other EU countries via the same Verein/co-op logic (co-ops are a
global legal form — 3M+ cooperatives worldwide share the 1M1V constraint).

**Rung 4 — global federation (H3, 2031+).** Forked nodes federate (shared identity trust, currency
settlement, composable governance); Netizen Cloud hosts internationally; the protocol gets a
neutral steward; a thin, capped, governed protocol fee on flows becomes sustaining revenue.

## 5. Go-to-market: three motions, one story

1. **Demonstration effect (civic).** Never push adoption. Make Röbel visibly prosperous, publish
   the Prosperity Ledger and radical open documentation, let towns and Vereine covet it. Sales
   asset = the town itself; conversion event = a Satzung amendment.
2. **Trojan-horse tools (commercial).** Give away the tool that finds the customer: the
   Fördermittel agent (success-fee pricing aligns incentives — it pays for itself in granted
   euros), the mini-app builder, the free tier of Netizen Cloud. Sell the scarce complement:
   operations, compliance, intelligence, SLAs.
3. **Procurement (institutional).** The Decidim path: bottom-up usage first, then one Gemeinde
   procures one module officially. Compatibility, not superiority, wins here — and each official
   adoption re-arms motion 1.

## 6. Business model & unit economics (grounded in verified costs)

**Pricing sketch** (to validate with real customers; net, indicative):

| Offer | Price | COGS anchor (verified) | Gross margin shape |
|---|---|---|---|
| Netizen Cloud node (community/town) | €199–499/mo + setup | ~€30–100/mo infra (Supabase/Hetzner-class per node; town-scale data is small) | ~70–85% |
| Verein/eG tenant on a shared node | €29–99/mo | marginal | very high |
| Coordinator-as-a-service (private votes) | €99–299/mo per org + per-tally fee | Fly-class compute + ops labor (the real cost) | ops-bound |
| Fiscal Constitution (agent budgets) | €299–999/mo per treasury + per-agent fee | indexer + audit infra, marginal | high |
| Sovereign AI, shared cluster | €0.x–x/1M tokens or €99–499/mo per org | Hetzner GEX44 €232/mo (7B) / GEX131 €1,197/mo (30B+) serves many orgs via LiteLLM multiplexing | scales with utilization |
| Fördermittel agent | free scan + **success fee (x% of granted funds)** or SaaS | inference + review labor | the flagship legible-euro engine |
| S1 services (statutes, DSGVO, onboarding, training) | €2–15k projects / day rates | labor | consulting-grade; feeds product |

**Cost structure (H1):** 1–2 founders + first hire, ~€1–2k/mo infrastructure total (one GEX-class
box + nodes + coordinator), legal/accounting, hardware nothing (demand-first rule). The field
study's *modelled* base case — ~€11.5k/mo commercial revenue against ~€7.5k/mo costs by end of
year 1, growing to ~€58k/mo net by Y3 — is the financial arc this plan inherits; treat it as a
target corridor, not a forecast. H1 is grant-and-service financed (Fördermittel for ourselves,
donations rail already live); investment capital only under the Legal Masterplan's gates
(VermAnlG/ECSP when raising return-bearing money).

**Revenue quality ranking (build in this order):** recurring hosting/ops (P1) → success-fee AI
(P4-Fördermittel) → recurring treasury/governance SaaS (P2/P3) → services (S1, deliberately
capped share) → protocol fee (H3 only, thin and governed).

## 7. Roadmap to a company that serves customers

Aligned with the blueprint's migration phases (technical) and the Decade Strategy's horizons
(adoption). Exit tests are the honest gates — no rung is entered before the previous one's test passes.

| Phase | When | Company milestones | Customer state | Exit test |
|---|---|---|---|---|
| **0 — Foundation** | next 90 days | Charter the **gemeinnütziger e.V.** (7 founding members) + plan the gGmbH; e.V.'s own governance runs on the stack; Fiscal Constitution v1 on the Gemeinschaftskasse (50/30/20 + timelock); first scoped-agent budget (Fördermittel agent, capped, audited); funding page live (Monerium IBAN + multichain, donations only); Prosperity Ledger v1; blueprint Phase-0 (schema→git, spec drafts) | customer zero = ourselves | e.V. registered; one agent budget executed safely under governance; docs public |
| **1 — Local proof** | 2026–2027 | Onboard 1–2 → 3–5 Röbel Vereine/eGs as tenants (`netizen init` v0 makes each one config); first Satzung amendment referencing the stack; Gemeinde cooperation conversation opened (tool offer, not parallel state); Fördermittel agent wins first external grants (success fee) | first external users, nominal fees | mesh adopts at home (the Decade Strategy's first kill condition); deployment #2 was config, not code |
| **2 — First real revenue** | 2027–2028 | **Netizen Labs GmbH/gGmbH** operational as the commercial vehicle; Netizen Cloud GA (managed nodes, SLAs); sovereign-AI SME service in MV; coordinator-as-a-service; S1 playbook productized (eG statutes + DSGVO design); EUDI relying-party integration from the sandbox; **B2B governance build trigger** (per the Business Governance doc): e.V. ≥6 months on-stack AND an external org asked | 10–20 paying orgs; first Gemeinde pilot in procurement | recurring revenue covers infrastructure + one salary; a procurement pilot signed |
| **3 — Product scale** | 2028–2031 | Fiscal Constitution standalone for agent-native orgs (the whitespace); eG-governance SaaS sold into the 7,000-eG category; white-label for other regions/countries; 20–50 orgs → hundreds of tenants; team of 3–7; protocol specs → neutral stewardship (e.V./foundation) | external agent-native customers with no Röbel connection | first *official* municipal adoption; Fiscal Constitution has external paying customers (Decade H2 test) |
| **4 — Global** | 2031+ | Federation live (cross-node identity, settlement, shared mini-app store); international Netizen Cloud; certified compliant civic infrastructure (OZG/eIDAS/BSI/BITV); thin capped protocol fee under neutral governance | multi-country node operators, majority-agent orgs | several official adoptions; the fee sustains maintenance without extraction (Decade H3 test) |

## 8. Company & protocol structure

Two-entity shape (per Decade Strategy + Legal Masterplan, counsel-gated):

- **Röbel/Netizen e.V. (gemeinnützig)** — community anchor, runs Röbel's node, holds the
  demonstration; later the **protocol steward** (specs, trademark of the open stack) — the
  structural answer to the credible-neutrality problem the thesis flags as unsolved.
- **Netizen Labs (GmbH, possibly via gGmbH Träger)** — the operating company: Cloud, SaaS,
  services, AI. Maintainer and hosting business, *not* owner of the protocol. Anti-extraction is
  structural: capped, governed fees; AGPL node; forkability as a feature.

Founder reality check: this is currently a one-person effort. The plan's load-bearing constraint
is **sequencing over parallelism** — each phase has one primary product motion; everything else
waits. First hires (Phase 2): one full-stack engineer, one community/ops person in MV.

## 9. Competition & moat

Per the verified market scan: Safe/Zodiac are primitives, not products (we build on them); agentic-
payment players ship payments without authorization; DAO tooling is rotating away from governance
theater (Tally shut down) — lead with treasury + compliance + AI value. **The defensible
combination** — opinionated four-contract integration + consumer-grade UX + German/EU legal
scaffolding + a real town as living proof + sovereign-AI operations — is a race we're early in,
not a moat we own; the moat compounds through adoption (every Satzung, every federation link) and
through the legal/ops knowledge that does not commoditize the way code does.

## 10. Risks & kill conditions (inherited + business-specific)

1. **Mesh doesn't adopt at home** → stop generalizing; Röbel remains a civic project (Decade KC-1).
2. **Nobody pays** at Rung 2 (Vereine expect free) → pivot revenue weight to P4/Fördermittel
   (euros from grants, not member fees) and Gemeinde procurement.
3. **Safe/Zodiac or a card network ships governed agent budgets first** → our version survives
   only bundled with the legal wrapper + civic proof; watch quarterly.
4. **Solo-founder capacity** — the plan fails silently if phases run in parallel; the sequencing
   rule *is* the mitigation.
5. **Legal gates** — every real-money/investment step behind Fachanwalt + Steuerberater
   (Masterplan rule); EU AI Act duties (Aug 2026) reviewed before the AI service sells.
6. **Protocol-governance neutrality unsolved** → if stewardship can't credibly transfer, the
   adoption thesis weakens to "another platform" (thesis's own honest limit).

## 11. The one-paragraph pitch

Netizen turns the proven infrastructure of a real German town — verified citizens, secret ballots,
a constitutional treasury, a community currency, and community-owned AI — into an open stack any
community or organization can run. Communities buy sovereignty as a service; organizations buy the
missing governance layer of the agent economy; both get German/EU legal ground under their feet.
The software is open and forkable; the business is operating it well. Röbel is node #1 — and the
proof that it works is that its citizens are measurably better off.

---

*Review gates before this plan is acted on: user review of this doc + the blueprint's §9 decisions;
the Legal Masterplan's counsel rule for entity formation and anything financial; and the standing
hostile-reader rule — this plan was produced inside a sympathetic context and needs one skeptical
external read (ideally GovTech-sales or German-corporate-law experienced) before commitments.*
