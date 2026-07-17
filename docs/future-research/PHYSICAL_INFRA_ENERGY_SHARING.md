# Physical Infrastructure + Energy Strategy (Atoms Layer)

**Status:** RESEARCH. Energy-law facts below verified against public sources as of 2026-07-17; re-verify before acting (BNetzA Festlegungen were still being finalized through 2026). Tax/legal structuring requires Steuerberater + Fachanwalt (Energierecht) before founding the eG.
**Thesis in one line:** As AI commoditizes software, moats migrate to land, grid connections, permits, hardware, and local trust. Winning structure = software wrapped around owned atoms. AWS cannot fork a rooftop in Mecklenburg.

## 1. The regulatory window (verified 2026-07)

- **§ 42c EnWG (Energy Sharing)** passed 2025-12-22, in force; since **2026-06-01** distribution grid operators must technically enable shared use of renewable power across the public grid within a balancing area (Bilanzierungsgebiet). Eligible: private individuals, SMEs, Kommunen, Genossenschaften. From ~June 2028: sharing extends to adjacent areas in the same Regelzone.
- Legal basis: EU RED II / revised electricity market directive (Art. 15a right to energy sharing), transposed via the Dec 2025 EnWG-Novelle.
- **Market state = early-mover window:** smart-meter coverage only ~5.5% of metering points (end 2025); several DSOs not technically ready until 2027; BNetzA opened 77 supervisory proceedings against lagging operators (March 2026). Analysts: 2026 = pilots; broad rollout realistic ~2029.
- **Economic caveat (be honest in all pitches):** shared power currently carries full Netzentgelte, Umlagen, Steuern; § 42c contains no financial incentives yet. 2026–27 pilot value = position + proof, not profit. Requires 15-min metering + Reststromvertrag per participant.
- **The strategic gift:** the identified binding constraint is *coordination software* — allocating 15-minute slices across many participants is "not manually doable"; consensus is that Energy Sharing only works via professional service providers, with service costs potentially 4–6 ct/kWh absent competition. Member management + verified identity + allocation + billing + governance for local communities is a near-exact description of the existing Röbel stack. **Energy-Sharing-Service-Provider is a legally-mandated national market whose missing piece we already built for different nouns.**

## 2. Asset stack (what to actually own)

| Asset | Owner | Why it's a moat |
|---|---|---|
| Rooftop PV + battery (MüritzPhone shop, own house) | Personal | Learning hardware, first grid connections, physical showroom |
| Community rooftops (school, Feuerwehr, Vereinsheime) | Bürgerenergie eG | Citizen capital via Anteile; GenG wrapper |
| Battery storage | eG | MV over-produces renewables → curtailment + negative-price hours → flexible storage/load is the valuable asset |
| Grid connection points (Netzanschlüsse) | eG | Scarce, queued, non-replicable — secure early |
| Sovereign compute container (1 rack GPU) | eG or Netizen Labs (TBD) | See §4 |
| Delivery/inspection robots (existing BOM, March 2026 plan) | TBD | Physical service layer; charged by eG power, dispatched by app |
| MüritzPhone storefront | Family | The trust node no startup can buy; evolves into Digitalwerkstatt: device sales + app onboarding + balcony-solar/smart-meter install partner |

## 3. Entity structure

Two entities, one member base:
- **e.V.** (already on critical path per 2026-07-12): governs, gemeinnützig, civic layer.
- **Bürgerenergie eG**: *owns* the energy assets. Proven German vehicle for citizen capital; GenG-mandated one-member-one-vote is natively served by our governance stack (cross-link: `BUSINESS_GOVERNANCE_PRODUCT.md` beachhead #1 — the eG is a first customer we control).
- **Do NOT tokenize eG Anteile.** The eG wrapper is the moat; classic shares avoid securities-law complexity entirely. The app is the eG's governance + allocation + billing layer, not its capitalization layer. (Consistent with Legal Masterplan: Münzen stay a non-redeemable Gutschein; euro rails via Monerium/Gnosis Pay.)

## 4. Sovereign compute container (energy → compute → coordination)

One rack of GPUs in a container next to eG solar + battery. Explicitly NOT competing with hyperscalers on price-per-FLOP. Competes on what they structurally cannot offer a Kommune or Mittelstand firm:
1. Data provably never leaves the town (sovereignty tier 4 in `SOVEREIGN_AI_FUTARCHY.md`).
2. Inference powered by the community's own panels — absorbs curtailed/cheap local power as flexible load.
3. **Waste heat piped into a building (Nahwärme/pool/Vereinsheim) instead of a cooling tower** — town-scale heat reuse is impossible for hyperscale DCs and free marketing here.
Product framing: sovereign inference as a product of the energy cooperative — energy in, answers + heat out. Check §14a EnWG (steuerbare Verbrauchseinrichtungen) implications for flexible-load compensation.

## 5. Phased plan (matched to real constraints: day job, limited capital, e.V. on critical path)

- **Phase 0 (2026, personal money):** PV + battery on shop and house build. Learning hardware, first Netzanschlüsse, showroom effect.
- **Phase 1 (next 6–12 months):** Found Bürgerenergie eG alongside the e.V. Citizen Anteile fund first community rooftops. App becomes the eG's member/governance/billing layer → first German cooperative whose Energy-Sharing allocation, voting, and treasury run on one civic platform. Pilot economics thin; the asset is position + the reference implementation.
- **Phase 2 (2027–28):** Batteries + compute container + heat reuse. Timed to smart-meter rollout maturing and BNetzA Festlegungen settling.
- **Phase 3:** Robot fleet (existing BOM) rides on eG power + app dispatch; adds meter reading / infra inspection for the energy community to the delivery use case.

## 6. Kardashev framing (narrative discipline)

Type 1 = a civilization capturing its planet's full energy budget — built as millions of local units that capture, store, and productively use their own energy. A town generating surplus power, converting part to sovereign compute, governed by its citizens, is the fractal unit. 500 kWp moves nothing on the Kardashev scale; the **forkable blueprint** (eG + § 42c Energy Sharing + Civic OS + sovereign compute), arriving as ~4,600 German small towns face a month-old law and missing software, is the actual claim. Etteln (~€100K community smart village) remains the domestic reference; we add the energy-community + sovereign-compute layers it lacks.

## 7. Open questions (assign before Phase 1)

1. Which DSO covers Röbel's Bilanzierungsgebiet, their smart-meter rollout status, and their § 42c readiness date? (Determines pilot feasibility timeline.)
2. eG founding cost/timeline via Genossenschaftsverband (Prüfungsverband membership is mandatory) — get a real quote.
3. Does the Energy-Sharing-Service-Provider software play belong to Netizen Labs (commercial, sold nationally) or the eG (community)? Likely split: eG runs it locally, Netizen Labs licenses the product. Decide before writing code.
4. MV Förderprogramme + KfW options for eG PV/storage.
5. Steuer: Gewinnerzielungsabsicht / Liebhaberei questions around sharing income — Steuerberater.
