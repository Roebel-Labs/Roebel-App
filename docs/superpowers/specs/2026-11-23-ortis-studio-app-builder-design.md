# Ortis Studio: App builder, meetings and the business case (vs. Langdock)

**Status:** 2026-11-23 — A0, templates and A1 (builder in Studio) built, see `STATE_OF_ORTIS_STUDIO.md` §6b. Meetings dropped by Max ("not needed right now"); templates added instead. A2 (shared collections, Raumbuchung, Anwesenheit, Studio „Daten“) and A6.1 built 2026-11-23; A3–A5, A6.2, A6.3 badge issuance, A6.4 open.
**Context:** Max compared Ortis Studio with Langdock (screenshots of the desktop app, Apps and Meetings)
and asked: how far are we, what can SAIA carry, which external model, and how does it become revenue.
Read with [`STATE_OF_ORTIS_STUDIO.md`](../../STATE_OF_ORTIS_STUDIO.md),
[`2026-07-08-miniapp-builder-pro-design.md`](2026-07-08-miniapp-builder-pro-design.md) and
[`2026-11-13-ortis-credits-subscriptions-design.md`](2026-11-13-ortis-credits-subscriptions-design.md).

---

## 1. Langdock in short (checked 2026-11-23)

| | |
|---|---|
| Company | Berlin, YC S23, co-CEOs Lennard Schmidt + Judith Dada. ~€50M ARR (CEO post, Sep 2026; Sacra estimates ~$67M end Oct). ~13,000 orgs claimed, named: Merck, Trumpf. Only ~$3M funding disclosed. Sep 2026 "reverse flip": US holding dissolved, German SE, citing CLOUD Act in customer legal reviews. |
| Hosting / compliance | Azure EU; ISO 27001 + SOC 2 Type II; AVV part of the ToS; Berufsgeheimnisträger addendum. ~50 models flagged EU or Global (Claude incl. 5.5, GPT-5.x/6.x, Gemini, Mistral, Llama). BYOK (Azure, Bedrock, Mistral, LiteLLM, any OpenAI-compatible). Single-tenant from 2,000 seats, BYO cloud / on-prem Helm from 5,000. Own German GPU data centre announced, not verified live. |
| Pricing (€/user/month, net) | Core 29 (23.20 yearly), Work 39 (31.20 yearly), Enterprise custom; volume tiers down to 12.80 / 17.80; Max seats 99 / 109; workflow add-on 40k runs €449; 7-day trial with €5 credits. Revenue = seats + workflow runs + API usage with markup. |
| Product | Chat (Auto routing, Deep Research, memory, images), Agents, Workflows (nested, shared, inbox notifications), Plugins (integrations + skills + MCP client, verified MCP directory), Scheduled tasks ("Geplant", API since Sep 15), Word/PowerPoint/Outlook/Excel add-ins, Slack/Teams bots, Agent MCP server, coding-agent keys. |
| Meetings (Nov 20, early access) | Bot-free recording; desktop app (Mac/Win) records both sides of online calls, browser only the mic; summary templates, folders, sharing, Q&A across transcripts. Core: 10 recordings/member/month; Work unlimited. |
| Apps (Nov 17, early access) | Built in chat (Plan → Build → Finish, clarifying questions, comment on element, screenshot, "Fix with AI"), preview vs live, templates. Tabs Preview / Analytics / Integrations / Data / AI / Versions / Code / Geplant. One DB per app with **Private** (per-user rows) and **Shared** tables. Integrations: each user picks their own connection and approves each action. Scheduled runs while the app is closed. Roles Owner/Editor/Viewer. |
| Apps limits (documented) | **No public URLs, no guests, no custom domains**; code view-only, no Git; no direct external API calls; Core shares an app with max 5 people. |
| Apps internals | Not documented. Screenshots show `backend/actors.ts` with Drizzle `sqliteTable(...)`, `src/App.tsx`, `translations.ts`, `thumbnail.svg` → most likely SQLite per app behind an actor runtime (inference). |

Sources: langdock.com/pricing, /security, /models, /changelog; docs.langdock.com (apps, meetings, byok,
legal-compliance); euronews 2026-09-16; sacra.com/c/langdock; sifted (Dada).

## 2. Where Ortis stands

| Langdock | Ortis today | Gap |
|---|---|---|
| Chat, agents, Auto | Studio workspace, 12 character agents, routes with SAIA fallback seam | small |
| Geplant | backend `routines`, `lib/chat/schedule.ts`, cron; started from briefing points | Studio screen |
| Plugins | Google connector (Testing), MCP servers, approval cards (harness risk tiers) | Microsoft connector |
| Inbox | mail / SMS / WhatsApp channels, daily briefing | one notification list |
| Deep Research, images, media | images live, media tools built (no live job run yet) | research mode |
| **Meetings** | toolbar "Aufnehmen" = dictation only | **missing** |
| **Apps** | web `/editor`: single-file HTML (GLM-5.2), canvas states, Mini-CMS, store images, analytics, MCP `publish_html_app`, `<slug>.roebel.site`, store + push + Münzen rewards + identity | **not in Studio; no shared writable data, no connectors, no AI, no schedules per app** |
| Office add-ins, SSO/SCIM, ISO/SOC2 | none | do not chase now |

