# The Sovereign-AI Community Wealth Engine

**A multi-year field study of regenerative finance, automation-ownership, and the path from a rural German town to shared abundance — Röbel/Müritz as Genesis Node.**

| | |
|---|---|
| **Principal investigator** | M. Brych — Netizen Labs / Röbel Labs |
| **Field site** | Röbel/Müritz, Mecklenburg-Vorpommern (~5,000 residents) |
| **Study horizon** | 2026 → 2031 (Phase A), open-ended thereafter |
| **Status** | Prospectus & hypothesis pre-registration (Working Paper v0.1) |
| **Instrument** | The Prosperity Ledger (on-chain, public) |
| **License** | CC BY 4.0 · methods AGPL-3.0 |

> Companion interactive version published as a Claude Artifact:
> https://claude.ai/code/artifact/d95a5973-09f1-4fd3-a2f9-ee57aa6e9363

---

## Abstract

Rural Mecklenburg-Vorpommern has Germany's lowest incomes and a shrinking population; the wider economy is entering a period in which AI and automation may produce a growing share of value while the labour share of that value continues to fall. Whoever **owns** the productive machinery of that economy will capture its gains. This study asks whether a single small town, starting in 2026, can **build and own community AI infrastructure that actually generates revenue and profit**, route that profit into a citizen-governed multi-signature treasury, and split it by a fixed on-chain rule into a present-day citizen dividend, a compounding permanent endowment, and reinvestment in further local capital.

We formalise a testable model — two engines (a linearly-growing *circulation* economy and an exponentially-growing *endowment*), three prosperity floors, and a constitutional 50/30/20 treasury split — and pre-register five hypotheses. The primary outcome (H1) is whether community-operated AI services reach operating profitability at town scale within 24 months. We present a bottom-up financial model with explicit assumptions and Conservative / Base / Optimistic scenarios, and are deliberately honest about the gap between what local operations can fund (a meaningful supplement of roughly €40–200/month of real prosperity per citizen within five years) and full universal high income (which requires a multi-decade endowment bet). Röbel is treated as an open, forkable, instrumented experiment: everything measurable is measured on-chain and published.

**Keywords:** sovereign AI · regenerative finance · automation-ownership · community wealth fund · universal high income · Circles v2 · private governance (MACI) · community energy · abundance

---

## 1 — Motivation: why here, why now

Two slow-moving facts collide in Röbel. The first is local: Mecklenburg-Vorpommern is the lowest-income German state, and small Müritz towns have been quietly losing people and prospects for a generation (roughly −0.6% population over five years locally). The second is global: as AI systems automate more cognitive and physical work, the value they create increasingly accrues to the owners of capital — models, compute, energy, data — rather than to wage labour.

The default trajectory of those two facts, superimposed, is grim for a town like Röbel: the economy grows more productive somewhere else, and the returns leave. This study investigates the *inversion*: if the community itself owns the AI, the compute, and the energy, then every gain from automation flows **toward** citizens — as a dividend, as cheaper essentials, and as freed time — instead of away from them. More automation would then mean a richer, freer town, not a hollowed-out one.

The bet is about **timing**. Ownership stakes in the AI economy are cheapest before that economy has fully arrived. A town that begins accumulating productive AI capital now — however modestly — holds a claim that compounds; a town that waits buys in at the top, if at all. Röbel already has the rare prerequisites in place: a live citizen-governed Gnosis multi-signature treasury (the *Gemeinschaftskasse* Safe), a working community currency with sybil-resistant personhood (CitizenNFT) and private voting (MACI), and an operating software team. The question is no longer *whether the rails exist* — they do — but **whether real AI revenue can be driven through them fast enough to matter.**

---

## 2 — Hypotheses

We pre-register five hypotheses. **H1 is primary** because the entire thesis is downstream of it: without real AI-generated profit, there is nothing to distribute and nothing to compound.

**H1 (primary — revenue).** Community-operated AI services (grant-writing agents, sovereign SME AI, a white-label civic platform) reach operating profitability at town scale within 24 months — commercial revenue exceeding compute, staffing, and compliance costs.
*Falsified if* commercial AI revenue has not covered operating cost for three consecutive months by month 24.

**H2 (distribution).** A fixed on-chain 50/30/20 treasury rule delivers a measurable per-citizen dividend and a compounding endowment without ever drawing down principal.
*Falsified if* principal is spent to fund distributions, or the dividend never becomes measurable.

**H3 (prosperity).** A cash dividend combined with community-owned essentials raises measured real prosperity per citizen more than an equivalent euro spent on cash transfers alone, because cheaper essentials also lower the denominator.
*Falsified if* the cost-of-living index does not fall for participating households, or the combined intervention shows no advantage over cash-only.

