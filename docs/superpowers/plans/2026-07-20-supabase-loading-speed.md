# Supabase Loading-Speed Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make apps/expo render Supabase-backed screens instantly from a persisted cache and cut per-screen network round-trips from 4–11 to 1, so the app stays fast on slow/flaky rural internet.

**Architecture:** TanStack Query v5 with an AsyncStorage persister becomes the cache-first backbone for the feed and explore screens (stale-while-revalidate, offline retry, OTA-shippable — no native modules). Two new SECURITY DEFINER Postgres RPCs (`get_feed_page`, `get_conversations_inbox`) collapse the feed's 4-serial-hop chain and the chat inbox's 2-queries-per-conversation pattern into one round-trip each, with client-side fallback to the legacy paths until the migrations are applied. Contexts (Messaging, Account) get hand-rolled AsyncStorage snapshots mirroring the existing `lib/user-cache.ts` pattern. Supabase Storage image transforms (Pro plan is active) shrink feed images on the read path.

**Tech Stack:** @tanstack/react-query v5 + @tanstack/react-query-persist-client + @tanstack/query-async-storage-persister (all pure JS), AsyncStorage, Supabase PostgREST/RPC (plpgsql), Supabase Storage render/image endpoint, expo-image.

## Global Constraints

- Monorepo uses **pnpm** — install deps with `pnpm --filter @roebel/expo add <pkg>`; never npm/yarn.
- Expo styling: `StyleSheet.create()` + `useTheme()` — NO NativeWind.
- All UI text German-first (no UI text changes expected in this plan).
- **NEVER show raw wallet addresses in UI** — none of these changes may surface a `0x…` string.
- **No native modules** — everything must remain OTA-updatable (no react-native-mmkv in this plan; noted as future EAS-build upgrade).
- After completing each task: `git add <specific files>` → commit → **push** (user's global git rules; commit style `feat(expo): …` / `fix(expo): …`).
- Do NOT run `eas update` — the user ships OTA updates himself.
- The Supabase MCP is not authenticated in this session: migrations CANNOT be applied from here. Migration SQL files go into `apps/expo/supabase/migrations/` and the client must work without them (fallback paths). Applying them is a user gate listed in Task 9.
- Migration ordering note: `get_feed_page` reads `posts.quoted_post_id`, `posts.pinned_until`, `posts.linked_mini_app_id` — the `social_feed_enhancements.sql`, `post_pinning.sql`, and `add_mini_app_share.sql` migrations must be applied before it.
- Jest exists (`jest-expo` preset). Run tests with `cd apps/expo && npx jest --watchAll=false <path>`. Repo has pre-existing tsc errors — verification is `pnpm lint` (from apps/expo) + targeted jest, not a full tsc run.
- All file paths below are relative to `apps/expo/` unless they start with `docs/` or `contracts/`.

---

### Task 1: Supabase image-transform URL helper

**Files:**
- Create: `apps/expo/lib/image-url.ts`
- Test: `apps/expo/lib/__tests__/image-url.test.ts`

**Interfaces:**
- Produces: `transformedImageUrl(url: string | null | undefined, opts: { width?: number; height?: number; quality?: number }): string | null` — rewrites Supabase Storage public-object URLs to the render/image transform endpoint; passes through non-Supabase URLs, videos, gifs, svgs unchanged. Consumed by Task 2.

- [ ] **Step 1: Write the failing test**

```ts
// apps/expo/lib/__tests__/image-url.test.ts
import { transformedImageUrl } from '../image-url';

const SB = 'https://wwbeqhkslxdxhktqzqti.supabase.co/storage/v1/object/public/images/posts/foo.jpg';

describe('transformedImageUrl', () => {
  it('rewrites a Supabase public object URL to the render endpoint with width and quality', () => {
    expect(transformedImageUrl(SB, { width: 1080 })).toBe(
      'https://wwbeqhkslxdxhktqzqti.supabase.co/storage/v1/render/image/public/images/posts/foo.jpg?width=1080&quality=75&resize=cover'
    );
  });

  it('respects an explicit quality', () => {
    expect(transformedImageUrl(SB, { width: 640, quality: 60 })).toContain('quality=60');
  });

  it('passes through non-Supabase URLs unchanged', () => {
    const other = 'https://example.com/a.jpg';
    expect(transformedImageUrl(other, { width: 500 })).toBe(other);
  });

  it('passes through videos, gifs and svgs unchanged', () => {
    const mp4 = SB.replace('foo.jpg', 'clip.mp4');
    const gif = SB.replace('foo.jpg', 'anim.gif');
    const svg = SB.replace('foo.jpg', 'icon.svg');
    expect(transformedImageUrl(mp4, { width: 500 })).toBe(mp4);
    expect(transformedImageUrl(gif, { width: 500 })).toBe(gif);
    expect(transformedImageUrl(svg, { width: 500 })).toBe(svg);
  });

  it('returns null for null/undefined input', () => {
    expect(transformedImageUrl(null, { width: 100 })).toBeNull();
    expect(transformedImageUrl(undefined, { width: 100 })).toBeNull();
  });

  it('preserves an existing query string', () => {
    const withQ = `${SB}?t=123`;
    const out = transformedImageUrl(withQ, { width: 320 })!;
    expect(out).toContain('t=123');
    expect(out).toContain('width=320');
    expect(out).toContain('/render/image/public/');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/expo && npx jest --watchAll=false lib/__tests__/image-url.test.ts`
Expected: FAIL — cannot find module '../image-url'.

- [ ] **Step 3: Write the implementation**

```ts
// apps/expo/lib/image-url.ts
/**
 * Rewrites Supabase Storage public-object URLs to the image-transform
 * (render) endpoint so feed images download at display size instead of the
 * full-resolution original (Pro-plan feature). Non-Supabase URLs, videos,
 * gifs and svgs pass through untouched, so callers can apply this to any
 * media URL unconditionally.
 */
const OBJECT_PUBLIC = '/storage/v1/object/public/';
const RENDER_PUBLIC = '/storage/v1/render/image/public/';
const SKIP_EXTENSIONS = /\.(mp4|mov|webm|m3u8|gif|svg)(\?|$)/i;

export type ImageTransformOptions = {
  width?: number;
  height?: number;
  quality?: number;
};

export function transformedImageUrl(
  url: string | null | undefined,
  opts: ImageTransformOptions
): string | null {
  if (!url) return null;
  if (!url.includes(OBJECT_PUBLIC)) return url;
  if (SKIP_EXTENSIONS.test(url)) return url;

  const [base, existingQuery] = url.split('?');
  const params = new URLSearchParams(existingQuery ?? '');
  if (opts.width) params.set('width', String(Math.round(opts.width)));
  if (opts.height) params.set('height', String(Math.round(opts.height)));
  params.set('quality', String(opts.quality ?? 75));
  params.set('resize', 'cover');

  return `${base.replace(OBJECT_PUBLIC, RENDER_PUBLIC)}?${params.toString()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/expo && npx jest --watchAll=false lib/__tests__/image-url.test.ts`
Expected: PASS (6 tests). If the first test fails only on parameter ORDER in the query string, adjust the test to assert with `toContain` for each param instead — order is a URLSearchParams implementation detail.

- [ ] **Step 5: Commit and push**

```bash
git add apps/expo/lib/image-url.ts apps/expo/lib/__tests__/image-url.test.ts
git commit -m "feat(expo): Supabase image-transform URL helper for display-size feed images"
git push
```

---

### Task 2: Serve transformed, cached images in the feed

**Files:**
- Modify: `apps/expo/components/feed/PostImageGrid.tsx`
- Modify: `apps/expo/components/UserAvatarWithFrame.tsx`

**Interfaces:**
- Consumes: `transformedImageUrl` from Task 1.
- Produces: no API changes — both components keep their existing props.

- [ ] **Step 1: Transform + cache feed post images in PostImageGrid**

In `apps/expo/components/feed/PostImageGrid.tsx`:

Add the import at the top:

```ts
import { transformedImageUrl } from '@/lib/image-url';
```

In `renderSlot` (the multi-image cell), replace the `<Image …>` element with:

```tsx
<Image
  source={{ uri: transformedImageUrl(imageUrls[index], { width: 640 }) ?? undefined }}
  style={styles.fillImage}
  contentFit="cover"
  cachePolicy="memory-disk"
  recyclingKey={imageUrls[index]}
  accessibilityIgnoresInvertColors
/>
```

In the single-image branch (`total === 1`), replace its `<Image …>` with:

```tsx
<Image
  source={{ uri: transformedImageUrl(imageUrls[0], { width: 1080 }) ?? undefined }}
  style={styles.fillImage}
  contentFit="cover"
  cachePolicy="memory-disk"
  recyclingKey={imageUrls[0]}
  onLoad={(e) => {
    const w = e.source?.width;
    const h = e.source?.height;
    if (w && h) setSingleAspect(w / h);
  }}
  accessibilityIgnoresInvertColors
/>
```

(Keep the existing `onLoad` aspect logic exactly as shown — it already exists; only `source`, `cachePolicy`, and `recyclingKey` change.)

- [ ] **Step 2: Downsize avatar downloads in UserAvatarWithFrame**

In `apps/expo/components/UserAvatarWithFrame.tsx` (avatar `Image` around lines 77-83, already has `cachePolicy="memory-disk"` + `recyclingKey`): find where the avatar URI is passed into `source` and wrap it:

```ts
import { transformedImageUrl } from '@/lib/image-url';
```

then `source={{ uri: transformedImageUrl(<existing-uri-expression>, { width: 160 }) ?? undefined }}` — read the file first and preserve the existing uri expression and all other props verbatim. Do NOT wrap the frame asset URL if it is an svg/gif (the helper already passes those through, so wrapping is safe either way).

- [ ] **Step 3: Verify**

Run: `cd apps/expo && pnpm lint`
Expected: no new lint errors (pre-existing warnings are fine).

- [ ] **Step 4: Commit and push**

```bash
git add apps/expo/components/feed/PostImageGrid.tsx apps/expo/components/UserAvatarWithFrame.tsx
git commit -m "feat(expo): serve feed images via Supabase transforms with disk caching"
git push
```

---

### Task 3: TanStack Query foundation with persisted cache

**Files:**
- Modify: `apps/expo/package.json` (via pnpm add)
- Create: `apps/expo/lib/query-client.ts`
- Modify: `apps/expo/app/_layout.tsx`

**Interfaces:**
- Produces: `queryClient` (QueryClient) and `persistOptions` from `@/lib/query-client`; a `PersistQueryClientProvider` wrapping the app. Queries opt into persistence with `meta: { persist: true }`. Consumed by Tasks 4–5.

- [ ] **Step 1: Install dependencies**

```bash
cd apps/expo && pnpm add @tanstack/react-query @tanstack/react-query-persist-client @tanstack/query-async-storage-persister
```

Expected: three packages added to apps/expo/package.json at ^5.x. If the resolved major is not 5, STOP and check the v6 migration notes before proceeding (the API used below is v5).

- [ ] **Step 2: Create the query client module**

```ts
// apps/expo/lib/query-client.ts
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

// Pause queries while offline and refetch on reconnect — critical for flaky
// rural connections: a request fired mid-dead-zone retries when signal returns.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected))
);

// RN has no window focus; app foregrounding is the equivalent signal.
AppState.addEventListener('change', (status) =>
  focusManager.setFocused(status === 'active')
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // Must exceed the persister maxAge or restored queries get GC'd.
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: 2,
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'roebel-query-cache',
  throttleTime: 2_000,
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  // New app version = new cache namespace (data shapes may have changed).
  buster: Constants.expoConfig?.version ?? '0',
  dehydrateOptions: {
    // Only queries that opt in via meta.persist land on disk — keeps the
    // AsyncStorage entry small and avoids persisting sensitive/ephemeral data.
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' && query.meta?.persist === true,
  },
};
```

- [ ] **Step 3: Wrap the provider tree in app/_layout.tsx**

Read `apps/expo/app/_layout.tsx`. Locate the provider nesting (around lines 289-347: `ThemeProvider → ConsentProvider → PostHog → ThirdwebProvider → …`). Add imports:

```ts
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persistOptions } from '@/lib/query-client';
```

Wrap `<PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>` around the OUTERMOST existing provider in that JSX return (i.e., it becomes the new outermost wrapper, so every context/screen can use queries). Close it at the matching position. No other changes.

- [ ] **Step 4: Verify**

Run: `cd apps/expo && pnpm lint`
Expected: no new errors. Also run `npx jest --watchAll=false lib/__tests__/image-url.test.ts` to confirm the jest environment still resolves modules.

- [ ] **Step 5: Commit and push**

```bash
git add apps/expo/package.json apps/expo/lib/query-client.ts apps/expo/app/_layout.tsx pnpm-lock.yaml
git commit -m "feat(expo): TanStack Query foundation with persisted AsyncStorage cache"
git push
```

---

### Task 4: Cache-first, progressive feed (useFeed rewrite)

**Files:**
- Create: `apps/expo/lib/feed-sections.ts`
- Modify: `apps/expo/hooks/useFeed.ts` (full rewrite of the hook body; keep `buildGovernanceNudges` and `generateMeckyTips` as-is)

**Interfaces:**
- Consumes: `queryClient` infra from Task 3; existing `fetchFeedPosts` (signature gains optional `walletAddress` in Task 6 — this task passes it already via an options object property that is simply ignored until Task 6 lands; TypeScript: add the optional field now, see Step 2).
- Produces: `useFeed(feedType, enabled)` with the SAME return shape as today (`items, isLoading, isRefreshing, isLoadingMore, hasMore, refresh, loadMore, removePost`) plus two NEW nullable fields `likedPostIds: Set<string> | null` and `repostedPostIds: Set<string> | null` (always null until Task 6). `fetchFeedSections(feedType): Promise<FeedSections>` for the section bundle.

Key behavior changes: (1) the feed renders as soon as the posts query resolves — the 10 section queries no longer block first paint; (2) both queries persist to disk, so a cold start renders the last-seen feed instantly and refetches in the background.

- [ ] **Step 1: Extract the section bundle into lib/feed-sections.ts**

```ts
// apps/expo/lib/feed-sections.ts
import type {
  FeedType,
  ServiceAlertRecord,
  BusinessDealWithBusiness,
  ProposalFeedRecord,
  ProposalCommentFeedRecord,
} from '@/lib/types/feed';
import type {
  EventRecord,
  MarketplaceListingRecord,
  NewsArticle,
  MovieRecord,
  RestaurantRecord,
  SpecialMenuRecord,
} from '@/lib/types';
import { fetchActiveServiceAlerts, fetchUpcomingEventsForFeed } from '@/lib/supabase-posts';
import { fetchActiveDeals } from '@/lib/supabase-deals';
import { fetchMarketplaceListings } from '@/lib/supabase-marketplace';
import { fetchRecentNews } from '@/lib/supabase-news';
import { fetchUpcomingMovies } from '@/lib/supabase-cinema';
import { fetchFeaturedRestaurants, fetchActiveSpecialMenus } from '@/lib/supabase-restaurants';
import { fetchProposals, type SupabaseProposal } from '@/lib/supabase-proposals';
import { fetchRecentProposalComments } from '@/lib/supabase-proposal-comments';

