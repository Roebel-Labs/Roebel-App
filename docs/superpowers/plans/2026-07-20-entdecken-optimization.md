# Entdecken (Explore) Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the Entdecken page — the content-heaviest screen — render progressively, download display-size images with disk caching, and stop fetching full news article bodies for card lists.

**Architecture:** Three independent levers. (E1) Apply `transformedImageUrl` + `cachePolicy="memory-disk"` to all 8 explore card components (the feed got this in the prior phase; explore never did). (E2) Split the single `['explore','all']` bundle query into 7 per-section persisted queries so each section renders as its data arrives, and trim `select('*')` to the columns the cards actually read (verified by code trace 2026-07-20; all detail screens re-fetch by id/slug, so trimming cannot break them). (E3) Convert the two explore sections that still use bare useEffect fetches (MiniAppsEntry, NearbyOrgAccountsSection) to persisted queries so they render instantly from cache too.

**Tech Stack:** Existing TanStack Query v5 + AsyncStorage persister (`meta: { persist: true }` contract in `apps/expo/lib/query-client.ts`), existing `apps/expo/lib/image-url.ts`.

## Global Constraints

- pnpm monorepo; StyleSheet + useTheme, NO NativeWind; German UI text unchanged; never show raw wallet addresses.
- Pathspec-only commits (`git add <files>`); user has unrelated dirty files (apps/expo/app.json, scratch-*.json) — never stage them. Push after every commit.
- USER DIRECTIVE (standing): skip typecheck/lint; commit and push immediately when edits are done.
- All paths relative to `apps/expo/`.
- `transformedImageUrl(url, {width, quality?})` is safe on ANY url (non-Supabase/video/gif/svg pass through; null→null). Default quality 75.

---

### Task E1: Image transforms + disk caching on all explore cards

**Files (modify):**
- `components/HorizontalEventCard.tsx` (image ~line 42: `event.image_url`)
- `components/SwipeableCardStack.tsx` (~lines 316 blurred bg + 325 sharp, both `event.image_url`)
- `components/MovieCard.tsx` (~line 31: `movie.cover_image_url`)
- `components/NewsCard.tsx` (~line 33: `article.cover_image_url`)
- `components/MarketplaceCard.tsx` (~lines 39, 72: `listing.media_urls[0]`)
- `components/BusinessDealCard.tsx` (~lines 32, 80: `deal.image_url`)
- `components/GastroCard.tsx` (~line 53 cover + ~63 logo)
- `components/OrgAccountCard.tsx` (~line 41 cover + ~51 avatar)

**Interfaces:** consumes `transformedImageUrl` from `@/lib/image-url`. No prop/API changes to any component.

- [ ] **Step 1:** In each file add `import { transformedImageUrl } from '@/lib/image-url';` and wrap the `source` uri, adding `cachePolicy="memory-disk"` and (where the component renders inside a FlatList) `recyclingKey={<original url expression>}`. Widths:

| Image | width | quality |
|---|---|---|
| SwipeableCardStack blurred background layer | **64** | **40** (it's blurred — tiny thumb suffices; this alone halves the hero's bytes) |
| SwipeableCardStack sharp foreground | 1080 | 75 |
| HorizontalEventCard, MovieCard, NewsCard, MarketplaceCard, BusinessDealCard, GastroCard cover, OrgAccountCard cover | 640 | 75 |
| GastroCard logo, OrgAccountCard avatar | 160 | 75 |

Pattern (read each file first; preserve every other prop, including contentFit and any onLoad):
```tsx
source={{ uri: transformedImageUrl(<existing-expression>, { width: 640 }) ?? undefined }}
cachePolicy="memory-disk"
recyclingKey={<existing-expression> ?? undefined}
```
For the blurred bg: `{ width: 64, quality: 40 }`.

- [ ] **Step 2:** Commit + push immediately:
```bash
git add apps/expo/components/HorizontalEventCard.tsx apps/expo/components/SwipeableCardStack.tsx apps/expo/components/MovieCard.tsx apps/expo/components/NewsCard.tsx apps/expo/components/MarketplaceCard.tsx apps/expo/components/BusinessDealCard.tsx apps/expo/components/GastroCard.tsx apps/expo/components/OrgAccountCard.tsx
git commit -m "feat(expo): Entdecken cards — display-size Supabase transforms + disk caching"
git push
```

NOTE: `NewsCard`/`MovieCard`/`MarketplaceCard`/`BusinessDealCard` are ALSO rendered by the SearchModal and other screens — the change is URL-level and prop-additive, safe everywhere they render. Do not touch `MiniAppCard` (its grid tile shows a 160px icon from the mini-app CMS; leave for a later pass).

---

### Task E2: Per-section persisted queries + column trimming in explore.tsx

