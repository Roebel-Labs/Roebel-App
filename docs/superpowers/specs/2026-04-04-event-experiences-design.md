# Event Experiences Feature — Design Spec

## Context

The event detail page (`apps/expo/app/event/[id].tsx`) currently shows event information but has no way for attendees to share their experiences. Users want a comment-like section at the bottom of the event detail page where they can post text, images, videos, and an optional mood emoji — creating a community memory of each event. These experiences are scoped to the event and do **not** appear in the main feed.

## Requirements

- Experiences section at the bottom of the event detail page (above "Weitere Veranstaltungen")
- Any logged-in user (wallet connected) can post — no verified-citizen gate
- Each experience supports: text (max 500 chars), up to 4 images, 1 video, and an optional emoji
- Emoji selection: curated row of ~8 emojis, optional (can skip), selected emoji renders large in the card
- Experiences are paginated, ordered newest-first
- Authors can delete their own experiences (soft delete)
- Experiences do NOT appear in the feed — they are event-scoped only

## Data Model

### New Table: `event_experiences`

| Column           | Type          | Constraints / Default              |
|------------------|---------------|------------------------------------|
| `id`             | UUID          | PK, `gen_random_uuid()`            |
| `event_id`       | UUID          | NOT NULL, FK → `events.id`         |
| `wallet_address` | TEXT          | NOT NULL                           |
| `content`        | TEXT          | NOT NULL, max 500 chars            |
| `media_urls`     | TEXT[]        | Nullable, max 4 entries            |
| `video_url`      | TEXT          | Nullable                           |
| `emoji`          | TEXT          | Nullable, single emoji character   |
| `status`         | TEXT          | `'published'` / `'deleted'`, default `'published'` |
| `created_at`     | TIMESTAMPTZ   | Default `now()`                    |

**Index:** `(event_id, created_at DESC)` for paginated queries.

**RLS Policies:**
- SELECT: anyone can read where `status = 'published'`
- INSERT: authenticated users (wallet_address matches auth context)
- UPDATE: authors can set `status = 'deleted'` on their own rows

### TypeScript Type

```typescript
// In apps/expo/lib/types/feed.ts (or a new events types file)
export type EventExperience = {
  id: string;
  event_id: string;
  wallet_address: string;
  content: string;
  media_urls: string[] | null;
  video_url: string | null;
  emoji: string | null;
  status: 'published' | 'deleted';
  created_at: string;
  author: PostAuthor; // joined from users table
};
```

## UI Design

### Layout Position

In `app/event/[id].tsx`, inserted **after** the action buttons row and **before** the "Weitere Veranstaltungen" section:

```
... existing event detail content ...
│ [Zum Kalender]  [Teilen]        │  ← Existing action buttons
├─────────────────────────────────┤
│  Erlebnisse (X)        [+ Erlebnis teilen] │  ← NEW: Experience section header
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │ 😍  (48px emoji, if set) │  │  ← Large emoji at top of card
│  │ [Avatar] Username  · 2h  │  │  ← PostAuthorRow (reused)
│  │ "Was für ein tolles..."   │  │  ← Content text
│  │ [image grid]              │  │  ← PostImageGrid (reused)
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ [Avatar] Username  · 1d  │  │  ← No emoji variant
│  │ "Der Markt war super..."  │  │
│  │ [img] [img]               │  │
│  └───────────────────────────┘  │
│       Mehr laden...             │  ← Pagination button
├─────────────────────────────────┤
│  Weitere Veranstaltungen        │  ← Existing section
```

### ExperienceComposer (Bottom Sheet or Inline)

Triggered by the "+ Erlebnis teilen" button:

```
┌─────────────────────────────────┐
│  Erlebnis teilen          [✕]   │  ← Title + close
├─────────────────────────────────┤
│  😍 🎉 😂 👍 🤩 ❤️ 🙏 🌟      │  ← Curated emoji row (tap to toggle)
├─────────────────────────────────┤
│  [TextInput: Erzähl von...]     │  ← Multiline, 500 char limit
├─────────────────────────────────┤
│  [📷 Bilder] [🎥 Video]        │  ← Media buttons
│  [image preview thumbnails]     │  ← If images selected
├─────────────────────────────────┤
│  [        Teilen        ]       │  ← Submit button (disabled until content)
└─────────────────────────────────┘
```

