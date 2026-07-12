# Legal & Regulatory Masterplan — Germany/EU, Röbel-first

> ⚠️ **STATUS: PARTIAL.** A deep, source-cited research pass ran and was **stopped early to conserve tokens**;
> adversarial verification completed for **3 topic clusters** (see "Verified findings" below) — those carry
> primary-source citations at high confidence. **Everything else on this page is still preliminary, unverified
> orientation** — *not* legal conclusions and *not* legal advice. Every item must be confirmed by a fuller research
> pass **and** reviewed by a German **Steuerberater + Rechtsanwalt** before any action.

**Scope:** German law, EU overlay (MiCA, AI Act, GDPR, Data Act, ECSP). **Anchor:** the Röbel genesis node. **Shape:**
a phased critical path from "buildable now, legally clean" → "frontier questions."

---

## ✅ Verified findings (partial cited pass, 2026-07-12 — high confidence, adversarially verified)

### 1. Self-custody of your own treasury needs **no crypto license**
- **BaFin Merkblatt "Kryptowerte-Dienstleistungen nach MiCAR"** (mb_250103, 3 Jan 2025), §II.1: *"Ebenso ist die
  Verwahrung und Verwaltung eigener Kryptowerte durch den Inhaber selbst … nicht erfasst, da diese nicht 'für Kunden'
  erfolgt."* — self-custody of one's **own** crypto is outside the CASP/custody perimeter.
- **MiCAR Art. 3(1)(17)** defines custody as a service "on behalf of clients"; third-party provision is definitional
  (corroborated by CMS Law). **Clean path:** the community self-custodies its **own** Safe → no CASP/Kryptoverwahr license.
- **⚠️ Design nuance:** the exemption is for "*own*" assets. Holding assets *for legally-separate members* could raise
  a "für Kunden" argument → keep the treasury the entity's own property; don't custody *for* members.

### 2. A gemeinnütziger Verein may **hold and even rebalance crypto** within Vermögensverwaltung
- **Solidaris** ("Steuerliche Einordnung von Spenden in Kryptowährungen", 17.05.2022): *"das bloße An- und Verkaufen –
  auch in wiederholtem Umfang – [stellt] keinen Tatbestand für das Überschreiten der Grenzen der Vermögensverwaltung
  dar."* The tests for *gewerblicher Wertpapier-/Devisenhandel* apply by analogy.
- **Settled BFH case law** (X R 7/99, X R 14/07, X R 26/18; H 15.3 EStR): repeated buying/selling **for one's own
  account** = private asset management; commercial status needs added factors (trading for foreign account,
  bank/dealer-typical activity, office, professional exploitation of price spreads).
- **Clean path:** the treasury can hold and rebalance crypto **without losing gemeinnützigkeit**, as long as activity
  stays asset-management-like, not händlertypisch.

### 3. Crypto donations = **Sachspende**; anonymous ones aren't deductible + issuer liability
- Crypto donations are treated as **Sachspenden**, governed by **§10b Abs. 3 EStG** (Solidaris; WINHELLER). Valuation:
  from **Betriebsvermögen** → Teilwert/Entnahmewert per **§6 Abs. 1 Nr. 4 S. 1 EStG**; private held **<1 yr** →
  acquisition cost; private **>1 yr** → gemeiner Wert (FMV at donation).
- **Anonymous donations:** a Spendenbescheinigung **cannot be issued** (§50 EStDV needs donor name/address + Steuer-ID),
  so the donor gets **no Spendenabzug**; issuing a wrong receipt grossly negligently/intentionally triggers **issuer
  liability at a flat 30% of the donation** (**§10b Abs. 4 S. 2 EStG**).
- **Clean path:** you *can accept* anonymous multichain/crypto donations, but **tax-deductible** ones require donor
  identity + careful due diligence before issuing any receipt.

*(Verification stopped here — the remaining 12 areas below did not complete the cited pass.)*

---

## The phased masterplan (skeleton)

### Phase 0 — Legally clean, do now
- **Entity:** form a **gemeinnütziger e.V.** (eingetragener Verein) as the civic/community vehicle; pair with a
  **gGmbH or GmbH Trägergesellschaft** for anything commercial or asset-holding, so gemeinnützigkeit is not risked.
- **Treasury:** self-custodial **Gnosis Safe** (community holds its own keys → hypothesis: no BaFin crypto-custody
  license, since custody-for-others is the trigger, not self-custody).
- **Currency:** operate Röbel Münzen as a **voucher/Gutschein-like** community token, *not* redeemable for euros —
  keep it clearly out of e-money/payment-services scope (Regionalgeld/Chiemgauer as precedent to study).
- **Funding:** **donations** into the e.V. (Spendenrecht, Spendenquittung); accept crypto donations; a public
  funding page (multichain + Monerium IBAN so SEPA/Stripe arrive as EURe).
- **Data/AI:** GDPR consent scaffolding; keep any AI-service revenue in the commercial entity.

### Phase 1 — Cooperative & data
- **Energy:** form a **Bürgerenergiegenossenschaft (eG)**; study EnWG/EEG thresholds for selling electricity + heat
  and energy-sharing under RED II.
- **Data trust:** citizen **data cooperative/trust** with a clean GDPR lawful basis for embodied-AI capture; sort
  worker-classification for paid contributors *before* scaling capture.
- **Dividend v1:** pay in **Abundance Coupons** (claims on below-market essentials), *not* euros — stays clear of
  e-money law.