**Files:**
- Modify: `app/explore.tsx`
- Modify: `components/NewsCard.tsx` (null-guard for trimmed `content`)
- Modify: `lib/utils.ts` (`calculateReadTime` guard)

**Interfaces:** none external; explore.tsx internal restructure.

- [ ] **Step 1:** In `lib/utils.ts`, make `calculateReadTime` null-safe: signature becomes `(content: string | null | undefined)`; return `null` when content is falsy (keep existing behavior otherwise). In `components/NewsCard.tsx`, where the read-time is computed/rendered, hide the read-time label when `calculateReadTime` returns null (conditional render; do NOT invent a substitute value). DELIBERATE TRADE-OFF: on Entdecken, news cards lose the read-time chip (the full body is no longer fetched for a card list); SearchModal and news detail keep it (their own queries still select content).

- [ ] **Step 2:** In `app/explore.tsx`, replace the single `fetchExploreData` + `useQuery(['explore','all'])` with 7 module-level fetchers and 7 persisted queries. Column trims are exactly these (verified against card render traces — do not widen, do not narrow further):

```ts
const EVENT_CARD_COLUMNS =
  'id, title, date, time, location, formatted_address, address_components, image_url, is_popular, is_cancelled, organizer_name';

async function fetchExploreEvents() {
  const { data } = await supabase
    .from('events')
    .select(EVENT_CARD_COLUMNS)
    .eq('status', 'approved')
    .gte('date', new Date().toISOString().split('T')[0])
    .order('date', { ascending: true })
    .order('time', { ascending: true, nullsFirst: true })
    .limit(60);
  return (data ?? []) as EventRecord[];
}

async function fetchExplorePopularEvents() {
  const { data } = await supabase
    .from('events')
    .select(EVENT_CARD_COLUMNS)
    .eq('status', 'approved')
    .eq('is_popular', true)
    .order('date', { ascending: true })
    .order('time', { ascending: true, nullsFirst: true })
    .limit(3);
  return (data ?? []) as EventRecord[];
}

async function fetchExploreNews() {
  const { data } = await supabase
    .from('news_articles')
    .select('id, slug, title, cover_image_url, author_name, published_at, excerpt')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(20);
  return (data ?? []) as NewsArticle[];
}

async function fetchExploreMovies() {
  const { data } = await supabase
    .from('movies')
    .select('id, title, date, cover_image_url, fsk, status')
    .eq('status', 'published')
    .order('date', { ascending: true });
  return (data ?? []) as MovieRecord[];
}

async function fetchExploreRestaurants() {
  const { data } = await supabase
    .from('restaurants')
    .select('id, slug, name, cover_image_url, logo_url, background_color, opening_hours, account_id')
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(50);
  return (data ?? []) as RestaurantRecord[];
}
// deals + listings keep their existing shared lib fetchers (other consumers rely on them):
//   fetchActiveDeals()  /  fetchMarketplaceListings({ limit: 10 })
```

Queries (all `meta: { persist: true }`):
```ts
const eventsQuery = useQuery({ queryKey: ['explore', 'events'], queryFn: fetchExploreEvents, meta: { persist: true } });
const popularQuery = useQuery({ queryKey: ['explore', 'popular-events'], queryFn: fetchExplorePopularEvents, meta: { persist: true } });
const newsQuery = useQuery({ queryKey: ['explore', 'news'], queryFn: fetchExploreNews, meta: { persist: true } });
const moviesQuery = useQuery({ queryKey: ['explore', 'movies'], queryFn: fetchExploreMovies, meta: { persist: true } });
const restaurantsQuery = useQuery({ queryKey: ['explore', 'restaurants'], queryFn: fetchExploreRestaurants, meta: { persist: true } });
const dealsQuery = useQuery({ queryKey: ['explore', 'deals'], queryFn: () => fetchActiveDeals(), meta: { persist: true } });
const listingsQuery = useQuery({ queryKey: ['explore', 'listings'], queryFn: () => fetchMarketplaceListings({ limit: 10 }), meta: { persist: true } });
```

Derived consts keep their existing names (`events = eventsQuery.data ?? []`, etc.).
**Progressive gate — USER DIRECTIVE (2026-07-20): loading states must ALWAYS be skeleton loaders.** Remove the page-level `loading` gate entirely. Each section renders: its content when its query has data; a **section skeleton** while its query `isPending` (first load with no cache); nothing when resolved-but-empty (existing behavior). Inspect the CURRENT loading UI in explore.tsx (whatever renders while `loading` is true today) and reuse/split those skeleton pieces per section — the repo's skeleton primitive is `components/SkeletonLoader.tsx` (`Skeleton`), already used by PostImageGrid. Keep skeleton shapes roughly matching each section's card rail (e.g., a horizontal row of 2-3 card-shaped skeletons). Do not introduce spinners/ActivityIndicator anywhere.
`onRefresh` refetches ALL seven in parallel:
```ts
const onRefresh = async () => {
  setRefreshing(true);
  await Promise.all([
    eventsQuery.refetch(), popularQuery.refetch(), newsQuery.refetch(), moviesQuery.refetch(),
    restaurantsQuery.refetch(), dealsQuery.refetch(), listingsQuery.refetch(),
  ]);
  setRefreshing(false);
};
```
Delete `fetchExploreData` and the old query. The old `['explore','all']` persisted entry becomes orphaned — harmless (7-day maxAge expiry).

