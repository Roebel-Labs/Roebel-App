# Event Engagement & Management — Design Spec

## Context

The Expo app currently lacks engagement features on events. Users can bookmark events locally but can't express interest or see social proof of who else is interested. Event creators (personal accounts or org accounts) have no way to view stats or manage their events from mobile. The web app already has an `event_interests` table and `EventInterestButton` — this feature brings parity to Expo and adds view tracking, creator stats, and CRUD.

**Goals:**
- Let users express interest in events with a satisfying "Interessiert" interaction
- Show social proof (avatar stack + count) on event cards and detail pages
- Track unique event views per user in Supabase
- Give event creators a management screen with stats (views, interests) and CRUD
- Introduce org account roles (Owner / Admin / Member) for shared event management

---

## 1. Data Layer

### 1.1 Existing: `event_interests` table

Already in production, used by the web app. Schema:
- `id` UUID (PK)
- `event_id` UUID (FK → events)
- `user_wallet` TEXT (user's wallet address)
- `created_at` TIMESTAMPTZ

No changes needed. Expo will read/write to the same table.

### 1.2 New: `event_views` table

Tracks unique views per user per event.

```sql
CREATE TABLE IF NOT EXISTS public.event_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, wallet_address)
);

CREATE INDEX idx_event_views_event ON public.event_views(event_id);
CREATE INDEX idx_event_views_wallet ON public.event_views(wallet_address);
```

Record a view via upsert (ON CONFLICT DO NOTHING) when the event detail page loads.

### 1.3 Extend: `account_owners` table — add `role` column

```sql
ALTER TABLE public.account_owners
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner'
CHECK (role IN ('owner', 'admin', 'member'));
```

Existing rows keep `role = 'owner'` (the default).

**Permissions matrix:**

| Action | Owner | Admin | Member |
|--------|-------|-------|--------|
| View events + stats | Yes | Yes | Yes |
| Create events | Yes | Yes | No |
| Edit events | Yes | Yes | No |
| Delete events | Yes | Yes | No |
| Invite/remove members | Yes | No | No |
| Change member roles | Yes | No | No |
| Delete account | Yes | No | No |

---

## 2. Expo Service Layer

### 2.1 `lib/supabase-interests.ts`

Functions:
- `toggleInterest(eventId: string, walletAddress: string): Promise<'added' | 'removed'>` — check existence, insert or delete, return action
- `getInterestCount(eventId: string): Promise<number>` — count rows for event
- `getInterestedUsers(eventId: string, limit?: number): Promise<{ wallet_address: string, username: string | null, profile_picture_url: string | null }[]>` — join with `users` table for avatar stack
- `isInterested(eventId: string, walletAddress: string): Promise<boolean>` — check if user is interested

### 2.2 `lib/supabase-event-views.ts`

Functions:
- `recordView(eventId: string, walletAddress: string): Promise<void>` — upsert (ON CONFLICT DO NOTHING)
- `getViewCount(eventId: string): Promise<number>` — count unique views

### 2.3 `lib/supabase-account-roles.ts`

Functions:
- `getAccountRole(accountId: string, walletAddress: string): Promise<'owner' | 'admin' | 'member' | null>` — fetch role from `account_owners`
- `canEditEvents(role: string | null): boolean` — returns true for owner/admin
- `canManageMembers(role: string | null): boolean` — returns true for owner only
- `updateMemberRole(accountId: string, walletAddress: string, newRole: string): Promise<void>`

---

## 3. Context

### 3.1 `context/InterestContext.tsx`

Similar pattern to `BookmarksContext.tsx`:
- On mount: fetch all event IDs the current user is interested in
- Exposes `useInterest()` hook with:
  - `isInterested(eventId: string): boolean`
  - `toggleInterest(eventId: string): Promise<'added' | 'removed'>` — optimistic update, reverts on error
  - `interestCounts: Map<string, number>` — cached counts, updated on toggle
- Wraps the app in `InterestProvider` (add to `_layout.tsx`)

---

## 4. UI Components

### 4.1 `components/InterestButton.tsx` — Card compact icon

**Placement:** New row at the bottom of `EventCard.tsx` content, below meta row (price/location), separated by 1px `border-top` in `colors.border`.

**Layout:**
```
┌─────────────────────────────────────┐
│ [AvatarStack] 24 interessiert    ♡  │
└─────────────────────────────────────┘
```

- Left: `AvatarStack` (max 3, size `small` = 24px) + count text (11px, `colors.textSecondary`)
- Right: Heart outline icon (20px, `colors.primary` stroke)
- Active state: Filled red heart (#E53935), text changes to "Du + {count-1} weitere"
- On tap: Heart.png plop animation (see Section 5), then filled heart
- If user is not connected (guest): tapping heart does nothing visually; the button is still visible but non-interactive (opacity 0.5). Interest count + avatar stack still display.

**Props:**
```typescript
type InterestButtonProps = {
  eventId: string;
  compact?: boolean; // true for HorizontalEventCard
};
```

Also integrate into `HorizontalEventCard.tsx` with `compact` mode (smaller avatars, shorter text).

### 4.2 `components/InterestCTA.tsx` — Detail page CTA

**Placement:** Below event title/date section, above the info cards (date/location/price). In `app/event/[id].tsx`, inserted after `titleSection` and before `infoCards`.

**Layout:**
```
┌─────────────────────────────────────┐
│         ♡  Interessiert             │  ← Full-width button
└─────────────────────────────────────┘
  [👤][👤][👤][+21]  24 Personen sind interessiert
```

**Default state:**
- Button: `colors.primary` (#194383) background, white text, white heart icon, border-radius 12px, padding 14px
- Below: AvatarStack (max 4, size `large` = 28px) + "{count} Personen sind interessiert"

**Active state:**
- Button: White background, 2px border #E53935, red text, filled red heart
- Below: "Du und {count-1} weitere sind interessiert", user's avatar first in stack

**Props:**
```typescript
type InterestCTAProps = {
  eventId: string;
};
```

### 4.3 `components/AvatarStack.tsx` — Reusable

**Props:**
```typescript
type AvatarStackProps = {
  users: { avatar_url: string | null; username: string | null }[];
  maxVisible?: number;      // default 3
  size?: 'small' | 'large'; // small=24px, large=28px
  totalCount?: number;       // for "+N" overflow badge
};
```

**Rendering:**
- Overlapping circles, each offset left by ~60% of diameter
- 2px white border on each circle
- If no `avatar_url`: show initials (first 2 chars of username, uppercased) on colored background
- If more users than `maxVisible`: last circle shows "+{remaining}" in gray (#e0e0e0) background
- z-index descends left to right so leftmost avatar is on top

### 4.4 Integration into existing event cards

**`EventCard.tsx`:** Add interest row below `metaRow`, with `InterestButton` component.

**`HorizontalEventCard.tsx`:** Add compact interest row below content.

**`app/event/[id].tsx`:** Add `InterestCTA` after `titleSection`, before `infoCards`. Add view recording in `useEffect` (call `recordView()` alongside existing `logEventView()`).

---

## 5. Heart.png Plop Animation

**Asset:** `apps/expo/assets/icons/Heart.png` (Roebel coat of arms in heart shape)

**Trigger:** On tap of heart icon (both card and detail CTA)

**Sequence (600ms total):**

1. **0ms — Tap:** Outline heart icon hides. `Heart.png` `Image` component appears at scale 0, opacity 1.
2. **0–200ms:** Scale 0 → 1.5, rotate 0° → -15°. Curve: `Animated.spring({ toValue: 1.5, damping: 6, stiffness: 250, useNativeDriver: true })`
3. **200–350ms:** Hold at scale ~1.5 with subtle wobble. `Animated.delay(150)` or spring settling.
4. **350–500ms:** Scale 1.5 → 0.85, rotate -15° → 5°. `Animated.spring({ toValue: 0.85, damping: 10, stiffness: 200 })`
5. **500–600ms:** Heart.png fades out (opacity → 0). Filled red SVG heart appears with scale 0.85 → 1.0 settle. `Animated.spring({ toValue: 1, damping: 12, stiffness: 200 })`

**Implementation:** Use `Animated.sequence()` + `Animated.parallel()` with `useNativeDriver: true` for all transforms. The Heart.png image is absolutely positioned on top of the heart icon area.

**Deactivation animation (300ms):** Simpler — filled heart shrinks to 0.6x with slight rotation, then outline heart appears and scales to 1.0x.

---

## 6. My Events Management Screen

### 6.1 `app/my-events.tsx`

**Access:** New button on `profile.tsx`, placed directly below "Veranstaltung einsenden" button. Label: "Meine Veranstaltungen" with a list/grid icon.

**Behavior:** Shows events for the **currently active account** only. If user switches account (via AccountContext), the list updates.

**Layout:**
```
┌─────────────────────────────────────┐
│  ← Meine Veranstaltungen           │  ← Header with back button
├─────────────────────────────────────┤
│                                     │
│  ┌───┐  Hafenfest Roebel           │
│  │img│  12. Apr 2026               │
│  │   │  ● Genehmigt                │  ← Green badge
│  └───┘  👁 142  ♡ 24               │  ← View + interest stats
│                                     │
│  ┌───┐  Adventsmarkt               │
│  │img│  01. Dez 2026               │
│  │   │  ○ Ausstehend               │  ← Yellow badge
│  └───┘  👁 0   ♡ 0                 │
│                                     │
│  (empty state: "Noch keine          │
│   Veranstaltungen erstellt")        │
└─────────────────────────────────────┘
```

**Event row:**
- Left: Event thumbnail (60x60, rounded 8px)
- Middle: Title (15px, Inter-Medium), date (12px, textSecondary), status badge
- Right area (below date): Eye icon + view count, heart icon + interest count
- Tap → navigate to `edit-event/[id].tsx`

**Status badges:**
- `approved` → "Genehmigt" green (#4CAF50)
- `pending` → "Ausstehend" yellow/amber (#FFA726)
- `rejected` → "Abgelehnt" red (#E53935)

**Permission check:** Fetch events where `account_id` matches active account. All roles (owner/admin/member) can view.

### 6.2 `app/edit-event/[id].tsx`

**Access:** Tap on event row in my-events screen.

**Form:** Reuses the field layout from `submit-event.tsx` — title, date, time, location, description, category, image, etc. All fields pre-filled with current event data.

**Permission check:** Only users with `owner` or `admin` role on the event's account can see edit/delete buttons. Members see a read-only view of the event details + stats.

**Actions:**
- **Save:** Updates event in Supabase, resets `status` to `'pending'`, navigates back to my-events. Shows snackbar: "Änderungen gespeichert — wird erneut geprüft".
- **Delete:** Confirmation modal ("Veranstaltung endgültig löschen?"). On confirm: deletes from Supabase, navigates back. Shows snackbar: "Veranstaltung gelöscht".

**Stats section:** At the top of the edit screen, show a stats bar: view count + interest count + experience count. Read-only, always visible to all roles.

---

## 7. Verification

### Manual testing:
1. **Interest toggle:** Open event card, tap heart → Heart.png plop animation plays → filled heart shows → avatar stack updates with "Du + X weitere". Tap again → deactivates. Verify in Supabase that `event_interests` row is created/deleted.
2. **Interest CTA:** Open event detail, tap "Interessiert" button → same animation → button style changes to outlined red → avatar stack shows "Du und X weitere sind interessiert". Toggle off.
3. **View tracking:** Open event detail → verify `event_views` row is created in Supabase (check with Supabase dashboard). Re-open same event → verify no duplicate row (upsert).
4. **Cross-platform sync:** Express interest in Expo → check web app shows updated count. Express interest on web → check Expo reflects it.
5. **My Events screen:** Navigate to profile → tap "Meine Veranstaltungen" → verify events list shows for active account only. Switch account → verify list updates.
6. **Edit event:** Tap event in my-events → verify form is pre-filled → change title → save → verify status resets to "pending" in Supabase.
7. **Delete event:** Tap delete → confirm → verify event is removed from Supabase and my-events list.
8. **Roles:** As member, verify my-events shows events but edit/delete buttons are hidden. As admin, verify full CRUD works. As owner, verify member management works.
9. **Empty states:** New account with no events → "Noch keine Veranstaltungen erstellt" message.

### Key files to modify:
- `apps/expo/app/_layout.tsx` — add InterestProvider
- `apps/expo/components/EventCard.tsx` — add interest row
- `apps/expo/components/HorizontalEventCard.tsx` — add compact interest row
- `apps/expo/app/event/[id].tsx` — add InterestCTA + view recording
- `apps/expo/app/profile.tsx` — add "Meine Veranstaltungen" button

### Key files to create:
- `apps/expo/context/InterestContext.tsx`
- `apps/expo/lib/supabase-interests.ts`
- `apps/expo/lib/supabase-event-views.ts`
- `apps/expo/lib/supabase-account-roles.ts`
- `apps/expo/components/InterestButton.tsx`
- `apps/expo/components/InterestCTA.tsx`
- `apps/expo/components/AvatarStack.tsx`
- `apps/expo/app/my-events.tsx`
- `apps/expo/app/edit-event/[id].tsx`

### Supabase migrations:
- `supabase/migrations/008_event_views.sql`
- `supabase/migrations/009_account_roles.sql`