### Emoji Display in Card

- If `emoji` is set: rendered at **48px** font size, centered or left-aligned above the author row
- If `emoji` is null: card starts directly with the author row (no gap)

## Components

### New Components

| Component | Path | Responsibility |
|-----------|------|----------------|
| `ExperienceSection` | `components/events/ExperienceSection.tsx` | Container: section header with count, FlatList of experiences, load-more button, empty state ("Noch keine Erlebnisse — sei der Erste!") |
| `ExperienceItem` | `components/events/ExperienceItem.tsx` | Single experience card: emoji (large), author row, content text, image grid, video player, delete action for author |
| `ExperienceComposer` | `components/events/ExperienceComposer.tsx` | Creation UI: emoji picker row, text input, media picker buttons, upload progress, submit |

### Reused Components

| Component | Source | Usage |
|-----------|--------|-------|
| `PostAuthorRow` | `components/feed/PostAuthorRow.tsx` | Author avatar, name, timestamp, verification badge |
| `PostImageGrid` | `components/feed/PostImageGrid.tsx` | Responsive 1-4 image layout |
| `uploadFile()` | `context/CreatePostContext.tsx` | Extract and reuse Supabase storage upload logic |

## Supabase Queries

### New File: `lib/supabase-experiences.ts`

```typescript
fetchEventExperiences(eventId: string, page: number, pageSize = 15)
// SELECT * FROM event_experiences
// WHERE event_id = $1 AND status = 'published'
// JOIN users ON wallet_address (for author data)
// ORDER BY created_at DESC
// LIMIT pageSize OFFSET page * pageSize

createExperience(input: {
  event_id: string;
  wallet_address: string;
  content: string;
  media_urls?: string[];
  video_url?: string;
  emoji?: string;
})
// INSERT INTO event_experiences
// Returns full record with joined author

deleteExperience(experienceId: string)
// UPDATE event_experiences SET status = 'deleted' WHERE id = $1
```

## Storage

Reuse existing `post-media` Supabase Storage bucket.

Upload path: `experiences/{walletAddress}/{timestamp}-{randomId}.{ext}`

- Images: max 5MB, JPEG quality 0.8
- Videos: max 50MB, max 60 seconds

## Migration

New SQL migration file: `supabase/migrations/005_event_experiences.sql`

```sql
CREATE TABLE event_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  content TEXT NOT NULL,
  media_urls TEXT[],
  video_url TEXT,
  emoji TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_experiences_event_created
  ON event_experiences (event_id, created_at DESC);

-- RLS policies should mirror existing patterns from supabase-posts-schema.sql
-- Adjust auth checks to match how the app authenticates with Supabase (thirdweb wallets)
ALTER TABLE event_experiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published experiences"
  ON event_experiences FOR SELECT
  USING (status = 'published');

CREATE POLICY "Authenticated users can insert"
  ON event_experiences FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authors can soft-delete own experiences"
  ON event_experiences FOR UPDATE
  USING (true)
  WITH CHECK (status = 'deleted');
```

## Verification Plan

1. **Migration**: Run the SQL migration against Supabase, verify table and indexes exist
2. **Create experience**: Open event detail → tap "+ Erlebnis teilen" → write text, pick emoji, add image → submit → verify it appears in the list
3. **Without emoji**: Create experience without selecting emoji → verify card renders cleanly without emoji row
4. **Media**: Create experience with 4 images → verify grid renders correctly. Create with video → verify playback
5. **Pagination**: Create >15 experiences → verify "Mehr laden" button loads next page
6. **Delete**: Author taps delete on own experience → verify soft delete, card disappears
7. **Empty state**: View event with no experiences → verify "Noch keine Erlebnisse" message
8. **Feed isolation**: Verify experiences do NOT appear in main feed or rathaus feed
9. **Theme**: Check light and dark mode rendering
