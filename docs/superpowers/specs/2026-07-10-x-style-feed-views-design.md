# X-Style Feed Redesign + Impression Views — Design

**Date:** 2026-07-10
**Scope:** apps/expo (index feed), one Supabase migration
**Status:** Approved by Max (2026-07-10)

## Goal

Make the home feed (`app/index.tsx` → `FeedHome` → `FeedList`, all three tabs
main/rathaus/app) look like X/Twitter's timeline: full-width posts separated by
hairline borders instead of rounded white "widgets" floating on a gray
background. Add an X-style **views (impressions) count** to the post action
row. The existing comment/share/like row stays exactly as it is otherwise.

**Explicitly dropped during brainstorming:** repost/quote. The feed is a single
shared town-wide timeline — everyone already sees every post, so repost adds no
distribution value. No 🔁 button ships.

## Decisions (from brainstorming)

1. **Inner post layout unchanged** — author row on top, content full-width
   below. No X two-column avatar rail. Only the container changes.
2. **Views = impressions, X-style** — every on-screen appearance counts,
   deduped only per app session in memory. **No per-view table** (explicitly
   confirmed 3×): a plain counter column + batched RPC.
3. **No repost/quote feature at all.**
4. Views display: right-most in the action row, bar-chart icon + compact
   German count. Comment/share/heart keep today's layout and animations.

## A. Feed layout changes

### FeedList.tsx (structural change, one place)

- `contentContainerStyle`: remove `paddingHorizontal: 8` and `gap: 8`.
- List `style` background: `colors.feedBackground` → `colors.background` so
  post cells blend seamlessly (X-style flat surface). The `feedBackground`
  token itself stays (other screens still use it).
- Add `ItemSeparatorComponent`: full-width `View` with
  `height: StyleSheet.hairlineWidth`, `backgroundColor: colors.border`
  (#E5E7EB light / #3c4043 dark).
- **Non-post modules keep their widget look** inside full-width cells: in
  `renderItem`, wrap every item type EXCEPT `post`/`mecky` in a
  `moduleWrap` view (`paddingHorizontal: 8`, `paddingVertical: 8`) replacing
  the list padding/gap they relied on. Affected types: alert, sponsored,
  marketplace, event, news/cinema/restaurant/special-menu sections,
  governance_nudge, mecky_tip, audio_player, proposal, proposal_comment,
  proposal_hero.
  - `post_type === 'event_experience'` (FeedExperienceCard) is rendered from
    the `post` branch but is a rounded widget (radius 20) — it gets the
    `moduleWrap` treatment too, not the flat treatment.

### FeedPostCard.tsx

- Container: `borderRadius: 12` → 0 (delete the radius; keep
  `overflow: 'hidden'` only if needed for pressed overlay — verify visually).
- Keep paddings (16 horizontal / 14 vertical), background `colors.background`,
  pressed overlay, and everything inside the card exactly as today.
- Marketplace variant (`containerMarketplace`, radius 20): rendered through
  the same container, so it also goes flat (outer radius removed) while
  keeping its inner spacing (`paddingVertical: 16`, gap 14). The rounded
  linked-listing preview card inside still provides visual framing.

### FeedMeckyCard.tsx

- Same flattening as FeedPostCard: radius 12 → 0, rendered full-width (no
  `moduleWrap`).

### FeedPostSkeleton.tsx

- Outer container flattened to match (no radius, full width, same paddings as
  FeedPostCard). Inner shimmer blocks unchanged.

### Not touched

- `app/post/[id].tsx` layout, profile `UserPostsList`, `FeedHome` header/tab
  bar/story bar, every other screen. (Post detail only gains the views count
  in its existing `PostActions` row.)

## B. Views backend (Supabase)

New migration `apps/expo/supabase/migrations/post_views_count.sql`:

```sql
ALTER TABLE posts ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_post_views(p_post_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE posts
  SET views_count = views_count + 1
  WHERE id = ANY(p_post_ids)
    AND status = 'published';
$$;

GRANT EXECUTE ON FUNCTION increment_post_views(uuid[]) TO anon, authenticated;
```

- One call increments each listed post by exactly 1; the client is
  responsible for not re-sending ids it already counted this session.
- Applied via Supabase MCP (`apply_migration`), per repo rules.
- `FEED_POST_SELECT` uses `*`, so `views_count` flows into `PostRecord`
  automatically; add `views_count: number` to the `PostRecord` type.

## C. Views tracking + display (client)

### lib/viewTracker.ts (new, ~50 lines)

- Module-level `countedIds: Set<string>` (session dedup) and
  `pending: Set<string>`.
- `trackPostViews(ids: string[])`: ids not in `countedIds` → add to both sets;
  schedule a flush.
- Flush: debounced ~3 s, or immediately at ≥10 pending ids. Calls
  `supabase.rpc('increment_post_views', { p_post_ids: [...] })`,
  fire-and-forget, errors swallowed (views are best-effort). Pending set
  cleared on send (no retry — an impression lost is fine).

### Hook-in points

- `FeedList.onViewableItemsChanged` (existing callback, 70 % visible for
  200 ms — same rule as video autoplay): collect ids of viewable
  `post`/`mecky` items → `trackPostViews`. Applies to all three feed tabs.
- `app/post/[id].tsx`: on successful post load → `trackPostViews([id])`.
- Session dedup means feed-then-detail counts once.

### PostActions.tsx

- New optional prop `viewsCount?: number`.
- Row order: `💬 comment · ↗ share` (left, unchanged) … right group:
  `♥ like` (unchanged animations/colors), then **views right-most**:
  Ionicons `stats-chart-outline` (size 16, `colors.textTertiary`) + count in
  the same muted color. `marginLeft: 'auto'` moves from the heart to the
  views element; heart sits just left of it with the current gap (20).
- Hidden when `iconOnly` (marketplace) or `viewsCount` is 0/undefined.
- Count formatting: new `formatCompactCount(n)` util —
  `Intl.NumberFormat('de-DE', { notation: 'compact' })` (1200 → „1,2 Tsd.");
  plain number below 1000.
- Callers passing `viewsCount`: FeedPostCard, FeedMeckyCard,
  post/[id].tsx. FeedExperienceCard may pass it too (harmless), but its
  widget look is unchanged.

## Error handling

- RPC failure: silent (console.warn in dev). No user-facing error, no retry.
- Migration not yet applied: `views_count` is `undefined` on `PostRecord` →
  views element hidden (prop undefined), RPC fails silently. The app keeps
  working before/after the migration lands.

## Testing / verification

- Repo has no expo unit-test infra for components; verification is manual via
  the running app (per repo norms):
  1. Feed shows full-width posts, hairline separators, no gray gutters, in
     light + dark mode.
  2. Non-post modules (news section, sponsored deal, marketplace, proposal
     hero) still look like cards and don't touch screen edges.
  3. Scroll the feed → `posts.views_count` rises in Supabase (MCP SQL check);
     re-scrolling the same posts in one session does NOT bump again; app
     restart bumps again (X-style).
  4. Views count renders right-most, muted, compact-formatted; hidden at 0.
  5. Like animation, comment navigation, share sheet unchanged.
