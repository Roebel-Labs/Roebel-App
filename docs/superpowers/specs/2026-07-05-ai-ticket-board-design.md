# AI-Ticket-Board (Dev-Tickets) — Design

**Date:** 2026-07-05
**Status:** Approved by Max (design review 2026-07-05)
**Repo:** `Roebel-Labs/Roebel-App` (git remote `origin`)

## Goal

A Trello-style ticket management system in the web admin dashboard that turns
user feedback — reported in the Mecky chat or via the existing feedback form —
into actionable dev tickets, lets an AI implement approved fixes as GitHub
pull requests, and lets a human review and merge them into `main`.

Two human gates, always:

1. **Gate 1 — start:** No AI fix runs until an admin clicks "Fix mit KI" on a
   ticket. AI-created tickets land in the Inbox column and wait.
2. **Gate 2 — merge:** Every AI-created PR is reviewed by a human and merged
   explicitly (from the dashboard when CI is green, or directly on GitHub).
   No auto-merge, ever.

## Context (what exists today)

- **Mecky chat is not persisted.** The Expo screen
  (`apps/expo/app/messages/mecky.tsx`) keeps conversation state in React
  memory (`context/MeckyContext.tsx`) and calls the Anthropic API directly
  from the client (`lib/services/anthropic-chat.ts`, model `claude-sonnet-4-6`).
  Mecky is NOT part of the Supabase DM system — no `conversations` /
  `direct_messages` rows. Mecky has 17 tools (`lib/tools/mecky-tools.ts`).
- **A feedback system exists**: Supabase table `feedback`
  (`feedback_type`: bug_report | feature_request | improvement | general;
  `status`: new | in_review | resolved | closed; `subject`, `message`,
  `contact_email`, `contact_phone`, `device_info`), with an Expo form
  (`apps/expo/app/feedback.tsx` + `lib/supabase-feedback.ts`), web forms, and
  an admin triage page (`apps/web/src/app/admin/dashboard/feedback/page.tsx`).
- **AI GitHub rails exist**: `.github/workflows/` already runs
  `anthropics/claude-code-action@v1` (pr-triage, release-notes,
  security-review) with the `ANTHROPIC_API_KEY` secret set. There is no
  runtime GitHub API usage in the app (no octokit, no `GITHUB_TOKEN`).
- **Admin dashboard patterns**: signed-cookie session (`dashboard-session`,
  `lib/auth/session.ts`), API routes gated with `requireAdmin()` +
  `jsonError()` (see `lib/muenzen/api.ts`), client pages polling `/api/*`
  (gemeinschaftskasse pattern), shadcn/Radix UI kit, dnd-kit installed and
  used (`components/admin/restaurants/menu-tab.tsx`), Vercel AI SDK
  (`@ai-sdk/anthropic`) for Claude calls.
- **Naming collision**: "tickets" in this codebase means Stripe event tickets
  (`api/tickets`, webhook). The new domain is therefore `dev_tickets` /
  `/api/dev-tickets`. The admin page route `/admin/dashboard/tickets` is free
  and used for the board.

## Architecture

```
User in Mecky chat ──reportProblem tool──▶ feedback (existing, source='mecky')
User in feedback form ────────────────────▶ feedback (existing)
                                                 │
                                   AI triage (Vercel cron + board button)
                                                 │ creates
Admin (manual create) ─────────────▶ dev_tickets ◀── kanban board CRUD
                                                 │ Gate 1: "Fix mit KI"
                                   workflow_dispatch → ticket-fix.yml
                                   (claude-code-action fixes on a branch, opens PR)
                                                 │ Gate 2: human review
                                   Merge (squash) → main, ticket → Fertig
```

All server logic lives in `apps/web` API routes (service-role Supabase +
GitHub REST via plain `fetch`). New infra = one GitHub workflow + one
fine-grained PAT.

## Data model (Supabase migration)

### `dev_tickets` (new)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `title` | text | |
| `description` | text | markdown |
| `type` | text | `bug` \| `feature` \| `task` \| `improvement` |
| `priority` | text | `low` \| `medium` \| `high` \| `urgent` |
| `status` | text | `inbox` \| `backlog` \| `in_progress` \| `in_review` \| `done` \| `rejected` |
| `position` | double precision | ordering within a kanban column |
| `source` | text | `manual` \| `mecky` \| `feedback_form` |
| `source_feedback_id` | uuid fk → `feedback.id` | nullable |
| `ai_analysis` | jsonb | repro steps, suspected code area, severity rationale, dedup notes |
| `github_branch` | text | `ticket/<short-id>-<slug>` |
| `github_pr_number` | int | nullable |
| `github_pr_url` | text | nullable |
| `fix_status` | text | `none` \| `queued` \| `running` \| `pr_open` \| `failed` \| `merged` |
| `created_at` / `updated_at` | timestamptz | |

