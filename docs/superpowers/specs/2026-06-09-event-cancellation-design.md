# Event Cancellation ("Abgesagt") — Design

**Date:** 2026-06-09

## Goal

Let an admin remotely mark a whole event as cancelled in the web admin dashboard,
and show a prominent red "Abgesagt" badge on that event in the Expo app.

This is a **separate, event-level** flag. It does NOT replace the existing
per-date `event_dates.is_cancelled` feature, which stays untouched.

## Decisions (confirmed with user)

- **Scope:** whole event — new `events.is_cancelled` column.
- **Badge location (Expo):** event card (list/feed) AND event detail screen.
- **Visibility:** cancelled events stay visible in the list, greyed out, with a
  red "Abgesagt" badge. No filtering of cancelled events from queries.

## Changes

### 1. Database (Supabase, via MCP migration)

```sql
ALTER TABLE public.events
  ADD COLUMN is_cancelled BOOLEAN NOT NULL DEFAULT false;
```

No backfill — defaults to `false` for all existing rows.

### 2. Web admin — remote toggle

- `apps/web/src/app/admin/dashboard/events/[id]/edit/page.tsx`
  - Add `is_cancelled: false` to `formData` state.
  - Hydrate `is_cancelled` from the fetched row in `fetchEvent`.
  - Add a `Switch` under the Status field labelled **"Event abgesagt"** with a
    hint that it shows a red Abgesagt banner in the app. Mirrors the existing
    livestream `Switch` pattern.

- `apps/web/src/app/actions/manage-events.ts` — `updateEvent`
  - Read `is_cancelled` from `formData` (`=== "true"`) and include it in the
    `.update({...})` payload.

### 3. Expo — badge display

- `apps/expo/lib/types.ts`: add `is_cancelled: boolean | null` to `EventRecord`.
- `apps/expo/components/EventCard.tsx`: when `event.is_cancelled`, overlay a red
  "ABGESAGT" badge on the image and dim the card (opacity ~0.6). Reuses the red
  tone already used for cancelled dates in `app/event/[id]/dates.tsx`.
- `apps/expo/app/event/[id].tsx`: prominent red "Abgesagt" banner near the header.

## Out of scope (YAGNI)

- No push notification on cancellation.
- No separate cancel button in the events list.
- No auto-cancelling of child `event_dates` rows.
- Toggle is reversible (un-cancel by toggling off).