export type FeedSections = {
  alerts: ServiceAlertRecord[];
  deals: BusinessDealWithBusiness[];
  marketplace: MarketplaceListingRecord[];
  events: EventRecord[];
  news: NewsArticle[];
  movies: MovieRecord[];
  restaurants: RestaurantRecord[];
  specialMenus: SpecialMenuRecord[];
  proposals: SupabaseProposal[];
  proposalComments: ProposalCommentFeedRecord[];
};

/**
 * The non-post feed sections (alerts, deals, events, news, …) bundled into a
 * single cacheable unit. Runs its sub-fetches in parallel; failures inside a
 * sub-fetch resolve to [] (each lib fn already catches), so one slow/broken
 * section can never block or break the others — and, unlike before, none of
 * them block the posts from rendering.
 */
export async function fetchFeedSections(feedType: FeedType): Promise<FeedSections> {
  const isMain = feedType === 'main';
  const isRathaus = feedType === 'rathaus';
  const emptyArr = Promise.resolve([] as any[]);

  const [
    alerts,
    deals,
    marketplace,
    events,
    news,
    movies,
    restaurants,
    specialMenus,
    proposals,
    proposalComments,
  ] = await Promise.all([
    fetchActiveServiceAlerts(),
    isMain ? fetchActiveDeals() : emptyArr,
    isMain ? fetchMarketplaceListings({ limit: 5 }) : emptyArr,
    isMain ? fetchUpcomingEventsForFeed(5) : emptyArr,
    isMain ? fetchRecentNews(5) : emptyArr,
    isMain ? fetchUpcomingMovies(6) : emptyArr,
    isMain ? fetchFeaturedRestaurants() : emptyArr,
    isMain ? fetchActiveSpecialMenus(3) : emptyArr,
    isMain || isRathaus ? fetchProposals().catch(() => []) : emptyArr,
    isRathaus ? fetchRecentProposalComments(50).catch(() => []) : emptyArr,
  ]);

  return {
    alerts,
    deals: deals as BusinessDealWithBusiness[],
    marketplace: marketplace as MarketplaceListingRecord[],
    events: events as EventRecord[],
    news: news as NewsArticle[],
    movies: movies as MovieRecord[],
    restaurants: restaurants as RestaurantRecord[],
    specialMenus: specialMenus as SpecialMenuRecord[],
    proposals: proposals as SupabaseProposal[],
    proposalComments: proposalComments as ProposalCommentFeedRecord[],
  };
}
```

- [ ] **Step 2: Widen the fetchFeedPosts options type**

In `apps/expo/lib/supabase-posts.ts`, change ONLY the signature of `fetchFeedPosts` to accept an optional wallet (unused until Task 6):

```ts
export async function fetchFeedPosts(options: {
  feedType: FeedType;
  page: number;
  pageSize?: number;
  walletAddress?: string;
}): Promise<{ data: PostRecord[]; hasMore: boolean; likedPostIds?: string[] | null; repostedPostIds?: string[] | null }> {
```

(Body unchanged in this task — the two optional return fields are simply never set yet.)

- [ ] **Step 3: Rewrite the useFeed hook**

Replace the `useFeed` function in `apps/expo/hooks/useFeed.ts` (keep the file's imports it still needs, `buildGovernanceNudges`, and `generateMeckyTips`; remove now-unused imports — the section fetch imports move to `lib/feed-sections.ts`):

```ts
import { useCallback, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FeedItem, FeedType, PostRecord, ProposalFeedRecord } from '@/lib/types/feed';
import { fetchFeedPosts } from '@/lib/supabase-posts';
import { fetchFeedSections } from '@/lib/feed-sections';
import { assembleFeed } from '@/lib/feed-assembler';
import { useUser } from '@/context/UserContext';

export function useFeed(feedType: FeedType, enabled: boolean = true) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Latest wallet without putting it in the query key: the feed CONTENT is
  // wallet-independent, so keying on the wallet would refetch the whole feed
  // when the cached user hydrates a tick after mount.
  const walletRef = useRef<string | null>(null);
  walletRef.current = user?.wallet_address ?? null;

  const postsKey = ['feed', 'posts', feedType] as const;

  const postsQuery = useInfiniteQuery({
    queryKey: postsKey,
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchFeedPosts({
        feedType,
        page: pageParam as number,
        walletAddress: walletRef.current ?? undefined,
      }),
    getNextPageParam: (last, _pages, lastPageParam) =>
      last.hasMore ? (lastPageParam as number) + 1 : undefined,
    // Bounds both memory and the size of the persisted cache entry.
    maxPages: 3,
    staleTime: 30_000,
    meta: { persist: true },
  });

  const sectionsQuery = useQuery({
    queryKey: ['feed', 'sections', feedType],
    enabled,
    queryFn: () => fetchFeedSections(feedType),
    meta: { persist: true },
  });

  const posts = useMemo(() => {
    // De-dupe by id: a pinned post prepended on page 0 can reappear at its
    // natural chronological position on a later page.
    const seen = new Set<string>();
    return (postsQuery.data?.pages ?? [])
      .flatMap((p) => p.data)
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [postsQuery.data]);

  const items: FeedItem[] = useMemo(() => {
    const s = sectionsQuery.data;
    return assembleFeed({
      posts,
      alerts: s?.alerts ?? [],
      deals: s?.deals ?? [],
      marketplaceListings: s?.marketplace ?? [],
      upcomingEvents: s?.events ?? [],
      newsArticles: s?.news ?? [],
      movies: s?.movies ?? [],
      restaurants: s?.restaurants ?? [],
      specialMenus: s?.specialMenus ?? [],
      governanceNudges: s ? buildGovernanceNudges(s.proposals) : [],
      meckyTips: generateMeckyTips(),
      proposals: (s?.proposals ?? []) as unknown as ProposalFeedRecord[],
      proposalComments: s?.proposalComments ?? [],
      feedType,
    });
  }, [posts, sectionsQuery.data, feedType]);

  // Union of the per-page liked/reposted id arrays returned by the
  // get_feed_page RPC. null (not empty) when the RPC isn't serving yet, so
  // FeedList knows to fall back to its own queries.
  const likedPostIds = useMemo(() => {
    const pages = postsQuery.data?.pages ?? [];
    if (!pages.some((p) => p.likedPostIds != null)) return null;
    const set = new Set<string>();
    pages.forEach((p) => p.likedPostIds?.forEach((id) => set.add(id)));
    return set;
  }, [postsQuery.data]);

  const repostedPostIds = useMemo(() => {
    const pages = postsQuery.data?.pages ?? [];
    if (!pages.some((p) => p.repostedPostIds != null)) return null;
    const set = new Set<string>();
    pages.forEach((p) => p.repostedPostIds?.forEach((id) => set.add(id)));
    return set;
  }, [postsQuery.data]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([postsQuery.refetch(), sectionsQuery.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postsQuery.refetch, sectionsQuery.refetch]);

  const loadMore = useCallback(async () => {
    if (postsQuery.isFetchingNextPage || !postsQuery.hasNextPage) return;
    await postsQuery.fetchNextPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postsQuery.isFetchingNextPage, postsQuery.hasNextPage, postsQuery.fetchNextPage]);

  const removePost = useCallback(
    (postId: string) => {
      queryClient.setQueryData(postsKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            data: page.data.filter((p: PostRecord) => p.id !== postId),
          })),
        };
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, feedType]
  );

  return {
    items,
    // Progressive: only the posts gate first paint; sections stream in.
    isLoading: postsQuery.isPending,
    isRefreshing,
    isLoadingMore: postsQuery.isFetchingNextPage,
    hasMore: postsQuery.hasNextPage ?? false,
    refresh,
    loadMore,
    removePost,
    likedPostIds,
    repostedPostIds,
  };
}
```

- [ ] **Step 4: Verify**

Run: `cd apps/expo && pnpm lint`
Expected: no new errors. Then grep for other consumers of the hook's return (`grep -rn "useFeed(" apps/expo/app apps/expo/components`) and confirm none destructure a field that was removed (all original fields still exist).

- [ ] **Step 5: Commit and push**

```bash
git add apps/expo/hooks/useFeed.ts apps/expo/lib/feed-sections.ts apps/expo/lib/supabase-posts.ts
git commit -m "feat(expo): cache-first progressive feed — posts render without waiting for sections"
git push
```

---

### Task 5: Cache-first explore screen with bounded queries

**Files:**
- Modify: `apps/expo/app/explore.tsx`

**Interfaces:**
- Consumes: query infra from Task 3.
- Produces: no external API (screen component).

- [ ] **Step 1: Convert fetchAllData into a persisted query and add limits**

In `apps/expo/app/explore.tsx`: the current `fetchAllData` (lines ~69-124) runs 7 fetches and writes 7 useStates; a `useEffect` drives `loading`. Convert as follows.

Add imports:

```ts
import { useQuery } from '@tanstack/react-query';
```

Replace `fetchAllData` with a module-level (outside the component) function that RETURNS the bundle instead of setting state — identical queries with three changes marked `// LIMIT`:

```ts
async function fetchExploreData() {
  const [
    eventsResult,
    popularEventsResult,
    newsResult,
    moviesResult,
    restaurantsResult,
    dealsResult,
    listingsResult,
  ] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .eq('status', 'approved')
      .gte('date', new Date().toISOString().split('T')[0]) // LIMIT: only today+future
      .order('date', { ascending: true })
      .order('time', { ascending: true, nullsFirst: true })
      .limit(60), // LIMIT
    supabase
      .from('events')
      .select('*')
      .eq('status', 'approved')
      .eq('is_popular', true)
      .order('date', { ascending: true })
      .order('time', { ascending: true, nullsFirst: true })
      .limit(3),
    supabase
      .from('news_articles')
      .select('*')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(20), // LIMIT
    supabase
      .from('movies')
      .select('id, title, description, date, time, cover_image_url, trailer_youtube_url, fsk, status, created_at, updated_at')
      .eq('status', 'published')
      .order('date', { ascending: true }),
    supabase
      .from('restaurants')
      .select('*')
      .eq('status', 'published')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .limit(50), // LIMIT
    fetchActiveDeals(),
    fetchMarketplaceListings({ limit: 10 }),
  ]);

  return {
    events: (eventsResult.data ?? []) as EventRecord[],
    popularEvents: (popularEventsResult.data ?? []) as EventRecord[],
    newsArticles: (newsResult.data ?? []) as NewsArticle[],
    movies: (moviesResult.data ?? []) as MovieRecord[],
    restaurants: (restaurantsResult.data ?? []) as RestaurantRecord[],
    deals: dealsResult as BusinessDealWithBusiness[],
    listings: listingsResult,
  };
}
```

