# Sovereign Community OS — Foundation + First Workflow

**Date:** 2026-07-05
**Status:** Design (brainstorming output) — awaiting user review before implementation planning
**Scope of THIS spec:** the shared foundation + the first proof workflow (Stage 1). Everything past Stage 1 is roadmap context, not part of this spec's implementation plan.

---

## 1. Vision (the north star)

A **sovereign, privacy-preserving, AI-boosted operating system for a local community.** Every human and organization in a town — citizens, businesses, the Verwaltung, Vereine, tourists — operates on **one shared foundation**, with **per-user feature sets (modules)** on top. An integrated local AI agent makes everyone dramatically more productive by doing the boring, repetitive, cross-party work for them.

**Röbel is the proof of concept.** The design is **product-first but protocol-ready**, so a working town can later be opened as a standard and forked to other towns — the "replicable blueprint for small towns" thesis, and the same north star as Netizen Labs / POLIS.

The bet is a **network effect on verified local identity**: every actor added makes existing workflows more valuable, because workflows connect actors who are all verified on one substrate.

---

## 2. Key decisions (locked during brainstorming)

1. **Platform, not app.** A stable shared *foundation* + per-user *modules*. Everything sovereign lives in the foundation; features are modules that inherit sovereignty for free.
2. **Product, protocol-ready.** Build one app Röbel uses now, but define the foundation as clean open interfaces so it can be opened/forked later. Don't pay full protocol cost yet.
3. **Build only differentiators; integrate protocols; fork/embed editors.** The moat is composition + verified local identity + the local AI glue — not the components.
4. **Hybrid sovereign data base.** Nextcloud/self-host as the gov-trusted backbone, wallet identity as the auth/permission layer, Fileverse-style E2E encryption for the truly sensitive data.
5. **Sovereignty implementation is staged.** The self-hosted German AI and the encrypted Vault *implementation* are deferred hardening stages — **required before the paid rollout and before any sensitive/citizen data flows**, not before the first demo. The design principle that makes the later swap clean holds from day one: modules and cockpit code never talk to a specific backend or model directly, so Stage 1b is a backend swap, not a rewrite.
6. **First user drives the design.** An overwhelmed town-embedded program runner (the Jugendclub lead), because overwhelm is the strongest adoption force and it permanently avoids the "nice-to-have chatbot" failure mode. **Pilot #2 is a school teacher** — the identical persona at the local school (recurring events, boring forms, overwhelm), which proves "same foundation, second institution" and opens a second paying customer.
7. **Product before platform (amended 2026-07-07).** The cockpit is built directly on existing rails (Supabase, existing events system, existing agent integration). The Foundation interfaces are **extracted from the working cockpit** once it proves what they need to be — not frozen up front. Interfaces designed before real usage are almost always wrong; the foundation is Stage 1's *output*, not its prerequisite.
8. **Implementation via multi-agent orchestration (Fable 5).** Parallel agent fleets are used where units are independent and requirements are known (research, license diligence, hardening, Wave-2+ modules). The cockpit v0.1 core itself is built in a tight sequential loop with pilot feedback — the bottleneck there is learning what the user needs, not code throughput.
9. **The suite is bigger than Stage 1.** The full product catalog (Flows, Calendar, Docs, Sheets, Present/Design, Mail two-lane, AI Phone, Commerce, Messenger, Mini App Builder) and its wave sequencing live in the companion doc: [2026-07-07-roebel-suite-product-portfolio.md](2026-07-07-roebel-suite-product-portfolio.md).

### Build vs. integrate vs. fork

| Layer | Decision | Concrete option |
|---|---|---|
| Identity | Already built — keep | Wallet + CitizenNFT (extend to multi-actor) |
| Module runtime | Already built — keep | Netizen Mini Apps SDK + Expo host |
| AI serving | Integrate (deferred) | Hosted model now; self-host open weights (GLM / EU model) via vLLM/SGLang on German GPU later |
| AI agent logic | **Build** (the value) | Town-specific tools/workflows over local data (extends Mecky) |
| Docs / sheets / storage | Fork/embed as a library | Fileverse editor and/or Nextcloud + OnlyOffice/Collabora |
| Calendar | Integrate (open standard) | CalDAV (Radicale / Nextcloud) — never build |
| Mail | Integrate (never run own server) | JMAP/IMAP client over existing mail |
| Messaging (sovereign) | Integrate | Matrix (E2E, self-host) or wallet-native (XMTP/Nostr) |
| Presentation / poster designer | Fork/embed, AI-driven | Excalidraw (MIT) / tldraw / Polotno |