**H4 (sovereignty).** Sovereignty can be sequenced — rent German-hosted compute first (Hetzner), own local compute only where a genuine local need is proven — with equal or better margin than premature hardware ownership.
*Falsified if* owned compute is bought ahead of demand and sits underutilised, or renting cannot meet the data-sovereignty requirement.

**H5 (long-arc, monitored).** Over a multi-decade horizon, the endowment's growth *rate* — not its starting size — governs the path toward UHI-scale support; continued reinvestment plus AI-era returns compound faster than operations alone could distribute.
*Monitored, not settled in Phase A* — reported annually as realised compound growth vs. the modelled path.

---

## 3 — Background

The design builds on five literatures, none sufficient alone:

- **Sovereign wealth & permanent funds.** Alaska's Permanent Fund pays every resident an annual dividend (recently ~$1,700) from invested resource wealth; Norway's fund shows the discipline of spending only real returns. We adopt the model at municipal scale, substituting AI-era productive assets for oil.
- **Unconditional transfers.** Germany's three-year basic-income pilot (€1,200/month, reported 2025) found no employment reduction and improved wellbeing; Stockton SEED and GiveDirectly Kenya show recipients shifting toward entrepreneurship and stability, not idleness.
- **Community energy.** German *Bürgerenergiegenossenschaften* deliver electricity at ~4–9 ct/kWh vs ~39 ct retail — a durable, legally-mature, revenue-generating asset that is also the physical substrate of any local AI.
- **Cooperative & local-currency economics.** Mondragón, Preston community wealth building, and Sardinia's Sardex mutual-credit network show how value can be retained and recirculated locally rather than extracted.
- **Onchain primitives.** Circles v2 (a demurrage group currency), MACI (private, collusion-resistant voting), and Safe multi-signature custody give programmable, auditable, sybil-resistant money and governance — the instrumentation that makes this a *measurable* study.

A supply-side *abundance* framing (lower the real cost of essentials, not only raise incomes) and a deliberately inverted "network state" reading (build local prosperity and legitimacy first; recognition, if ever, last) complete the picture.

---

## 4 — The model: two engines, three floors, one rule

**Two engines with different growth curves.** Engine A, *circulation*, is the community currency plus local operations; it grows roughly linearly and produces cash flow now. Engine B, the *endowment*, holds productive AI-era capital and compounds. The single most important structural fact: **Engine A's job is to buy Engine B** — present operations fund the acquisition of assets whose returns eventually dwarf those operations.

**Prosperity has two blades:**

```
Prosperity = ( income floor + citizen dividend ) ÷ cost of living
```

Most interventions raise the numerator. We attack both — the dividend lifts income, community-owned essentials lower the denominator (H3).

**Three floors beneath every citizen:**

| Floor | Name | What it is |
|---|---|---|
| 1 · Money | Participation income + dividend | Currency earned for real contribution, plus a share of treasury profit |
| 2 · Abundance | Cheap community essentials | Community-owned energy, food, housing capacity sold below market to members |
| 3 · Intelligence | An AI agent for every citizen | A sovereign model + compute quota as a public utility — the newest floor, treated as first-class |

**The constitution: a 50/30/20 split, written on-chain.** Every euro of net treasury inflow divides automatically:

```
50%  Dividend pool   ·   30%  Permanent endowment   ·   20%  Reinvest in local AI capital
```

Dividends grow linearly with operations; the endowment grows exponentially with the AI economy; reinvestment feeds back into new revenue. Governance (MACI + timelock) may tune the ratios and smoothing parameters, but cannot change a distribution already in flight and cannot spend endowment principal — **math sets the prices; votes only set the parameters.**

**Distribution mechanism — the epoch dividend auction.** Rather than posting a redeemable euro price (drainable, needs an oracle), each epoch the treasury funds a fixed dividend pool `D` in EURe. Verified citizens deposit currency into the pool during the epoch — one claim lane per human, enforced by a Semaphore citizenship proof and a per-epoch nullifier, so the split is per-capita, not per-whale. At close, the rate emerges by pro-rata division, `rate = D ÷ total deposited`; deposited tokens are burned; everyone claims. Self-balancing, un-drainable, oracle-free. This reframes "redemption" as what it actually is: **the citizen dividend, priced by demand.** The pool size can be indexed to measured community output (see §8), turning "GDP → shared income" from a slogan into a contract.

---

## 5 — The engine that matters most: applying AI to actually generate revenue

