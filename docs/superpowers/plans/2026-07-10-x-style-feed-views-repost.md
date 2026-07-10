# X-Style Feed + Views + App-Feed Repost/Quote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Expo home feed like X/Twitter (full-width posts, hairline separators), add an impression-based views count with per-user tracking and a creator-only viewer list, and add repost/quote for App-feed posts that land in the main feed.

**Architecture:** Reposts/quotes are `posts` rows with a self-referencing `quoted_post_id` (no separate repost table) so pagination/profile/deletion/RLS work unchanged. Views are counted per (post, wallet) in a `post_views` table via one batched SECURITY DEFINER RPC that also bumps a denormalized `posts.views_count`. All UI is StyleSheet + `useTheme()` — NO NativeWind.

**Tech Stack:** Expo SDK 55 / React Native, Supabase (Postgres + RPC via `@/lib/supabase`), jest-expo for pure-logic tests, react-native-svg-transformer for `.svg` imports.

**Spec:** `docs/superpowers/specs/2026-07-10-x-style-feed-views-design.md`

## Global Constraints

- Styling: `StyleSheet.create()` + `useTheme()` tokens from `constants/theme.ts`. NO NativeWind.
- All UI copy German. NEVER display raw wallet addresses — resolve account name → display name → username → „Jemand".
- Font tokens: existing code uses `Inter-*` names (aliased to Mona Sans) — match surrounding files.
- Supabase operations (apply migration, ad-hoc SQL checks) go through the **Supabase MCP**, never a CLI.
- Package manager: pnpm. Commit convention: `feat(expo): …` / `fix(expo): …`. Commit with explicit pathspecs (never `git add .`), push after every commit.
- Do NOT run `eas update` — the user runs it himself.
- The repo has ~431 pre-existing tsc errors; only new errors in touched files count as failures.
- `views_count` / `reposts_count` / `quoted_post_id` are optional on `PostRecord` so the app keeps working if the migration lags the JS.

---

### Task 1: Database migration (views + repost/quote + notification exclusion)

**Files:**
- Create: `apps/expo/supabase/migrations/feed_views_reposts.sql`

**Interfaces:**
- Produces: `posts.views_count int`, `posts.reposts_count int`, `posts.quoted_post_id uuid`, table `post_views(post_id, wallet_address, view_count, last_viewed_at)`, RPC `increment_post_views(p_post_ids uuid[], p_wallet text)`, post_type check extended with `'repost','quote'`.

- [ ] **Step 1: Write the migration file** with exactly this content:

```sql
-- Views (X-style impressions, per-user counts) + repost/quote support.
-- Spec: docs/superpowers/specs/2026-07-10-x-style-feed-views-design.md

-- ── Views ────────────────────────────────────────────────────
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.post_views (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  view_count integer NOT NULL DEFAULT 1,
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, wallet_address)
);

ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_views_select ON public.post_views;
CREATE POLICY post_views_select ON public.post_views FOR SELECT USING (true);
-- No INSERT/UPDATE policies: writes happen only through the RPC below.

CREATE OR REPLACE FUNCTION public.increment_post_views(p_post_ids uuid[], p_wallet text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_wallet IS NULL OR btrim(p_wallet) = '' OR p_post_ids IS NULL OR array_length(p_post_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.post_views (post_id, wallet_address)
    SELECT DISTINCT unnest(p_post_ids), lower(p_wallet)
  ON CONFLICT (post_id, wallet_address)
    DO UPDATE SET view_count = post_views.view_count + 1,
                  last_viewed_at = now();

  UPDATE public.posts
     SET views_count = views_count + 1
   WHERE id = ANY(p_post_ids)
     AND status = 'published';
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_post_views(uuid[], text) TO anon, authenticated;

-- ── Repost / quote ───────────────────────────────────────────
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS quoted_post_id uuid REFERENCES public.posts(id);
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS reposts_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS posts_quoted_post_id_idx ON public.posts (quoted_post_id) WHERE quoted_post_id IS NOT NULL;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_post_type_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_post_type_check
  CHECK (post_type IN ('user', 'mecky', 'event_share', 'marketplace_share', 'event_experience', 'repost', 'quote'));

-- One plain repost per user per post (quotes are unlimited).
CREATE UNIQUE INDEX IF NOT EXISTS posts_one_repost_per_user
  ON public.posts (wallet_address, quoted_post_id)
  WHERE post_type = 'repost' AND status = 'published';

-- Maintain reposts_count on the ORIGINAL for repost+quote rows.
CREATE OR REPLACE FUNCTION public.maintain_reposts_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_type IN ('repost', 'quote') AND NEW.quoted_post_id IS NOT NULL AND NEW.status = 'published' THEN
      UPDATE public.posts SET reposts_count = reposts_count + 1 WHERE id = NEW.quoted_post_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_type IN ('repost', 'quote') AND OLD.quoted_post_id IS NOT NULL AND OLD.status = 'published' THEN
      UPDATE public.posts SET reposts_count = GREATEST(0, reposts_count - 1) WHERE id = OLD.quoted_post_id;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.post_type IN ('repost', 'quote') AND OLD.quoted_post_id IS NOT NULL THEN
      IF OLD.status = 'published' AND NEW.status <> 'published' THEN
        UPDATE public.posts SET reposts_count = GREATEST(0, reposts_count - 1) WHERE id = OLD.quoted_post_id;
      ELSIF OLD.status <> 'published' AND NEW.status = 'published' THEN
        UPDATE public.posts SET reposts_count = reposts_count + 1 WHERE id = OLD.quoted_post_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintain_reposts_count ON public.posts;
CREATE TRIGGER trg_maintain_reposts_count
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.maintain_reposts_count();

-- Plain reposts must NOT push-notify the whole town (quotes still do).
-- Recreate the feed-post notification trigger with a post_type exclusion.
DROP TRIGGER IF EXISTS trg_notify_new_main_post ON public.posts;
CREATE TRIGGER trg_notify_new_main_post
  AFTER INSERT ON public.posts
  FOR EACH ROW
  WHEN (NEW.feed_type = 'main' AND NEW.status = 'published' AND NEW.post_type <> 'repost')
  EXECUTE FUNCTION public.notify_new_main_post();
```

- [ ] **Step 2: Apply via Supabase MCP** — `mcp__supabase__apply_migration` with name `feed_views_reposts` and the SQL above.

- [ ] **Step 3: Verify** — `mcp__supabase__execute_sql`:
  - `SELECT column_name FROM information_schema.columns WHERE table_name='posts' AND column_name IN ('views_count','reposts_count','quoted_post_id');` → 3 rows.
  - `SELECT increment_post_views(ARRAY[(SELECT id FROM posts WHERE status='published' LIMIT 1)]::uuid[], '0xTEST');` then `SELECT * FROM post_views WHERE wallet_address='0xtest';` → 1 row, view_count 1. Run RPC again → view_count 2. Clean up: `DELETE FROM post_views WHERE wallet_address='0xtest'; UPDATE posts SET views_count = views_count - 2 WHERE id = (SELECT post_id FROM ...);` (use the id captured above).
  - `SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname='trg_notify_new_main_post';` → contains `post_type <> 'repost'`.