- [ ] **Step 3:** Self-review: no remaining reference to the removed bundle; every field each section/card reads is in the trimmed selects (events filters need `formatted_address`/`address_components` — included; GastroCard needs `background_color`/`opening_hours`/`account_id` — included; NewsCard no longer reads `content` on this screen after Step 1). Commit + push:
```bash
git add apps/expo/app/explore.tsx apps/expo/components/NewsCard.tsx apps/expo/lib/utils.ts
git commit -m "feat(expo): Entdecken progressive per-section queries + column trimming (news body no longer fetched for cards)"
git push
```

---

### Task E3: Persisted queries for the independent explore sections

**Files:**
- Modify: `components/miniapp/MiniAppsEntry.tsx` (own `fetchLiveMiniApps()` in a useEffect today)
- Modify: `components/NearbyOrgAccountsSection.tsx` (own `fetchOrgAccountsBySubType('unternehmen')` + `fetchAccountVoteSummaries`)
- Modify: `components/RestaurantSection.tsx` (rating augmentation via `fetchAccountRatingSummaries`)

**Interfaces:** none external — each component keeps its props; only its internal data fetching changes.

- [ ] **Step 1:** Read each component. Replace the `useEffect`+`useState` fetch with `useQuery` (import from `@tanstack/react-query`):
  - MiniAppsEntry: `queryKey: ['explore', 'mini-apps']`, queryFn = existing `fetchLiveMiniApps()` call, `meta: { persist: true }`. Keep `useInstalledMiniApps()` as is.
  - NearbyOrgAccountsSection: `queryKey: ['explore', 'org-accounts']`, queryFn = the existing fetch composition (accounts + vote summaries bundled into one object), `meta: { persist: true }`.
  - RestaurantSection: `queryKey: ['explore', 'restaurant-ratings', accountIds]` where accountIds is a stable sorted array derived from props, queryFn = `fetchAccountRatingSummaries(accountIds)`, `meta: { persist: true }`, `enabled: accountIds.length > 0`.
  Preserve loading/empty UI branches exactly (map `isPending` to the old loading state variable semantics).

- [ ] **Step 2:** Self-review (hooks order stable, no conditional useQuery, derived data identical), then commit + push:
```bash
git add apps/expo/components/miniapp/MiniAppsEntry.tsx apps/expo/components/NearbyOrgAccountsSection.tsx apps/expo/components/RestaurantSection.tsx
git commit -m "feat(expo): Entdecken independent sections render from persisted cache (mini-apps, orgs, ratings)"
git push
```

---

### Task E4: Skeleton loading state on the main feed

**Files:**
- Modify: `components/feed/FeedList.tsx` (or `FeedHome.tsx` — wherever the `isLoading` empty-state renders)
- Possibly create: `components/feed/FeedPostSkeleton.tsx` (only if no post skeleton exists yet)

**Interfaces:** none external.

USER DIRECTIVE (2026-07-20): loading states must always be skeleton loaders — the main feed included.

- [ ] **Step 1:** Find what the feed renders while `isLoading && items.length === 0` (grep FeedList/FeedHome for ActivityIndicator/loading branches). If it is anything other than skeleton cards, replace it with a column of 4 post-shaped skeletons built from the `Skeleton` primitive (`components/SkeletonLoader.tsx`): avatar circle (40px) + two text lines + a media rectangle (16:10), roughly matching `FeedPostCard` layout paddings/tokens (StyleSheet + useTheme, match surrounding code). If a post skeleton component already exists anywhere, reuse it instead of creating a new one.
- [ ] **Step 2:** Keep pull-to-refresh and load-more indicators as they are (refresh spinner in RefreshControl is platform-native and stays; the footer load-more indicator may stay a small spinner — the directive targets the initial loading state).
- [ ] **Step 3:** Commit + push immediately:
```bash
git add <exact files touched>
git commit -m "feat(expo): skeleton loaders for main feed initial load"
git push
```

---

### Deferred (explicitly out of scope, noted for the future)
- Lazy-mounting below-the-fold sections (ScrollView → viewport-aware mounting): the transforms + disk cache make mounted images cheap; revisit only if profiling still shows jank.
- `MiniAppCard` image treatment (CMS-hosted URLs; separate pass).
- SearchModal query trimming (its `select('*')` runs only on user-typed searches).
