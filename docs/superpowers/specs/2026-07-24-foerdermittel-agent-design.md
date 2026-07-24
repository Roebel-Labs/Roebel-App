# Fördermittel Agent — Phase 1 Design

**Status:** Design (approved to spec) · **Created:** 2026-07-24 · **Wave:** 1 (flagship)
**Roadmap:** [`docs/MECKY_AGENT_ROADMAP.md`](../../MECKY_AGENT_ROADMAP.md) · Skill #1

---

## 1. Goal & value

Mecky proactively helps Röbel/Müritz organizations — **Vereine, businesses
(Unternehmen/Restaurants), and the Stadt** — find and win funding they
**realistically** qualify for. Not a keyword dump of every grant: a specific,
deeply-reasoned, **honest** shortlist with real probabilities, grounded in cited
program data, delivered by an agent that gets in contact and does the work.

Small rural orgs massively under-claim funding because the landscape is
fragmented (EU / Bund / Land MV / Landkreis / LEADER-LAG / Stiftungen), eligibility
is opaque, and applications are bureaucratic. Phase 1 removes the first two
barriers (discovery + honest eligibility) and hands off the third (drafting) to
Phase 2.

This is the strongest "replicable blueprint for small towns" story in the
product, and building it produces the first real instances of both backbone
layers:
- the **org deep-profile** = Town Context Graph (backbone A), and
- the **server-side outreach agent** = Outbound Agent Runtime (backbone B).