- [ ] **Step 4: Commit**

```bash
git add apps/expo/supabase/migrations/feed_views_reposts.sql
git commit -m "feat(expo): views + repost/quote schema — post_views table, RPC, quoted_post_id, count triggers"
git push
```

---

### Task 2: Types + data layer

**Files:**
- Modify: `apps/expo/lib/types/feed.ts` (PostType, PostRecord, CreatePostInput)
- Modify: `apps/expo/lib/supabase-posts.ts` (FEED_POST_SELECT, createPost, mergeAccountIntoAuthor mapping, new helpers)

**Interfaces:**
- Produces:
  - `PostType = 'user' | 'mecky' | 'event_share' | 'marketplace_share' | 'event_experience' | 'repost' | 'quote'`
  - `PostRecord` gains `views_count?: number; reposts_count?: number; quoted_post_id?: string | null; quoted_post?: PostRecord | null;`
  - `CreatePostInput` gains `quoted_post_id?: string;`
  - `createRepost(postId: string, walletAddress: string, accountId?: string): Promise<PostRecord | null>`
  - `undoRepost(postId: string, walletAddress: string): Promise<boolean>` (true if a repost row was found and deleted)
  - `getUserRepostedPostIds(postIds: string[], walletAddress: string): Promise<Set<string>>` (returns the ORIGINAL post ids the wallet has published reposts for)
  - `type PostViewer = { wallet_address: string; view_count: number; username: string | null; display_name: string | null; profile_picture_url: string | null }`
  - `getPostViewers(postId: string): Promise<PostViewer[]>` (sorted view_count desc)

- [ ] **Step 1: Extend types** in `apps/expo/lib/types/feed.ts`:

```ts
export type PostType = 'user' | 'mecky' | 'event_share' | 'marketplace_share' | 'event_experience' | 'repost' | 'quote';
```

In `PostRecord` after `comments_count: number;`:

```ts
  /** Denormalized totals — undefined until the feed_views_reposts migration is applied. */
  views_count?: number;
  reposts_count?: number;
  /** Set on repost/quote rows: the original post being referenced. */
  quoted_post_id?: string | null;
```

In the `// Joined data` block:

```ts
  quoted_post?: PostRecord | null;
```

In `CreatePostInput` after `linked_experience_id?: string;`:

```ts
  quoted_post_id?: string;
```

- [ ] **Step 2: Extend FEED_POST_SELECT** in `apps/expo/lib/supabase-posts.ts` — add before the closing backtick (after the `sticker:` line, comma-separated):

```
  quoted_post:posts!posts_quoted_post_id_fkey(
    *,
    author:users!posts_wallet_address_fkey(
      wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
    ),
    account:accounts(id, account_type, name, avatar_url),
    links:post_links(*),
    poll:post_polls(*),
    linked_event:events(id, title, date, time, location, image_url, category),
    linked_marketplace:marketplace_listings(id, title, price, price_type, category, condition, media_urls, neighborhood),
    sticker:lootbox_rewards!sticker_reward_id(id, type, name, asset_url)
  )
```

- [ ] **Step 3: Hydrate the nested author** — update `mergeAccountIntoAuthor` so quoted posts get the same account merge:

```ts
function mergeAccountIntoAuthor<T extends { author?: any; account?: any; quoted_post?: any }>(row: T): T {
  if (row.account && row.author) {
    row.author = { ...row.author, account: row.account };
  }
  if (row.quoted_post) {
    row.quoted_post = mergeAccountIntoAuthor(row.quoted_post);
  }
  return row;
}
```

- [ ] **Step 4: createPost passes quoted_post_id** — in the `.insert({...})` object add (next to the stadtkasse spread, same guarded pattern so posting works pre-migration):

```ts
      ...(input.quoted_post_id ? { quoted_post_id: input.quoted_post_id } : {}),
```

- [ ] **Step 5: Add repost/view helpers** at the end of the Posts section of `lib/supabase-posts.ts`:

```ts
// ─── Reposts ────────────────────────────────────────────────

/**
 * Plain repost: a posts row referencing the original. Lands in the main feed
 * (App-feed posts get promoted into "Für Alle"). RLS/posting rules apply — a
 * PostingDeniedError propagates like normal post creation.
 */
export async function createRepost(
  postId: string,
  walletAddress: string,
  accountId?: string,
): Promise<PostRecord | null> {
  return createPost({
    wallet_address: walletAddress,
    account_id: accountId,
    content: '',
    feed_type: 'main',
    post_type: 'repost',
    quoted_post_id: postId,
  });
}

/** Remove the caller's published repost of `postId`. Returns false if none exists. */
export async function undoRepost(postId: string, walletAddress: string): Promise<boolean> {
  const wallet = walletAddress.toLowerCase();
  const { data, error } = await supabase
    .from('posts')
    .select('id')
    .eq('wallet_address', wallet)
    .eq('quoted_post_id', postId)
    .eq('post_type', 'repost')
    .eq('status', 'published')
    .limit(1);
  if (error || !data || data.length === 0) return false;
  await deletePost(data[0].id, walletAddress);
  return true;
}

/** Which of `postIds` (ORIGINAL ids) has this wallet already reposted? */
export async function getUserRepostedPostIds(
  postIds: string[],
  walletAddress: string,
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('posts')
    .select('quoted_post_id')
    .eq('wallet_address', walletAddress.toLowerCase())
    .eq('post_type', 'repost')
    .eq('status', 'published')
    .in('quoted_post_id', postIds);
  if (error || !data) return new Set();
  return new Set(data.map((r: any) => r.quoted_post_id).filter(Boolean));
}

// ─── Views ──────────────────────────────────────────────────

export type PostViewer = {
  wallet_address: string;
  view_count: number;
  username: string | null;
  display_name: string | null;
  profile_picture_url: string | null;
};

/** Everyone who viewed a post, with per-user counts — for the creator-only drawer. */
export async function getPostViewers(postId: string): Promise<PostViewer[]> {
  const { data: views, error } = await supabase
    .from('post_views')
    .select('wallet_address, view_count')
    .eq('post_id', postId)
    .order('view_count', { ascending: false })
    .limit(200);
  if (error || !views || views.length === 0) return [];

  const wallets = views.map((v: any) => v.wallet_address);
  const { data: users } = await supabase
    .from('users')
    .select('wallet_address, username, display_name, profile_picture_url')
    .in('wallet_address', wallets);

  const byWallet = new Map<string, any>(
    (users ?? []).map((u: any) => [u.wallet_address.toLowerCase(), u]),
  );
  return views.map((v: any) => {
    const u = byWallet.get(v.wallet_address.toLowerCase());
    return {
      wallet_address: v.wallet_address,
      view_count: v.view_count,
      username: u?.username ?? null,
      display_name: u?.display_name ?? null,
      profile_picture_url: u?.profile_picture_url ?? null,
    };
  });
}
```

