# X-Style Feed Redesign + Views + App-Feed Repost/Quote — Design

**Date:** 2026-07-10 (v2 — supersedes the same-day v1 that had dropped repost)
**Scope:** apps/expo (index feed, post detail, profile), Supabase migrations
**Status:** Approved by Max (2026-07-10)

## Goal

1. Make the home feed (`app/index.tsx` → `FeedHome` → `FeedList`, tabs
   „Für Alle"/„Umfragen"/„App") look like X/Twitter's timeline: full-width
   posts separated by hairline borders instead of rounded widgets on gray.
   The inner post layout (author row on top, content full-width below) and
   the comment/share/like row stay as they are.
2. Add an X-style **views count** (impressions, fast-growing) with per-user
   tracking and a **creator-only viewer list**.
3. Add **repost + quote**, scoped: only posts in the **App feed** can be
   reposted/quoted; the repost/quote entry lands in the **main feed**
   („Für Alle") as a reference to the original — promoting App-tab content
   into the town-wide timeline. Reposts also show on the reposter's profile.

Icons: `assets/icons/repost.svg` and `assets/icons/view.svg` (already in repo).

## Decisions (from brainstorming)

1. Inner post layout unchanged — no X two-column avatar rail.
2. Views are impressions: **every viewport appearance counts** (no session
   dedup — deliberately fast-growing), tracked **per user** in a
   `post_views` table so the creator can see who viewed and how often.
   Only the post creator can open the viewer list.
3. Repost button only on App-feed posts; repost/quote entries land in the
   main feed. Quote = X-parity (drawer: „Reposten" / „Zitieren").
4. Reposts/quotes appear on the reposter's profile Beiträge tab with a
   „↺ hat repostet" marker.
5. Architecture: **reposts/quotes are `posts` rows** (`quoted_post_id`
   self-reference), NOT a separate repost table — feed pagination, profile
   lists, pinning, deletion, RLS all work unchanged.
6. Gate: creating a repost/quote follows the same rule as composing a post
   (PostingGate).

## A. Feed layout (X-style)

### FeedList.tsx

- `contentContainerStyle`: remove `paddingHorizontal: 8` and `gap: 8`.
- List background `colors.feedBackground` → `colors.background` (the
  `feedBackground` token stays for other screens).
- `ItemSeparatorComponent`: full-width hairline
  (`height: StyleSheet.hairlineWidth`, `backgroundColor: colors.border`).
- Non-post modules keep their widget look inside full-width cells: wrap every
  item type EXCEPT `post`/`mecky` in a `moduleWrap` view
  (`paddingHorizontal: 8`, `paddingVertical: 8`). Affected: alert, sponsored,
  marketplace, event, news/cinema/restaurant/special-menu sections,
  governance_nudge, mecky_tip, audio_player, proposal, proposal_comment,
  proposal_hero. `post_type === 'event_experience'` (FeedExperienceCard,
  radius 20) also gets `moduleWrap`.

### FeedPostCard.tsx / FeedMeckyCard.tsx / FeedPostSkeleton.tsx

- Flatten: `borderRadius` → 0, full width, paddings/pressed overlay/inner
  layout unchanged. Marketplace variant also flat; its rounded linked-listing
  preview inside provides framing. Skeleton matches.

### Not touched

- `FeedHome` header/tab bar/story bar, post detail layout, other screens.

## B. Database (one migration, applied via Supabase MCP)

`apps/expo/supabase/migrations/feed_views_reposts.sql`:

```sql
-- Views
ALTER TABLE posts ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS post_views (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  view_count integer NOT NULL DEFAULT 1,
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, wallet_address)
);
-- RLS: readable by anyone (viewer list is client-gated to the creator;
-- counts are public anyway), writes only via the RPC below.

CREATE OR REPLACE FUNCTION increment_post_views(p_post_ids uuid[], p_wallet text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- one impression per id per call; ids may repeat across calls
  INSERT INTO post_views (post_id, wallet_address)
    SELECT unnest(p_post_ids), p_wallet
  ON CONFLICT (post_id, wallet_address)
    DO UPDATE SET view_count = post_views.view_count + 1,
                  last_viewed_at = now();
  UPDATE posts SET views_count = views_count + 1
    WHERE id = ANY(p_post_ids) AND status = 'published';
END $$;
GRANT EXECUTE ON FUNCTION increment_post_views(uuid[], text) TO anon, authenticated;

-- Repost / quote
ALTER TABLE posts ADD COLUMN IF NOT EXISTS quoted_post_id uuid REFERENCES posts(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reposts_count integer NOT NULL DEFAULT 0;
-- post_type gains 'repost' and 'quote' (extend the CHECK constraint if one exists)

-- one plain repost per user per post
CREATE UNIQUE INDEX IF NOT EXISTS posts_one_repost_per_user
  ON posts (wallet_address, quoted_post_id)
  WHERE post_type = 'repost' AND status = 'published';

-- trigger: maintain reposts_count on the ORIGINAL for repost+quote rows
-- (insert +1, delete/status→deleted -1)
```

Additional trigger change: the existing feed-post push-notification trigger
(`feed_post_notifications.sql`, fires for every `feed_type='main'` insert)
must **skip `post_type = 'repost'`** rows (a plain repost must not push-notify
the town). Quotes keep notifying — they are real content.

Note: `increment_post_views` requires a wallet; views from a not-yet-connected
session are not counted (the app auto-connects wallets, so this is marginal).

## C. Views tracking + display

### lib/viewTracker.ts (new)

- Counts **every viewport appearance**: a post id is queued each time it
  becomes viewable; a per-post throttle (min ~10 s between counts for the
  same post) guards against scroll jitter, but there is NO session dedup.
- Batched flush: debounced ~3 s or ≥10 pending ids →
  `supabase.rpc('increment_post_views', { p_post_ids, p_wallet })`,
  fire-and-forget, errors swallowed. Duplicate ids across flushes are fine
  (each flush = +1 per id).

### Hook-in points

- `FeedList.onViewableItemsChanged` (existing 70 %/200 ms viewability):
  queue viewable `post`/`mecky` ids — all tabs.
- `app/post/[id].tsx`: queue the id on load.

### Display (PostActions.tsx)

- New props `viewsCount?: number`, `onViewsPress?: () => void`.
- Row: `💬 comment · ↗ share` (left, unchanged) … right group: `♥ like`
  (unchanged animations), then **views right-most** (`marginLeft: 'auto'`
  moves from heart to views): `view.svg` (18 px, `colors.textTertiary`) +
  compact count (`formatCompactCount`, `Intl.NumberFormat('de-DE',
  { notation: 'compact' })`).
- Hidden when `iconOnly` or count is 0/undefined.
- Tappable ONLY when `onViewsPress` is provided; callers pass it only when
  the signed-in wallet is the post author (`post.wallet_address` match,
  case-insensitive).

### Viewer list (creator only)

- New `components/feed/PostViewersDrawer.tsx` (BottomDrawer): title
  „Aufrufe", rows = avatar + display name + „×N", sorted by `view_count`
  desc. Data via new `getPostViewers(postId)` in `lib/supabase-posts.ts`
  (`post_views` joined to `users`).
- **Never show wallet addresses** (standing rule): name resolution
  account name → display name → username → „Jemand". Row is tappable only
  when a `username` exists → `router.push('/user/[username]')`.
- Available in feed cards and post detail (same drawer).

## D. Repost / quote

### Data flow

- Repost: `createPost({ post_type: 'repost', feed_type: 'main',
  quoted_post_id, content: '' })`. Quote: same with `post_type: 'quote'`
  and the user's text. Author = reposter (wallet or active org account).
- Undo repost: find own published repost row for that post → `deletePost`.
- `FEED_POST_SELECT` gains `reposts_count`, `quoted_post_id` (via `*`) and a
  self-join `quoted_post:posts!posts_quoted_post_id_fkey(…)` with the
  original's author/media/linked previews (one level deep — a quote of a
  quote renders the inner preview without further nesting).
- `PostRecord` type: add `views_count`, `reposts_count`, `quoted_post_id`,
  `quoted_post?: PostRecord`, and extend `PostType` with
  `'repost' | 'quote'`.
- New helper `getUserRepostedPostIds(postIds, wallet)` (mirrors
  `getUserLikedPostIds`) so the 🔁 icon can show the active/reposted state
  (primary color when already reposted).

### Rendering

- **Repost row** (`post_type === 'repost'`): FeedPostCard renders the
  **original** (`quoted_post`) — author row, content, media, actions — with a
  small header line above: `repost.svg` + „{Reposter} hat repostet"
  (`colors.textTertiary`, same style as the „Angeheftet" row; reposter name
  resolves via the standing no-wallet-addresses rule). All actions
  (like/comment/share/views/🔁) target the original post. If the original was
  deleted, the row renders nothing (skip in FeedList).
- **Quote row** (`post_type === 'quote'`): normal post card with the
  reposter's text, plus an embedded **QuotedPostPreview** card below the
  content (new component: hairline border, radius 12, mini author row,
  up to 3 lines of text, first image as thumbnail). Tap preview →
  `/post/[original id]`.
- **🔁 button**: added to PostActions between comment and share
  (`repost.svg`, 22 px) with `reposts_count`. Shown only when the acting
  post (original) is `feed_type === 'app'` — i.e. in the App tab, on
  App-post detail pages, and on main-feed repost/quote entries whose
  original is an App post. Tap → new `RepostDrawer` (BottomDrawer):
  „Reposten" (or „Repost rückgängig" when already reposted) / „Zitieren".