IMPORTANT CHECK before adding the `gte('date', …)` filter: grep the rest of explore.tsx for uses of `events` that expect PAST events (e.g. an archive section). If any exist, drop the `gte` filter and keep only `.limit(60)`.

- [ ] **Step 2: Replace the state plumbing**

Inside the component, remove the `useState`s for `events, popularEvents, newsArticles, movies, restaurants, deals, listings, loading` and the `useEffect` that called `fetchAllData`, and replace with:

```ts
const exploreQuery = useQuery({
  queryKey: ['explore', 'all'],
  queryFn: fetchExploreData,
  meta: { persist: true },
});

const events = exploreQuery.data?.events ?? [];
const popularEvents = exploreQuery.data?.popularEvents ?? [];
const newsArticles = exploreQuery.data?.newsArticles ?? [];
const movies = exploreQuery.data?.movies ?? [];
const restaurants = exploreQuery.data?.restaurants ?? [];
const deals = exploreQuery.data?.deals ?? [];
const listings = exploreQuery.data?.listings ?? [];
const loading = exploreQuery.isPending;
```

and rewrite `onRefresh`:

```ts
const onRefresh = async () => {
  setRefreshing(true);
  await exploreQuery.refetch();
  setRefreshing(false);
};
```

(`refreshing` keeps its existing useState.) Preserve every other piece of the file — search modal logic, tab handling, render tree — untouched. If any setter (e.g. `setEvents`) is referenced elsewhere in the file, adapt that call site by invalidating/refetching the query instead; if that turns out nontrivial, keep that ONE state as local state layered over the query data and note it in the commit message.

- [ ] **Step 3: Verify**

Run: `cd apps/expo && pnpm lint`
Expected: no new errors, no unused-variable warnings from removed states.

- [ ] **Step 4: Commit and push**

```bash
git add apps/expo/app/explore.tsx
git commit -m "feat(expo): cache-first explore screen with bounded event/news/restaurant queries"
git push
```

---

### Task 6: get_feed_page RPC — one round-trip feed pages

**Files:**
- Create: `apps/expo/supabase/migrations/feed_page_rpc.sql`
- Modify: `apps/expo/lib/supabase-posts.ts` (fetchFeedPosts body)
- Modify: `apps/expo/components/feed/FeedList.tsx` (accept prefetched like/repost sets)
- Modify: `apps/expo/components/feed/FeedHome.tsx` (pass the sets through)

**Interfaces:**
- Consumes: `useFeed`'s `likedPostIds`/`repostedPostIds` fields (Task 4), `fetchFeedPosts` options with `walletAddress` (Task 4).
- Produces: SQL functions `public.feed_post_json(posts, boolean) returns jsonb` and `public.get_feed_page(text, integer, integer, text) returns jsonb`; `fetchFeedPosts` now RPC-first with automatic legacy fallback. FeedList gains optional props `prefetchedLikedIds?: Set<string> | null` and `prefetchedRepostedIds?: Set<string> | null`.

- [ ] **Step 1: Write the migration**