- [ ] **Step 6: Typecheck touched files** — `cd apps/expo && npx tsc --noEmit 2>&1 | grep -E "lib/types/feed|lib/supabase-posts" || echo CLEAN` → expect `CLEAN` (pre-existing errors elsewhere don't count).

- [ ] **Step 7: Commit**

```bash
git add apps/expo/lib/types/feed.ts apps/expo/lib/supabase-posts.ts
git commit -m "feat(expo): repost/quote + views data layer — types, quoted_post join, repost & viewer helpers"
git push
```

---

### Task 3: Pure logic — formatCompactCount + viewTracker (TDD)

**Files:**
- Create: `apps/expo/lib/utils/format-count.ts`
- Create: `apps/expo/lib/viewTracker.ts`
- Test: `apps/expo/lib/__tests__/format-count.test.ts`
- Test: `apps/expo/lib/__tests__/view-tracker.test.ts`

**Interfaces:**
- Produces:
  - `formatCompactCount(n: number): string` — `0→'0'`, `999→'999'`, `1000→'1K'`, `1234→'1,2K'`, `9950→'10K'`, `12345→'12K'`, `999499→'999K'`, `1_200_000→'1,2M'`
  - `setViewTrackerWallet(wallet?: string | null): void`
  - `trackPostViews(ids: string[]): void`
  - `flushPostViews(): void` (exported for tests/teardown)

- [ ] **Step 1: Write failing tests** `apps/expo/lib/__tests__/format-count.test.ts`:

```ts
import { formatCompactCount } from '../utils/format-count';

describe('formatCompactCount', () => {
  it('passes small numbers through', () => {
    expect(formatCompactCount(0)).toBe('0');
    expect(formatCompactCount(7)).toBe('7');
    expect(formatCompactCount(999)).toBe('999');
  });
  it('formats thousands with German decimal comma', () => {
    expect(formatCompactCount(1000)).toBe('1K');
    expect(formatCompactCount(1234)).toBe('1,2K');
    expect(formatCompactCount(9950)).toBe('10K');
    expect(formatCompactCount(12345)).toBe('12K');
    expect(formatCompactCount(999499)).toBe('999K');
  });
  it('formats millions', () => {
    expect(formatCompactCount(1_200_000)).toBe('1,2M');
    expect(formatCompactCount(25_000_000)).toBe('25M');
  });
});
```

And `apps/expo/lib/__tests__/view-tracker.test.ts` (mock supabase before importing the tracker):

```ts
const rpcMock = jest.fn().mockResolvedValue({ error: null });
jest.mock('../supabase', () => ({ supabase: { rpc: (...args: any[]) => rpcMock(...args) } }));

import { setViewTrackerWallet, trackPostViews, flushPostViews } from '../viewTracker';

describe('viewTracker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    rpcMock.mockClear();
    setViewTrackerWallet('0xAbC');
  });
  afterEach(() => {
    flushPostViews();
    rpcMock.mockClear();
    jest.useRealTimers();
  });

  it('does nothing without a wallet', () => {
    setViewTrackerWallet(null);
    trackPostViews(['a']);
    jest.advanceTimersByTime(5000);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('batches ids and flushes after the debounce with a lowercased wallet', () => {
    trackPostViews(['a', 'b']);
    expect(rpcMock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(3000);
    expect(rpcMock).toHaveBeenCalledWith('increment_post_views', {
      p_post_ids: expect.arrayContaining(['a', 'b']),
      p_wallet: '0xabc',
    });
  });

  it('throttles re-impressions of the same post within 10s but counts them after', () => {
    trackPostViews(['a']);
    jest.advanceTimersByTime(3000); // flush 1
    trackPostViews(['a']); // < 10s since first count → dropped
    jest.advanceTimersByTime(3000);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(10_000);
    trackPostViews(['a']); // > 10s → counts again (X-style)
    jest.advanceTimersByTime(3000);
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it('flushes immediately at 10 pending ids', () => {
    trackPostViews(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail** — `cd apps/expo && npx jest lib/__tests__/format-count.test.ts lib/__tests__/view-tracker.test.ts --watchAll=false` → FAIL (modules not found).

- [ ] **Step 3: Implement** `apps/expo/lib/utils/format-count.ts`:

```ts
/**
 * X-style compact count, German decimal comma: 999 → "999", 1234 → "1,2K",
 * 12345 → "12K", 1_200_000 → "1,2M". One decimal only below 10 of a unit.
 */
export function formatCompactCount(n: number): string {
  const compact = (value: number, unit: string): string => {
    const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
    if (rounded >= 10 || Number.isInteger(rounded)) {
      return `${Math.round(rounded)}${unit}`;
    }
    return `${String(rounded).replace('.', ',')}${unit}`;
  };
  if (n < 1000) return String(n);
  if (n < 1_000_000) return compact(n / 1000, 'K');
  return compact(n / 1_000_000, 'M');
}
```

And `apps/expo/lib/viewTracker.ts`:

```ts
import { supabase } from './supabase';

/**
 * X-style impression tracking: every viewport appearance of a post counts,
 * batched into one RPC call. No session dedup (counts grow fast by design) —
 * only a small per-post throttle so scroll jitter doesn't multi-count within
 * seconds. Best-effort: failures are swallowed, nothing retries.
 */
const FLUSH_DELAY_MS = 3000;
const FLUSH_THRESHOLD = 10;
const PER_POST_THROTTLE_MS = 10_000;

let wallet: string | null = null;
const lastCounted = new Map<string, number>();
const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function setViewTrackerWallet(w?: string | null): void {
  wallet = w ? w.toLowerCase() : null;
}

export function trackPostViews(ids: string[]): void {
  if (!wallet || ids.length === 0) return;
  const now = Date.now();
  for (const id of ids) {
    if (!id || pending.has(id)) continue;
    const last = lastCounted.get(id);
    if (last !== undefined && now - last < PER_POST_THROTTLE_MS) continue;
    lastCounted.set(id, now);
    pending.add(id);
  }
  if (pending.size >= FLUSH_THRESHOLD) {
    flushPostViews();
    return;
  }
  if (!timer && pending.size > 0) {
    timer = setTimeout(flushPostViews, FLUSH_DELAY_MS);
  }
}

export function flushPostViews(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!wallet || pending.size === 0) return;
  const ids = Array.from(pending);
  pending.clear();
  supabase
    .rpc('increment_post_views', { p_post_ids: ids, p_wallet: wallet })
    .then(({ error }: { error: unknown }) => {
      if (error && __DEV__) console.warn('[viewTracker] flush failed', error);
    });
}
```

- [ ] **Step 4: Run tests, verify pass** — same jest command → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/lib/utils/format-count.ts apps/expo/lib/viewTracker.ts apps/expo/lib/__tests__/format-count.test.ts apps/expo/lib/__tests__/view-tracker.test.ts
git commit -m "feat(expo): compact count formatter + batched impression view tracker (TDD)"
git push
```

---

### Task 4: Icons + PostActions row (repost button, views right-most)

**Files:**
- Modify: `apps/expo/assets/icons/repost.svg`, `apps/expo/assets/icons/view.svg` (`stroke="black"` → `stroke="currentColor"`, all occurrences — otherwise the `color` prop does nothing)
- Modify: `apps/expo/components/feed/PostActions.tsx`