**License diligence is an explicit step**, not an assumption (repo is AGPL-3.0; Nextcloud AGPL-compatible, Excalidraw MIT easy, tldraw/Polotno/Fileverse need checking).

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────┐
│  THE SHELL — one app (Expo + web), unified sovereign UX    │
│                                                            │
│  ┌────────── MODULES (per-user feature sets) ──────────┐   │
│  │ Program cockpit │ Calendar │ Events │ Mail │ Docs │  │   │ ← built later,
│  │ (Stage 1)       │          │        │      │Poster│  │   │   one spec each
│  └──────┬───────────┬──────────┬─────────┬────────────┘   │
│         │  every module calls the SAME 4 interfaces  │     │
│  ┌──────▼───────────▼──────────▼─────────▼────────────┐   │
│  │            THE FOUNDATION (same for all)            │   │
│  │  1. IDENTITY  — who you are (wallet + CitizenNFT,   │   │
│  │                 extended to multi-actor)            │   │
│  │  2. VAULT     — your data; interface sovereign,     │   │
│  │                 implementation staged               │   │
│  │  3. AGENT     — model-agnostic; hosted now,         │   │
│  │                 self-hosted German AI later         │   │
│  │  4. MODULES   — the runtime (Mini Apps SDK)         │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

A module never talks to Nextcloud or a specific model directly. It says *"who is this user," "read/write the Vault," "ask the Agent," "host me."* That indirection is what makes it protocol-ready (swap backends without touching modules) and uniformly sovereign (privacy lives in the foundation).

---

## 4. Foundation layers

### 4.1 Identity — multi-actor (shape now, one implementation)
Extends the existing wallet + CitizenNFT identity from citizens-only to **actor types**: citizen, business, town/Amt, Verein, town-staff, school-staff, tourist. This is the substrate for interconnection — a workflow can only route between a business and the Amt if both are verified actors on one identity layer. **Stage 1 defines the actor-type shape but implements only `town-staff`/`school-staff`** (YAGNI — Stage 1 has one user type across two institutions); further actor types are implemented when a flow actually needs them.

### 4.2 Vault — sovereign data (interface now, implementation staged)
A per-user data store exposed as a **clean interface** (read/write/share). Stage 1 backs it with existing storage to prove product value fast. Stage 1b swaps the backing to the sovereign implementation (Nextcloud backbone + wallet-derived encryption keys + Fileverse-style E2E for sensitive docs) **behind the same interface**, before any sensitive data flows.

### 4.3 Agent — model-agnostic intelligence (hosted now, self-hosted later)
The Agent acts over a user's Vault data + town knowledge, scoped by Identity permissions. Its **job is doing and connecting, not answering** (the Mecky lesson — see §7). Interface is model-agnostic. Stage 1 uses a hosted model. A later hardening stage self-hosts open weights on German infrastructure for data residency. Keep the serving layer model-swappable (GLM vs. an EU model like Mistral) — provenance is a political/optics question separate from data residency.

### 4.4 Modules — the runtime
The existing Netizen Mini Apps SDK + host. Feature sets are sandboxed modules that call the three interfaces above. A new module *category* — **"flows"** — represents multi-party workflows the Agent orchestrates end-to-end, as opposed to single-user tools.

---

## 5. First proof: the Program-Runner Cockpit

**Persona:** a town-employed program runner (pilot: the Jugendclub lead) who manages meetings and events, fills out long boring forms, and is overwhelmed juggling everything.

**Hero flow — "the boring forms fill themselves":**

> **First session (cold start):** she brings her existing mess — last year's reports, her Word/Excel files, the funder's blank form — and the **Agent ingests it and drafts the report that's due *now***. The magic works on day one, not after months of data entry.
> **Steady state:** she runs her sessions and events in the app (calendar + the existing events system). When the next Verwendungsnachweis, Sachbericht, or permit comes due, the Agent drafts it from data she already entered — attendance from events, dates from calendar, budget from her Vault. She reviews and submits. She never re-types anything.

**The last mile is the real deliverable:** German funders and Ämter want *their* specific form, not prose. Output must be a **filled PDF (AcroForm) or field-by-field copy-paste output matching the actual form** — a draft she can submit, not a draft she must re-transcribe. Consequently, **task #1 of the implementation plan (before any code) is the forms inventory**: which funders, which forms, which fields, from both pilots.

