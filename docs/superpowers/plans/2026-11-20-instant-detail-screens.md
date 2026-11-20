# Instant Detail Screens (Optimistic UI, layer 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Event and marketplace detail pages open instantly with the data the tapped card already had, then refresh in the background — no full-page skeleton when the app already knows the item.

**Architecture:** Detail data moves from per-screen `useEffect` + `useState` into React Query (`lib/query-client.ts`, already app-wide). Every card that opens a detail page goes through one helper (`openEvent` / `openListing`) that first seeds the detail query with the card's record (marked stale, so the page still refetches) and prefetches on press-in. The detail pages read `useEventDetail` / `useListingDetail`; the skeleton only shows when there is no data at all.

**Tech Stack:** Expo SDK 56 (OTA onto runtime 3.10.0), expo-router 56, @tanstack/react-query v5 (`queryClient` singleton in `apps/expo/lib/query-client.ts`), Supabase JS, Jest (`jest-expo`) + `react-test-renderer`.

**Spec:** Conversation decision 2026-11-20 (Max: "yes, sounds great") on the optimistic-UI proposal — layer 2 "instant screens" first, on event + marketplace details. Layers 1 (optimistic actions) and 3 (warm main tabs) get their own plans afterwards.

## Global Constraints

- All code under `apps/expo`; package manager pnpm; no new dependencies, no native modules (ships as an OTA onto the installed 3.10.0 binary).
- Navigation hooks only from `expo-router` (never `@react-navigation/native` — crashes under expo-router 56).
- Styling `StyleSheet.create` + `useTheme()`; UI copy German, identifiers/comments English.
- Query keys exactly: `['event-detail', id]` and `['listing-detail', id]`.
- Seeded data must be stale immediately (`updatedAt: 0`) so the detail page always refetches once on mount.
- Detail queries are NOT persisted to disk (no `meta.persist`).
- Never pass Skia objects through shared values (unrelated, but the event page renders `DesignedCard`s — don't touch that path).
- Run single Jest files only (`npx jest <path>`); the full suite and full `tsc` are too slow/large for this Mac (12 GB heap needed for tsc).

## Review Focus

1. **Seeded partial record** — a list query may select fewer columns than `select('*')`; the detail page must render with missing optional fields (no crash on `undefined`), then show the full record after refetch. Test in Task 2/3.
2. **Item deleted or hidden after seeding** — refetch returns `null`; the page must show its "not found" state, not keep the stale seeded card. Test in Task 1 (`useEventDetail` / `useListingDetail` return `notFound: true`).
3. **Seed never overwrites fresher data** — back → list → open again must not replace a fully fetched record with an older card record. Test in Task 1.
4. **Offline open** — seeded data renders; the paused refetch must not flip the page to a skeleton (`isLoading` false whenever data exists). Test in Task 1.
5. **View tracking runs once per id** — `logEventView` / `recordView` / `trackListingView` fire once per opened id, not again on every background refetch. Test in Task 2/3 via a mocked tracker.

---

### Task 1: Detail queries, seeding and hooks

**Files:**
- Create: `apps/expo/lib/queries/detailQueries.ts`
- Create: `apps/expo/hooks/useDetailQueries.ts`
- Test: `apps/expo/lib/__tests__/detail-queries.test.ts`
- Test: `apps/expo/hooks/__tests__/useDetailQueries.test.tsx`

**Interfaces:**
- Produces (`lib/queries/detailQueries.ts`):
  - `eventDetailKey(id: string): readonly ['event-detail', string]`
  - `listingDetailKey(id: string): readonly ['listing-detail', string]`
  - `fetchEventDetail(id: string): Promise<EventRecord | null>` — `supabase.from('events').select('*').eq('id', id).maybeSingle()`; error → throw, no row → `null`.
  - `fetchListingDetail(id: string): Promise<MarketplaceListingRecord | null>` — wraps existing `fetchListingById` from `lib/supabase-marketplace.ts`.
  - `seedEventDetail(event: EventRecord): void` and `seedListingDetail(listing: MarketplaceListingRecord): void` — `queryClient.setQueryData(key, record, { updatedAt: 0 })` only when the query has no data yet.
  - `prefetchEventDetail(id: string): void` and `prefetchListingDetail(id: string): void` — `queryClient.prefetchQuery({ queryKey, queryFn, staleTime: 30_000 })`, errors swallowed.
- Produces (`hooks/useDetailQueries.ts`):
  - `useEventDetail(id: string | undefined): { event: EventRecord | null; isLoading: boolean; notFound: boolean; refetch: () => Promise<unknown> }`
  - `useListingDetail(id: string | undefined): { listing: MarketplaceListingRecord | null; isLoading: boolean; notFound: boolean; refetch: () => Promise<unknown> }`
  - `isLoading` = no data yet AND fetching; `notFound` = query succeeded with `null`.

- [ ] **Step 1: Write the failing tests** (`lib/__tests__/detail-queries.test.ts`, mock `@/lib/supabase` and `@/lib/supabase-marketplace`; `beforeEach(() => queryClient.clear())`)

```ts
it('seeds an empty event query, stale at once', () => {
  seedEventDetail({ id: 'e1', title: 'Hafenfest' } as EventRecord);
  expect(queryClient.getQueryData(eventDetailKey('e1'))).toMatchObject({ title: 'Hafenfest' });
  expect(queryClient.getQueryState(eventDetailKey('e1'))?.dataUpdatedAt).toBe(0);
});
it('never overwrites existing detail data', () => {
  queryClient.setQueryData(eventDetailKey('e1'), { id: 'e1', title: 'Full' });
  seedEventDetail({ id: 'e1', title: 'Card' } as EventRecord);
  expect(queryClient.getQueryData(eventDetailKey('e1'))).toMatchObject({ title: 'Full' });
});
it('same two rules for listings', () => { /* seedListingDetail mirrors the two cases above */ });
it('fetchEventDetail returns null for a missing row and throws on error', async () => { /* maybeSingle → {data:null} → null; {error} → rejects */ });
```

- [ ] **Step 2: Write the failing hook tests** (`hooks/__tests__/useDetailQueries.test.tsx`, render inside `QueryClientProvider client={queryClient}` with `react-test-renderer` + `act`)

```tsx
it('returns seeded data immediately without loading', () => {
  seedEventDetail({ id: 'e1', title: 'Card' } as EventRecord);
  const r = renderHookResult(() => useEventDetail('e1'));
  expect(r.event?.title).toBe('Card');
  expect(r.isLoading).toBe(false);
});
it('replaces seeded data with the refetched record', async () => { /* fetch resolves {title:'Full'} → event.title === 'Full' */ });
it('reports notFound when the refetch returns null, even after seeding', async () => { /* → notFound true, event null */ });
it('stays out of loading while offline with seeded data', () => { /* onlineManager.setOnline(false) → isLoading false */ });
it('useListingDetail mirrors seeded/notFound behaviour', async () => {});
```

- [ ] **Step 3: Run both test files, verify they fail**

Run: `cd apps/expo && npx jest lib/__tests__/detail-queries.test.ts hooks/__tests__/useDetailQueries.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `lib/queries/detailQueries.ts` and `hooks/useDetailQueries.ts`** per the Interfaces block. Hooks use `useQuery({ queryKey, queryFn, enabled: !!id, staleTime: 30_000 })`; `notFound` = `status === 'success' && data === null`.

- [ ] **Step 5: Run the tests, verify they pass** (same command; expect PASS).

- [ ] **Step 6: Commit**

```bash
git add apps/expo/lib/queries/detailQueries.ts apps/expo/hooks/useDetailQueries.ts apps/expo/lib/__tests__/detail-queries.test.ts apps/expo/hooks/__tests__/useDetailQueries.test.tsx
git commit -m "feat(expo): detail queries with card seeding (instant detail screens, part 1)"
```

### Task 2: Event detail reads from the query

**Files:**
- Modify: `apps/expo/app/event/[id].tsx` (the `load()` effect at ~lines 206–300 and the `event`/`loading` state at ~106–110)
- Test: `apps/expo/lib/__tests__/event-view-tracking.test.ts`

**Interfaces:**
- Consumes: `useEventDetail(id)` from Task 1.
- Produces: `trackEventOpen(event: EventRecord, address: string | undefined): void` in `apps/expo/lib/queries/detailQueries.ts` — calls `logEventView` + `recordView` at most once per event id per app session (module-level `Set<string>`), so background refetches never double-count.

- [ ] **Step 1: Write the failing test** — `trackEventOpen` called twice with the same id calls the mocked `logEventView` once; a different id calls it again.

- [ ] **Step 2: Run it, verify it fails** (`npx jest lib/__tests__/event-view-tracking.test.ts` → FAIL, not defined).

- [ ] **Step 3: Implement `trackEventOpen`, then refactor the screen:** `const { event, isLoading, notFound } = useEventDetail(id)`; delete `setEvent`/main fetch; keep publisher account, `event_dates` and "more events" loading in an effect keyed on `event?.id` (they render progressively below the fold); skeleton only when `isLoading`; existing not-found UI when `notFound`; call `trackEventOpen(event, activeAccount?.address)` in an effect on `event?.id`. Guard optional fields (Review Focus 1): every field not in the card's select must tolerate `undefined`.

- [ ] **Step 4: Run the test, verify it passes.**

- [ ] **Step 5: Commit** — `feat(expo): event detail renders seeded data instantly (instant detail screens, part 2)`

### Task 3: Marketplace detail reads from the query

**Files:**
- Modify: `apps/expo/app/marketplace/[id].tsx` (`loadData` at ~line 138 and `listing`/`loading` state at ~83–85)
- Test: extend `apps/expo/lib/__tests__/event-view-tracking.test.ts` → rename `detail-view-tracking.test.ts`

**Interfaces:**
- Consumes: `useListingDetail(id)` from Task 1.
- Produces: `trackListingOpen(listing: MarketplaceListingRecord): void` (once per id per session, wraps existing `trackListingView`).

- [ ] **Step 1: Write the failing test** — `trackListingOpen` twice with one id → mocked `trackListingView` called once.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement + refactor the screen:** `useListingDetail(id)`; "Weitere Anzeigen" (`fetchMarketplaceListings({ limit: 7 })`) moves to its own `useQuery(['listing-more', id])`; seller lookup effect stays keyed on `listing?.account_id` / `seller_wallet_address`; skeleton only when `isLoading`; not-found UI when `notFound`.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(expo): marketplace detail renders seeded data instantly (instant detail screens, part 3)`

### Task 4: One way in — `openEvent` / `openListing` + press-in prefetch

**Files:**
- Create: `apps/expo/lib/navigation/openDetail.ts`
- Test: `apps/expo/lib/__tests__/open-detail.test.ts`
- Modify (replace their `router.push` to `/event/[id]` or `/marketplace/[id]` with the helper, passing the full record they hold): `components/EventCard.tsx`, `components/HeroCarousel.tsx`, `components/HeroEventCard.tsx`, `components/HeroCards.tsx`, `components/HorizontalEventCard.tsx`, `components/EventListRow.tsx`, `components/BookmarkedEvents.tsx`, `components/TinderHeroCards.tsx`, `components/EnhancedTinderCards.tsx`, `components/DeckCardSwiper.tsx`, `components/SwipeableCardStack.tsx`, `components/LivestreamBanner.tsx`, `components/feed/FeedEventCard.tsx`, `components/feed/FeedExperienceCard.tsx`, `components/feed/HomeStoryBar.tsx`, `components/feed/PostLinkedEventCard.tsx`, `components/MarketplaceCard.tsx`, `components/feed/FeedMarketplaceCard.tsx`, `components/feed/PostLinkedMarketplaceCard.tsx`, `components/messages/ListingCard.tsx`, `components/profile/ProfileOfferRows.tsx`, `components/org/BusinessProfileView.tsx`, `app/org/services.tsx`, `app/org/products.tsx`, `app/account/[id]/index.tsx`, `app/marketplace/[id].tsx` ("Weitere Anzeigen"), `components/map/MapPlaceSheet.tsx`, `components/mecky/MeckyResultCard.tsx`, `app/notifications/index.tsx`, `app/org/sponsoring/[slug].tsx`. Callers that only hold an id pass `{ id }`.

**Interfaces:**
- Produces:
  - `openEvent(event: EventRecord | { id: string }, opts?: { replace?: boolean }): void` — seeds when the argument has more than `id`, then `router.push({ pathname: '/event/[id]', params: { id } })` (or `replace`).
  - `openListing(listing: MarketplaceListingRecord | { id: string }, opts?: { replace?: boolean }): void` — same for `/marketplace/[id]`.
  - `prefetchOnPressIn` usage: cards add `onPressIn={() => prefetchEventDetail(event.id)}` / `prefetchListingDetail(listing.id)` (from Task 1) on their main Pressable.

- [ ] **Step 1: Write the failing test** (mock `expo-router` `router.push/replace`):

```ts
it('seeds then pushes the event route', () => {
  openEvent({ id: 'e1', title: 'Hafenfest' } as EventRecord);
  expect(queryClient.getQueryData(eventDetailKey('e1'))).toMatchObject({ title: 'Hafenfest' });
  expect(router.push).toHaveBeenCalledWith({ pathname: '/event/[id]', params: { id: 'e1' } });
});
it('an id-only call does not seed', () => {
  openEvent({ id: 'e2' });
  expect(queryClient.getQueryData(eventDetailKey('e2'))).toBeUndefined();
});
it('openListing pushes /marketplace/[id] and seeds', () => {});
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement `openDetail.ts`, then convert every caller listed above** (keep each caller's other behaviour — analytics, haptics, `replace` where it used `router.replace`).
- [ ] **Step 4: Run the test; then verify no direct pushes remain:**

Run: `cd apps/expo && grep -rnE "router\.(push|replace)\(.*(/event/\[id\]|/event/\\$\{|/marketplace/\[id\]|/marketplace/\\$\{)" app components | grep -v "edit-event\|/tickets\|/dates\|badge-qr"`
Expected: no output.

- [ ] **Step 5: Commit** — `feat(expo): cards open details through openEvent/openListing with seeding + press-in prefetch (instant detail screens, part 4)`

### Task 5: Device check and OTA

**Files:** none (verification only).

- [ ] **Step 1:** `grep -rnE "from '@react-navigation/native'" apps/expo/app apps/expo/components | grep -v "import type"` → no output.
- [ ] **Step 2:** Run the four new test files together: `cd apps/expo && npx jest lib/__tests__/detail-queries.test.ts hooks/__tests__/useDetailQueries.test.tsx lib/__tests__/detail-view-tracking.test.ts lib/__tests__/open-detail.test.ts` → all PASS.
- [ ] **Step 3:** Push `main`, publish the preview Android OTA from `.worktrees/prod-390` (`.ota/preview-android.sh`, message "Detailseiten öffnen sofort"), then on the Pixel: open an event from Erkunden and a listing from Austausch → title, image and date appear in the first frame; airplane mode → open a seeded event → content shows, no endless skeleton.