**Interfaces:**
- Produces — `PostActions` new optional props (all existing props/animations unchanged):

```ts
  /** 🔁 shown between comment and share when provided. */
  repostsCount?: number;
  isReposted?: boolean;
  onRepost?: () => void;
  /** Views: rendered right-most, muted; hidden when 0/undefined or iconOnly. */
  viewsCount?: number;
  /** When set, the views element is pressable (creator-only viewer list). */
  onViewsPress?: () => void;
```

- [ ] **Step 1: Fix both SVGs** — replace every `stroke="black"` with `stroke="currentColor"` in `repost.svg` (4 paths) and `view.svg` (2 paths).

- [ ] **Step 2: Extend PostActions** — add imports:

```ts
import RepostIcon from '@/assets/icons/repost.svg';
import ViewIcon from '@/assets/icons/view.svg';
import { formatCompactCount } from '@/lib/utils/format-count';
```

Add the new props to `Props` + destructure with defaults (`repostsCount = 0`, `isReposted = false`). Insert the repost button between the comment and share Pressables:

```tsx
      {onRepost && (
        <Pressable onPress={onRepost} style={styles.action} accessibilityLabel="Reposten">
          <RepostIcon
            width={22}
            height={22}
            color={isReposted ? colors.primary : colors.textPrimary}
          />
          {!iconOnly && repostsCount > 0 && (
            <Text style={[styles.count, { color: isReposted ? colors.primary : colors.textPrimary }]}>
              {repostsCount}
            </Text>
          )}
        </Pressable>
      )}
```

After the heart Pressable (heart keeps `marginLeft: 'auto'` so views lands at the extreme right), append:

```tsx
      {!iconOnly && typeof viewsCount === 'number' && viewsCount > 0 && (
        <Pressable
          onPress={onViewsPress}
          disabled={!onViewsPress}
          style={styles.action}
          accessibilityLabel={`${viewsCount} Aufrufe`}
        >
          <ViewIcon width={18} height={18} color={colors.textTertiary} />
          <Text style={[styles.count, { color: colors.textTertiary }]}>
            {formatCompactCount(viewsCount)}
          </Text>
        </Pressable>
      )}
```

- [ ] **Step 3: Typecheck** — `cd apps/expo && npx tsc --noEmit 2>&1 | grep "PostActions" || echo CLEAN` → CLEAN.

- [ ] **Step 4: Commit**

```bash
git add apps/expo/assets/icons/repost.svg apps/expo/assets/icons/view.svg apps/expo/components/feed/PostActions.tsx
git commit -m "feat(expo): PostActions — repost button next to comments, views count right-most"
git push
```

---

### Task 5: X-style feed layout (full-width + hairline separators)

**Files:**
- Modify: `apps/expo/components/feed/FeedList.tsx`
- Modify: `apps/expo/components/feed/FeedPostCard.tsx`
- Modify: `apps/expo/components/feed/FeedMeckyCard.tsx`
- Modify: `apps/expo/components/feed/FeedPostSkeleton.tsx`

**Interfaces:**
- Consumes: nothing new. Produces: visual change only — no API changes.

- [ ] **Step 1: FeedList container** —
  - `styles.feedContent`: delete `paddingHorizontal: 8` and `gap: 8` (keep `paddingTop: 8`).
  - List `style`: `{ backgroundColor: colors.feedBackground }` → `{ backgroundColor: colors.background }`.
  - Add to the `Animated.FlatList` props:

```tsx
      ItemSeparatorComponent={() => (
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
      )}
```

  - New styles:

```ts
  separator: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  moduleWrap: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
```

- [ ] **Step 2: Wrap non-post modules** — in `renderItem`, every branch EXCEPT the flat `post` (non-experience) and `mecky` cases returns its element wrapped:

```tsx
        case 'alert':
          return <View style={styles.moduleWrap}><FeedAlertCard alert={item.data} /></View>;
```

Apply the same `<View style={styles.moduleWrap}>…</View>` wrapper to: `alert`, `sponsored`, `marketplace`, `event`, `news_section`, `cinema_section`, `restaurant_section`, `special_menu_section`, `governance_nudge`, `mecky_tip`, `audio_player`, `proposal`, `proposal_comment`, `proposal_hero`, and the `post_type === 'event_experience'` sub-branch (FeedExperienceCard). The plain `FeedPostCard` and `FeedMeckyCard` returns stay unwrapped (full-width).

- [ ] **Step 3: Flatten cards** —
  - `FeedPostCard.tsx` `styles.container`: `borderRadius: 12` → delete the line. `styles.containerMarketplace`: `borderRadius: 20` → delete.
  - `FeedMeckyCard.tsx` line ~107: delete `borderRadius: 12`.
  - `FeedPostSkeleton.tsx`: read the file; on the OUTER container style remove any `borderRadius`/`marginHorizontal` so the skeleton is a full-width flat block; keep all inner shimmer shapes.

- [ ] **Step 4: Manual verification** — run the app (`cd apps/expo && pnpm start`), check in light AND dark mode:
  - Posts render edge-to-edge with a hairline line between items, no gray gutters, no rounded corners.
  - News/sponsored/marketplace/proposal-hero modules still have their card look with breathing room.
  - Pull-to-refresh, pagination, video autoplay unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/components/feed/FeedList.tsx apps/expo/components/feed/FeedPostCard.tsx apps/expo/components/feed/FeedMeckyCard.tsx apps/expo/components/feed/FeedPostSkeleton.tsx
git commit -m "feat(expo): X-style feed — full-width posts, hairline separators, flat background"
git push
```

---

### Task 6: Views wiring + creator-only viewer drawer

**Files:**
- Create: `apps/expo/components/feed/PostViewersDrawer.tsx`
- Modify: `apps/expo/components/feed/FeedList.tsx` (viewability → tracker)
- Modify: `apps/expo/components/feed/FeedPostCard.tsx` (pass viewsCount + drawer)
- Modify: `apps/expo/app/post/[id].tsx` (track open, pass viewsCount + drawer)

**Interfaces:**
- Consumes: `trackPostViews`, `setViewTrackerWallet`, `flushPostViews` (Task 3); `getPostViewers`, `PostViewer` (Task 2); `viewsCount`/`onViewsPress` props (Task 4).
- Produces: `PostViewersDrawer` props `{ visible: boolean; onClose: () => void; postId: string | null }`.

- [ ] **Step 1: PostViewersDrawer** — new component:

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import BottomDrawer from '@/components/BottomDrawer';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import { useTheme } from '@/context/ThemeContext';
import { getPostViewers, type PostViewer } from '@/lib/supabase-posts';

type Props = {
  visible: boolean;
  onClose: () => void;
  postId: string | null;
};

/** Creator-only list of who viewed a post and how often. Never shows wallets. */
export default function PostViewersDrawer({ visible, onClose, postId }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const [viewers, setViewers] = useState<PostViewer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !postId) return;
    let cancelled = false;
    setLoading(true);
    getPostViewers(postId).then((rows) => {
      if (cancelled) return;
      setViewers(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, postId]);

  const displayName = (v: PostViewer) => v.display_name || v.username || 'Jemand';

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Aufrufe</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : viewers.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textTertiary }]}>Noch keine Aufrufe</Text>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {viewers.map((v) => {
            const openProfile = v.username
              ? () => {
                  onClose();
                  router.push(`/user/${v.username}` as any);
                }
              : undefined;
            return (
              <Pressable
                key={v.wallet_address}
                onPress={openProfile}
                disabled={!openProfile}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.pressedOverlay }]}
              >
                <UserAvatarWithFrame
                  size={36}
                  uri={v.profile_picture_url}
                  fallbackInitial={displayName(v).charAt(0).toUpperCase()}
                  frameAssetUrl={null}
                />
                <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                  {displayName(v)}
                </Text>
                <Text style={[styles.count, { color: colors.textTertiary }]}>{v.view_count}×</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontFamily: 'Inter-SemiBold', marginBottom: 8 },
  loader: { paddingVertical: 24 },
  empty: { fontSize: 14, fontFamily: 'Inter-Regular', paddingVertical: 24, textAlign: 'center' },
  list: { maxHeight: 420 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4 },
  name: { flex: 1, fontSize: 15, fontFamily: 'Inter-Medium' },
  count: { fontSize: 14, fontFamily: 'Inter-Medium' },
});
```