This is the load-bearing section. Everything else distributes or compounds money this section must first earn. Design principle: **software margin before hardware capex** — lead with AI services that have near-zero marginal cost and a buyer who already has a budget; let their profit fund the physical, compounding assets later. Sell AI where the value is *legible* (euros arrive or costs fall) and where German data-sovereignty is a feature competitors can't match.

**5.1 Fördermittel-AI — the flagship.** German municipalities and *Vereine* leave enormous grant funding unclaimed because applications are complex and deadline-driven. A treasury-owned agent scans EU/federal/state (MV)/foundation programmes, matches an organisation to eligibility, drafts the application, tracks deadlines. Revenue is dual: a monthly SaaS fee plus a success fee on funding actually secured. Maximally legible value; the same agent runs on Röbel's own behalf, making the town's grant income a near-free by-product. Scales like software across ~11,000 German municipalities and hundreds of thousands of Vereine.

**5.2 Sovereign SME AI — the Mittelstand play.** Many German small businesses won't put customer data through US-cloud AI for compliance reasons. A German-hosted, data-sovereign assistant (document processing; quotes/invoices for Handwerk; menus and food photography for Gastro; tourism content for the Müritz region) sells on exactly the sovereignty premium a village co-op can credibly offer. Röbel already runs AI menu-image generation and a mini-app platform — productised, not invented.

**5.3 White-label civic OS.** Other towns fork the Röbel stack (app, treasury, private governance, currency, mini-apps) as a subscription with a capped, governed commons fee; the sovereign AI assistant is the per-seat margin engine on top. Each deployment is a new demonstration node.

**5.4 Treasury-owned autonomous agents — the purest form.** Long-run destination: agents with their own wallets running the services above across many towns, paying for data via machine-native micropayments (x402), streaming success fees back to the treasury — each agent/robot holding earnings in a token-bound account (ERC-6551) so citizens watch, on-chain, the source of their dividend. Automation-ownership made literal: **the AI generates the value; the citizens hold the claim.**

**5.5 Physical assets — later, demand-first.** Community energy (heat reused into the town Schwimmbad, surplus compute sold) and a small delivery-robot pilot are Phase-1+ once software profit and proven demand justify the capital. Energy is the single most defensible AI-era asset a town can own — every model, forever, needs joules — but it is bought *after* the software engine is paying.

**Table 1 — AI revenue lines and unit economics (Base assumptions)**

| Revenue line | Unit | Price / unit | Margin | Time-to-euro |
|---|---|---|---|---|
| Fördermittel-AI | org / month | €300–400 + fee | High | Now |
| Sovereign SME AI | SME / month | €150–220 | High | Now |
| White-label civic OS | town / month | €500–800 | High | Near |
| AI media / mini-apps | project | variable | Med | Now |
| Autonomous agents (x402) | task fee | micro | High | Mid |
| Energy + compute + heat | kWh / GPU-hr | cost-plus | Med | Phase 1+ |
| Robot fleet (DePIN) | delivery + data | fee | Low–Med | Phase 2+ |

Margin is qualitative; software lines carry near-zero marginal cost once the model and workflow exist. "Time-to-euro" orders the build sequence: software first, capital last.

---

## 6 — Financial model: specific numbers, honest gaps

All figures are **modelled scenarios with explicit assumptions, not forecasts.** Base assumes competent execution and the adoption ramp in Table 2; Conservative ≈ 0.5× and Optimistic ≈ 2× Base commercial revenue. Adoption is deliberately modest against today's reality (a handful of active citizens at the study's start).

**Table 2 — Base-case monthly economics by study year (EUR)**

| Line | Year 1 | Year 3 | Year 5 |
|---|--:|--:|--:|
| Active verified citizens | 150 | 750 | 2,000 |
| Fördermittel-AI (SaaS + fees) | 6,500 | 36,000 | 125,000 |
| Sovereign SME AI | 3,000 | 20,000 | 88,000 |
| White-label civic OS | 1,000 | 14,000 | 48,000 |
| Autonomous agents + AI media | 1,000 | 5,000 | 32,000 |
| Energy + robots (net) | — | 7,000 | 37,000 |
| **Commercial AI revenue** | **11,500** | **82,000** | **330,000** |
| Grants secured (own, via agent) | 6,700 | 10,000 | 15,000 |
| Donations & patronage | 1,800 | 3,000 | 5,000 |
| **Gross inflow** | **20,000** | **95,000** | **350,000** |
| Operating cost (compute, team, legal) | −7,500 | −37,000 | −160,000 |
| **Net to treasury** | **12,500** | **58,000** | **190,000** |