- **Tax:** VAT (Umsatzsteuer) setup on AI-service and data sales; crypto tax treatment.

### Phase 2 — Real money out
- **Euro dividend/redemption:** the **e-money / ZAG trigger.** Preferred clean path: **Gnosis Pay** (see below) so
  the regulated e-money burden sits with a licensed issuer, not the community.
- **Investment capital:** if raising beyond donations, use the **EU Crowdfunding (ECSP) Regulation** and/or
  **VermAnlG §2a Schwarmfinanzierungsausnahme** via the commercial entity — *not* the gemeinnütziger e.V.
- **MiCA:** classify the token (utility vs EMT vs ART); confirm holding/using **EURe** (Monerium EMT) is clean;
  white-paper duties only if issuing a regulated crypto-asset.

### Phase 3 — Frontier
- **DAO wrapper:** mature the e.V./eG as the **legal wrapper** for on-chain governance (avoid the unwrapped-GbR
  joint-liability trap); is a MACI vote internally binding via the statutes?
- **Autonomous agents:** legal status, liability, and representation (Vollmacht) for agents transacting from the
  treasury; no legal personhood for agents → they act *for* a legal principal.
- **AI Act:** obligations for operating/owning models and selling AI services (risk tier, GPAI, transparency).
- **Federation:** cross-jurisdiction replication of the legal wrapper for forks.

---

## Gnosis Pay — the clean euro-exit (fold into Phase 2)

Gnosis Pay is a **Visa debit card that spends directly from a self-custodial Gnosis Safe**, auto-converting EURe/GNO
at the point of sale. The regulated **e-money / payments licensing sits with Gnosis Pay / Monerium as the licensed
issuer — not with the community.** This reshapes the hardest trigger: instead of the community becoming a
BaFin-licensed e-money issuer, the treasury distributes **EURe** to a citizen's own Safe and the citizen spends it
through *their own* Gnosis Pay card. **Verify:** per-user KYC, country availability, and whether distributing EURe
to token-holders is itself a regulated act. Net: "hold + spend EURe via a licensed card" is a genuinely clean path.

---

## The 15 areas (preliminary orientation — all TO VERIFY)

1. **Entity** — e.V.+Gemeinnützigkeit for the community; gGmbH/GmbH Trägergesellschaft for commercial/asset-holding. Can a gemeinnütziger Verein hold crypto/securities within Vermögensverwaltung limits? → verify.
2. **Treasury/custody** — self-custody ≠ Kryptoverwahrgeschäft (custody *for others* is the trigger); confirm under KWG + MiCA CASP.
3. **Community currency** — keep as non-redeemable voucher to stay out of E-Geld (ZAG)/MiCA; Regionalgeld precedents.
4. **Euro dividend/redemption** — redeeming tokens for euros is the e-money/PSD2/ZAG trigger; route via Gnosis Pay/EURe.
5. **Crowdfunding** — donations (clean, gemeinnützig) vs investment (ECSP Reg / VermAnlG §2a / prospectus thresholds).
6. **MiCA** — token classification; EURe as EMT is fine to hold/use; white-paper only if issuing; in-force + transitional timeline.
7. **AI Act** — phased application; risk tier + GPAI + transparency duties for owned models and AI services.
8. **GDPR + Data Act** — lawful basis + explicit consent for AR/teleoperation capture (esp. private/commercial premises); data-trust governance; data licensing.
9. **Labour** — paid data contribution: employment vs self-employment vs co-op member; Scheinselbständigkeit, Sozialversicherung, Mindestlohn, crowdwork rules.
10. **DAO/governance** — no German DAO form; unwrapped ≈ GbR joint liability; wrap in e.V./eG; is a MACI vote statutorily binding?
11. **Autonomous agents** — no legal personhood; agent acts for a principal; liability + Vollmacht + wallet-control questions.
12. **Energy co-op** — eG under EnWG/EEG; selling power + heat; RED II energy sharing; licensing thresholds.
13. **Tax** — gemeinnützigkeit (KSt/GewSt exemption + Vermögensverwaltung vs wirtschaftlicher Geschäftsbetrieb limits); VAT on services/data; crypto tax (§23 EStG / business income); dividend taxation for citizens; Spenden deductibility.
14. **Securities** — is the dividend/token a Wertpapier (WpHG/eWpG) / Vermögensanlage / MiFID II instrument → prospectus duties? Design the dividend to avoid the security characterization.
15. **Municipal/public law** — a "parallel" community layer alongside the Gemeinde (cooperation, not conflict); public-procurement rules when selling AI to municipalities.

---

## Take these to a Steuerberater + Rechtsanwalt

- Exact **entity split** (e.V. + gGmbH/GmbH) and how much commercial/AI/asset activity the gemeinnützige side may touch.
- Whether **Röbel Münzen** stays clearly a voucher (out of ZAG/MiCA) at every phase, including once a dividend exists.
- The precise **e-money trigger** for any euro-out, and whether **Gnosis Pay/EURe** fully outsources it.
- **Investment-crowdfunding** structure (ECSP vs VermAnlG §2a) if raising return-bearing capital.
- **Worker classification** for paid data contributors before scaling capture.
- **DAO legal wrapper** design so on-chain governance is binding without joint-liability exposure.
- **Data-capture consent + AI Act** posture for embodied-data collection and owned models.

*This document is research scaffolding, not legal advice. Do not act on any item without professional review.*