This is the interconnection thesis made physical: **enter once, reuse everywhere.** It exercises all four foundation layers (Identity: she's a verified town-staff actor; Vault: her program data; Agent: does the form-filling; Modules: calendar + events + forms on one runtime).

It is also the **spine** of the whole platform. She is a *town-staff actor filing outward* (to the Amt / to funders). Generalize "her" to "any business or Verein filing to the town" → Stage 1 for everyone. Add citizens/tourists to her events → Stage 2. Nothing changes; she just gives the spine a face.

**Pilot #2 — the school teacher.** The identical persona at the local school: recurring events (Klassenfahrten, Elternabende, projects), boring forms (Anträge, Genehmigungen, documentation), overwhelm. Same cockpit, zero new build — it proves "same foundation, different institution" and opens a second paying customer. **Hard constraint: school pilots start with logistics workflows only** (forms, event planning, parent letters) — never student records until Stage 1b sovereignty hardening is live (minors' data is the most sensitive category; the school answers to the Land, not the town).

**Ecosystem track (already live):** the Sommer Camp hackathon (Jul 10–17) with the AI Mini App Builder deploying student apps into the Röbel App is the module-ecosystem thesis in action — the community's youth building the community's software. No new build is promised for it; it seeds the developer side of the platform.

**Stage 1 scope (this spec):**
- Cockpit built **directly on existing rails** (Supabase, existing events, existing agent integration): calendar (integrate CalDAV) + events reuse + **Agent form/report auto-draft** (ingestion-first per the hero flow).
- Foundation interfaces (Identity actor-shape, Vault, Agent, Modules) **extracted from the working cockpit** as it stabilizes — sovereign interfaces as Stage 1's output.
- Hero deliverable: at least one real recurring form auto-drafted end-to-end **as a submittable filled form**, from each pilot's own data, reviewed and submitted.

---

## 6. Staged roadmap (context, not this spec's plan)

```
STAGE 1   Program-runner cockpit          ← proves value; pilots: town program runner + teacher
STAGE 1b  Sovereignty hardening           ← encrypted Vault impl + self-hosted German AI
                                             (before sensitive data / paid rollout / school records)
STAGE 2   Present/Design + Docs + Events  ← visible, viral, low-sensitivity; reuses the engine
STAGE 3   Sheets + AI Phone + B2B/commerce ← transaction fees begin (Röbel-Münzen rails)
STAGE 4   Mail (two-lane) + Messenger     ← hardest grind, done when the suite has gravity
```

Business↔Town filings is not a separate product; it is the generalization of the cockpit's outward filing. **The full product catalog, the two-lane mail architecture, and the wave rationale live in the companion portfolio doc:** [2026-07-07-roebel-suite-product-portfolio.md](2026-07-07-roebel-suite-product-portfolio.md).

### Sustainability (business model)

- **AI fees:** institutions (Verwaltung, school, later businesses) pay subscriptions for agent-boosted workflows — B2G/B2B revenue from Stage 1 onward.
- **Transaction fees:** small fees on value flows (commerce, ticketing, B2B orders on Münzen rails) — real, but volume-dependent; not before Stage 3.
- **Blockchain's role:** verified identity + coordination/truth — the trust layer that makes cross-party workflows and fee-bearing transactions legitimate.
- **Scale:** product-first, protocol-ready — a working Röbel becomes a forkable blueprint for other towns, then a federation, then a protocol.

---

## 7. Adoption principle (the Mecky lesson)

A citizen Q&A agent (Mecky) already exists and is underused. Lesson: **a chatbot that answers questions is a nice-to-have; people never build a habit around it.** The wedge must be **workflows people are forced to do anyway** (forms, filings, reports, events), made dramatically easier and connected across parties. Usage comes from necessity — and, in the first user's case, from acute overwhelm.

---

## 8. Trust & privacy model

- **Sovereignty = the operator cannot read user data + citizen data never leaves German infrastructure.** Achieved by wallet-derived encryption keys (Vault), E2E for sensitive docs, and self-hosted inference.
- **Honest Stage 1 caveat:** Stage 1 is *not yet* sovereign (hosted model, existing storage). Therefore Stage 1 runs with **friendly internal pilot users and no sensitive citizen data** (for the school: logistics only, never student records). Real/sensitive data waits for Stage 1b. Because no cockpit code talks to a specific backend or model directly, 1b is a backend swap, not a rewrite.
- **Key-management UX is a first-class open problem** (§9): sovereignty via wallet keys must work for non-crypto users, including recovery, without exposing seed phrases.

---

## 9. Open questions / risks

1. **Key-management & recovery UX** for non-crypto users (biggest UX risk of the whole sovereignty thesis).
2. **Model provenance** — GLM (China) vs. EU open model (Mistral) for the self-hosted stage; data residency vs. political optics.
3. **License diligence** per embedded/forked component.
4. **Procurement path** — how the town and the school actually buy/roll this out beyond delighted pilot employees.
5. **School legal path** — schools answer to the Land (school law, Datenschutz for minors); the rollout gate for anything beyond logistics workflows needs mapping.

(The forms inventory is no longer an open question — it is **task #1 of the implementation plan**, per §5. The mail sovereignty/interoperability tension is resolved by the two-lane architecture in the portfolio doc.)

---

## 10. Success criteria (Stage 1)

- The pilot program runner saves real, measurable time on at least one recurring form/report.
- She would be upset to lose the tool (habit formed — the opposite of Mecky).
- The town agrees to a broader rollout on the strength of that one demo.
- The foundation interfaces held up unchanged while building a real flow on them (proves protocol-readiness).

---

## 11. Implementation methodology

- **Product before platform.** The cockpit core is built in a tight sequential loop on existing rails, driven by pilot feedback — the bottleneck there is learning what the pilots need, not code throughput. Foundation interfaces are extracted from the working cockpit as it stabilizes, not frozen up front.
- **Multi-agent build with Fable 5 where it shines:** independent, known-requirement units — the forms-inventory research, license diligence, form-template/PDF-fill tooling, CalDAV integration, Stage 1b hardening, and Wave-2+ modules can fan out to parallel Fable-5 agents.
- The implementation plan (next step, via the writing-plans skill) will encode this decomposition and the build order, with the forms inventory as task #1.