```sql
-- apps/expo/supabase/migrations/feed_page_rpc.sql
--
-- One-round-trip feed page: posts + all embeds + quoted originals +
-- pinned-first ordering + the caller's liked/reposted ids. Replaces the
-- client's 4 serial PostgREST requests (page → pinned → quoted-post
-- hydration → mini-app hydration) plus 2 like/repost state requests.
-- The client falls back to the legacy path while this function is missing
-- (see fetchFeedPosts), so applying this migration is a pure speedup.
--
-- REQUIRES (must already be applied): social_feed_enhancements.sql
-- (posts.quoted_post_id), post_pinning.sql (posts.pinned_until),
-- add_mini_app_share.sql (posts.linked_mini_app_id).

create or replace function public.feed_post_json(
  p_post public.posts,
  p_include_quoted boolean default true
)
returns jsonb
language plpgsql
stable
as $$
declare
  v jsonb;
  v_quoted public.posts;
begin
  -- Shape mirrors the client's FEED_POST_SELECT PostgREST embed exactly:
  -- author/account/sticker/linked_event/linked_marketplace/linked_mini_app as
  -- objects (null when absent), links as array, poll as object (unique
  -- post_id), quoted_post one level deep. mergeAccountIntoAuthor on the
  -- client does the author.account fold, same as for PostgREST responses.
  v := to_jsonb(p_post) || jsonb_build_object(
    'author', (
      select jsonb_build_object(
        'wallet_address', u.wallet_address,
        'username', u.username,
        'profile_picture_url', u.profile_picture_url,
        'is_verified_citizen', u.is_verified_citizen,
        'tier', u.tier,
        'equipped_frame_asset_url', u.equipped_frame_asset_url
      )
      from public.users u
      where u.wallet_address = p_post.wallet_address
    ),
    'account', (
      select jsonb_build_object(
        'id', a.id, 'account_type', a.account_type,
        'name', a.name, 'avatar_url', a.avatar_url
      )
      from public.accounts a
      where a.id = p_post.account_id
    ),
    'links', coalesce(
      (select jsonb_agg(to_jsonb(l))
       from public.post_links l where l.post_id = p_post.id),
      '[]'::jsonb
    ),
    'poll', (
      select to_jsonb(pp)
      from public.post_polls pp
      where pp.post_id = p_post.id
      limit 1
    ),
    'linked_event', (
      select jsonb_build_object(
        'id', e.id, 'title', e.title, 'date', e.date, 'time', e.time,
        'location', e.location, 'image_url', e.image_url, 'category', e.category
      )
      from public.events e
      where e.id = p_post.linked_event_id
    ),
    'linked_marketplace', (
      select jsonb_build_object(
        'id', m.id, 'title', m.title, 'price', m.price,
        'price_type', m.price_type, 'category', m.category,
        'condition', m.condition, 'media_urls', m.media_urls,
        'neighborhood', m.neighborhood
      )
      from public.marketplace_listings m
      where m.id = p_post.linked_marketplace_id
    ),
    'sticker', (
      select jsonb_build_object(
        'id', lr.id, 'type', lr.type, 'name', lr.name, 'asset_url', lr.asset_url
      )
      from public.lootbox_rewards lr
      where lr.id = p_post.sticker_reward_id
    ),
    'linked_mini_app', (
      select jsonb_build_object(
        'id', ma.id, 'slug', ma.slug, 'name', ma.name,
        'description', ma.description, 'icon_url', ma.icon_url,
        'primary_color', ma.primary_color, 'category', ma.category
      )
      from public.mini_apps ma
      where ma.id = p_post.linked_mini_app_id and ma.status = 'live'
    )
  );

  if p_include_quoted and p_post.quoted_post_id is not null then
    select * into v_quoted
    from public.posts
    where id = p_post.quoted_post_id and status = 'published';
    if found then
      v := v || jsonb_build_object(
        'quoted_post', public.feed_post_json(v_quoted, false)
      );
    else
      v := v || jsonb_build_object('quoted_post', null);
    end if;
  end if;

  return v;
end;
$$;

create or replace function public.get_feed_page(
  p_feed_type text,
  p_page integer default 0,
  p_page_size integer default 15,
  p_wallet text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from integer := greatest(p_page, 0) * p_page_size;
  v_wallet text := nullif(lower(coalesce(p_wallet, '')), '');
  v_page_ids uuid[] := '{}';
  v_pinned_ids uuid[] := '{}';
  v_rest_ids uuid[] := '{}';
  v_ids uuid[] := '{}';
  v_target_ids uuid[] := '{}';
  v_posts jsonb := '[]'::jsonb;
  v_liked jsonb := '[]'::jsonb;
  v_reposted jsonb := '[]'::jsonb;
begin
  select coalesce(array_agg(id), '{}') into v_page_ids
  from (
    select id from public.posts
    where feed_type = p_feed_type and status = 'published'
    order by created_at desc
    offset v_from limit p_page_size
  ) s;

  -- Page 0 surfaces currently-pinned posts first (pins expire by time),
  -- mirroring the legacy client logic.
  if p_page = 0 then
    select coalesce(array_agg(id), '{}') into v_pinned_ids
    from (
      select id from public.posts
      where feed_type = p_feed_type and status = 'published'
        and pinned_until > now()
      order by pinned_until desc
    ) s;
  end if;

  select coalesce(array_agg(id order by ord), '{}') into v_rest_ids
  from unnest(v_page_ids) with ordinality as t(id, ord)
  where id <> all (v_pinned_ids);

  v_ids := v_pinned_ids || v_rest_ids;

  if coalesce(array_length(v_ids, 1), 0) > 0 then
    select coalesce(jsonb_agg(public.feed_post_json(p, true) order by t.ord), '[]'::jsonb)
    into v_posts
    from unnest(v_ids) with ordinality as t(id, ord)
    join public.posts p on p.id = t.id;

    -- Like/repost state binds to the TARGET post: the original on reposts.
    select coalesce(array_agg(distinct x), '{}') into v_target_ids
    from (
      select unnest(v_ids) as x
      union
      select quoted_post_id from public.posts
      where id = any (v_ids) and quoted_post_id is not null
    ) s(x);

    if v_wallet is not null then
      select coalesce(jsonb_agg(distinct pl.post_id), '[]'::jsonb) into v_liked
      from public.post_likes pl
      where lower(pl.wallet_address) = v_wallet
        and pl.post_id = any (v_target_ids);

      select coalesce(jsonb_agg(distinct pr.quoted_post_id), '[]'::jsonb) into v_reposted
      from public.posts pr
      where lower(pr.wallet_address) = v_wallet
        and pr.post_type = 'repost' and pr.status = 'published'
        and pr.quoted_post_id = any (v_target_ids);
    end if;
  end if;

  return jsonb_build_object(
    'posts', v_posts,
    'has_more', coalesce(array_length(v_page_ids, 1), 0) = p_page_size,
    'liked_post_ids', v_liked,
    'reposted_post_ids', v_reposted
  );
end;
$$;

grant execute on function public.feed_post_json(public.posts, boolean) to anon, authenticated;
grant execute on function public.get_feed_page(text, integer, integer, text) to anon, authenticated;
```

NOTE for the implementer: if `posts.id` is not uuid (check an existing migration or `lib/types/feed.ts`), change the `uuid[]` declarations to `text[]` and add `::text` casts on the `id` selections — do NOT guess; verify.

- [ ] **Step 2: Make fetchFeedPosts RPC-first with fallback**

In `apps/expo/lib/supabase-posts.ts`, above `fetchFeedPosts`, add:

```ts
// Session-level feature detection: null = untested, true = RPC serving,
// false = function missing (migration not applied) → use the legacy path
// without re-probing on every page.
let feedRpcAvailable: boolean | null = null;
```

Then replace the BODY of `fetchFeedPosts` so it starts with the RPC attempt and keeps the entire current implementation as the fallback tail (unchanged):

```ts
export async function fetchFeedPosts(options: {
  feedType: FeedType;
  page: number;
  pageSize?: number;
  walletAddress?: string;
}): Promise<{ data: PostRecord[]; hasMore: boolean; likedPostIds?: string[] | null; repostedPostIds?: string[] | null }> {
  const size = options.pageSize || PAGE_SIZE;

  if (feedRpcAvailable !== false) {
    const { data, error } = await supabase.rpc('get_feed_page', {
      p_feed_type: options.feedType,
      p_page: options.page,
      p_page_size: size,
      p_wallet: options.walletAddress ?? null,
    });
    const payload = data as any;
    if (!error && payload && Array.isArray(payload.posts)) {
      feedRpcAvailable = true;
      return {
        data: (payload.posts as PostRecord[]).map(mergeAccountIntoAuthor),
        hasMore: !!payload.has_more,
        likedPostIds: payload.liked_post_ids ?? null,
        repostedPostIds: payload.reposted_post_ids ?? null,
      };
    }
    // PGRST202 = function not found → migration not applied yet. Any other
    // error (network blip, transient 5xx) falls through to the legacy path
    // for THIS call but keeps probing on later calls.
    if (error?.code === 'PGRST202') {
      feedRpcAvailable = false;
    }
  }

  // Legacy multi-request path (kept verbatim from before): wide select →
  // pinned query → attachQuotedPosts → attachLinkedMiniApps.
  const from = options.page * size;
  const to = from + size - 1;
  // …existing body continues UNCHANGED from `const { data, error } = await supabase.from('posts')…`
```

