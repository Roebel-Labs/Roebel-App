# Ortis personal context ("Wiki"), suggestions, skills, library

**Date:** 2026-11-12 · **Status:** built (backend on main, UI on `feat/ortis-studio-desktop`), not yet run on a real mailbox.
Reference: Town.com (Max's 17 screenshots, not committed) and the research summary in §2.

## 1. Goal

After someone connects Google (Gmail, Calendar), imports what Claude or ChatGPT know about them, or
simply uses the Röbel App, the assistants should know them like a long-time colleague: who they are,
what they work on, what matters this week, who the people around them are and how they write. The
same knowledge feeds a "Für dich" page with concrete tasks and routines.

Non-goals for this slice: team sharing, Microsoft 365, Slack/Notion sources, a vector index.

## 2. What the research says (2026-11-12)

- **Town** builds one shared profile from *sent* mail first, keeps a living Markdown wiki (profile,
  communication style, work patterns, goals, projects, people), injects a short view of it into every
  chat and exposes list/read/write-wiki tools. Explicit user instructions are protected from cleanup.
  All mail content is treated as untrusted.
- **ChatGPT** injects a small set of saved facts and recent-chat summaries on every turn; no vector
  search over history was found by people who reverse-engineered it.
- **Letta's benchmark**: plain files plus search tools beat specialised memory stacks on LoCoMo. How
  and when the agent searches matters more than the store. Vendor leaderboards are disputed.
- **Karpathy's LLM-wiki pattern**: immutable sources, an LLM-maintained Markdown wiki, an index and
  an append-only log are enough up to a few hundred pages.
- **Known failure modes**: newsletters treated as people, relationships inferred from a shared
  surname, stale facts, over-personalisation, reappearing suggestions, prompt injection through mail.

Decision: a Markdown wiki in Postgres is both the product surface and the runtime store. A cheap
model extracts cited facts, a strong model writes the pages. No graph or vector database in v1.

## 3. Pipeline (`apps/web/src/lib/chat/persona`)

A build is a state machine in `persona_jobs` (lease + checkpoint) so it survives the 300 s function
limit. `POST /api/chat/persona/build` starts it and runs the first tick after the response; the
cron `/api/chat/cron/persona` (every minute) continues it and starts a daily refresh for wikis of
people who used the assistant in the last three days.

| Stage | File | What happens |
|---|---|---|
| collect | `collect.ts`, `classify.ts` | Gmail: up to 220 sent (12 months) and 220 inbox (45 days) headers; deterministic split into people and machines (`List-Unsubscribe`, `List-Id`, `Precedence`, `Auto-Submitted`, Gmail categories, noreply/platform senders). Bodies only for 90 sent mails and 50 inbox mails from people the user also writes to; quotes and signatures cut, secrets scrubbed, 1 400 chars each. Machine mail survives as sender + subject only ("notices": failed payments, failed builds, deadlines). Calendar −90/+60 days, one entry per recurring series. Röbel App profile, imports, chat memory. Contacts ranked by reciprocity × recency (60-day half-life) × log volume. |
| digest | `prompts.ts` `DIGEST_*` | Fast model, 12 mails per call, four calls in parallel: cited facts (`stated` / `inferred`, `sensitive` dropped) and style observations from sent mail. |
| synthesize | `SYNTH_*`, `PROFILE_*` | Two strong-model calls in parallel: overview, goals (today / week / month), projects, short profile for the system prompt, suggestions; and profile, communication style, background, work patterns. |
| people | `PERSON_*` | One page per contact with a real exchange (≥ 2 mails written to them, or one each way, or a meeting plus a mail); 12 on a full build. |
| done | `build.ts` | Update log entry, `built_at`, checkpoint (mail excerpts) deleted. |

Rules that hold everywhere:

- **Evidence.** The writer cites refs (`[s12]`, `[a3]`); `numberCitations` turns known refs into
  `[[n]]` plus a source list and silently drops invented ones.
- **The person wins.** Pages they edited (`edited_by_user`), imported memory and chat memory are
  passed as authoritative and edited pages are never overwritten. Deleted people and dismissed
  suggestions are tombstoned and not derived again.
- **Untrusted input.** Extractor and writer have no tools and return a schema-constrained object;
  every prompt declares source text as data. The runtime block repeats that the wiki is information,
  not instruction.
- **Sensitive data.** Health, religion, politics, sexuality, union, origin, criminal matters, exact
  finances and credentials are dropped at extraction and forbidden at synthesis.
- **Cost.** Routes `persona:*` are recorded in `chat_runs` but do not count against the daily chat
  quota; at most 4 builds per day per account. A person's own Anthropic key is used when stored.

## 4. Runtime (`persona/runtime.ts`, `harness/context.ts`)

Every bot with the `memory` key gets, in the system prompt: the short profile (≤ 220 words plus the
style line), up to 14 people as one line each, the person's own notes, the page index and seven
usage rules (use it naturally, read the page before answering about goals/projects/people, write in
their style, verify stale items, do not volunteer third-party details). On demand: `wiki_read`,
`wiki_search`, `wiki_note` (writes to the Notes page), `skill_read`.

## 5. Surfaces (Studio, `apps/studio/src/persona`)

Für dich (suggestions, start/dismiss), Funktionen (routines, skills, integrations, routine catalog
with 14 templates), Wiki (pages with citations and infobox, editing, people, imports with the export
prompt, rebuild, delete), Bibliothek (files and generated images across chats). Suggestions and
routines run with the Mecky preset (connectors + memory + strong model).

## 6. API

See the route files under `apps/web/src/app/api/chat/{persona,skills,routines/catalog,routines/quick,library,cron/persona}`.
Tables: migration `20261112b_persona_wiki.sql` (applied to production 2026-11-12).

## 7. Open

1. **Never run on a real mailbox.** The Gmail/Calendar collector and the real model calls are
   untested (no Google credentials locally, the local Anthropic key is at its limit). Verified with a
   stand-in model against the production database: stages, lease, retries, citations, pages,
   suggestions, system block.
2. Refresh rewrites pages from new evidence plus the previous text; old source lists are not carried
   over. A fact ledger with validity intervals would fix that and enable Gmail `history.list` sync.
3. `gmail.readonly` is a restricted Google scope: fine in Testing, needs CASA before the public can
   connect (see STATE_OF_ORTIS_STUDIO §6). With the `verified` profile the wiki builds from calendar,
   imports and Röbel data only.
4. Routine runs still use each bot's own route; catalog prompts assume the Google tools.
5. Team tab, per-routine memory, "report bad suggestion", Röbel App screen for the wiki.
