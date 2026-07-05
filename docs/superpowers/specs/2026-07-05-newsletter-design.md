# Röbel Newsletter — Design Spec

**Date:** 2026-07-05
**Status:** Approved by Max (design conversation, 2026-07-05)
**Scope:** apps/web only (admin dashboard + public pages + API routes) plus one Supabase migration.

## Goal

A German-language, AI-drafted weekly email newsletter for the Röbel App, fully managed
inside the existing `apps/web` admin dashboard: automated content generation, subscriber
management, and delivery via the already-configured Resend account (`roebel.app` domain,
`src/lib/resend.ts`).

**Flow:** every Friday a cron generates a draft issue from the week's app activity →
Max reviews/edits it in the existing Tiptap editor → Max clicks "Senden" → batch
delivery via Resend. **Nothing is ever sent without a manual click.**

## Decisions (from design conversation)

| Decision | Choice |
|---|---|
| Send flow | Cron generates **draft only**; send is always manual |
| Cadence | Weekly draft (Friday 06:00 UTC cron) |
| Content sources | News articles, events, DAO proposals/tallies, Marktplatz & Gewerbe, community posts |
| Subscriber sources | Public signup page (double opt-in), CSV import, invite existing app users, AGB auto-enroll (behind default-OFF toggle) |
| Delivery architecture | **Direct batch send** — Supabase is the single source of truth; `resend.batch.send` in chunks of 100; own unsubscribe tokens/pages; Resend webhook feeds status back. (Rejected: Resend Audiences + Broadcasts — two sources of truth, subscriber data at Resend, non-German unsubscribe UX.) |
| Language | All UI, emails, and generated content in German |

## 1. Data model — Supabase migration `newsletter.sql`

Three tables. RLS enabled, **no public policies** — all access via service-role client
(`lib/supabase/admin.ts`) from server actions / API routes.

### `newsletter_subscribers`
- `id` uuid PK default `gen_random_uuid()`
- `email` text NOT NULL, unique on `lower(email)` (store lowercased)
- `status` text NOT NULL default `'pending'` — `pending | active | unsubscribed | bounced | complained`
- `source` text NOT NULL — `signup | import | app_user | admin`
- `wallet_address` text NULL (link to `users` for app_user source)
- `confirm_token` uuid default `gen_random_uuid()` (double opt-in)
- `confirmed_at` timestamptz NULL
- `unsubscribe_token` uuid NOT NULL default `gen_random_uuid()`
- `unsubscribed_at` timestamptz NULL
- `consent_note` text NULL (documents legal basis, e.g. "AGB v2 accepted 2026-07-10")
- `created_at` / `updated_at` timestamptz

### `newsletter_issues`
- `id` uuid PK
- `subject` text NOT NULL, `preheader` text NULL
- `content_html` text NOT NULL default `''` (Tiptap HTML)
- `status` text NOT NULL default `'draft'` — `draft | sending | sent | failed`
- `generated_by` text — `ai | manual`
- `generation_sources` jsonb NULL (counts + ids of what the AI saw, for the admin UI)
- `recipient_count` int default 0, `delivered_count` int default 0, `opened_count` int default 0, `clicked_count` int default 0, `bounced_count` int default 0
- `sent_at` timestamptz NULL, `created_at` / `updated_at`

### `newsletter_sends`
- `id` uuid PK, `issue_id` uuid FK → issues, `subscriber_id` uuid FK → subscribers
- `email` text NOT NULL (snapshot), `resend_id` text NULL
- `status` text default `'queued'` — `queued | sent | delivered | bounced | complained | failed`
- `opened_at` / `clicked_at` timestamptz NULL, `created_at`
- UNIQUE `(issue_id, subscriber_id)` — enables retry of failed rows without duplicates

