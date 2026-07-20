# Supabase Loading Speed — Architecture & Operations

Shipped 2026-07-20 on `main` (commits `465ff08..7519219`, 12 commits). Goal: instant
perceived loading from a persisted local cache plus far fewer network round-trips,
so apps/expo stays fast on slow/flaky rural connections. Plan:
[`docs/superpowers/plans/2026-07-20-supabase-loading-speed.md`](superpowers/plans/2026-07-20-supabase-loading-speed.md).

## Caching architecture

**TanStack Query v5 (^5.101.2) with a persisted AsyncStorage cache** — pure JS,
OTA-shippable, no native modules.

- [`apps/expo/lib/query-client.ts`](../apps/expo/lib/query-client.ts): the shared
  `QueryClient` (staleTime 60s, gcTime 7d, retry 2), an AsyncStorage persister under
  the key `roebel-query-cache` (throttle 2s), `onlineManager` wired to NetInfo
  (requests pause offline, refetch on reconnect), `focusManager` wired to AppState.
- `PersistQueryClientProvider` is the outermost provider in
  [`apps/expo/app/_layout.tsx`](../apps/expo/app/_layout.tsx). Persistence maxAge 7d;
  the cache **buster is the app version** (`Constants.expoConfig.version`), so every
  release starts a fresh namespace.
- **Opt-in persistence:** only queries with `meta: { persist: true }` are written to
  disk (`shouldDehydrateQuery`), keeping the storage entry small.

Persisted query keys today:

| Key | Screen | Source |
|---|---|---|
| `['feed','posts',feedType]` | feed posts (infinite) | `hooks/useFeed.ts` |
| `['feed','sections',feedType]` | alerts/deals/events/news/… bundle | `lib/feed-sections.ts` |
| `['explore','all']` | explore screen bundle | `app/explore.tsx` |

Hand-rolled AsyncStorage snapshots (contexts, mirroring the pre-existing
`lib/user-cache.ts` pattern):

- `lib/inbox-cache.ts` — `@cached_inbox_<accountId>`: chat list renders instantly on
  cold start; reconciled when the real (XMTP-merged) load lands. A guard skips both
  the state update and the persist while a personal account is still waiting for
  XMTP to boot, so the placeholder empty list can never wipe the snapshot.
- `lib/account-cache.ts` — `@cached_accounts`: owned accounts + active account per
  wallet (case-insensitively validated), removing the `fetchOwnedAccounts` network
  hop from the cold-start chain. Cleared on logout.

## Feed behavior changes

- **Progressive render** (`hooks/useFeed.ts`): first paint waits only on the posts
  query; the 10 section queries stream in afterward. Previously all 11 blocked in one
  `Promise.all`.
- **Pull-to-refresh fetches a fresh page 0 and collapses the cache to one page**
  (`refresh()` uses `setQueryData` with `{pages:[first], pageParams:[0]}`). There is
  deliberately **no `maxPages`** on the infinite query: TanStack's front-eviction
  would otherwise let `pageParams[0]` drift off 0 and background refetches would
  permanently miss new/pinned posts. Do not reintroduce `maxPages`.

## The two RPCs (one round-trip instead of many)

Both migrations live in `apps/expo/supabase/migrations/` and are **feature-detected
by the client**: on PostgREST error `PGRST202` (function not found) the app
permanently (per session) falls back to the legacy multi-request path, byte-identical
to the old code. Applying the migrations is therefore a pure speedup with no
deploy-order coupling.

1. **`feed_page_rpc.sql` → `get_feed_page(p_feed_type, p_page, p_page_size, p_wallet)`**
   Replaces up to 4 serial requests (page → pinned → quoted-post hydration →
   mini-app hydration) **plus** the 2 like/repost state queries. Returns
   `{posts, has_more, liked_post_ids, reposted_post_ids}` where each post embeds
   author/account/links/poll/linked_event/linked_marketplace/sticker/quoted_post
   (one level)/linked_mini_app in exactly the shape of the legacy PostgREST select.
   Client: `fetchFeedPosts` in `lib/supabase-posts.ts`; `FeedList` uses the
   RPC-provided like/repost sets when present, else falls back to its own queries.
2. **`conversations_inbox_rpc.sql` → `get_conversations_inbox(p_account_id)`**
   Replaces 4 batched queries + 2 queries *per conversation* with one call (lateral
   joins: peer account, owner user for personal peers only, last message with
   sticker, caller's last_read_at). Client: `fetchConversations` in
   `lib/supabase-messages.ts` (`mapInboxRpcRow` produces the identical
   `ConversationWithLastMessage` shape).

Both functions are `SECURITY DEFINER`; all touched tables already carry
allow-all/anon-readable RLS policies, so the RPCs widen nothing.

## Realtime inbox

New `direct_messages` INSERTs now patch the visible conversation row in place
(preview + unread dot, no network) and schedule ONE coalesced authoritative reload
(≤1.2s after the first insert of a burst, non-re-arming timer). Previously every
insert triggered a full inbox refetch. The optimistic patch never creates rows —
unknown conversations arrive via the reload, preserving the XMTP-only personal-inbox
policy.

## Images

- `lib/image-url.ts` — `transformedImageUrl(url, {width, quality})` rewrites Supabase
  Storage public URLs to the **image transform endpoint** (`/render/image/public/…`,
  Pro-plan feature); passes through non-Supabase URLs, videos, gifs, svgs. Unit
  tests: `lib/__tests__/image-url.test.ts`.
- Feed post images request display-size variants (single 1080px, grid cells 640px,
  avatars 160px) with `cachePolicy="memory-disk"` + `recyclingKey` (original URL) —
  `components/feed/PostImageGrid.tsx`, `components/UserAvatarWithFrame.tsx`.

## Cold start

Identity chain parallelized: cached user (existing) → cached accounts (new) → cached
inbox (new) all hydrate from disk at t=0; the network chain (thirdweb autoConnect →
user sync → accounts → chat) reconciles behind. Inside `UserContext.syncUser` the two
thirdweb calls (`getUserEmail`, `getProfiles`) now run in parallel via
`Promise.allSettled`.

Explore queries are bounded now: events ≥ today + limit 60, news limit 20,
restaurants limit 50 (movies/deals/listings unchanged).

## OPEN GATES (user actions)

1. **Apply migrations via Supabase MCP** (`apply_migration`), in this order:
   1. `apps/expo/supabase/migrations/add_mini_app_share.sql` (pre-existing gate —
      `get_feed_page` reads `posts.linked_mini_app_id`)
   2. `apps/expo/supabase/migrations/feed_page_rpc.sql`
   3. `apps/expo/supabase/migrations/conversations_inbox_rpc.sql`
   Until applied, the app silently uses the legacy paths — nothing breaks.
2. **Ship the OTA update yourself** (all 12 commits are JS/SQL only — no native
   changes, no app.config.ts changes; OTA-safe).
3. Optional, next EAS build: swap the AsyncStorage persister for `react-native-mmkv`
   (native module → build required, not OTA) for faster synchronous cache reads.

## Post-migration verification checklist

- Supabase logs: opening the feed issues ONE `get_feed_page` RPC call (not 4-7 REST
  requests); opening chats issues ONE `get_conversations_inbox` call.
- Cold start in airplane mode: feed, explore, and chat list render the last-seen
  content from cache (no infinite spinners).
- Feed images load noticeably smaller (network inspector: `/render/image/public/`
  URLs with `width=` params) — requires Pro-plan image transformations enabled.
- Pull-to-refresh after deep scrolling still surfaces brand-new and pinned posts
  (the page-0 anchor fix).