**The opening:** Langdock apps are internal tools only. Ortis apps already publish to the public
(members, citizens, guests) with verified identity, payments/points and a store. That is the thing to
sell, not "another enterprise chat".

## 3. App builder in Studio

### 3.1 Goal

A Studio section **Apps** where a Verein, a business or the Amt builds an app in chat, sees it live,
gives it data, connections, AI and schedules, and publishes it to its members or the public. Same
contract as the web editor (single-file HTML + `@netizen-labs/miniapp-sdk`), so apps stay portable to
the Röbel App host, the web host and `<slug>.roebel.site`.

### 3.2 What exists and is reused

- `POST /api/mini-apps/generate` (streaming full document, iteration with current HTML, vision brief,
  `generate/status` job state) and `htmlPrompt.ts` (design + SDK + screen contract).
- `POST /api/mini-apps/publish`, `/manifest`, `/cms-plan`, `/images*`, `/analytics`, versions in
  `mini_app_versions.html`.
- `mini_app_data` (`/api/mini-apps/data`): scope `app` = content (world-readable, developer writes),
  scope `user` = per-wallet state. This is already Langdock's "Private" table, as key/value.
- Studio: `GET /api/chat/mini-apps` + analytics view (`AppsSection.tsx`, `AppAnalytics.tsx`), pairing
  session (Bearer), approval cards, routines.

### 3.3 Slices

| # | Slice | Contents | Est. |
|---|---|---|---|
| A0 | Auth + model | Builder routes accept the Studio pairing session (Bearer) besides `x-wallet-address`; **`/generate` gets auth + per-account rate limit** (today it has none, which is an open cost hole); codegen model switch (see §5) | 2–3 d |
| A1 | Builder panel | Studio Apps → "Neue App": chat left, live preview right (iframe with the existing web host bridge), stages Planen / Bauen / Fertig from the stream, canvas states, "Mit KI reparieren" on failed checks, comment-on-element + screenshot (already in `/editor`), open existing app, publish | 1–2 wk |
| A2 | Shared collections | `sdk.db.collection(name, { scope: 'private' \| 'shared' })` with `add / list / update / remove / query`; new table `mini_app_rows (app_id, collection, id, owner_wallet, data jsonb, created_at, updated_at)`; private = owner only, shared = all signed-in users of the app, writes limited to own rows unless the manifest grants `shared:write-all` to admins; per-app row/size caps. Data tab in Studio (read-only table view like Langdock) | 1–2 wk |
| A3 | Connections with consent | `sdk.connectors.call(tool, args)` → host shows the existing approval card; grant stored per (app, user, tool), revocable in Studio → Integrationen tab; never the owner's connection for other users | 1 wk |
| A4 | AI + schedules in apps | `sdk.ai.generate({ prompt, schema? })` billed to the *user's* credits (owner's for scheduled runs); app routines on the existing cron with the owner's grants; KI tab with usage | 1 wk |
| A5 | Tabs | Versionen (restore), Code (view **and** edit, unlike Langdock), Geplant, Teilen (members of an org, link, public) | 3–5 d |

Rough total: 5–7 focused weeks for A0–A5. A0+A1 alone already gives "build an app inside Studio".

### 3.5 Credentials and attendance badges in apps (A6, added 2026-11-23)

Max asked to think about credential use and attendance badges. What exists: the credential register
(`CredentialRegistry` on Gnosis, roles / memberships / badges per org, spec 2026-11-17), Studio "Ausweise"
(types, people, batches, event badges), and SDK v0.4 `sdk.credentials.list / has / request / onChange` plus
v2 manifests with `identity.credentials` (what the app may ask for) and `audience` (whom it is for). Production
status: register switched off (`credentials_enabled` false, no registry env on Vercel).

**Gap:** AI-built apps cannot use any of it. The builder prompt (`htmlPrompt.ts`) does not document
`sdk.credentials`, and `manifestDraftSchema` / `publishHtml.ts` only write v1 fields, so the host refuses
every `credentials.request` from an HTML app (types must be in the reviewed manifest).

