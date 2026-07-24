# Mecky Agent Roadmap

**Status:** Strategy / prioritization roadmap · **Created:** 2026-07-24 · **Owner:** product

This document maps how Mecky evolves from a reactive concierge into an agentic
platform that delivers real, tangible value to **Citizens**, **Organisations**
(Vereine, businesses, Stadt) and the **commons** of Röbel/Müritz — and does so
as a **replicable blueprint for small towns**.

It is a roadmap, not an implementation spec. Each skill below gets its own
`brainstorm → spec → plan → build` cycle. The **first skill to be specced is the
Fördermittel Agent** (Wave 1 flagship).

---

## 1. Where Mecky is today

There are effectively **three separate Meckys**, and they do not share a brain:

- **Expo chat Mecky** (`apps/expo/lib/tools/mecky-tools.ts`) — 18 tools, but only
  **2 write** (`submitEvent`, `reportProblem`). A strong *reactive concierge*
  (events, restaurants, transit, POIs, wildlife) with **no memory** —
  conversations are never persisted and it never initiates. Ships the Anthropic
  key client-side (fine for reactive chat, wrong for autonomous agents).
- **Web chat Mecky** — no tools, pure conversation.
- **Web cron Mecky** (`apps/web/src/app/api/cron/mecky/`) — the only autonomous
  loop: daily it pulls one RSS feed, picks 3 stories, and writes `mecky_drafts`
  that an admin approves into real `posts`. Human-in-the-loop, no original
  reporting.

**The gap:** every high-value use case below needs two capabilities Mecky does
not have yet — persistent context and outbound agency. Those are the backbone.

---

## 2. The backbone (everything plugs into this)

Build a **thin slice** of the backbone in Wave 0, then let each skill thicken it.

### A · Town Context Graph (Mecky Memory)
Persistent, consent-gated, structured context that Mecky reads **and enriches**:

- **Org deep-profiles** — beyond today's minimal `accounts` (name/`sub_type`/bio):
  legal form (e.V./gGmbH/GbR/sole trader), Gemeinnützigkeit status, founding year,
  member/employee count, budget band, sector/tags, project needs, story, milestones.
- **Citizen profiles** — `interests`/`vereine`/skills/needs/story-worthy events
  (partly in `users` + `privacy_settings` already), strictly opt-in.
- **Conversation memory** — persist Mecky chats (today they are ephemeral) so
  Mecky remembers prior interactions with a person or org.
- Storage: new Supabase tables, **RLS-on** (the DB audit flagged 34 RLS-off
  tables incl. `citizens_registration` with real names/DOB — we do not add to
  that debt).

### B · Outbound Agent Runtime
Mecky that *initiates* and runs multi-step workflows across days:

- **Server-side** execution (edge function / cron / queue) — never the app's
  shipped key.
- **Campaigns** = long-running, cross-session workflows (interview flow,
  grant-matching run, application draft), triggered by **schedule**, **events**
  (a new business registers), or **user opt-in**.
- Delivery through existing `notifications` + DM rails (XMTP / Supabase Realtime).
- **Human approval checkpoints** — reuse the `mecky_drafts` approve-before-publish
  pattern as a generic gate for anything Mecky sends, publishes, or submits.

---

## 3. Cross-cutting principles (shape every skill)

- **Best model per use case (model routing).** Do not default everything to one
  model. Keep a small provider abstraction + server-side keys so each subtask
  routes to the best tool:
  - **Reasoning / writing / agentic tool-loops / grant-fit / drafting** →
    **Claude** (Opus 4.8 for the hardest reasoning + final drafts; Sonnet for
    default agentic turns; Haiku 4.5 for cheap high-volume classification &
    moderation).
  - **Text-legible images (flyers, posters, event covers with headlines / dates /
    addresses)** → **OpenAI gpt-image-1** (best at rendering legible in-image
    typography).
  - **Photographic imagery (food, places, products)** → **Seedream** via the
    existing `kie-proxy` edge function (already in use for menu images).
  - **Voice interviews (later)** → best-in-class STT/TTS.
- **Grounding over hallucination.** Funding, legal, and Amt facts must be cited
  from real sources, and a human reviews before any submission or publication.
- **Consent & privacy.** New Context tables are RLS-on and opt-in; honor
  `users.privacy_settings`. Never surface raw wallet addresses (resolve to display
  names).
- **The payment legal wall.** Donor-directed forwarding to a third-party author is
  a BaFin/ZAG-regulated Finanztransfergeschäft, and Röbel Münzen are **not**
  €-redeemable (`MUENZE_EUR = 1` is orientation-only). So author pay = **Münzen
  tips** (non-cash) or a **treasury honorarium** (Werkvertrag), never forwarded
  donations. Copy stays "Unterstützen", not "Spende", until a gemeinnütziger e.V.
  exists.
- **Human-in-the-loop by default.** Autonomous drafting, always; autonomous
  sending/publishing/submitting, only behind an approval checkpoint.

---

## 4. Prioritized skills (impact × effort)

★ = impact (people + mission) · ● = effort (build cost incl. new backbone) ·
**Wave**: 0 backbone · 1 anchor wins · 2 mission value · 3 deepen/scale · L later

