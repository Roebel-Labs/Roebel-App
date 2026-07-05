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
5. **Sovereignty implementation is staged, interfaces are sovereign from day one.** The self-hosted German AI and the encrypted Vault *implementation* are deferred hardening stages — **required before the paid rollout and before any sensitive/citizen data flows**, not before the first demo. The *interfaces* are sovereign from the start so the swap is clean.
6. **First user drives the design.** An overwhelmed town-embedded program runner (the Jugendclub lead), because overwhelm is the strongest adoption force and it permanently avoids the "nice-to-have chatbot" failure mode.
7. **Implementation via multi-agent orchestration (Fable 5).** The plan is decomposed into independent, clean-interface units so a fleet of Fable-5 agents can build them in parallel.

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

### 4.1 Identity — multi-actor
Extends the existing wallet + CitizenNFT identity from citizens-only to **actor types**: citizen, business, town/Amt, Verein, town-staff, tourist. Each verified, each with roles/attestations. This is the substrate for interconnection — a workflow can only route between a business and the Amt if both are verified actors on one identity layer. Reuses the hard part you already own.

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

> She runs her sessions and events in the app (calendar + the existing events system). When a funding report (Verwendungsnachweis), activity report (Sachbericht), or permit comes due, the **Agent drafts it from data she already entered** — attendance from her events, dates from her calendar, budget from her Vault. She reviews and submits. She never re-types anything.

This is the interconnection thesis made physical: **enter once, reuse everywhere.** It exercises all four foundation layers (Identity: she's a verified town-staff actor; Vault: her program data; Agent: does the form-filling; Modules: calendar + events + forms on one runtime).

It is also the **spine** of the whole platform. She is a *town-staff actor filing outward* (to the Amt / to funders). Generalize "her" to "any business or Verein filing to the town" → Stage 1 for everyone. Add citizens/tourists to her events → Stage 2. Nothing changes; she just gives the spine a face.

**Stage 1 scope (this spec):**
- Foundation: multi-actor Identity, Vault interface, model-agnostic Agent (hosted), Modules runtime.
- Cockpit module: calendar (integrate CalDAV) + reuse existing events system + **Agent form/report auto-draft** from that data.
- Hero deliverable: at least one real recurring form auto-drafted end-to-end from her own data, reviewed and submitted.

---

## 6. Staged roadmap (context, not this spec's plan)

```
STAGE 1   Program-runner cockpit          ← proves foundation; onboards town-staff actor
STAGE 1b  Sovereignty hardening           ← encrypted Vault impl + self-hosted German AI
                                             (before sensitive data / paid rollout)
STAGE 2   Public events + poster designer ← reuses cockpit; adds citizens/tourists + AI design
STAGE 3   Local B2B / commerce            ← reuses business identity + Vault + Röbel-Münzen
LATER     Mail, docs, sheets, full calendar, messaging — each its own spec/module
```

Business↔Town filings is not a separate product; it is the generalization of the cockpit's outward filing.

---

## 7. Adoption principle (the Mecky lesson)

A citizen Q&A agent (Mecky) already exists and is underused. Lesson: **a chatbot that answers questions is a nice-to-have; people never build a habit around it.** The wedge must be **workflows people are forced to do anyway** (forms, filings, reports, events), made dramatically easier and connected across parties. Usage comes from necessity — and, in the first user's case, from acute overwhelm.

---

## 8. Trust & privacy model

- **Sovereignty = the operator cannot read user data + citizen data never leaves German infrastructure.** Achieved by wallet-derived encryption keys (Vault), E2E for sensitive docs, and self-hosted inference.
- **Honest Stage 1 caveat:** Stage 1 is *not yet* sovereign (hosted model, existing storage). Therefore Stage 1 runs with a **friendly internal pilot user and no sensitive citizen data**. Real/sensitive data waits for Stage 1b. The interfaces are sovereign from day one so this is a backend swap, not a rewrite.
- **Key-management UX is a first-class open problem** (§9): sovereignty via wallet keys must work for non-crypto users, including recovery, without exposing seed phrases.

---

## 9. Open questions / risks

1. **Key-management & recovery UX** for non-crypto users (biggest UX risk of the whole sovereignty thesis).
2. **Model provenance** — GLM (China) vs. EU open model (Mistral) for the self-hosted stage; data residency vs. political optics.
3. **The real forms** — need an inventory of the pilot's actual recurring forms (which funder, which fields, which office) before building auto-draft. This must come from the pilot user.
4. **License diligence** per embedded/forked component.
5. **Procurement path** — how the town actually buys/rolls this out beyond one delighted employee.
6. **Mail/messaging sovereignty vs. interoperability** tension (deferred; not in Stage 1).

---

## 10. Success criteria (Stage 1)

- The pilot program runner saves real, measurable time on at least one recurring form/report.
- She would be upset to lose the tool (habit formed — the opposite of Mecky).
- The town agrees to a broader rollout on the strength of that one demo.
- The foundation interfaces held up unchanged while building a real flow on them (proves protocol-readiness).

---

## 11. Implementation methodology

- **Multi-agent build with Fable 5.** Decompose Stage 1 into independent, clean-interface units (each foundation layer, the calendar integration, the events reuse, the form auto-draft) so a fleet of Fable-5 agents can build in parallel with minimal shared state.
- Interfaces are defined and frozen first; module/layer implementations then proceed independently against them.
- The implementation plan (next step, via the writing-plans skill) will encode this decomposition and the build order.