### `dev_ticket_activity` (new)

`id`, `ticket_id` fk, `author` (`admin` \| `ai` \| `system`), `body` (text),
`created_at`. Holds admin comments AND automatic log entries (status changes,
"PR #N geöffnet", "Fix fehlgeschlagen: …", "Gemergt").

### `feedback` (alter)

Add `source` text (`app_form` \| `web_form` \| `mecky`), default `app_form`
for existing rows (web forms set `web_form` going forward).

### RLS

`dev_tickets` + `dev_ticket_activity`: service-role only (all access goes
through admin-gated API routes). Mecky writes to `feedback` through the
already-permitted client insert path — the app's anon key never touches
`dev_tickets`.

## Mecky `reportProblem` tool (Expo, v1)

New tool in `apps/expo/lib/tools/mecky-tools.ts` following the existing
pattern (definition + executor + `ToolResult` with a confirmation
`displayType`):

- **Input** (written by the model, no history plumbing): `summary` (short
  German title), `details` (what happened, expected vs. actual),
  `category` (`bug` \| `feature` \| `improvement`), `conversation_context`
  (Mecky's own excerpt/summary of the relevant chat turns).
- **Executor**: inserts into `feedback` via `lib/supabase-feedback.ts` with
  `feedback_type` mapped from category, `source='mecky'`,
  `subject=summary`, `message=details + "\n\n---\nKontext aus dem Chat:\n" +
  conversation_context`, auto-collected `device_info`.
- **System prompt** (`lib/prompts/mecky-system-prompt.ts`): when a user
  describes a bug, problem, or wish, Mecky offers to file a report, confirms
  the summary with the user first, files it, and confirms it was sent to the
  team. Mecky never files without the user's OK in-chat.
- Consent: unchanged — the tool only exists inside the already consent-gated
  Mecky chat.

Out of scope v1: the web Mecky route (`api/chat/mecky`) has no tools today
and stays tool-less.

## AI triage: feedback → ticket

- **Endpoint**: `POST /api/dev-tickets/triage` (admin-gated) + a Vercel cron
  entry; the board has an "Import & Triage" button calling the same endpoint.
- **Input**: `feedback` rows with `status='new'` and `feedback_type` in
  (bug_report, feature_request, improvement) — `general` feedback stays in
  the existing feedback admin page untouched.
- **Model call**: `@ai-sdk/anthropic` `generateObject`, model
  `claude-sonnet-4-6`, prompt includes the feedback row + the list of open
  ticket titles/summaries for dedup.
- **Output per row**: `{ actionable: boolean, duplicate_of_ticket_id?: uuid,
  title, description, type, priority, ai_analysis }`.
  - actionable + not duplicate → create `dev_tickets` row in `inbox`,
    activity entry "Von KI aus Feedback #… erstellt", feedback →
    `in_review`.
  - duplicate → activity entry on the existing ticket, feedback →
    `in_review` with a link.
  - not actionable → feedback stays `new` for human triage in the old page.
- **Idempotency**: `source_feedback_id` unique-checked before insert;
  a feedback row is only ever triaged once (any `in_review` marker skips it).
- Failures leave feedback rows at `new`; the next cron run retries.

## Kanban board — `/admin/dashboard/tickets`

- **Columns** (German): Eingang (`inbox`), Backlog, In Arbeit
  (`in_progress`), Review (`in_review`), Fertig (`done`), Abgelehnt
  (`rejected`).
- **Drag & drop**: dnd-kit (`DndContext` + `SortableContext`), same idiom as
  `components/admin/restaurants/menu-tab.tsx`; drop persists `status` +
  `position` (float midpoint ordering).
- **Cards**: title, type badge, priority badge, source icon
  (Mecky / Formular / Manuell), fix-status chip ("PR #123 · CI ✓" etc.).
- **Detail view**: Radix Sheet — description (markdown), KI-Analyse, source
  feedback incl. Mecky chat excerpt, activity feed + comment box,
  edit-in-place for title/description/type/priority, and actions:
  - **Fix mit KI** (Gate 1) — visible in any pre-done status with
    `fix_status` in (none, failed)
  - **PR ansehen** — external link when `pr_open`
  - **Mergen** (Gate 2) — enabled only when the GitHub poll reports
    mergeable + CI green
  - **Ablehnen** / delete (with confirm dialog)
- **Create dialog**: title, description, type, priority → lands in Backlog
  (manual tickets skip Inbox).
- **Data**: client components, `fetch` → `/api/dev-tickets/*`
  (`requireAdmin()` + `jsonError()` pattern from `lib/muenzen/api.ts`), 30s
  polling while any ticket has an active `fix_status` (gemeinschaftskasse
  pattern). UI text German, primary `#00498B`, shadcn/Radix components.
- **API routes**: `GET/POST /api/dev-tickets`, `PATCH/DELETE
  /api/dev-tickets/[id]`, `POST /api/dev-tickets/[id]/comments`,
  `POST /api/dev-tickets/triage`, `POST /api/dev-tickets/[id]/fix`,
  `GET /api/dev-tickets/[id]/github`, `POST /api/dev-tickets/[id]/merge`.

## GitHub fix pipeline

- **Workflow** `.github/workflows/ticket-fix.yml`:
  - `on: workflow_dispatch` with inputs `ticket_id`, `title`,
    `instructions` (ticket description + `ai_analysis` rendered to text).
  - Steps: checkout `main` → `anthropics/claude-code-action@v1` (existing
    `ANTHROPIC_API_KEY` secret) with a prompt to implement the fix, commit to
    branch `ticket/<short-id>-<slug>`, and open a PR whose body links the
    dashboard ticket and states it was AI-generated from user feedback.
  - Existing CI (`ci.yml`) and AI security review run on the PR
    automatically.
- **Dispatch**: `POST /api/dev-tickets/[id]/fix` → GitHub REST
  `POST /repos/{repo}/actions/workflows/ticket-fix.yml/dispatches` → set
  `fix_status='queued'`, `github_branch`, ticket `status='in_progress'`
  (auto-move to In Arbeit), activity entry.
- **Status sync (polling, no webhooks)**: `GET /api/dev-tickets/[id]/github`
  looks up the PR by head branch, returns PR state + check-runs + mergeable +
  merged. Board polling updates `fix_status`
  (`queued → running → pr_open → merged` / `failed`) and auto-moves the
  ticket to Review when the PR opens and to Fertig when merged — including
  merges done directly on GitHub.
- **Merge**: `POST /api/dev-tickets/[id]/merge` → GitHub REST
  `PUT /pulls/{n}/merge` with `merge_method: squash`. Only callable when the
  latest poll shows mergeable + CI green (server re-checks before merging).
- **Auth**: fine-grained PAT for `Roebel-Labs/Roebel-App` in Vercel env
  `GITHUB_TICKETS_TOKEN`; permissions: Actions RW (dispatch), Contents RW
  (merge), Pull requests RW. Repo slug in env `GITHUB_TICKETS_REPO`
  (default `Roebel-Labs/Roebel-App`). Plain `fetch` to `api.github.com` —
  no octokit dependency.
- **Timeout**: if no PR exists 30 minutes after dispatch, the poll marks
  `fix_status='failed'` with a system activity entry and re-enables the
  retry button.

## Error handling

- Workflow dispatch non-2xx → `fix_status='failed'`, activity entry with the
  GitHub error, toast in UI.
- Missing `GITHUB_TICKETS_TOKEN` → 500 with explicit German message
  ("GitHub-Token fehlt — GITHUB_TICKETS_TOKEN in Vercel setzen").
- Triage/model errors → feedback stays `new`, retried next cron; endpoint
  returns per-row results so partial failures are visible.
- Merge conflicts / red CI → Mergen stays disabled with the reason shown;
  admin resolves on GitHub.

## Testing & verification

- No test framework exists in `apps/web`; verification is end-to-end:
  1. File a report through Mecky in the Expo app → row appears in `feedback`
     with `source='mecky'`.
  2. Run triage → ticket appears in Eingang with plausible `ai_analysis`.
  3. Approve a trivial real bug → workflow runs → PR opens → board shows
     Review + CI status.
  4. Merge from the dashboard → PR squash-merged into `main`, ticket Fertig.
- Triage prompt sanity-checked against a handful of real/sample feedback
  rows (actionable, duplicate, and noise cases) before wiring the cron.
- Note: repo has ~431 pre-existing tsc errors (untyped Supabase client);
  CI on the AI PRs is the meaningful gate, not local tsc.

## Manual setup required (Max)

1. Create a fine-grained PAT on `Roebel-Labs/Roebel-App` (Actions RW,
   Contents RW, Pull requests RW).
2. Add `GITHUB_TICKETS_TOKEN` (+ optional `GITHUB_TICKETS_REPO`) to Vercel
   env for `apps/web`.
3. Confirm the `ANTHROPIC_API_KEY` repo secret still has quota for
   claude-code-action runs.

## Out of scope (v1)

- Tools for the web Mecky chat route.
- Notifying the reporting user when their fix ships (nice follow-up: DM via
  `send-notification`).
- GitHub webhooks (polling is sufficient at this volume).
- Auto-fix without Gate 1, auto-merge of any kind.
- Migrating/replacing the existing admin feedback page (it stays as the raw
  triage surface; tickets link back via `source_feedback_id`).
