# Org Events Dashboard — Design Spec

**Date:** 2026-07-01
**Scope:** `apps/web` — give every org account full event management inside its own
dashboard (`/dashboard/events`), and re-point the public "Bearbeiten" button to that
dashboard instead of the admin area.

## Goal

Each org account already has a dashboard at `/dashboard/*`. Today `/dashboard/events`
only lists events (read-only) and the "Bearbeiten" button on a public event pushes the
owner into the **admin** dashboard. This spec makes the org dashboard the single home
for an org's events: list + overview stats, full create/edit/delete, draft/publish,
duplicate, RSVP (interest) management, per-event stats, and a proof-of-attendance QR
linked to the Circles "Röbel Münzen" reward rail.

## Confirmed decisions

- **Publish = go live immediately.** Org "Veröffentlichen" sets `events.status='approved'`
  (public). "Zurückziehen" sets `status='draft'` (private). New events default to `draft`.
  No admin approval gate for org-published events.
- **RSVP reuses the existing `event_interests` table** (do NOT create `event_rsvps`).
  `event_interests(id, event_id→events.id, user_wallet, created_at)` already exists
  (26 rows / 23 events) and the public [`EventInterestButton`](../../../apps/web/src/components/app/EventInterestButton.tsx)
  already writes to it. The dashboard surfaces this data; optionally relabel the public
  button "Interessiert?" → "Ich komme" (cosmetic).
- **Attendance proof links to the Circles reward rail.** RSVP = intent; the Smart-Event-QR
  `event_attend` reward = proof. The QR↔event relationship does **not** exist yet and is
  implemented here.

## Live-schema facts (verified via Supabase MCP, project `wwbeqhkslxdxhktqzqti`)

- `events` columns: `id, title, description, date (date), time, end_time, location,
  organizer_name/email/phone, category, status (varchar, NULLABLE, NO check constraint),
  image_url, website_url, ticket_price, max_attendees, is_popular, latitude, longitude,
  place_id, formatted_address, address_components, is_recurring, livestream_url,
  livestream_active, account_id→accounts.id, audio_url, is_cancelled`.
  - **There is no `starts_at` column.** The current `/dashboard/events/page.tsx` orders by
    `starts_at` (a latent bug returning an error/empty). Order by `date` + `time` instead.
  - Because `status` has no CHECK constraint, adding the value `'draft'` needs **no**
    migration. Public event queries already filter `status='approved'`, so drafts stay hidden.
- `reward_events` columns: `id, label, starts_at, expires_at, active, created_by,
  max_rewards`. **No `event_id`.** No FK links `reward_events`↔`events` in either direction.
- `reward_claims(wallet, action, reference_id, status, ...)`, unique `(wallet, action,
  reference_id)`; RLS = service-role only. For `action='event_attend'`, all real claims key
  off **`reward_events.id`** (verified: 3/3 claims match `reward_events.id`, 0 match
  `events.id`).

## Data model changes

1. **`reward_events.event_id`** — `uuid NULL REFERENCES public.events(id) ON DELETE SET NULL`,
   plus `idx_reward_events_event ON reward_events(event_id)`. This is the QR↔event link.
2. **`event_interests`** — reused as-is. Ensure a unique index on `(event_id, user_wallet)`
   exists (add `IF NOT EXISTS` if missing); no other change.
3. **`events.status`** — no DDL; the app starts using `'draft'` alongside
   `pending/approved/rejected`.

## Routes (all under the existing org dashboard, gated by `AccountContext` + org account)

- `/dashboard/events` — **list + overview KPIs**. Tabs: *Bevorstehend / Vergangen /
  Entwürfe*. Rows show title, date, status badge (Veröffentlicht / Entwurf / Abgesagt),
  inline mini-stats (Aufrufe, Interessierte), and actions: Bearbeiten, Duplizieren,
  Veröffentlichen/Zurückziehen, Ansehen (public), Löschen.
- `/dashboard/events/new` — org create form (replaces the old "Neues Event" → `/app/submit`).
- `/dashboard/events/[id]/edit` — org edit page, **new target of "Bearbeiten"**. Tabs:
  - **Details** — the event form.
  - **Anmeldungen** — interest/RSVP list (names resolved from `user_wallet` via
    display-name resolution, never raw `0x…`) + count + CSV export.
  - **Statistik & QR** — per-event stats + Smart-Event-QR panel.

## Org event form (`OrgEventForm`)