(The legacy tail must remain byte-identical to the current implementation, ending with the existing `return { data: …, hasMore: … }` — that return now simply lacks the two optional fields, which is valid.)

- [ ] **Step 3: FeedList accepts prefetched like/repost state**

In `apps/expo/components/feed/FeedList.tsx`:
1. Add to the component's Props type: `prefetchedLikedIds?: Set<string> | null;` and `prefetchedRepostedIds?: Set<string> | null;` and destructure them in the component signature.
2. In the effect that currently calls `getUserLikedPostIds` / `getUserRepostedPostIds` (~lines 161-188), replace the two trailing calls with:

```ts
if (prefetchedLikedIds) {
  initLikes(prefetchedLikedIds, counts);
} else {
  getUserLikedPostIds(postIds, walletAddress).then((likedIds) => {
    initLikes(likedIds, counts);
  });
}
if (prefetchedRepostedIds) {
  initReposts(prefetchedRepostedIds, repostCounts);
} else {
  getUserRepostedPostIds(postIds, walletAddress).then((ids) => {
    initReposts(ids, repostCounts);
  });
}
```

3. Add `prefetchedLikedIds, prefetchedRepostedIds` to that effect's dependency array.

- [ ] **Step 4: FeedHome passes the sets through**

In `apps/expo/components/feed/FeedHome.tsx`: locate where `useFeed(…)` is destructured and where `<FeedList` is rendered (there may be one instance per tab/pager page). Destructure `likedPostIds, repostedPostIds` from the same `useFeed` result and add `prefetchedLikedIds={likedPostIds} prefetchedRepostedIds={repostedPostIds}` to the corresponding `<FeedList … />`. If FeedHome renders multiple FeedLists from multiple useFeed instances, wire each pair — never cross tabs.

- [ ] **Step 5: Verify**

Run: `cd apps/expo && pnpm lint`
Expected: clean. Also sanity-check the SQL loads: `cat apps/expo/supabase/migrations/feed_page_rpc.sql | head -5` and confirm no editor mangling.

- [ ] **Step 6: Commit and push**

```bash
git add apps/expo/supabase/migrations/feed_page_rpc.sql apps/expo/lib/supabase-posts.ts apps/expo/components/feed/FeedList.tsx apps/expo/components/feed/FeedHome.tsx
git commit -m "feat(expo): get_feed_page RPC — feed page in one round-trip with legacy fallback"
git push
```

---

### Task 7: get_conversations_inbox RPC — inbox in one round-trip

**Files:**
- Create: `apps/expo/supabase/migrations/conversations_inbox_rpc.sql`
- Modify: `apps/expo/lib/supabase-messages.ts` (fetchConversations)

**Interfaces:**
- Produces: SQL function `public.get_conversations_inbox(p_account_id text) returns jsonb`; `fetchConversations(myAccountId)` keeps its exact signature and return type (`ConversationWithLastMessage[]`), now RPC-first with legacy fallback.

- [ ] **Step 1: Write the migration**

```sql
-- apps/expo/supabase/migrations/conversations_inbox_rpc.sql
--
-- Whole chat inbox in ONE round-trip: conversations + peer account + (for
-- personal peers) the owner's users row + last message (with sticker embed)
-- + the caller's last_read_at. Replaces 4 batched queries + 2 queries PER
-- conversation. Client falls back to the legacy path while this function is
-- missing (see fetchConversations). SECURITY DEFINER matches the exposure of
-- the existing anon-readable tables — the account-id scoping is identical to
-- what the client already filters on.

create or replace function public.get_conversations_inbox(p_account_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t.row order by t.sort_ts desc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'conversation', to_jsonb(c),
        'peer_account', (
          select jsonb_build_object(
            'id', a.id, 'account_type', a.account_type, 'sub_type', a.sub_type,
            'name', a.name, 'slug', a.slug, 'avatar_url', a.avatar_url,
            'is_verified', a.is_verified
          )
          from public.accounts a where a.id::text = peer.peer_id
        ),
        'peer_user', pu.j,
        'peer_wallet', pw.wallet_address,
        'last_message', lm.j,
        'last_read_at', cp.last_read_at
      ) as row,
      coalesce(lm.created_at, c.created_at) as sort_ts
    from public.conversations c
    cross join lateral (
      select case
        when c.participant_one_account_id::text = p_account_id
        then c.participant_two_account_id::text
        else c.participant_one_account_id::text
      end as peer_id
    ) peer
    -- Owner wallet only for PERSONAL peers (org avatars come from the
    -- accounts row — resolving org owners would show the wrong identity).
    left join lateral (
      select ao.wallet_address
      from public.account_owners ao
      join public.accounts a2 on a2.id = ao.account_id
      where ao.account_id::text = peer.peer_id
        and a2.account_type = 'personal'
      limit 1
    ) pw on true
    left join lateral (
      select jsonb_build_object(
        'wallet_address', u.wallet_address, 'username', u.username,
        'profile_picture_url', u.profile_picture_url,
        'equipped_frame_asset_url', u.equipped_frame_asset_url,
        'xmtp_registered_at', u.xmtp_registered_at
      ) as j
      from public.users u where u.wallet_address = pw.wallet_address
    ) pu on true
    left join lateral (
      select
        to_jsonb(m) || jsonb_build_object(
          'sticker', (
            select jsonb_build_object(
              'id', lr.id, 'type', lr.type, 'name', lr.name, 'asset_url', lr.asset_url
            )
            from public.lootbox_rewards lr where lr.id = m.sticker_reward_id
          )
        ) as j,
        m.created_at
      from public.direct_messages m
      where m.conversation_id = c.id
      order by m.created_at desc
      limit 1
    ) lm on true
    left join lateral (
      select cp2.last_read_at
      from public.conversation_participants cp2
      where cp2.conversation_id = c.id and cp2.account_id::text = p_account_id
      limit 1
    ) cp on true
    where c.participant_one_account_id::text = p_account_id
       or c.participant_two_account_id::text = p_account_id
  ) t
$$;

grant execute on function public.get_conversations_inbox(text) to anon, authenticated;
```

NOTE for the implementer: if `direct_messages.sticker_reward_id` does not exist (check `fetchMessages` in lib/supabase-messages.ts — it selects that embed today, so it should), keep as-is; if the column is missing in some environments the function body is still valid SQL at creation only if the column exists — this migration hard-requires the sticker migration, note it in the header comment if you find a named migration for it.

- [ ] **Step 2: RPC-first fetchConversations**

In `apps/expo/lib/supabase-messages.ts`, add above `fetchConversations`:

```ts
let inboxRpcAvailable: boolean | null = null;

type InboxRpcRow = {
  conversation: Conversation;
  peer_account: AccountFields | null;
  peer_user: UserFields | null;
  peer_wallet: string | null;
  last_message: Message | null;
  last_read_at: string | null;
};

function mapInboxRpcRow(
  row: InboxRpcRow,
  myAccountId: string
): ConversationWithLastMessage | null {
  const convo = row.conversation;
  const peerId =
    convo.participant_one_account_id === myAccountId
      ? convo.participant_two_account_id
      : convo.participant_one_account_id;
  if (!peerId || !row.peer_account) return null;

  const peerAccount = row.peer_account;
  const peerUser = row.peer_user;
  const lastMessage = row.last_message;
  const lastReadAt = row.last_read_at;

  const hasUnread =
    !!lastMessage &&
    lastMessage.sender_account_id !== myAccountId &&
    (!lastReadAt || new Date(lastMessage.created_at) > new Date(lastReadAt));

  return {
    ...convo,
    peerAccountId: peerId,
    peerAccountType: peerAccount.account_type,
    peerSubType: peerAccount.sub_type,
    peerName: peerAccount.name,
    peerSlug: peerAccount.slug,
    peerUsername: peerUser?.username ?? null,
    peerIsVerified: peerAccount.is_verified,
    peerAvatarUrl: peerUser?.profile_picture_url ?? peerAccount.avatar_url,
    peerEquippedFrameUrl: peerUser?.equipped_frame_asset_url ?? null,
    peerAddress: peerId,
    peerProfilePictureUrl: peerUser?.profile_picture_url ?? peerAccount.avatar_url,
    lastMessage,
    lastReadAt,
    hasUnread,
    peerOwnerWallet: row.peer_wallet?.toLowerCase() ?? null,
    peerXmtpRegisteredAt: peerUser?.xmtp_registered_at ?? null,
  } satisfies ConversationWithLastMessage;
}
```

Then at the TOP of `fetchConversations`, after the `if (!myAccountId) return [];` guard, insert:

```ts
  if (inboxRpcAvailable !== false) {
    const { data, error } = await supabase.rpc('get_conversations_inbox', {
      p_account_id: myAccountId,
    });
    if (!error && Array.isArray(data)) {
      inboxRpcAvailable = true;
      const rows = (data as InboxRpcRow[])
        .map((r) => mapInboxRpcRow(r, myAccountId))
        .filter((r): r is ConversationWithLastMessage => r !== null);
      rows.sort((a, b) => {
        const ta = a.lastMessage?.created_at ?? a.created_at;
        const tb = b.lastMessage?.created_at ?? b.created_at;
        return new Date(tb).getTime() - new Date(ta).getTime();
      });
      return rows;
    }
    if (error?.code === 'PGRST202') {
      inboxRpcAvailable = false;
    }
  }
```

The legacy body below stays byte-identical (it is the fallback).

- [ ] **Step 3: Verify**

Run: `cd apps/expo && pnpm lint`
Expected: clean. Double-check the mapped object against the legacy row construction (lines ~309-332 of the current file) field-by-field — they must produce identical shapes.

- [ ] **Step 4: Commit and push**

```bash
git add apps/expo/supabase/migrations/conversations_inbox_rpc.sql apps/expo/lib/supabase-messages.ts
git commit -m "feat(expo): get_conversations_inbox RPC — chat inbox in one round-trip with fallback"
git push
```

---

### Task 8: Inbox snapshot cache + incremental realtime

**Files:**
- Create: `apps/expo/lib/inbox-cache.ts`
- Modify: `apps/expo/context/MessagingContext.tsx`

**Interfaces:**
- Consumes: `ConversationWithLastMessage` type from lib/supabase-messages.
- Produces: `loadCachedInbox(accountId: string): Promise<ConversationWithLastMessage[] | null>` and `saveCachedInbox(accountId: string, rows: ConversationWithLastMessage[]): Promise<void>`.

- [ ] **Step 1: Create the inbox cache module (mirrors lib/story-cache.ts)**

```ts
// apps/expo/lib/inbox-cache.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ConversationWithLastMessage } from '@/lib/supabase-messages';

const key = (accountId: string) => `@cached_inbox_${accountId}`;

/**
 * Last successfully-loaded inbox for an account, persisted so the chat list
 * renders instantly on cold start instead of spinning through the
 * wallet-reconnect → accounts → conversations chain. Reconciled with fresh
 * data as soon as the real load lands; see MessagingContext.
 */
export async function loadCachedInbox(
  accountId: string
): Promise<ConversationWithLastMessage[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ConversationWithLastMessage[]) : null;
  } catch {
    return null;
  }
}

export async function saveCachedInbox(
  accountId: string,
  rows: ConversationWithLastMessage[]
): Promise<void> {
  try {
    await AsyncStorage.setItem(key(accountId), JSON.stringify(rows));
  } catch {
    // Non-fatal: cold-start hydration just won't be available next launch.
  }
}
```

- [ ] **Step 2: Hydrate + persist in MessagingContext**

In `apps/expo/context/MessagingContext.tsx`:

1. Import: `import { loadCachedInbox, saveCachedInbox } from '@/lib/inbox-cache';`

2. In `loadConversations`, right after the final guarded `setConversations(convos);` (inside the `if (accountIdRef.current === accountId)` block), add:

```ts
        void saveCachedInbox(accountId, convos);
```

3. In the account-change effect (the one that currently does `accountIdRef.current = activeAccountId; loadConversations(activeAccountId); loadUnreadCount(activeAccountId);`), insert the hydration between setting the ref and the loads:

```ts
    accountIdRef.current = activeAccountId;
    // Cold-start hydration: show the last-known inbox instantly while the
    // real load (network + XMTP merge) runs. Never overwrites fresher data.
    void loadCachedInbox(activeAccountId).then((cached) => {
      if (!cached || accountIdRef.current !== activeAccountId) return;
      setConversations((prev) => (prev.length > 0 ? prev : cached));
    });
    loadConversations(activeAccountId);
    loadUnreadCount(activeAccountId);
```

- [ ] **Step 3: Incremental + coalesced realtime handling**

Still in MessagingContext, replace the Supabase realtime effect's INSERT callback (currently: `() => { const current = accountIdRef.current; if (current) { loadConversations(current); loadUnreadCount(current); } }`) with a payload-aware version. Also add a ref near the other refs: `const supabaseReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);`

```ts
        (payload) => {
          const current = accountIdRef.current;
          if (!current) return;

          // Instant optimistic patch when the conversation is already
          // visible — no network needed to show the new preview/badge.
          const row = payload.new as any;
          if (row?.conversation_id) {
            setConversations((prev) => {
              const idx = prev.findIndex((c) => c.id === row.conversation_id);
              if (idx === -1) return prev;
              const updated = {
                ...prev[idx],
                lastMessage: row,
                hasUnread:
                  row.sender_account_id !== current ? true : prev[idx].hasUnread,
              };
              const next = [...prev];
              next[idx] = updated;
              next.sort((a, b) => {
                const ta = a.lastMessage?.created_at ?? a.created_at;
                const tb = b.lastMessage?.created_at ?? b.created_at;
                return new Date(tb).getTime() - new Date(ta).getTime();
              });
              return next;
            });
          }

          // Authoritative reload, coalesced: a burst of inserts triggers ONE
          // refetch instead of one per message.
          if (supabaseReloadTimerRef.current) clearTimeout(supabaseReloadTimerRef.current);
          supabaseReloadTimerRef.current = setTimeout(() => {
            const id = accountIdRef.current;
            if (id) {
              loadConversations(id);
              loadUnreadCount(id);
            }
          }, 1200);
        }
```

And in that effect's cleanup, alongside `supabase.removeChannel(channel);`, add:

```ts
      if (supabaseReloadTimerRef.current) clearTimeout(supabaseReloadTimerRef.current);
```

- [ ] **Step 4: Verify**

Run: `cd apps/expo && pnpm lint`
Expected: clean. Manually re-read the diff and confirm: (a) the optimistic patch NEVER creates a new conversation row (unknown conversation_id → only the debounced reload handles it); (b) personal-account XMTP-only rows are only patched if the Supabase message's conversation_id matches a visible row (rare legacy rail) and the debounced authoritative reload restores XMTP truth within ~1.2s.

