# Home Feed — Stories Bar, Post Bar & App Tab

**Date:** 2026-04-09  
**Scope:** apps/expo — home feed UX redesign

---

## Context

The home feed currently has two tabs ("Für dich" and "Stadt") and no quick post entry point. The user wants:

1. A **post bar** at the top (tap → post creation screen)
2. A **third "App" feed tab** for app-related community discussions
3. A **Facebook-style horizontal event story bar** on the "Für dich" tab showing this week's events
4. A **full-screen story viewer** that opens when tapping an event story card, with a swipe-up gesture to reach the event detail page

---

## 1. Post Bar

A tappable row placed directly below the app header (`Röbel` title + messenger icon), above the tab bar.

**Layout:** user avatar (small, circular) + placeholder text `"Teile etwas mit Röbel"` + image icon  
**Behavior:** tapping anywhere on the row navigates to `/create?feedType=<activeTab>` so the post composer pre-fills the correct destination feed  
**Visibility:** always visible across all tabs

**New component:** `components/feed/PostBar.tsx`  
**Integration:** rendered in `FeedHome.tsx` as part of the FlatList `ListHeaderComponent`, between the app header and `FeedTabBar`

---

## 2. "App" Tab — Third Feed Type

A third filter tab alongside "Für dich" and "Stadt" for community discussion about the app itself (ideas, feature requests, general discussions).

**Tab label:** `App`  
**FeedType value:** `'app'` (extend union in `lib/types/feed.ts`)  
**Content:** posts with `feed_type = 'app'`, paginated, no events or sponsored content injected  
**Post creation:** users can post to the App feed via `/create` — the composer will need to support selecting `feed_type: 'app'` (same mechanism as existing `main`/`rathaus` selection)

**Files to modify:**
- `lib/types/feed.ts` — add `'app'` to `FeedType`
- `components/feed/FeedTabBar.tsx` — add "App" tab (3rd item)
- `components/feed/FeedHome.tsx` — handle `activeTab === 'app'` in rendering logic
- `hooks/useFeed.ts` — handle `'app'` feed type (posts only, no feed assembly)
- `lib/supabase-posts.ts` — pass `feed_type = 'app'` filter in query
- `app/create/index.tsx` — allow selecting App as feed destination

---

## 3. Event Story Bar ("Für dich" tab only)

A horizontal scroll strip shown at the top of the "Für dich" feed content area, between the tab bar and the first feed item.

**Data:** approved events this week — `status = 'approved' AND date >= today AND date <= sunday of current week`  
**Limit:** fetch up to 10 events  
**Ordering:** ascending by date  
**Requires join:** `account` (for `avatar_url`, `name`) via `account_id`

**Story card layout (90×140 dp):**
- Event image as full-card background (or colored placeholder if none)
- Organizer avatar (22dp circle, top-left, white border) — from `event.account.avatar_url`
- Bottom gradient overlay with event title + date label
- Rounded corners (14dp)

**First card — "Veranstaltung erstellen":**
- Dashed border, dark background
- Blue `+` circle (centered, top half)
- Label: `"Veranstaltung\nerstellen"`
- Tap → `router.push('/submit-event')`

**New component:** `components/feed/EventStoryBar.tsx`  
**New hook/query:** `fetchThisWeekEvents()` in `lib/supabase-events.ts` (or inline in component)  
**Integration:** rendered inside `FeedHome.tsx` `ListHeaderComponent` when `activeTab === 'main'`, below the tab bar

---

## 4. Event Story Viewer

A full-screen modal that opens when the user taps an event story card (not the "create" card).

**Layout:**
- Event image fills the full screen width and height (using `resizeMode: 'cover'`)
- **Top area:**
  - Progress bars (one per event in the story bar, current highlighted) — horizontal strip below status bar
  - Organizer avatar (38dp, white border) + org name + event time — below progress bars
  - Close button (✕) — top-right
- **Bottom area (lower ~30% of screen):**
  - Black gradient from transparent to near-opaque, bottom-to-top
  - Event title (large, white, bold)
  - Event metadata: date + location (smaller, white/70%)
  - `↑` animated bounce arrow + `"Mehr erfahren"` label — centered

**Interactions:**
- **Tap left half** → go to previous event story
- **Tap right half** → go to next event story
- **Swipe up** → navigate to `/event/[id]` (closes viewer)
- **Tap "Mehr erfahren" / the CTA area** → also navigates to `/event/[id]`
- **Close button** → dismiss modal, return to feed
- Progress bar auto-advances after ~5 seconds (optional, can be skipped in v1)

**Implementation:** React Native `Modal` (fullscreen) — no separate route needed  
**New component:** `components/feed/EventStoryViewer.tsx`  
**State:** `selectedStoryIndex: number | null` managed in `EventStoryBar` or `FeedHome`

---

## 5. Data Flow

```
FeedHome
 ├── PostBar                         → tap → /create
 ├── FeedTabBar (main | rathaus | app)
 ├── [if main] EventStoryBar         → fetchThisWeekEvents()
 │    └── EventStoryViewer (modal)   → state: selectedIndex
 └── FlatList (existing feed items)
```

The story events are fetched independently of the main feed (`useFeed`) — a separate lightweight query in `EventStoryBar` with its own loading state.

---

## 6. Files Affected

| File | Change |
|------|--------|
| `lib/types/feed.ts` | Add `'app'` to `FeedType` |
| `lib/supabase-events.ts` | Add `fetchThisWeekEvents()` |
| `lib/supabase-posts.ts` | Support `feed_type = 'app'` in queries |
| `hooks/useFeed.ts` | Handle `'app'` tab (posts only) |
| `components/feed/FeedTabBar.tsx` | Add "App" tab |
| `components/feed/FeedHome.tsx` | Add PostBar, EventStoryBar to header, handle app tab |
| `components/feed/PostBar.tsx` | **New** — post entry bar |
| `components/feed/EventStoryBar.tsx` | **New** — horizontal story scroll |
| `components/feed/EventStoryViewer.tsx` | **New** — full-screen story modal |
| `app/create/index.tsx` | Allow `feed_type: 'app'` selection |

---

## 7. Verification

1. **Post bar:** tap row → `/create` opens; user avatar shows from active account
2. **App tab:** switching to "App" tab shows only `feed_type = 'app'` posts; creating a post with App destination appears in App tab
3. **Story bar:** appears only on "Für dich" tab; shows events from current week; "Veranstaltung erstellen" card is always first; tapping event card opens viewer
4. **Story viewer:** image fills screen; org avatar + name visible; swipe up / tap CTA opens `/event/[id]`; left/right tap navigates between events; close dismisses modal
5. **No regression:** "Stadt" and "Für dich" tabs continue to work as before