### AGB auto-enroll trigger
Postgres trigger on `public.users` (INSERT, and UPDATE OF `email` when previously NULL):
inserts `(email, source='app_user', status='active', wallet_address, consent_note)` into
`newsletter_subscribers` on conflict do nothing — **only when** `app_settings` key
`newsletter_auto_enroll` = `'on'`. Seed the key with `'off'`.
Legal note (flagged to Max): consent bundled into AGB is shaky under §7 UWG / DSGVO;
the toggle stays OFF until the AGB/Datenschutzerklärung contain the clause and Max
flips it deliberately.

## 2. AI generation

- **Cron:** add `{"path": "/api/cron/newsletter-draft", "schedule": "0 6 * * 5"}` to
  `apps/web/vercel.json`. Route follows the existing pattern (`Bearer ${CRON_SECRET}`,
  `runtime nodejs`, `maxDuration 300`).
- **Guard:** if a draft issue already exists that was created after the last sent issue,
  the cron skips (no draft pileup); the admin "Jetzt generieren" button can force a new one.
- **Gatherer** (`src/lib/newsletter/gather.ts`): queries everything since the last sent
  issue's `sent_at` (fallback: last 7 days), each source independently failable:
  - published news articles (title, excerpt, category, slug)
  - upcoming events in the next 14 days (title, date, location)
  - DAO: proposals created + tally results in window
  - Marktplatz: new listings; Gewerbe: newly published businesses
  - community posts: top N by likes in window (feed_type='main')
  - Exact table/column names are taken from the existing action/lib files during
    implementation (e.g. `src/app/actions/news.ts`); each query capped (e.g. 10 items).
- **Generator** (`src/lib/newsletter/generate.ts`): one `generateText` call via existing
  `@ai-sdk/anthropic`, model `claude-sonnet-5` (weekly single call; long-form German
  quality over haiku). Structured output (JSON): `subject`, `preheader`, `sections[]`
  ({heading, html}). Converted to Tiptap-compatible HTML (`h2/h3/p/ul/li/a/strong/em/hr`)
  and stored as a draft issue with `generation_sources`.
  Persona: warm, bürgernah, "Moin"-Ton, no CRC/Circles jargon (Röbel-Taler only),
  no wallet addresses (display names only) — reuse the app's copy rules.
- **Notification:** after draft creation, one email via Resend to the admin
  (`EMAIL_CONFIG.replyTo`) — "Newsletter-Entwurf bereit" with deep link to the editor.

## 3. Admin UI — `/admin/dashboard/newsletter`

Follows the news/announcements section patterns (server actions + client pages, sonner
toasts, existing UI components). Add nav entry in the admin dashboard layout.

- **Ausgaben (default tab):** issue list — subject, status badge, created/sent date,
  recipient + open counts. "Jetzt generieren" and "Neue Ausgabe" (blank manual) buttons.
- **Issue editor** (`/admin/dashboard/newsletter/[id]`):
  - subject + preheader inputs, existing `RichTextEditor` (bucket `news-images`)
  - **Vorschau** toggle: rendered inside the real email template (iframe, srcDoc)
  - **Test senden:** input + button, sends the real email to one address, no state change
  - **Senden:** confirm dialog showing live active-subscriber count → triggers send
  - **Neu generieren** (drafts only): re-runs the generator, overwrites content after confirm
  - Sent issues: read-only + per-issue stats (delivered/opened/clicked/bounced)
- **Abonnenten tab:** table (email, status, source, created) with search + status filter;
  manual add; CSV import (parse client-side, dedupe against existing, imported rows =
  `source 'import', status 'active'`); CSV export; row actions: unsubscribe, DSGVO-delete
  (hard delete). Header shows counts per status.
  **"Bestehende Nutzer einladen":** finds `users.email` not present in subscribers and
  sends each an opt-in invitation email (double opt-in — clicking the link confirms).
  Records invited emails (reuse `newsletter_subscribers` with `status 'pending'`,
  `source 'app_user'`) so re-running never double-invites.

## 4. Sending pipeline