- [ ] **Step 5: Commit and push**

```bash
git add apps/expo/lib/inbox-cache.ts apps/expo/context/MessagingContext.tsx
git commit -m "feat(expo): instant chat inbox — persisted snapshot + incremental realtime patches"
git push
```

---

### Task 9: Cold-start parallelization (accounts snapshot + thirdweb parallel fetch)

**Files:**
- Create: `apps/expo/lib/account-cache.ts`
- Modify: `apps/expo/context/AccountContext.tsx`
- Modify: `apps/expo/context/UserContext.tsx`

**Interfaces:**
- Consumes: `Account` type from `@/lib/types`.
- Produces: `loadCachedAccounts(): Promise<CachedAccounts | null>`, `saveCachedAccounts(bundle: CachedAccounts): Promise<void>`, `clearCachedAccounts(): Promise<void>` where `CachedAccounts = { walletAddress: string; activeAccount: Account | null; ownedAccounts: Account[]; savedAt: number }`.

Effect: on cold start the chain `cached user → fetchOwnedAccounts (network) → activeAccount → MessagingContext load` loses its network hop — activeAccount hydrates from disk, so the chat list (Task 8 cache) and account-gated UI render immediately.

- [ ] **Step 1: Create the account cache module**

```ts
// apps/expo/lib/account-cache.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Account } from '@/lib/types';

const CACHED_ACCOUNTS_KEY = '@cached_accounts';

export type CachedAccounts = {
  walletAddress: string;
  activeAccount: Account | null;
  ownedAccounts: Account[];
  savedAt: number;
};

/**
 * Last successfully-loaded accounts for a wallet, persisted so AccountContext
 * (and everything gated on activeAccount — chat, org UI) hydrates instantly on
 * cold start instead of waiting for the fetchOwnedAccounts round-trip behind
 * the thirdweb reconnect. Reconciled with fresh data once refreshAccounts
 * lands; cleared on logout.
 */
export async function loadCachedAccounts(): Promise<CachedAccounts | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_ACCOUNTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.walletAddress === 'string' &&
      Array.isArray(parsed.ownedAccounts)
    ) {
      return parsed as CachedAccounts;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveCachedAccounts(bundle: CachedAccounts): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHED_ACCOUNTS_KEY, JSON.stringify(bundle));
  } catch {
    // Non-fatal.
  }
}

export async function clearCachedAccounts(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHED_ACCOUNTS_KEY);
  } catch {
    // Non-fatal.
  }
}
```

- [ ] **Step 2: Hydrate + persist in AccountContext**

In `apps/expo/context/AccountContext.tsx`:

1. Import: `import { loadCachedAccounts, saveCachedAccounts, clearCachedAccounts } from '@/lib/account-cache';`

2. Add an optimistic-hydration effect after the MRU-restore effect:

```ts
  // Optimistic hydration: restore the last-known accounts for THIS wallet so
  // activeAccount (and everything gated on it — chat, org UI) is available
  // before the fetchOwnedAccounts round-trip completes. `prev ?? cached`
  // ensures a fast real load is never clobbered.
  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    loadCachedAccounts().then((cached) => {
      if (cancelled || !cached) return;
      if (cached.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) return;
      setOwnedAccounts((prev) => (prev.length > 0 ? prev : cached.ownedAccounts));
      setActiveAccount((prev) => prev ?? cached.activeAccount);
    });
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);
```

3. In `refreshAccounts`, persist after the active account is resolved. Restructure the resolution to compute a local `resolved` first, then set + save (behavior identical to today):

```ts
      const accounts = await fetchOwnedAccounts(walletAddress);
      setOwnedAccounts(accounts);

      let resolved: Account | null = null;
      if (user?.active_account_id) {
        const active = accounts.find((a) => a.id === user.active_account_id);
        if (active) {
          resolved = active;
        } else {
          const fetched = await fetchAccountById(user.active_account_id);
          resolved =
            fetched || accounts.find((a: Account) => a.account_type === 'personal') || null;
        }
      } else {
        resolved = accounts.find((a) => a.account_type === 'personal') || null;
      }
      setActiveAccount(resolved);
      void saveCachedAccounts({
        walletAddress,
        activeAccount: resolved,
        ownedAccounts: accounts,
        savedAt: Date.now(),
      });
```

4. In the reset-on-disconnect effect (the `if (!walletAddress)` one), add `void clearCachedAccounts();` next to the existing `AsyncStorage.removeItem(RECENT_ACCOUNT_IDS_KEY)`.

- [ ] **Step 3: Parallelize the thirdweb calls in UserContext**

In `apps/expo/context/UserContext.tsx`, inside `syncUser`, replace the sequential `getUserEmail` → `getProfiles` block (the two try/catch blocks under `if (wallet && wallet.id === 'inApp')`) with:

```ts
        let email: string | undefined;
        let authProvider: string | undefined;
        if (wallet && wallet.id === 'inApp') {
          // Two independent thirdweb round-trips — run them in parallel;
          // each failure stays non-fatal, matching the old behavior.
          const [emailRes, profilesRes] = await Promise.allSettled([
            getUserEmail({ client }),
            getProfiles({ client }),
          ]);
          if (emailRes.status === 'fulfilled') email = emailRes.value;
          if (profilesRes.status === 'fulfilled') {
            const primary = profilesRes.value?.find(
              (p: { type?: string }) => p.type && p.type !== 'guest'
            );
            authProvider = primary?.type;
          }
        }
```

- [ ] **Step 4: Verify**

Run: `cd apps/expo && pnpm lint`
Expected: clean.

- [ ] **Step 5: Commit and push**

```bash
git add apps/expo/lib/account-cache.ts apps/expo/context/AccountContext.tsx apps/expo/context/UserContext.tsx
git commit -m "feat(expo): cold-start parallelization — accounts snapshot + parallel thirdweb profile fetch"
git push
```

---

### Task 10: Final verification + operations doc

**Files:**
- Create: `docs/SUPABASE_LOADING_SPEED.md`

- [ ] **Step 1: Full verification sweep**

```bash
cd apps/expo && pnpm lint && npx jest --watchAll=false lib/__tests__/image-url.test.ts
```

Expected: lint clean (vs pre-existing baseline), jest green. Then `git status` must be clean (everything committed and pushed).

- [ ] **Step 2: Write the ops doc**

Create `docs/SUPABASE_LOADING_SPEED.md` summarizing (in your own words, reflecting what was ACTUALLY built):
- The caching architecture (TanStack persisted queries; which query keys persist; the `meta.persist` opt-in; the version buster).
- The two RPCs, what they replace, and the fallback semantics (PGRST202 feature-detection).
- **OPEN GATES (user actions):**
  1. Apply `apps/expo/supabase/migrations/add_mini_app_share.sql` (pre-existing gate), then `feed_page_rpc.sql`, then `conversations_inbox_rpc.sql` via the Supabase MCP (`apply_migration`) — in that order.
  2. Ship the OTA update himself (never run `eas update` for him).
  3. Optional next EAS build: swap the AsyncStorage persister for react-native-mmkv (native module — needs a build, not OTA).
- Verification checklist for the user after applying migrations: feed loads with ONE `get_feed_page` request (check Supabase logs), airplane-mode cold start still renders feed/explore/chat list from cache.

- [ ] **Step 3: Commit and push**

```bash
git add docs/SUPABASE_LOADING_SPEED.md
git commit -m "docs: Supabase loading-speed architecture + migration gates"
git push
```