- **Quote composer**: PostComposer gains a `quotedPost` mode — shows the
  QuotedPostPreview under the text input, posts to main feed with
  `quoted_post_id`. Reachable only via the drawer.
- **Profile** (`UserPostsList` + `fetchUserPosts`): repost/quote rows are the
  user's own posts rows, so they appear automatically; the list renders the
  ↺ header / quoted preview accordingly (compact, read-only as today).
- Post detail (`/post/[id]`) of a repost row redirects to the original post's
  detail; detail of a quote row shows the quote with embedded preview.

## Error handling

- Views RPC failure: silent (dev-only warn). No retry — lost impressions are
  acceptable.
- Repost insert hitting the unique index (double-tap race): treat as
  already-reposted, sync icon state.
- Migration not yet applied: `views_count`/`reposts_count` undefined → views
  element and 🔁 count hidden; repost drawer actions fail gracefully with
  the existing error drawer.
- Deleted originals: repost rows skipped; quote rows render „Beitrag wurde
  gelöscht" placeholder in the preview slot.

## Testing / verification (manual, via running app + Supabase MCP)

1. Feed: full-width posts, hairline separators, no gray gutters, light+dark.
2. Non-post modules still look like cards, don't touch screen edges.
3. Scrolling bumps `posts.views_count` and `post_views.view_count`
   (re-scrolling the same post after >10 s bumps again — X-style).
4. Views element right-most, compact German format; tap works ONLY on own
   posts → viewer drawer with names ×counts; tapping a viewer opens
   `/user/[username]`; no wallet addresses anywhere.
5. App-tab post → 🔁 → „Reposten": entry appears in „Für Alle" with
   „↺ … hat repostet" header; actions on it affect the original; second
   repost attempt blocked; „Repost rückgängig" removes the entry.
6. „Zitieren": composer with embedded preview → quote lands in main feed;
   preview tap opens original.
7. Profile Beiträge tab shows the repost/quote with marker.
8. Plain repost does NOT push-notify; quote does.
9. Like animation, comment navigation, share sheet unchanged.