Year-1 commercial revenue (€11.5k/mo) already exceeds operating cost (€7.5k/mo) — the H1 profitability test. Team scales 1.5 → 5 → 15 FTE; compute scales with owned-model usage.

**Table 3 — Applying the 50/30/20 rule**

| Allocation | Year 1 | Year 3 | Year 5 |
|---|--:|--:|--:|
| Dividend pool (50%) / month | 6,250 | 29,000 | 95,000 |
| → per citizen / month | €42 | €39 | €48 |
| Endowment (30%) / month | 3,750 | 17,400 | 57,000 |
| Reinvest (20%) / month | 2,500 | 11,600 | 38,000 |
| Endowment value (cumulative) | ~€45k | ~€0.45M | ~€1.7M |

Per-citizen dividend stays ~€40–48 because the citizen base grows alongside revenue — by design: the dividend is a *share*, and growth is reinvested and endowed rather than paid out. Endowment cumulative assumes contributions plus a conservative real return; principal is never spent.

### 6.1 The cost-of-living blade changes the real number

A cash dividend of ~€45/month understates the intervention, because Floor 2 lowers the denominator. Community electricity at ~8 ct/kWh vs ~39 ct retail saves a typical household roughly **€77/month on power alone**; heat reuse and food coupons plausibly bring total essential-cost reduction to **€120–150/month** by Year 3–5.

| Real prosperity gain per participating citizen (Yr 3–5) | € / month-equiv |
|---|--:|
| Cash dividend | ~€45 |
| Essential-cost reduction | ~€130 |
| **Total real prosperity gain** | **~€175** |

### 6.2 The honest gap to universal high income

We state the limit plainly. A genuine UHI — say €1,500/month for 3,000 eligible citizens — is €54M/year. Funded from a permanent endowment at a 4% real draw, that requires roughly **€1.35 billion** in productive assets. The Year-5 endowment (~€1.7M) throws off ~€68k/year — real, but three orders of magnitude short. **Local operations do not reach UHI, and this study does not claim they will.** What they do: deliver a meaningful supplement now (~€175/month-equivalent), and — per H5 — fund the endowment whose compounding is the only credible long-arc path to the larger number. Whether that path closes is a decade-scale question contingent on AI-era returns; we monitor it, we do not promise it.

> **Honesty note.** Owning broad AI-equity exposure buys market *beta* — you ride the tide, you don't own the boat. The genuine power-law upside comes from equity in what Röbel itself incubates and from treasury-owned agents, not from an index position. The model treats index exposure as ballast and local ventures as the source of asymmetric return.

---

## 7 — Methodology: Röbel as an instrumented, longitudinal experiment

**Design.** A single-site, longitudinal, pre-registered field study with staged rollout. Unit of analysis: the participating verified citizen (and, for some measures, the household and the treasury itself). Because the town is the treatment, we use pre/post comparison against the town's own baseline plus a synthetic-control comparison drawn from demographically comparable MV municipalities without the intervention.

**Phases (Phase A, 2026–2031):**

- **Phase 0 — Foundation (legally clean, months 0–6):** charter the Safe as the Röbel Permanent Fund with the on-chain 50/30/20 split; open donation rails (a Monerium business IBAN so SEPA/Stripe transfers arrive as EURe in the Safe, plus a multi-chain donation router); ship the Fördermittel agent; stand up Hetzner-hosted sovereign inference for data-sensitive workloads; publish Prosperity Ledger v1. All donation-and-grant funded; avoids the regulated euro-out surface.
- **Phase 1 — First real revenue & abundance (year 1–2):** onboard paying Fördermittel and SME customers; launch the community energy cooperative; begin the epoch dividend, paid first as *Abundance Coupons* (claims on below-market essentials) to stay clear of e-money law until cleared.
- **Phase 2 — Compounding (year 2–4):** white-label to other towns; first spin-out equity into the endowment; owned compute only where demand is proven; euro-denominated dividend once legal clearance exists.
- **Phase 3 — Federation (year 4+):** shared inter-town endowment; treasury-owned autonomous agents at scale.

**Data & consent.** The primary instrument is on-chain and public, so core economic variables are audited by construction rather than self-reported. Survey measures (wellbeing, employment, entrepreneurship) are opt-in; personhood and voting use MACI/Semaphore so participation is private and no personal data is exposed. Legal and ethical review precedes every phase that touches real money or citizen data.

---

## 8 — Instrumentation: the Prosperity Ledger

What isn't measured can't be claimed. The Ledger publishes, live and on-chain wherever possible:

- **Treasury balance & inflows** — total, split into commercial AI revenue vs grants vs donations.
- **Commercial AI margin** — the H1 test, reported monthly.
- **Dividend per citizen** and **endowment value & realised real yield** (hard flag if principal ever moves).
- **Currency velocity** — circulation volume as the local-output proxy that can index the dividend pool (§4).
- **Sovereignty ratio** — share of AI queries served by the community's own model rather than a frontier API (the H4 test).
- **Human : machine productivity ratio** — treasury revenue attributable to autonomous agents/robots vs people; rising over time is the automation-ownership thesis made visible.
- **Cost-of-living index** for participating households (the H3 test).
- **Adoption & wellbeing** — active verified citizens; opt-in survey outcomes.

Publishing these openly is also the go-to-market: growth strategy is *demonstration, not persuasion* — make Röbel visibly, measurably better off and let other towns choose to fork it.

---

## 9 — Risks & threats to validity

- **Legal is the master gate.** Euro-denominated dividends, investment-style crowdfunding, a charity holding securities or robots, the energy cooperative, and citizen-data AI each touch German regulation (BaFin / MiCA / e-money, VermAnlG, Gemeinnützigkeit, EnWG, GDPR). *Mitigation:* sequence by legal cleanliness — donations, grants, the energy cooperative, and coupon-denominated dividends first; euro-out and investment vehicles later, under a *Steuerberater* and *Rechtsanwalt*. Mechanism elegance must never outrun the legal wrapper.
- **The AGI-timing bet (H5).** If AI value concentrates in inaccessible frontier labs, the endowment earns only beta. *Mitigation:* build machinery that pays regardless of AI timing (energy, local services, grants); treat AI-beta as a long-duration option, not the plan.
- **Adoption / empty-graph.** The model assumes an adoption ramp today's numbers don't yet show. *Mitigation:* ship a small but real dividend fast; auto-trust every verified citizen; make Floor 2 savings immediately felt.
- **Faucet & velocity honesty.** "Community GDP" must reflect real activity, not free-minted tokens redeemed in a circle. *Mitigation:* contribution-weighted minting, demurrage on idle balances, measure velocity not supply.
- **Governance capture.** A treasury holding real assets is a target. *Mitigation:* MACI private voting, a timelock, the multi-signature Attester Safe, the immutable 50/30/20 split, never-spend-principal.
- **External validity.** One town, one founder, favourable initial conditions. *Mitigation:* the forkable design is itself the replication protocol — each new node is an independent test.

---

## 10 — Conclusion

This is a study designed to run for years, not a launch plan dressed as one. Its wager is narrow and testable: that a small town can own a slice of the AI economy's productive machinery early, drive real AI revenue through a citizen-governed treasury, and split that revenue by a rule no individual can override — delivering a measurable improvement in real prosperity now and a compounding claim on abundance later. The near-term result we expect is honest and modest: operating-profitable community AI within two years (H1), a dividend and cost-of-living improvement worth on the order of €175/month-equivalent per citizen by year five, and an endowment that is real but small. The far-term result is a bet on compounding that we will monitor in the open rather than assert.

Sovereign AI, regenerative finance, and community-owned sustainability are not three projects here; they are one flywheel — intelligence earns, the treasury allocates, essentials get cheaper, the endowment compounds, and the whole thing is measured on a public ledger so its success or failure is legible to anyone who wants to fork it. Röbel is Genesis Node #1. The experiment begins now.

---

## Selected references & notes

1. Alaska Permanent Fund Dividend program; Norway Government Pension Fund Global spending rule. Figures indicative; institutional models, not benchmarks.
2. German basic-income pilot (three-year, €1,200/month), reported 2025: no employment reduction, improved wellbeing. Stockton SEED; GiveDirectly Kenya long-term transfer studies.
3. German *Bürgerenergiegenossenschaft* generation cost vs. retail electricity price; ~39 ct/kWh household retail reference. Cost figures are illustrative regional estimates.
4. Circles v2 (demurrage group currency); MACI (minimal anti-collusion infrastructure); Safe multi-signature custody; x402 machine-payment standard; ERC-6551 token-bound accounts.

All quantitative figures in §6 are transparent modelled scenarios built on the stated assumptions; they are provided for hypothesis-setting and are **not forecasts.**

---

**Disclaimer.** This document is a research prospectus and hypothesis pre-registration for a community field study. It is not investment advice, not a securities offering, and not a promise of financial return. Any euro-denominated redemption, dividend, or investment-style capital raise described here is contingent on prior German legal and regulatory clearance and is not enabled by this document. Modelled figures are illustrative scenarios, not projections.

*Working Paper v0.1 · Röbel/Müritz · 2026 · CC BY 4.0 · methods AGPL-3.0*