- [ ] **Step 2: FeedList tracking** — imports `import { trackPostViews, setViewTrackerWallet } from '@/lib/viewTracker';`. Add an effect near the top of the component: `React.useEffect(() => { setViewTrackerWallet(walletAddress); }, [walletAddress]);`. In `onViewableItemsChanged`, collect ids and feed the tracker (repost rows count the ORIGINAL):

```ts
      const impressionIds: string[] = [];
      viewableItems.forEach((item) => {
        if (item.item?.type === 'post' || item.item?.type === 'mecky') {
          const post = item.item.data as PostRecord;
          const target = post.post_type === 'repost' && post.quoted_post ? post.quoted_post : post;
          impressionIds.push(target.id);
        }
      });
      if (impressionIds.length > 0) trackPostViews(impressionIds);
```

(Merge into the existing forEach — don't add a second loop.)

- [ ] **Step 3: FeedPostCard views display + drawer** — FeedPostCard already receives `walletAddress`. Add state `const [viewersVisible, setViewersVisible] = useState(false);` and compute:

```ts
  const isOwnPost = !!walletAddress && post.wallet_address?.toLowerCase() === walletAddress.toLowerCase();
```

Pass to `<PostActions …>`:

```tsx
        viewsCount={post.views_count ?? 0}
        onViewsPress={isOwnPost ? () => setViewersVisible(true) : undefined}
```

Render next to ImageZoomModal:

```tsx
      <PostViewersDrawer
        visible={viewersVisible}
        onClose={() => setViewersVisible(false)}
        postId={post.id}
      />
```

(For repost rows Task 7 rebinds these to the quoted original — this step wires the plain case.)

- [ ] **Step 4: Post detail** — in `app/post/[id].tsx`: import `trackPostViews`, `setViewTrackerWallet`, `PostViewersDrawer`. In `loadPost` after `setPost(postData)`: `setViewTrackerWallet(walletAddress); trackPostViews([postData.id]);`. Pass `viewsCount={post.views_count ?? 0}` and `onViewsPress={isOwnPost ? () => setViewersDrawerVisible(true) : undefined}` to its `PostActions`, add the drawer + `viewersDrawerVisible` state.

- [ ] **Step 5: Manual verification** —
  - Scroll the feed, wait ~5 s → Supabase MCP: `SELECT post_id, wallet_address, view_count FROM post_views ORDER BY last_viewed_at DESC LIMIT 10;` shows your wallet with counts; `posts.views_count` rises.
  - Scroll away and back after >10 s → count increments again.
  - Views number appears right-most, muted. On someone else's post: not tappable. On your own: opens „Aufrufe" drawer, names + ×N, tap row → profile opens. No wallet addresses visible.

- [ ] **Step 6: Commit**

```bash
git add apps/expo/components/feed/PostViewersDrawer.tsx apps/expo/components/feed/FeedList.tsx apps/expo/components/feed/FeedPostCard.tsx "apps/expo/app/post/[id].tsx"
git commit -m "feat(expo): impression tracking wired to feed + post detail, creator-only Aufrufe drawer"
git push
```

---

### Task 7: Repost/quote rendering + repost action

**Files:**
- Create: `apps/expo/components/feed/QuotedPostPreview.tsx`
- Create: `apps/expo/components/feed/RepostDrawer.tsx`
- Modify: `apps/expo/hooks/usePostActions.ts` (repost state)
- Modify: `apps/expo/components/feed/FeedPostCard.tsx` (repost header / quote preview / target rebinding / repost button)
- Modify: `apps/expo/components/feed/FeedList.tsx` (target-aware bindings, repost init, drop orphaned reposts)
- Modify: `apps/expo/components/feed/FeedHome.tsx` (repost drawer state + handlers)
- Modify: `apps/expo/app/post/[id].tsx` (repost-row redirect, repost button + drawer, quote preview)

**Interfaces:**
- Consumes: `createRepost`, `undoRepost`, `getUserRepostedPostIds` (Task 2); `repostsCount`/`isReposted`/`onRepost` props (Task 4).
- Produces:
  - `QuotedPostPreview` props `{ post: PostRecord | null | undefined; onPress?: () => void }` (null → „Beitrag wurde gelöscht" placeholder)
  - `RepostDrawer` props `{ visible: boolean; onClose: () => void; isReposted: boolean; onRepost: () => void; onQuote: () => void }`
  - `usePostActions` additionally returns `{ initReposts(ids: Set<string>, counts: Record<string, number>): void; isReposted(id: string): boolean; getRepostCount(id: string, original: number): number; repost(post: PostRecord, accountId?: string): Promise<void>; unrepost(post: PostRecord): Promise<void> }`
  - `FeedPostCard` new optional prop `onRepost?: (target: PostRecord) => void`, new props `isReposted?: boolean`, `displayRepostCount?: number`
  - `FeedList` new optional prop `onRepost?: (target: PostRecord) => void`
  - Repost target rule (used everywhere): `const target = post.post_type === 'repost' && post.quoted_post ? post.quoted_post : post;` — 🔁 visible iff `target.feed_type === 'app'`; all like/comment/share/views/repost interactions bind to `target`.

- [ ] **Step 1: QuotedPostPreview**:

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import VerifiedBadge from '@/components/VerifiedBadge';
import { formatRelativeTimestamp } from '@/lib/utils';
import type { PostRecord } from '@/lib/types/feed';

type Props = {
  /** The quoted original. null/undefined → deleted placeholder. */
  post: PostRecord | null | undefined;
  onPress?: () => void;
};

/** Embedded mini preview of a quoted post (X-style bordered card). */
export default function QuotedPostPreview({ post, onPress }: Props) {
  const { colors } = useTheme();

  if (!post) {
    return (
      <View style={[styles.container, { borderColor: colors.border }]}>
        <Text style={[styles.deleted, { color: colors.textTertiary }]}>Beitrag wurde gelöscht</Text>
      </View>
    );
  }

  const isOrg = post.author?.account?.account_type === 'organisation';
  const name = (isOrg ? post.author?.account?.name : post.author?.username) || 'Jemand';
  const avatar = isOrg ? post.author?.account?.avatar_url : post.author?.profile_picture_url;
  const firstImage = post.media_urls?.filter(Boolean)?.[0];

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.container,
        { borderColor: colors.border },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
    >
      <View style={styles.authorRow}>
        <UserAvatarWithFrame size={20} uri={avatar ?? null} fallbackInitial={name.charAt(0).toUpperCase()} frameAssetUrl={null} />
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
        {post.author?.is_verified_citizen && <VerifiedBadge size={13} />}
        <Text style={[styles.time, { color: colors.textTertiary }]}>· {formatRelativeTimestamp(post.created_at)}</Text>
      </View>
      {post.content ? (
        <Text style={[styles.content, { color: colors.textPrimary }]} numberOfLines={3}>{post.content}</Text>
      ) : null}
      {firstImage && (
        <Image source={{ uri: firstImage }} style={styles.image} contentFit="cover" accessibilityIgnoresInvertColors />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10, gap: 6 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 13, fontFamily: 'Inter-Medium', flexShrink: 1 },
  time: { fontSize: 12, fontFamily: 'Inter-Regular' },
  content: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20 },
  image: { width: '100%', height: 140, borderRadius: 8 },
  deleted: { fontSize: 14, fontFamily: 'Inter-Regular', fontStyle: 'italic' },
});
```

- [ ] **Step 2: RepostDrawer** (mirrors PostOptionsDrawer's row style):

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomDrawer from '@/components/BottomDrawer';
import { useTheme } from '@/context/ThemeContext';
import RepostIcon from '@/assets/icons/repost.svg';

type Props = {
  visible: boolean;
  onClose: () => void;
  isReposted: boolean;
  onRepost: () => void;
  onQuote: () => void;
};

export default function RepostDrawer({ visible, onClose, isReposted, onRepost, onQuote }: Props) {
  const { colors } = useTheme();
  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Pressable
          onPress={() => { onClose(); onRepost(); }}
          style={({ pressed }) => [styles.row, { borderBottomColor: colors.border }, pressed && { backgroundColor: colors.pressedOverlay }]}
        >
          <RepostIcon width={20} height={20} color={isReposted ? colors.error : colors.textPrimary} />
          <Text style={[styles.rowText, { color: isReposted ? colors.error : colors.textPrimary }]}>
            {isReposted ? 'Repost rückgängig' : 'Reposten'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => { onClose(); onQuote(); }}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.pressedOverlay }]}
        >
          <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
          <Text style={[styles.rowText, { color: colors.textPrimary }]}>Zitieren</Text>
        </Pressable>
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { fontSize: 16, fontFamily: 'Inter-Medium' },
});
```

- [ ] **Step 3: usePostActions repost state** — add alongside the like state (same optimistic pattern):

```ts
  const [repostedPosts, setRepostedPosts] = useState<Set<string>>(new Set());
  const [repostCounts, setRepostCounts] = useState<Record<string, number>>({});

  const initReposts = useCallback((ids: Set<string>, counts: Record<string, number>) => {
    setRepostedPosts(ids);
    setRepostCounts(counts);
  }, []);

  const isReposted = useCallback((postId: string) => repostedPosts.has(postId), [repostedPosts]);

  const getRepostCount = useCallback(
    (postId: string, originalCount: number) => repostCounts[postId] ?? originalCount,
    [repostCounts],
  );

  const repost = useCallback(
    async (post: PostRecord, accountId?: string) => {
      if (!walletAddress) { requireAuth(() => {}); return; }
      if (repostedPosts.has(post.id)) return;
      setRepostedPosts((prev) => new Set(prev).add(post.id));
      setRepostCounts((prev) => ({ ...prev, [post.id]: (prev[post.id] ?? post.reposts_count ?? 0) + 1 }));
      try {
        const created = await createRepost(post.id, walletAddress, accountId);
        if (!created) throw new Error('repost failed');
      } catch (err) {
        setRepostedPosts((prev) => { const next = new Set(prev); next.delete(post.id); return next; });
        setRepostCounts((prev) => ({ ...prev, [post.id]: post.reposts_count ?? 0 }));
        throw err;
      }
    },
    [walletAddress, repostedPosts, requireAuth],
  );

  const unrepost = useCallback(
    async (post: PostRecord) => {
      if (!walletAddress) { requireAuth(() => {}); return; }
      setRepostedPosts((prev) => { const next = new Set(prev); next.delete(post.id); return next; });
      setRepostCounts((prev) => ({ ...prev, [post.id]: Math.max(0, (prev[post.id] ?? post.reposts_count ?? 0) - 1) }));
      try {
        await undoRepost(post.id, walletAddress);
      } catch (err) {
        setRepostedPosts((prev) => new Set(prev).add(post.id));
        setRepostCounts((prev) => ({ ...prev, [post.id]: post.reposts_count ?? 0 }));
        throw err;
      }
    },
    [walletAddress, requireAuth],
  );
```

Import `createRepost`, `undoRepost` and `type PostRecord`; export the five new members from the hook's return object.

- [ ] **Step 4: FeedPostCard repost/quote rendering** — new props:

```ts
  isReposted?: boolean;
  displayRepostCount?: number;
  /** Called with the repost TARGET (original for repost rows). Button hidden when undefined. */
  onRepost?: (target: PostRecord) => void;
```

At the top of the component body:

```ts
  const isRepostRow = post.post_type === 'repost' && !!post.quoted_post;
  const display = isRepostRow ? post.quoted_post! : post;
  const target = display; // interactions bind here
  const canRepost = !!onRepost && target.feed_type === 'app';
```

Replace every use of `post.` in the card BODY (content, media, video, links, poll, linked event/marketplace, sticker, author row, pinned row, comments/likes counts) with `display.` — EXCEPT `onMore` (stays bound to the row itself so an owner can delete their repost) and the quote-specific parts below. `handlePress`/`handleComment` navigate to `display.id`.

Repost header above `PostAuthorRow` (reuse the pinnedRow style pattern):

```tsx
        {isRepostRow && (
          <View style={styles.pinnedRow}>
            <RepostIcon width={14} height={14} color={colors.textTertiary} />
            <Text style={[styles.pinnedText, { color: colors.textTertiary }]}>
              {reposterName} hat repostet
            </Text>
          </View>
        )}
```

with `import RepostIcon from '@/assets/icons/repost.svg';` and:

```ts
  const reposterName =
    (post.author?.account?.account_type === 'organisation' ? post.author?.account?.name : post.author?.username) || 'Jemand';
```

Quote preview (after the media/video/link blocks, before the Pressable closes):

```tsx
        {post.post_type === 'quote' && (
          <QuotedPostPreview
            post={post.quoted_post}
            onPress={post.quoted_post ? () => router.push(`/post/${post.quoted_post!.id}` as any) : undefined}
          />
        )}
```

PostActions gets the new bindings:

```tsx
      <PostActions
        likesCount={displayLikeCount}
        commentsCount={display.comments_count}
        isLiked={isLiked}
        onLike={onLike}
        onComment={handleComment}
        onShare={onShare}
        iconOnly={isMarketplacePost}
        repostsCount={displayRepostCount ?? target.reposts_count ?? 0}
        isReposted={isReposted}
        onRepost={canRepost ? () => onRepost!(target) : undefined}
        viewsCount={display.views_count ?? 0}
        onViewsPress={isOwnDisplayPost ? () => setViewersVisible(true) : undefined}
      />
```

where `isOwnDisplayPost` compares `display.wallet_address` to `walletAddress` and the viewer drawer's `postId` becomes `display.id`.

- [ ] **Step 5: FeedList target-aware bindings** — new prop `onRepost?: (target: PostRecord) => void` threaded to FeedPostCard. In `renderItem`'s `post`/`mecky` branches:

```ts
          const target = post.post_type === 'repost' && post.quoted_post ? post.quoted_post : post;
```

Pass `isLiked(target.id)`, `getLikeCount(target.id, target.likes_count)`, `onLike={() => toggleLike(target.id, target.likes_count)}`, `onShare={() => sharePost(target.id, target.content)}`, plus `isReposted={isReposted(target.id)}`, `displayRepostCount={getRepostCount(target.id, target.reposts_count ?? 0)}`, `onRepost={onRepost}`. Destructure `initReposts, isReposted, getRepostCount` from `usePostActions`.

In the likes-init effect, use target ids/counts and also init reposts:

```ts
    const targets = items
      .filter((item) => item.type === 'post' || item.type === 'mecky')
      .map((item) => {
        const post = item.data as PostRecord;
        return post.post_type === 'repost' && post.quoted_post ? post.quoted_post : post;
      });
    const postIds = targets.map((t) => t.id);
    if (postIds.length === 0) return;
    const counts: Record<string, number> = {};
    const repostCounts: Record<string, number> = {};
    targets.forEach((t) => {
      counts[t.id] = t.likes_count;
      repostCounts[t.id] = t.reposts_count ?? 0;
    });
    getUserLikedPostIds(postIds, walletAddress).then((likedIds) => initLikes(likedIds, counts));
    getUserRepostedPostIds(postIds, walletAddress).then((ids) => initReposts(ids, repostCounts));
```

In the `displayData` memo, first drop orphaned reposts (deleted originals):

```ts
    const visible = items.filter(
      (it) =>
        !(
          (it.type === 'post' || it.type === 'mecky') &&
          (it.data as PostRecord).post_type === 'repost' &&
          !(it.data as PostRecord).quoted_post
        ),
    );
```

…and use `visible` in place of `items` for the rest of the memo (both the early return and the hero insertion).

- [ ] **Step 6: FeedHome wiring** — state + handlers:

```ts
  const [repostTarget, setRepostTarget] = useState<PostRecord | null>(null);
  const { repost, unrepost, isReposted } = usePostActions(walletAddress); // extend the existing destructure

  const handleRepostPress = useCallback((target: PostRecord) => {
    requireAuth(() => setRepostTarget(target));
  }, [requireAuth]);

  const handleConfirmRepost = async () => {
    if (!repostTarget) return;
    try {
      if (isReposted(repostTarget.id)) {
        await unrepost(repostTarget);
        showSnackbar({ message: 'Repost entfernt' });
      } else {
        await repost(repostTarget, activeAccount?.id);
        showSnackbar({ message: 'Repostet — erscheint in „Für Alle"' });
      }
      mainListRef.current?.refresh();
    } catch {
      showSnackbar({ message: 'Repost fehlgeschlagen' });
    } finally {
      setRepostTarget(null);
    }
  };

  const handleQuote = () => {
    if (!repostTarget) return;
    const id = repostTarget.id;
    setRepostTarget(null);
    requireAuth(() => router.push({ pathname: '/create', params: { quotedPostId: id } } as any));
  };
```

(`activeAccount` comes from the existing `useAccount()` destructure — extend it.) Pass `onRepost={handleRepostPress}` to all three `<FeedList …>` instances. Render near the other drawers:

```tsx
      <RepostDrawer
        visible={!!repostTarget}
        onClose={() => setRepostTarget(null)}
        isReposted={repostTarget ? isReposted(repostTarget.id) : false}
        onRepost={handleConfirmRepost}
        onQuote={handleQuote}
      />
```

NOTE: `usePostActions` keeps repost state per hook instance — FeedHome's instance drives the drawer, FeedList's instance drives icon state; after a repost the `refresh()` re-inits FeedList's state from the server, so both converge. Accept this (matches how likes already work across FeedHome/FeedList instances).

- [ ] **Step 7: Post detail** — in `app/post/[id].tsx`:
  - Repost-row redirect in `loadPost`, right after `fetchPostById` resolves: `if (postData?.post_type === 'repost' && postData.quoted_post_id) { router.replace(`/post/${postData.quoted_post_id}` as any); return; }` (check `fetchPostById`'s select includes the new columns — it must use `FEED_POST_SELECT` or add `quoted_post_id`/`quoted_post` the same way).
  - Quote rows: render `<QuotedPostPreview post={post.quoted_post} onPress={…}/>` after the content/media blocks.
  - Repost button: destructure `repost, unrepost, isReposted: isRepostedFn, getRepostCount, initReposts` from the existing `usePostActions`; init via `getUserRepostedPostIds([post.id], walletAddress)` next to the likes init; add `repostDrawerVisible` state + `RepostDrawer`; pass to `PostActions`: `repostsCount={getRepostCount(post.id, post.reposts_count ?? 0)}`, `isReposted={isRepostedFn(post.id)}`, `onRepost={post.feed_type === 'app' ? () => setRepostDrawerVisible(true) : undefined}`; drawer's `onRepost` runs the same confirm logic as FeedHome (repost/unrepost + snackbar), `onQuote` pushes `/create?quotedPostId=…`.

- [ ] **Step 8: Manual verification** —
  - App tab post shows 🔁 between 💬 and ↗; main/Umfragen posts don't.
  - Repost → snackbar, entry appears in „Für Alle" with „↺ Max hat repostet" header rendering the ORIGINAL author/content; its like/comment/share/views act on the original (check like count matches original post).
  - 🔁 turns primary-colored + count on both the App-tab original and the main-feed entry.
  - Repost again → drawer shows „Repost rückgängig" → removes the entry (refresh) and decrements count.
  - No push notification for the repost (check Supabase `net` logs / no device push), quote still notifies.
  - Tap the repost entry → opens the ORIGINAL post detail.

- [ ] **Step 9: Commit**

```bash
git add apps/expo/components/feed/QuotedPostPreview.tsx apps/expo/components/feed/RepostDrawer.tsx apps/expo/hooks/usePostActions.ts apps/expo/components/feed/FeedPostCard.tsx apps/expo/components/feed/FeedList.tsx apps/expo/components/feed/FeedHome.tsx "apps/expo/app/post/[id].tsx"
git commit -m "feat(expo): repost/quote — App-feed posts promotable to Für Alle, X-style rendering"
git push
```

---

### Task 8: Quote composer flow

**Files:**
- Modify: `apps/expo/context/CreatePostContext.tsx`
- Modify: `apps/expo/app/create/index.tsx`
- Modify: `apps/expo/app/create/review.tsx`

**Interfaces:**
- Consumes: `QuotedPostPreview` (Task 7), `fetchPostById` (existing), `CreatePostInput.quoted_post_id` (Task 2).
- Produces: `CreatePostContext` gains `quotedPostId: string | null; quotedPostData: PostRecord | null; setQuotedPost: (id: string, data: PostRecord | null) => void;` (cleared by `reset`).

- [ ] **Step 1: CreatePostContext** — add to state type + `initialState` (`quotedPostId: null, quotedPostData: null`), action:

```ts
  const setQuotedPost = useCallback((id: string, data: PostRecord | null) => {
    setState((prev) => ({ ...prev, quotedPostId: id, quotedPostData: data, feedType: 'main' }));
  }, []);
```

(Setting a quote forces `feedType: 'main'` — quotes always land in „Für Alle".) Import `type PostRecord`; expose in the provider value + actions type.

- [ ] **Step 2: create/index.tsx** — extend the `useLocalSearchParams` type with `quotedPostId?: string;` and hydrate once:

```ts
  useEffect(() => {
    if (!params.quotedPostId || draft.quotedPostId) return;
    fetchPostById(params.quotedPostId).then((p) => {
      draft.setQuotedPost(params.quotedPostId!, p);
    });
  }, [params.quotedPostId]);
```

Render the preview below the content input / above the linked-item blocks (read-only, no remove — closing the composer resets the draft):

```tsx
          {draft.quotedPostId && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
              <QuotedPostPreview post={draft.quotedPostData} />
            </View>
          )}
```

While quoting, hide the feed-type selector row (wrap the existing selector in `{!draft.quotedPostId && (…)}`) so the forced `main` can't be changed. Import `fetchPostById` from `@/lib/supabase-posts` and `QuotedPostPreview`.

- [ ] **Step 3: review.tsx** — in `handlePost`, adjust the `createPost` call:

```ts
        post_type: draft.quotedPostId ? 'quote' : draft.postType,
        quoted_post_id: draft.quotedPostId || undefined,
```

and allow posting with a quote + empty text guard change: extend the `hasLinkedItem`-style check with `const hasQuote = !!draft.quotedPostId;` and include it in the early-return condition (`!draft.content.trim() && !hasLinkedItem && !hasSticker && !hasStadtkasse && !hasQuote`). Also render `<QuotedPostPreview post={draft.quotedPostData} />` in the review summary (below the content text block). NOTE: also check `app/create/index.tsx`'s `canContinue` (line ~181) — extend the same way so a bare repost-with-comment isn't blocked when the user types nothing.

- [ ] **Step 4: Manual verification** —
  - App-tab post → 🔁 → „Zitieren" → composer opens with embedded preview, feed-type selector hidden.
  - Write text → post → quote appears in „Für Alle" with your text + preview card; preview tap → original detail; original's 🔁 count +1.
  - Quote push notification fires (it's a normal main-feed post).
  - Profile → quote visible (full rendering lands in Task 9).

- [ ] **Step 5: Commit**

```bash
git add apps/expo/context/CreatePostContext.tsx apps/expo/app/create/index.tsx apps/expo/app/create/review.tsx
git commit -m "feat(expo): quote composer — Zitieren flow with embedded original preview"
git push
```

---

### Task 9: Profile — reposts/quotes on the Beiträge tab

**Files:**
- Modify: `apps/expo/lib/supabase-posts.ts` (`fetchUserPosts` select — add the same `quoted_post:…` join block used in FEED_POST_SELECT; `fetchAccountPosts` likewise)
- Modify: `apps/expo/components/profile/UserPostsList.tsx`

**Interfaces:**
- Consumes: `QuotedPostPreview` (Task 7), `quoted_post` join (Task 2 shape).

- [ ] **Step 1: fetchUserPosts/fetchAccountPosts joins** — append the same `quoted_post:posts!posts_quoted_post_id_fkey(…)` block (verbatim from Task 2 Step 2) into both functions' `.select(…)` strings. Repost/quote rows are the wallet's own rows, so they are already returned — no filter changes.

- [ ] **Step 2: UserPostsList rendering** — inside the post item render: skip orphaned reposts, show the ↺ marker + original content for reposts, and the quote preview for quotes:

```tsx
  // inside the map over posts, before rendering a row:
  if (post.post_type === 'repost' && !post.quoted_post) return null;
  const isRepost = post.post_type === 'repost';
  const display = isRepost && post.quoted_post ? post.quoted_post : post;
```

Above the row's `PostAuthorRow`, when `isRepost`:

```tsx
        <View style={styles.repostRow}>
          <RepostIcon width={13} height={13} color={colors.textTertiary} />
          <Text style={[styles.repostText, { color: colors.textTertiary }]}>hat repostet</Text>
        </View>
```

with styles `repostRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }`, `repostText: { fontSize: 12, fontFamily: 'Inter-Medium' }`, import `RepostIcon from '@/assets/icons/repost.svg'`. Author row + content + images use `display.…`; the row keeps navigating to `/post/${display.id}`. For quote rows (`post.post_type === 'quote'`), render the post's own content as today plus `<QuotedPostPreview post={post.quoted_post} />` beneath it.

- [ ] **Step 3: Manual verification** — own profile → Beiträge shows the repost (↺ marker + original content, tap → original detail) and the quote (own text + preview) in chronological order.

- [ ] **Step 4: Commit**

```bash
git add apps/expo/lib/supabase-posts.ts apps/expo/components/profile/UserPostsList.tsx
git commit -m "feat(expo): profile Beiträge tab renders reposts (↺ marker) and quotes"
git push
```

---

### Task 10: Final verification sweep

- [ ] **Step 1: Jest** — `cd apps/expo && npx jest lib/__tests__/format-count.test.ts lib/__tests__/view-tracker.test.ts --watchAll=false` → PASS.
- [ ] **Step 2: Scoped typecheck** — `cd apps/expo && npx tsc --noEmit 2>&1 | grep -E "feed/(FeedList|FeedPostCard|FeedMeckyCard|FeedPostSkeleton|PostActions|PostViewersDrawer|QuotedPostPreview|RepostDrawer)|usePostActions|viewTracker|format-count|CreatePostContext|UserPostsList|supabase-posts|types/feed|post/\[id\]|create/(index|review)" || echo CLEAN` → CLEAN (pre-existing errors elsewhere don't count).
- [ ] **Step 3: End-to-end manual run** — walk the spec's verification list (§ Testing) top to bottom in the running app, light + dark mode. Fix anything broken before declaring done.
- [ ] **Step 4: Do NOT run `eas update`** — done = committed + pushed; the user ships OTA himself.