| Slice | What | Est. |
|---|---|---|
| A6.1 Builder knows credentials | `SDK_REFERENCE` gets `sdk.credentials.*` with the patterns below; `manifestDraftSchema` gets optional `identity.credentials` (≤8, with reason) and `audience`; `publishHtml` writes `manifest_version '2'`, `identity`, `audience` (same missing-column fallback as `data.ts`); identity goes through the existing identity review | 3–4 d |
| A6.2 Org binding in the builder | Publishing from Studio for an org (the user's orgs from `/api/credentials/org`): sets `org`, offers the org's credential types as "Nur für Mitglieder" (`audience.required`) or "Empfohlen für Mitglieder" | 2–3 d |
| A6.3 Attendance in apps | Template "Anwesenheit" (training / course / Ehrenamt): trainer opens a session, members check in (tap, or QR shown by the trainer), list per session — needs A2 shared collections. "Abzeichen vergeben" hands the checked-in people to the org's event-badge flow (Studio Ausweise → one batch, phone confirms) | 1 wk after A2 |
| A6.4 Apps as badge issuers | Count-based badges ("10 Trainings") issued without the organiser's phone: the org appoints the node's badge key as delegate for that one type (register spec 5.5); the app's check-ins trigger small batches. Needs the register live + the node key decision | later |

Patterns the builder should produce (all degrade when `supports('credentials.list')` is false or the
register is off):

- **Mitgliederbereich:** a screen shown only when `sdk.credentials.has('org:<id>')`; otherwise an explanation
  and "Mitgliedschaft teilen" (`request`). Never security — data that must stay private needs A2 rules on the
  server (shared collections readable only by holders of a credential).
- **Rollen-Werkzeuge:** trainer / Vorstand screens behind a `role` credential (e.g. open a check-in session,
  edit the weekly plan), the server checks the same credential.
- **Abzeichen zeigen:** an app lists the person's badges of its org (kind `badge`) as a small collection or
  "Dabei gewesen" on past events (Festprogramm, Vereinstermine).
- **Belohnung mit Nachweis:** Quiz or Stempelkarte pays its Röbel-Münze only to `citizen`.

**Decision for Max:** order A2 → A6.1 → A6.3 (attendance needs shared data), or A6.1 first so apps can at
least gate screens once the register is switched on in production.

### 3.4 Non-goals (for now)

Multi-file apps with their own server code (Langdock's `actors.ts`). Single-file + SDK services keeps
the review/hosting model we have. Revisit only when a real app needs server logic that A2–A4 cannot cover.

## 4. Meetings in Studio

- Record: Electron `desktopCapturer` / display-media with system audio (Windows loopback; macOS 13+
  via the display-media handler), plus mic. Behind the existing camera gate. Needs an **installer**.
- Transcribe: Whisper (EU host, §5) in chunks; speaker turns from the two channels (me vs. others)
  first, real diarisation later.
- After the meeting: summary from a template, tasks, a thread in the workspace ("Chat mit dem
  Meeting"), stored in Bibliothek. Calendar link through the Google connector.
- Consent: a visible recording notice + a one-line text the user can paste into the call chat.
- Est. 2–3 weeks.

## 5. Models

| Use | Now | Proposal |
|---|---|---|
| Builder codegen | GLM-5.2 on z.ai (Chinese provider) | **Claude Sonnet 5.5 via AWS Bedrock Frankfurt or Vertex EU**; GLM only via an EU host if kept at all. z.ai is a blocker for any business or public customer. |
| Chat routes | Anthropic + SAIA seam (off) | Claude Haiku 5.5 / Sonnet 5.5 on an EU region for production |
| Sovereign tier | none | Mistral Large 4 (EU vendor) or open-weight models on IONOS AI Model Hub / STACKIT (German, AVV); same OpenAI-compatible seam as `lib/ai/saia.ts` |
| Speech-to-text | OpenAI (key missing in prod) | Whisper on the EU host |
| German TTS | ElevenLabs via kie.ai | unchanged (SAIA has no German voice) |

**SAIA (GWDG AcademicCloud):** personal key, academic use only, 800 req/day. Use it for prototypes,
benchmarks, Max's own use and choosing the open-weight model for the sovereign tier. Not for citizens
or paying customers until there is a contract + AVV (verkauf@gwdg.de — worth asking; "hosted at a
German university computing centre" would be a strong story for Vereine and Kommunen).

## 6. Business case

Do not compete with Langdock for corporate teams (Office add-ins, certifications, seat discounts,
13k orgs). Compete where they do not go:

1. **Public apps:** building is free; publishing to more than N users, a custom domain or the store
   is paid. Langdock forbids exactly this.
2. **Flat plans per organisation** instead of per seat: Verein 14.99 €, Betrieb 39 € (credits design).
3. **Town licence** ~€1 per inhabitant per year (Crossiety benchmark): town app + Studio for the
   administration and Vereine + apps + livestream.
4. **Credits** for media and heavy AI (one pot, ×2 on provider cost). Trust features stay free.
5. **Sovereign tier** later: EU-only models + AVV, then a dedicated node.
6. **Funding:** LEADER Regionalbudget MV (80 % of €1–20k) for a town rollout; Prototype Fund window
   closes **2026-11-30**.

Gates that are not code: legal entity (AVV, paid plans), credits ledger + Stripe (not built), the
codegen model switch, Google app verification.

## 7. Decisions for Max

1. Order: A0+A1 first, then A2–A5, then Meetings? Or Meetings first?
2. Codegen model: Claude Sonnet 5.5 in an EU region (proposal), or keep GLM-5.2?
3. Publishing tiers: what is free (N users? only org members?) and what is paid?
4. Write to GWDG about a contract for SAIA?
5. Where Studio Apps live: on `feat/ortis-studio-desktop` like the rest of Studio (proposal).