Reuses leaf components from the admin editor (`ImageUploadDropzone`,
`AudioUploadDropzone`, `CATEGORIES`, event-dates management). Fields: title, description,
image, audio, date, time, end_time, location, category, organizer_name/email/phone,
website_url, ticket_price, max_attendees, is_cancelled, livestream_url, livestream_active,
recurring dates. **Excluded (admin-only):** `is_popular` ("Event des Tages") and the raw
approval `status` dropdown — replaced by the draft/publish toggle. The form also shows the
"QR-Code über Circles Playground erstellen" link (see below).

## Server actions (`apps/web/src/app/actions/org-events.ts`)

All verify ownership via `isAccountOwner(account_id, callerWallet)` and are **required**
(not optional as in the legacy `updateEvent`). They only write org-permitted fields so
`is_popular` is never clobbered.

- `createOrgEvent(accountId, formData, callerWallet, { publish })` → insert with
  `account_id`, `status = publish ? 'approved' : 'draft'`. Returns new id.
- `updateOrgEvent(eventId, formData, callerWallet, { publish })` → update org fields;
  `status` set only from the publish toggle; never touches `is_popular`.
- `setEventPublished(eventId, published, callerWallet)` → `status = 'approved' | 'draft'`.
- `duplicateOrgEvent(eventId, callerWallet)` → clone the row as a new `draft` (copies
  event_dates; does not copy the QR).
- `deleteOrgEvent(eventId, callerWallet)` → owner-verified delete (reuse existing
  `deleteEvent` semantics).
- `getOrgEventInterests(eventId, callerWallet)` → owner-verified read of `event_interests`
  for the event, each row resolved to a display name for the list + CSV.
- `createEventQr(eventId, callerWallet)` → **service-role** insert into `reward_events`
  (`event_id`, `label = event.title`, `starts_at`, `created_by = wallet`, `max_rewards`
  cap), one QR per event; returns `reward_events.id` → `https://www.roebel.app/e/<id>`.
- `getEventAttendance(eventId, callerWallet)` → **service-role** count of `reward_claims`
  where `action='event_attend'` and `reference_id = <linked reward_events.id>` (status
  `paid`).

Service-role reads/writes use the same service client pattern as the existing
`apps/web/src/app/api/muenzen/*` routes (reward_* tables are RLS service-role only).

## Stats

- **Overview (top of `/dashboard/events`):** total events, upcoming count, drafts, total
  Interessierte (`event_interests`), total Aufrufe (`event_views`), events-this-month.
- **Per-event (Statistik & QR tab):** Aufrufe (`event_views`), Interessierte +
  Auslastung vs `max_attendees`, Erfahrungen (`event_experiences`), Anwesende/Nachweis
  (`reward_claims` via `getEventAttendance`), status.

## Proof-of-attendance QR (Circles reward rail)

- **Statistik & QR tab** shows:
  - If no QR linked: "Smart-Event-QR erstellen" → `createEventQr`. Also a
    "QR-Code über Circles Playground erstellen" external link:
    `https://circles.gnosis.io/playground?url=https%3A%2F%2Fcircles-inviter.vercel.app%2F`.
  - If a QR is linked: printable QR for `https://www.roebel.app/e/<reward_events.id>` and
    the **live attendance count** from `getEventAttendance`.
- The same "QR-Code über Circles Playground erstellen" link also appears on the event
  create/edit form as requested.

### Governance note (constraint, not blocking)

`event_attend` pays real Münzen from the funder float. Org-created QRs are therefore
constrained: **one QR per event**, a sane `max_rewards` cap, created only for a
**published** event, and remain visible/manageable to admins in
`/admin/dashboard/muenzen/belohnungen`. Amount is small (5 Münzen, once per wallet).

## The one-line fix

`apps/web/src/components/app/EventOwnerActions.tsx` — change the "Bearbeiten" href from
`/admin/dashboard/events/${eventId}/edit` to `/dashboard/events/${eventId}/edit`.
Ownership is already enforced by `isOwnerOf(accountId)`; the new edit route re-verifies.

## Non-goals (this iteration)

- No changes to the admin event editor or the admin approval workflow.
- No new payment/ticketing flow (ticket_price stays an informational field).
- No automatic linking of historical `reward_events` to events (only new org-created QRs
  set `event_id`).

## Out-of-scope future ideas

- Backfill/link existing `reward_events` to events by label/date.
- Attendance-vs-interest funnel charts; per-event trend over time.
- Relabel/rework the public interest button into an explicit RSVP with capacity gating.
