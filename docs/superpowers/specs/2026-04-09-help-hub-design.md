# Help Hub ("Hilfe & Tipps") — Design Spec

## Context

The Röbel App introduces novel civic technology UX that many users — especially older residents — haven't encountered before. To help users discover features and learn the app, we're building an in-app help hub inspired by Google Pixel's "My Pixel" app. It provides tutorials, feature discovery, and town onboarding content, all managed dynamically from Supabase (with a future web admin dashboard for content management).

## Entry Point

A new menu item **"Hilfe & Tipps"** on the profile page (`app/profile.tsx`) pushes to `/help`.

## Screens

### 1. Help Home (`app/help/index.tsx`)

Fixed layout, scrollable:

1. **Header**: Back arrow + "Hilfe & Tipps" title
2. **Featured hero card**: The single collection where `is_featured = true`. Full-width card with `cover_image_url` background, title, subtitle. Taps into collection detail.
3. **Grid collections**: 2-column grid of non-featured collections. Each card shows `icon_url` (square image) + `title`. Taps into collection detail.
4. **Discover video feed**: Section title "Entdecke mehr über Röbel". Vertical list of video cards from `help_videos` table. Each card shows `thumbnail_url`, `title`, duration + date. Tapping opens `youtube_url` via `Linking.openURL()`.

### 2. Collection Detail (`app/help/[collectionId].tsx`)

1. **Hero area**: Collection's `cover_image_url` as background with title + subtitle overlaid (like My Pixel's "What's new" detail). Back arrow returns to help home.
2. **Items list**: Vertical list of `help_items` for this collection, sorted by `display_order`. Each row: square `icon_url` thumbnail (48x48, rounded 12px) + `title` + `subtitle`. Tapping pushes to item detail.

### 3. Item Detail (`app/help/item/[itemId].tsx`)

Paginated walkthrough of all items in the parent collection. Receives `itemId` + `collectionId` as params, fetches all sibling items.

1. **Header bar**: Back arrow + item `title` (text, truncated with ellipsis). Back returns to collection detail.
2. **Content area** (scrollable):
   - Hero media card: rounded container showing `hero_media_url` (image via `<Image>` or video via `<Video>` based on `hero_media_type`). If null, no hero shown.
   - Title (bold, larger — this is the content heading, e.g. "Deine Stimme für Röbel")
   - Body text (`body_text`)
   - Numbered steps (from `steps` JSON array) — each step: numbered circle + text
3. **Bottom pagination bar** (sticky):
   - Left arrow: navigates to previous item. Dimmed/disabled on first item.
   - Action button (center): only shown when `action_enabled = true`. Label from `action_label`, navigates to `action_route` via `router.push()`.
   - Right arrow: navigates to next item. Dimmed/disabled on last item.

## Supabase Schema

### Table: `help_collections`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | gen_random_uuid() | PK |
| title | text | — | Required. "Erste Schritte" |
| subtitle | text | null | Optional description |
| icon_url | text | null | Square icon for grid display |
| cover_image_url | text | null | Hero image for featured/detail |
| display_order | integer | 0 | Sort position on help home |
| is_featured | boolean | false | Shows as hero card at top (max 1) |
| is_published | boolean | false | Draft/publish toggle |
| created_at | timestamptz | now() | Auto |

### Table: `help_items`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | gen_random_uuid() | PK |
| collection_id | uuid | — | FK → help_collections.id, ON DELETE CASCADE |
| title | text | — | Required. Shown in header bar + item list |
| subtitle | text | null | Short teaser for list display |
| icon_url | text | null | Square icon/illustration for list |
| hero_media_url | text | null | Image or video URL for detail hero |
| hero_media_type | text | 'image' | 'image' or 'video' |
| body_text | text | null | Main description paragraph |
| steps | jsonb | null | ["Step 1 text", "Step 2 text", ...] |
| action_enabled | boolean | false | Toggle for action button |
| action_label | text | null | Button text, e.g. "Zur Abstimmung" |
| action_route | text | null | In-app route, e.g. "/governance" |
| display_order | integer | 0 | Sort within collection (pagination order) |
| is_published | boolean | false | Draft/publish toggle |
| created_at | timestamptz | now() | Auto |

### Table: `help_videos`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | gen_random_uuid() | PK |
| title | text | — | Required. "Willkommen in Röbel" |
| thumbnail_url | text | — | Video thumbnail image |
| youtube_url | text | — | Full YouTube link |
| duration | text | — | Display string, e.g. "2:30" |
| published_date | date | — | Display date |
| display_order | integer | 0 | Sort position |
| is_published | boolean | false | Draft/publish toggle |
| created_at | timestamptz | now() | Auto |

### RLS Policies

All three tables: public read access for published rows (`is_published = true`). No write access from client — content managed via admin dashboard (future) or direct Supabase dashboard.

```sql
-- Same pattern for all three tables:
ALTER TABLE help_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read published" ON help_collections
  FOR SELECT USING (is_published = true);
```

## Data Fetching

New file: `lib/supabase-help.ts`

Following existing patterns from `supabase-news.ts`, `supabase-proposals.ts`:

- `fetchHelpCollections()` — all published collections, ordered by `display_order`
- `fetchHelpCollection(id)` — single collection by ID
- `fetchHelpItems(collectionId)` — all published items for a collection, ordered by `display_order`
- `fetchHelpVideos()` — all published videos, ordered by `display_order`

## Components

All in `components/help/`:

- **HelpHeroCard** — featured collection card (full-width, image background, title overlay)
- **HelpCollectionCard** — grid card (icon + title)
- **HelpItemRow** — list row for collection detail (icon thumbnail + title + subtitle)
- **HelpVideoCard** — video card (thumbnail, play icon overlay, title, duration + date)
- **HelpPaginationBar** — bottom bar with prev/next arrows + optional action button

## Navigation

```
Profile menu → "Hilfe & Tipps" → /help (Stack push)
                                    → /help/[collectionId] (Stack push)
                                        → /help/item/[itemId] (Stack push)
                                    → YouTube (Linking.openURL)
```

All screens use Stack navigation (expo-router `router.push()`). No new tab or layout group needed.

## Styling

- `StyleSheet.create()` + `useTheme()` — following existing app patterns
- Theme colors from `constants/theme.ts` (lightColors/darkColors)
- Card border radius: 12-16px
- Icon thumbnails: 48x48, border-radius 12px
- Spacing: 16px horizontal padding, 8-12px gaps
- Typography: Inter family, existing size tokens

## Verification

1. Create the three Supabase tables via SQL editor
2. Insert seed data: 2-3 collections, 3-5 items per collection, 2-3 videos
3. Run `pnpm start` in apps/expo, open on iOS simulator
4. Navigate: Profile → "Hilfe & Tipps" → verify help home renders collections + videos
5. Tap a collection → verify collection detail shows items list
6. Tap an item → verify detail shows content + pagination arrows work
7. Toggle action_enabled on an item → verify action button appears and navigates
8. Tap a video card → verify YouTube opens externally
9. Test dark mode: verify all screens respect theme colors
10. Test empty states: verify graceful handling when no data exists