| # | Skill | For | Impact | Effort | Wave | Notes / depends on |
|---|-------|-----|:---:|:---:|:---:|----|
| 1 | **Fördermittel Agent** | Orgs | ★★★ | ●●● | 1 | Flagship. Curated+cited MV funding DB → honest matching → application drafting. No legal wall. |
| 2 | **Org content studio** (copy: announcements, newsletter, blog) | Orgs | ★★★ | ●○○ | 1 | Quick win; reuses `mecky_drafts`/`blog_articles`. Proves the co-write + approve loop. |
| 3 | **Printable flyer / poster generator** (A4, print-ready PDF, QR) | Orgs | ★★★ | ●●○ | 1 | gpt-image-1 or HTML/SVG-layout→PDF (decide at spec). Aushang/Schaukasten/shop-window pain. |
| 4 | **Concierge upgrade** (memory + personalization) | Citizens | ★★☆ | ●○○ | 1 | Extends today's 18-tool Mecky once Context exists. |
| 5 | **Visual asset studio** (feed images, event covers, social cards, logos) | Orgs | ★★☆ | ●●○ | 2 | Extends #2 with routed image models (gpt-image-1 / Seedream). |
| 6 | **Local journalism engine** (interview → co-write → publish) | Commons | ★★★ | ●●● | 2 | Needs Outbound runtime. `journalist` sub_type + `blog_articles` already exist. |
| 7 | **Author appreciation** (Münzen tips / GK honorarium) | Commons | ★★☆ | ●●○ | 2 | Depends on #6. Münzen tips = legally clean; real-money = later, deliberate policy. |
| 8 | **Behörden / Amt navigator** (Anträge, appointments) | Citizens | ★★★ | ●●○ | 2 | Big rural pain. Needs curated local-admin knowledge base. |
| 9 | **Civic-participation guide** (explains votes/proposals) | Citizens | ★★☆ | ●●○ | 2 | Drives MACI governance adoption. On-mission. |
| 10 | **Event co-pilot** (date-clash → listing → reward-QR → recap) | Orgs | ★★☆ | ●●○ | 3 | Ties `events` + `reward_events`. Reuses #3 for the event flyer. |
| 11 | **Verwendungsnachweis / grant-reporting** helper | Orgs | ★★★ | ●●○ | 3 | Phase 2 of #1; huge pain for funded orgs. |
| 12 | **Autonomous newsroom scale-up** (council, sports, alerts) | Commons | ★★★ | ●●● | 3 | Evolves the RSS cron into original reporting. |
| 13 | **Town-needs sensor** (consented demand signal to council) | Commons | ★★☆ | ●●○ | 3 | Privacy-sensitive; aggregate-only. |
| 14 | **Treasury-transparency narrator** | Commons | ★☆☆ | ●○○ | 3 | `stadtkasse_snapshot` already exists. |
| 15 | **Heimat oral-history archivist** | Commons | ★★☆ | ●●○ | L | Journalism variant; cultural preservation. |
| 16 | **Vereinsrecht / e.V.-founding navigator** | Orgs | ★★☆ | ●○○ | L | Mostly RAG/knowledge. |
| 17 | **Job / Ausbildung matcher** | Citizens | ★★☆ | ●●● | L | Retention lever; needs new job data. |
| 18 | **Nachbarschaftshilfe broker** (needs ↔ offers) | Citizens | ★★☆ | ●●○ | L | Ties into marketplace. |
| 19 | **Vereins-growth / member recruitment** | Orgs | ★☆☆ | ●●○ | L | Needs citizen consent to match on interests. |
| 20 | **New-resident onboarding buddy** | Citizens | ★☆☆ | ●○○ | L | Guided flow over existing citizen verification. |

---

## 5. Build sequence

- **Wave 0 — Backbone slice.** Persistent Mecky memory + org deep-profile schema
  + server-side agent runtime skeleton + one reusable human-approval checkpoint +
  the model-router abstraction. Build only what Wave 1 needs.
- **Wave 1 — Anchor wins.** **Fördermittel Agent (Phase 1)** flagship · **Org
  content studio** (low-effort proof of the co-write loop) · **printable flyer
  generator** · **concierge memory** upgrade.
- **Wave 2 — Mission value.** Journalism engine + Münzen tips · visual asset
  studio · Behörden navigator · civic-participation guide.
- **Wave 3 — Deepen & scale.** Application drafting + Verwendungsnachweis ·
  newsroom scale-up · needs sensor · transparency narrator.
- **Later.** The ★☆ / ●●● tail (job matcher, Nachbarschaftshilfe, oral history,
  e.V. navigator, Vereins-growth, onboarding buddy).

---

## 6. Next step

Spec **Skill #1 — Fördermittel Agent (Wave 1, Phase 1)** first: highest tangible
value (real funding into local orgs), no legal/payment wall, strongest
small-town-blueprint story, and it forces the **org deep-profile** layer that
almost every later skill reuses. Phase 1 scope to brainstorm:

1. Org funding-profile builder (Mecky interviews the org).
2. Curated, cited funding database (start hand-curated with high-relevance
   rural-MV programs).
3. Honest matching → a ranked "grants you should actually apply to, and why"
   report — with probabilities, not noise.

Application drafting and Verwendungsnachweis are Phase 2/3 (#11).