`POST /api/admin/newsletter/send` (admin-authed like other admin routes, `maxDuration 300`):
1. Load issue, require `status='draft'`; snapshot all `active` subscribers.
2. Insert `newsletter_sends` rows (`queued`), set issue `status='sending'`.
3. Chunk into 100s → `resend.batch.send`; each email: from `Röbel App <hello@roebel.app>`,
   personal unsubscribe link, headers `List-Unsubscribe` (mailto + URL) and
   `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
4. Update send rows (`sent` + `resend_id`, or `failed`), throttle to respect ~2 req/s.
5. Finish: issue `status='sent'`, `recipient_count`, `sent_at`. If any rows failed the UI
   shows "X fehlgeschlagen — erneut senden" which re-runs only `failed` rows.

**Email template** (`src/lib/newsletter/template.ts`): hand-rolled inline-styled HTML
(same approach as `ticket-email.ts`) — navy `#00498B` header with the windmill logo
(hosted PNG from `apps/web/public`), max-width 600, Inter with system fallbacks, footer
with Impressum link, postal address, and "Abmelden" link. A small post-processor maps
Tiptap tags to inline styles (email clients ignore `<style>`).

## 5. Public pages (all German, no auth)

- **`/newsletter`** — signup: email input, consent sentence (Datenschutz link), submit →
  upsert subscriber `pending` + send double-opt-in confirmation email. Re-signup of an
  unsubscribed address re-sends confirmation. Never reveals whether an email already
  exists (silent success).
- **`/newsletter/bestaetigen?token=`** — validates `confirm_token` → `active` +
  `confirmed_at`; friendly success/error page.
- **`/newsletter/abmelden?token=`** — validates `unsubscribe_token`; GET shows a
  one-click "Abmelden" button + immediately processes `?token&confirm=1`; POST handler
  supports RFC 8058 one-click (List-Unsubscribe-Post). Sets `unsubscribed` + timestamp.
- Footer of the public site gets a "Newsletter" link (small touch, existing footer).

## 6. Resend webhook

`POST /api/newsletter/webhook` — verifies Svix signature with new env
`RESEND_WEBHOOK_SECRET` (raw body verify). Handles:
- `email.bounced` → send row `bounced`, subscriber `bounced`, issue `bounced_count++`
- `email.complained` → send row/subscriber `complained`
- `email.delivered` → send row `delivered`, issue `delivered_count++`
- `email.opened` / `email.clicked` → first-touch `opened_at`/`clicked_at` on send row,
  increment issue counts (first touch per recipient only)
Lookup via `resend_id`. Unknown ids → 200 (other email traffic shares the account).

## 7. Env & config

- Existing: `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, Supabase keys.
- New: `RESEND_WEBHOOK_SECRET` (Vercel; webhook endpoint configured in Resend dashboard).
- `EMAIL_CONFIG` gains `fromNewsletter: "Röbel App <hello@roebel.app>"`.
- `app_settings`: `newsletter_auto_enroll` = `'off'` (seeded by migration).

## 8. Error handling & edge cases

- Cron: each gather source try/caught independently — one broken source never kills the
  draft; AI failure → cron returns 500 (visible in Vercel), no issue row created.
- Send: per-batch try/catch; partial failure leaves issue `sent` with failed rows
  retryable; double-click protected by the `status='draft'` guard (first request flips
  to `sending`).
- Bounced/complained subscribers are excluded from all future sends (only `active` are
  snapshotted) — protects the roebel.app domain reputation.
- CSV import validates emails, skips invalid rows, reports skipped count.

## 9. Testing / verification

- Manual end-to-end: signup → confirm → appears active in admin; generate draft (button);
  edit; test send to own address (check rendering in Gmail + Apple Mail); real send to a
  2-subscriber test list; unsubscribe link; webhook events visible in stats.
- `pnpm build` for apps/web must pass (repo has known pre-existing tsc errors; no new ones
  in newsletter files).

## Out of scope (YAGNI)

- Segments/multiple lists, A/B testing, per-subscriber personalization beyond unsubscribe
  link, HTML template builder, scheduled send-later, analytics dashboards beyond per-issue
  counts, Expo app surfaces.