### Non-goals (Phase 1)
- Writing the actual application (Antrag) — that is **Phase 2**.
- Verwendungsnachweis / reporting / deadline pipeline — **Phase 3** (Skill #11).
- Any money movement. This feature never touches funds.
- Political/party funding (`sub_type = fraktion`) — out of scope for now.

---

## 2. Decisions locked in brainstorming

| # | Decision | Choice |
|---|----------|--------|
| 1 | Funding-data sourcing | **Hybrid** — hand-curated core (~15–20 rural-MV programs) + AI research agent that proposes/refreshes with citations, human-verified before live |
| 2 | Org profile capture | **Hybrid** — short structured facts (pre-filled) + warm Mecky conversation about the actual project/need |
| 3 | Engagement model | **Fully proactive** — Mecky initiates contact with the org's owners; interview + report happen in-thread; dashboard is the pull complement |
| 4 | Outreach trigger + consent | **Relevance-driven, opt-out** — only reaches out with a specific reason; opt-out toggle (default on for orgs), frequency-capped, deduped |
| 5 | Phase 1 output boundary | **Honest match report + "help me apply?" handoff** — drafting is Phase 2 |

---

## 3. Architecture — components

Each component is a focused unit with one purpose, a defined interface, and clear
dependencies.

### 3.1 Funding database (data layer)
Two Supabase tables, **RLS-on**. Matching only ever reads `status = 'verified'`.

`funding_programs`
- `id` uuid pk
- `name`, `provider` (e.g. "DSEE", "LAG Mecklenburgische Seenplatte"), `level`
  (`eu | bund | land | landkreis | lag | stiftung | kommune | sonstiges`)
- `summary` text, `description` text
- `target_sub_types` text[] (subset of `verein | unternehmen | restaurant | stadt`)
- `sector_tags` text[] (culture, sport, social, environment, youth,
  digitalization, integration, …)
- `eligibility` jsonb — machine-checkable: `legal_forms_allowed[]`,
  `gemeinnuetzig_required` bool, `min_members`/`max_members`, `region_scope`
  (e.g. MV / Landkreis MSE / bundesweit), `project_types[]`, `cofinancing_required`
  bool, `applicant_must_be_established_years` int|null
- `amount_min`, `amount_max` numeric|null, `funding_rate` text|null
- `deadline` date|null, `deadline_type` (`fixed | rolling | annual | unknown`)
- `source_url` text, `source_checked_at` timestamptz
- `status` (`curated | proposed | verified | archived`)
- `confidence` (`high | medium | low`), `origin` (`curated | research_agent`)
- `created_at`, `updated_at`

`funding_program_sources` (grounding / citations)
- `id`, `program_id` → `funding_programs`, `url`, `quote` text, `fetched_at`

### 3.2 Org funding-profile (backbone A — Town Context Graph)
`org_funding_profiles`, **RLS-on**, owner-scoped via `account_owners`.
- `account_id` → `accounts` (pk/unique)
- `legal_form` (`ev | gmbh | ggmbh | gbr | ug | einzelunternehmen | sonstiges | unbekannt`)
- `is_gemeinnuetzig` bool|null
- `founded_year` int|null, `member_count` int|null, `budget_band`
  (`<5k | 5-25k | 25-100k | >100k | unbekannt`)
- `sector_tags` text[]
- `project_needs` text (narrative from the interview), `goals` text
- `region` text (default Röbel / Landkreis MSE)
- `profile_completeness` int (0–100, computed), `last_interviewed_at` timestamptz

Consent lives on the account:
- `accounts.foerder_outreach_opt_in` bool (default `true` for organisation
  accounts) — the opt-out switch.

### 3.3 Research agent (backbone B — ingestion)
Scheduled edge function (`funding-research`), **server-side keys**.
- Claude **Sonnet + web search** discovers new programs and refreshes existing
  ones from official sources.
- Extracts the `funding_programs` structured fields **plus ≥1
  `funding_program_sources` citation** per program.
- Writes rows as `status = 'proposed'` (never `verified`). An admin approves in a
  verification queue (reuses the `mecky_drafts` approve/reject pattern).
- Refresh pass re-checks `source_checked_at` on `verified` rows and flags stale
  deadlines rather than overwriting silently.

### 3.4 Matching engine
Server-side function (`funding-match`), invoked per org profile. Two stages:

1. **Hard filters** (cheap, deterministic + **Haiku** where light NLP helps):
   drop programs the org is categorically ineligible for — wrong `legal_form`,
   `gemeinnuetzig_required` unmet, `region_scope` mismatch, `sub_type` not in
   `target_sub_types`, established-years unmet. No LLM guessing on hard rules.
2. **Deep fit reasoning** (**Opus 4.8** — quality matters most here): for each
   surviving program, reason about *genuine* fit given the org's `project_needs`
   and `goals`, grounded in the program's cited data. Produce: fit rationale,
   **honest probability band** (`hoch | mittel | niedrig`), `requirements` (what
   the org needs to apply), and `red_flags`.

Persist to `org_funding_matches`:
- `id`, `account_id`, `program_id`, `score` numeric, `probability_band`,
  `rationale` text, `requirements` text, `red_flags` text,
  `status` (`new | seen | saved | dismissed | applying`), `created_at`

**Honesty guardrail:** the report surfaces `hoch`/`mittel` by default, collapses
`niedrig`, always shows the rationale + `source_url`, and carries a visible
disclaimer ("Mecky kann sich irren — bitte prüft die Förderbedingungen selbst").

### 3.5 Outreach orchestrator (backbone B — outbound)
Scheduled function (`funding-outreach`), reads triggers, respects consent.
- **Trigger 1 — new eligible org:** an `accounts` insert with `account_type =
  'organisation'` and `sub_type ∈ {verein, unternehmen, restaurant, stadt}`,
  `foerder_outreach_opt_in = true`, not recently contacted → Mecky sends a warm
  notification/DM to the `account_owners` (owner/admin) offering a funding check.
- **Trigger 2 — new strong match / deadline:** matching produces a fresh
  `hoch`/`mittel` match for a profiled org, **or** a `saved` match's `deadline`
  approaches → nudge.
- Frequency-capped + deduped (never re-nudge the same thing); quiet after a
  `dismissed`; logs every attempt in `foerder_outreach_log`
  (`account_id`, `trigger`, `program_id?`, `channel`, `sent_at`, `result`).
- Delivery via the existing `notifications` table + DM rail. Owner identities
  resolve to **display names** (never raw wallets).

### 3.6 Mecky conversational surface (server-side)
The interview + report run inside a Mecky thread powered by a **server-side**
agent (edge function) — **not** the app's client-shipped Anthropic key. New
tools exposed to the agent:
- `getOrgFundingProfile(account_id)` — read (pre-fill).
- `updateOrgFundingProfile(account_id, fields)` — **write**, only after the user
  confirms the facts.
- `runFundingMatch(account_id)` — invoke the matching engine.
- `getFundingMatches(account_id)` — read the ranked report.
- `saveFundingMatch(match_id)` / `dismissFundingMatch(match_id)` — **write**.
- `requestApplicationHelp(match_id)` — **write**, queues the Phase 2 handoff and
  notifies (Phase 1 records intent; drafting itself is Phase 2).

Interview + narration model = **Claude Sonnet** (conversational).

### 3.7 Dashboard panel (web org dashboard — pull complement)
A new **"Fördermittel"** panel in `apps/web/src/app/dashboard/`, gated via
`subTypeFeatures()` in `apps/web/src/types/account.ts` (add a `foerdermittel`
flag for `verein | unternehmen | restaurant | stadt`). Shows: the funding
profile (editable), the ranked matches (saved/dismissed states), the deadline
nudges, and the **opt-out toggle**. Separately, an **admin verification queue**
for research-agent `proposed` programs.

---

## 4. Data flow (happy path)

1. New Verein registers (`accounts` insert).
2. `funding-outreach` sees eligible + opt-in + not-recently-contacted → Mecky DMs
   the owner: *"Moin! Ich glaube, es gibt Fördermittel für euren Verein — wollt
   ihr, dass ich das in 5 Minuten prüfe?"*
3. Owner agrees → **hybrid interview**: confirm/enrich the structured facts
   (pre-filled from `accounts`/`businesses`), then a warm chat about the actual
   project/need → `updateOrgFundingProfile`.
4. `runFundingMatch` → hard filters → deep fit reasoning (Opus) → persist
   `org_funding_matches`.
5. Mecky presents the ranked honest report in-thread; the same data appears in the
   dashboard panel.
6. Owner saves interesting matches → Mecky: *"Soll ich euch beim Antrag helfen?"*
   → `requestApplicationHelp` queues Phase 2.

---

## 5. Model routing (best model per job)

| Job | Model | Why |
|-----|-------|-----|
| Interview + report narration | Claude Sonnet | Conversational, cost-balanced |
| Hard-filter light classification | Claude Haiku 4.5 | Cheap, high-volume |
| Deep fit reasoning + probability | **Claude Opus 4.8** | Highest-stakes reasoning; honesty depends on it |
| Program research + extraction | Claude Sonnet + web search | Grounded discovery |

All model calls run **server-side** (edge functions), never the app's shipped key.

---

## 6. Guardrails

- **Consent:** `foerder_outreach_opt_in` (default on for orgs), frequency cap,
  dedupe, quiet-after-dismiss; opt-out is one toggle in the dashboard.
- **Grounding:** every match cites its `source_url`; research-agent data is
  **human-verified** (`proposed → verified`) before matching can see it.
- **Honesty:** probability bands + visible rationale + self-check disclaimer;
  never over-promises; low-chance matches are collapsed, not hidden-and-forgotten.
- **Privacy:** all new tables **RLS-on**, owner-scoped; owners resolve to display
  names; never surface wallet addresses.
- **Staleness:** flag programs whose `source_checked_at` is old; never assert a
  passed deadline from stale data.

---

## 7. Error handling

- **Thin/empty profile:** matching asks for the missing facts rather than
  guessing; low `profile_completeness` short-circuits deep reasoning.
- **Unverified programs** never reach matching (status gate).
- **No reachable owner / notifications off:** outreach degrades to dashboard-only;
  logged as such in `foerder_outreach_log`.
- **Research extraction failure / missing citation:** the row is rejected (not
  written as `proposed`) — a program with no source is never persisted.

---

## 8. Testing

- **Eligibility hard-filter units** — fixture orgs × programs; deterministic
  pass/fail on `legal_form`, `gemeinnuetzig`, region, sub_type.
- **Matching golden set** — curated org×program pairs asserting honest verdicts,
  e.g. a GbR must **not** match a `gemeinnuetzig_required` pot; a bundesweit
  youth program **should** match an eligible Jugend-Verein.
- **Outreach logic** — trigger selection, frequency cap, opt-out respect, dedupe,
  quiet-after-dismiss.
- **Research agent** — extraction schema validation + citation-presence check
  (reject on missing source).

---

## 9. Phase boundaries

- **Phase 1 (this spec):** funding DB (curated core + verified research), org
  funding-profile, matching engine, proactive outreach, honest report, dashboard
  panel + admin verification queue. Ends at the "help me apply?" handoff.
- **Phase 2 (Skill #1 cont.):** application drafting with per-program rubrics.
- **Phase 3 (Skill #11):** Verwendungsnachweis + deadline/status pipeline.

---

## 10. Open items / operational gates (not code)

- **Curated seed content:** who writes the initial ~15–20 program entries, and
  from which sources (candidates: DSEE, LEADER/LAG Mecklenburgische Seenplatte,
  Ehrenamtsstiftung MV, Aktion Mensch, *Demokratie leben!*, regional Stiftungen,
  ESF/EFRE). Owner + first list TBD before launch.
- **Admin verification owner:** who staffs the research-agent verification queue.
- **Web-search provider** for the research agent (Anthropic web search vs.
  external) + server env/keys.
- **Cron cadence** for `funding-research` and `funding-outreach`.
