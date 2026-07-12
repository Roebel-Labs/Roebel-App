# Future Research — Röbel as a Prosperity Engine & Coordination Protocol

> **Research log — 2026-07-11 / 2026-07-12.** Exploratory strategy + design session (M. Brych with Claude).
> This directory collects durable, forkable documentation of a multi-hour research thread that took the
> Röbel App from "civic app" to a **prosperity engine**, then to a general **coordination protocol**, and
> finally into a **legal masterplan** for making it real in Germany/EU. Nothing here is committed product;
> it is a north-star research record meant to be built on.

## What's in this directory

| File | What it is | Status |
|---|---|---|
| [`README.md`](README.md) | This index + the intellectual arc of the session | — |
| [`../SOVEREIGN_AI_COMMUNITY_WEALTH_STUDY.md`](../SOVEREIGN_AI_COMMUNITY_WEALTH_STUDY.md) | The field-study working paper (v0.2) | Committed |
| [`COORDINATION_PROTOCOL_THESIS.md`](COORDINATION_PROTOCOL_THESIS.md) | The generalization: the org-substrate thesis | Durable copy of artifact |
| [`LEGAL_MASTERPLAN.md`](LEGAL_MASTERPLAN.md) | Germany/EU, Röbel-first phased legal path | Partial — 3 clusters verified & cited |
| [`DECADE_STRATEGY.md`](DECADE_STRATEGY.md) | 2026–2036 plan: fork → merge (Decidim path) + fiscal-constitution reframe | Current |

**Interactive artifacts (private, on claude.ai):**
- Field study (v0.2, 🌱): https://claude.ai/code/artifact/d95a5973-09f1-4fd3-a2f9-ee57aa6e9363
- Coordination Protocol thesis (v0.1, 🧩): https://claude.ai/code/artifact/5d2307c7-8f75-4fb8-aa7e-dabe21886209
- Decade Plan roadmap (v0.1, 🗺️): https://claude.ai/code/artifact/34d5e690-eef6-4f45-b1e7-8f41acd3f5d7

---

## The intellectual arc (what was explored, in order)

### 1. From community currency to euro value — Circles mechanics
Clarified that **Röbel Münzen (RTLR) *are* gCRC** — the Röbeltaler group's Circles v2 token — so "convert Münzen
to gCRC" is a category confusion. Two real directions exist: **redeem gCRC → personal CRC** (a within-Circles
move, mechanically supported but not built, low standalone value), and **cash out → EUR** (a separate layer that
needs a real-money counterparty — the treasury or a card rail — *not* a token operation). See the two scoping maps
that came out of this: a near-term **redeem-to-pCRC** feature and a **treasury EURe-buyback**. Key insight: the
euro exit always needs external fuel; redeeming to pCRC does not advance it. Merchant acceptance (EURe settlement
spread) is the honest way to fill the euro till.

### 2. The prosperity engine — the field study
Formalised **Prosperity = (income floor + citizen dividend) ÷ cost of living**, two engines (linear *circulation*
vs exponential *endowment*, where Engine A's job is to buy Engine B), three floors (Money / Abundance /
Intelligence), and an on-chain **50/30/20** treasury split (dividend / endowment / reinvest, never-spend-principal).
Written up with a bottom-up financial model and an honest UHI gap (€54M/yr needs ~€1.35B; local ops reach a
~€175/mo-equivalent supplement, not full UHI). See [`../SOVEREIGN_AI_COMMUNITY_WEALTH_STUDY.md`](../SOVEREIGN_AI_COMMUNITY_WEALTH_STUDY.md).

### 3. Structural techno-optimism & the upward spiral (study v0.2)
Reframed away from "sell software" toward an **incentive system**: an income loop (community exports genuine AI
value → progress-indexed dividend) and a cost loop (community owns the automation, prices at cost → cheaper
essentials). Together: progress → higher income *and* lower prices → abundance. The **incentive inversion** (H6):
automating a task makes it a treasury-owned dividend asset, so nobody loses from automation. Revenue engine
recentered on **embodied AI** (Proof-of-Contribution to Intelligence: AR/teleoperation data, x402 exports, owned
robots) with software as **bootstrap fuel**; Trojan-horse GTM (give away the tool, sell the scarce complement).

### 4. The long arc — digital → embodied → AGI → ASI
The decisive frame: as intelligence runs from today's tools to AGI and ASI, the source of citizen income **shifts
from contributing to intelligence to owning it**. The 50/30/20 rule is a **bridge from a labour-income world to an
ownership-income world**; the endowment is the decisive long-run variable (H5); and **sovereignty becomes safety**
(community-owned, MACI-governed, values-aligned AI governs increasingly capable systems).

### 5. The coordination protocol — the generalization
"The fundaments are all the same." Every organization is **four contracts + a work layer**: membership, governance,
treasury, value, + work. Röbel already provides all as programmable primitives (CitizenNFT / MACI / Safe / Circles
/ agentic commerce) — a **6-layer coordination stack**. Killer thesis: **AI agents are members too** and need the
same four primitives no bank/registry can give them → *organizations become programs with a runtime; the
coordination protocol is the org-technology of the AI era.* Wedge = run the hardest customer (a real democracy)
first; moat = credible neutrality + composability + a thin protocol fee; honest limit = the protocol is the OS, a
legal entity is the jurisdictional wrapper (interop, not replacement). See [`COORDINATION_PROTOCOL_THESIS.md`](COORDINATION_PROTOCOL_THESIS.md).

### 6. The legal masterplan — Germany/EU, Röbel-first
Scoped a phased legal path across 15 areas (entity, treasury custody, currency, euro dividend, crowdfunding, MiCA,
AI Act, GDPR/Data Act, labour, DAO status, agent status, energy co-op, tax, securities, municipal law). A deep
**cited research pass was launched and then stopped before completion**, so [`LEGAL_MASTERPLAN.md`](LEGAL_MASTERPLAN.md)
is a **scaffold** (phase skeleton + questions), not a finished, sourced legal document. **Gnosis Pay** was flagged
as the cleanest euro-exit that outsources the e-money licensing burden to a licensed issuer.

---

## Open threads / next steps

- [ ] **Re-run the cited legal research** and fill [`LEGAL_MASTERPLAN.md`](LEGAL_MASTERPLAN.md) with sourced positions per area (fold in Gnosis Pay).
- [ ] **Redeem-to-pCRC** feature scoping → decide the redemption policy (free vs gated) before any build.
- [ ] **Treasury EURe-buyback / merchant acceptance** as the honest euro-fuel source.
- [ ] **Phase 0 first-90-days** as a dated checklist (charter the fund, funding page + Monerium IBAN, Fördermittel agent, Hetzner sovereign model, Prosperity Ledger v1).
- [ ] Optionally fold a **"Generalization" section** into the field-study paper so it cross-references the thesis.
- [ ] **Everything legal/financial here requires a Steuerberater + Rechtsanwalt before execution.** This is research, not advice.
