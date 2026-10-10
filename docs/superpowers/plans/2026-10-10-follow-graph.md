# Folgen & Stummschalten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One "Für Alle" feed that hides accounts the viewer unfollowed or muted, default follows at onboarding, follow notices in the inbox, and a weekly push digest for orgs.

**Architecture:**
- Data lives in two new Supabase tables:
  - `account_follows`: public, the source of follower counts.
  - `account_hides`: private, holds `unfollowed` / `muted`.
- Both are written only by a new signed edge function, `account-relations`, which uses the same auth as `org-membership`.
- The client holds the viewer's hidden set in a `RelationsContext`. It passes the hidden account ids to `get_feed_page` and filters comments, quotes and the inbox locally.
- Push suppression lives in the existing SQL triggers and in `send-notification`.
- The org digest is a weekly `pg_cron` SQL function.

**Tech Stack:** Supabase Postgres (plpgsql, RLS, pg_cron, pg_net, vault), Deno edge functions (viem), Expo SDK 56 / React Native (StyleSheet + `useTheme`), React Query, thirdweb `useActiveAccount`, Jest (`jest-expo`).

**Spec:** `docs/superpowers/specs/2026-10-10-follow-graph-design.md`

## Global Constraints

- Expo styling is `StyleSheet.create()` + `useTheme()` only. No NativeWind.
- Identifiers and comments are in English. All UI copy is German.
- Never render a wallet address. Resolve to a display name or username.
- Wallet comparisons are always case-insensitive. New tables store wallets lowercased. Joins against `account_owners` / `users` use `lower(...)` (prod has checksummed rows).
- Targets are `accounts.id` (uuid). A person is their personal `accounts` row: `account_type = 'personal'`, the oldest one if several exist.
- Package manager is pnpm. Expo tests: `cd apps/expo && npx jest <path> --watchAll=false`.
- Supabase work goes through the Supabase MCP. Run `get_project_url` first and expect `wwbeqhkslxdxhktqzqti`.
- Before replacing any live SQL function, fetch its live body with `select pg_get_functiondef('public.<fn>'::regproc)`. Repo files can lag behind hand-applied changes.
- Commit convention is `feat(expo): …` / `feat(db): …`. Stage only the files you touched (`git add <paths>`). Never `git add -A`.
- Never run `eas update`. Max runs EAS himself.
- Copy uses "Follower", "folgt dir", "Folgen", "Entfolgen", "Stummschalten", "Stummgeschaltet". Org name and person name come from `accounts.name`, falling back to `users.display_name` / `users.username`.

## Review Focus

1. **Legacy posts with `account_id IS NULL`** (66 of 177 live posts) by a muted person must disappear like their other posts. Task 3 and Task 7 tests pin this.
2. **The hidden set must be known before the first feed page**, or muted posts flash. The cached snapshot loads from AsyncStorage synchronously-first, and the client-side filter also drops posts already on screen. Task 6 and Task 7 tests pin this.
3. **No passkey fingerprint prompt at app start.** The background `list` call runs only when `canSignSilently(account)`; otherwise the cached snapshot is used. Task 6 test.
4. **A double tap or retry must not send a second "folgt dir" notice.** Notices are inserted only for rows the upsert actually created. Task 4 test.
5. **Logged-out guests:**
   - the feed is unchanged;
   - Folgen/Stummschalten rows are hidden;
   - the onboarding follow step never blocks completion, even on a network failure.

   Task 8 and Task 10 tests.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20261010_follow_graph.sql` | tables, RLS, column, helper + read RPCs, `get_feed_page` exclusion |
| `supabase/migrations/20261010_follow_graph_push.sql` | push trigger mute check, `post_new` actor data, pref column, digest fn + cron |
| `supabase/tests/follow_graph_test.sql` | rollback-only SQL assertions |
| `apps/expo/supabase/functions/account-relations/core.ts` | pure validation + notice copy (Jest-tested) |
| `apps/expo/supabase/functions/account-relations/index.ts` | signed edge endpoint |
| `apps/expo/supabase/functions/send-notification/index.ts` | `follower_digest` type + pref, `post_new` hidden-viewer filter |
| `apps/expo/lib/relations-state.ts` | pure hidden-set logic (Jest-tested) |
| `apps/expo/lib/account-relations.ts` | signed client calls + snapshot cache |
| `apps/expo/lib/supabase-follows.ts` | public read RPC wrappers |
| `apps/expo/context/RelationsContext.tsx` | session state, optimistic updates |
| `apps/expo/components/follow/FollowList.tsx` | tickable account list (onboarding, intro, settings) |
| `apps/expo/components/follow/FollowButton.tsx` | Folgen/Entfolgt pill |
| `apps/expo/components/follow/FollowIntroSheet.tsx` | one-time sheet for existing users |
| `apps/expo/app/welcome/follow.tsx` | onboarding step |
| `apps/expo/app/settings/follows.tsx` | Settings → Folgen & Stummschalten |

---

### Task 1: Schema, RLS, read RPCs

**Files:**
- Create: `supabase/migrations/20261010_follow_graph.sql` (part 1; Task 3 appends the feed change)
- Create: `supabase/tests/follow_graph_test.sql`

**Interfaces:**
- Produces:
  - tables `account_follows`, `account_hides`;
  - `accounts.suggest_to_new_users boolean`;
  - `personal_account_id(p_wallet text) → uuid`;
  - `get_follow_suggestions() → table(account_id uuid, name text, avatar_url text, account_type text, sub_type text, followers int, score numeric)`;
  - `get_follow_stats(p_account_id uuid) → jsonb {account_id, followers, following}`;
  - `list_account_followers(p_account_id uuid, p_limit int, p_offset int) → table(wallet text, name text, avatar_url text, username text)`.

- [ ] **Step 1: Write the failing SQL test**

`supabase/tests/follow_graph_test.sql`. It runs inside a transaction that is always rolled back:

```sql
begin;
do $$
declare
  v_w1 text := '0x00000000000000000000000000000000000000f1';
  v_w2 text := '0x00000000000000000000000000000000000000f2';
  v_a1 uuid; v_a2 uuid; v_stats jsonb;
begin
  insert into users (wallet_address, username, display_name) values (v_w1, 'fgtest1', 'FG Eins'), (v_w2, 'fgtest2', 'FG Zwei');
  insert into accounts (account_type, name) values ('personal', 'FG Eins') returning id into v_a1;
  insert into accounts (account_type, name) values ('personal', 'FG Zwei') returning id into v_a2;
  insert into account_owners (account_id, wallet_address, role) values (v_a1, upper(v_w1), 'owner'), (v_a2, v_w2, 'owner');

  assert public.personal_account_id(v_w1) = v_a1, 'personal_account_id must match case-insensitively';

  insert into account_follows (follower_wallet, target_account_id, source) values (v_w1, v_a2, 'onboarding');
  v_stats := public.get_follow_stats(v_a2);
  assert (v_stats->>'followers')::int = 1, 'followers count';
  v_stats := public.get_follow_stats(v_a1);
  assert (v_stats->>'following')::int = 1, 'following count for the personal account owner';

  assert exists (select 1 from public.get_follow_suggestions() s where s.account_id = v_a2), 'suggestions include account';
  update accounts set suggest_to_new_users = false where id = v_a2;
  assert not exists (select 1 from public.get_follow_suggestions() s where s.account_id = v_a2), 'opt-out respected';

  begin
    insert into account_follows (follower_wallet, target_account_id, source) values (v_w1, v_a2, 'bogus');
    assert false, 'source check must reject';
  exception when check_violation then null;
  end;
end $$;

-- RLS: anon may read follows, never hides, never write either
set local role anon;
do $$
begin
  perform 1 from account_follows limit 1;
  begin
    perform 1 from account_hides limit 1;
    assert false, 'anon must not read account_hides';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into account_follows (follower_wallet, target_account_id, source)
      values ('0xdead', '00000000-0000-0000-0000-000000000001', 'manual');
    assert false, 'anon must not insert follows';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
```

- [ ] **Step 2: Run it, expect failure**

Run it through MCP `execute_sql` with the file's contents.

Expected: ERROR `relation "account_follows" does not exist`.

- [ ] **Step 3: Write the migration (part 1)**

`supabase/migrations/20261010_follow_graph.sql`:

```sql
-- Folgen & Stummschalten (spec: docs/superpowers/specs/2026-10-10-follow-graph-design.md)
-- account_follows is public (follower counts); account_hides is private and only the
-- account-relations edge function (service role) reads or writes it.

create table if not exists public.account_follows (
  follower_wallet   text not null,
  target_account_id uuid not null references public.accounts(id) on delete cascade,
  source            text not null check (source in ('onboarding','manual','intro')),
  created_at        timestamptz not null default now(),
  primary key (follower_wallet, target_account_id),
  check (follower_wallet = lower(follower_wallet))
);
create index if not exists account_follows_target_idx on public.account_follows (target_account_id, created_at desc);

create table if not exists public.account_hides (
  viewer_wallet     text not null,
  target_account_id uuid not null references public.accounts(id) on delete cascade,
  kind              text not null check (kind in ('unfollowed','muted')),
  created_at        timestamptz not null default now(),
  primary key (viewer_wallet, target_account_id, kind),
  check (viewer_wallet = lower(viewer_wallet))
);
create index if not exists account_hides_target_idx on public.account_hides (target_account_id) where kind = 'muted';

alter table public.accounts add column if not exists suggest_to_new_users boolean not null default true;

alter table public.account_follows enable row level security;
alter table public.account_hides enable row level security;
revoke all on public.account_follows from anon, authenticated;
revoke all on public.account_hides from anon, authenticated;
grant select on public.account_follows to anon, authenticated;
drop policy if exists account_follows_read on public.account_follows;
create policy account_follows_read on public.account_follows for select using (true);
-- account_hides: no policy, no grant → service role only.

create or replace function public.personal_account_id(p_wallet text)
returns uuid language sql stable security definer set search_path = public as $$
  select a.id from public.accounts a
  join public.account_owners ao on ao.account_id = a.id
  where a.account_type = 'personal' and lower(ao.wallet_address) = lower(p_wallet)
  order by a.created_at asc limit 1
$$;

create or replace function public.get_follow_stats(p_account_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'account_id', p_account_id,
    'followers', (select count(*) from public.account_follows f where f.target_account_id = p_account_id),
    -- "following" only means something for a personal account: its owner's follows.
    'following', (
      select count(*) from public.account_follows f
      where f.follower_wallet in (
        select lower(ao.wallet_address) from public.account_owners ao
        join public.accounts a on a.id = ao.account_id and a.account_type = 'personal'
        where ao.account_id = p_account_id
      )
    )
  )
$$;

create or replace function public.get_follow_suggestions()
returns table(account_id uuid, name text, avatar_url text, account_type text, sub_type text, followers int, score numeric)
language sql stable security definer set search_path = public as $$
  with eng as (
    select coalesce(p.account_id, public.personal_account_id(p.wallet_address)) as aid,
           sum(coalesce(p.likes_count,0)) as likes,
           sum(coalesce(p.comments_count,0)) as comments,
           sum(coalesce(p.views_count,0)) as views
    from public.posts p
    where p.status = 'published' and p.created_at > now() - interval '90 days'
    group by 1
  ),
  fol as (select target_account_id as aid, count(*)::int as n from public.account_follows group by 1)
  select a.id, a.name, a.avatar_url, a.account_type, a.sub_type,
         coalesce(fol.n, 0),
         3 * coalesce(fol.n,0) + coalesce(eng.likes,0) + 2 * coalesce(eng.comments,0)
           + 0.1 * coalesce(eng.views,0) + 2 * coalesce(v.up_count,0)
  from public.accounts a
  left join eng on eng.aid = a.id
  left join fol on fol.aid = a.id
  left join public.account_vote_summary v on v.account_id = a.id
  where a.suggest_to_new_users
    and coalesce(trim(a.name), '') <> ''
    and (a.account_type = 'organisation'
         or exists (select 1 from public.account_owners ao where ao.account_id = a.id))
  order by 7 desc, (a.account_type = 'organisation') desc, a.name asc
$$;

create or replace function public.list_account_followers(p_account_id uuid, p_limit int default 50, p_offset int default 0)
returns table(wallet text, name text, avatar_url text, username text)
language sql stable security definer set search_path = public as $$
  select f.follower_wallet, coalesce(u.display_name, u.username), u.profile_picture_url, u.username
  from public.account_follows f
  left join public.users u on lower(u.wallet_address) = f.follower_wallet
  where f.target_account_id = p_account_id
  order by f.created_at desc
  limit least(p_limit, 200) offset greatest(p_offset, 0)
$$;

revoke execute on function public.personal_account_id(text) from public;
grant execute on function public.personal_account_id(text), public.get_follow_stats(uuid),
  public.get_follow_suggestions(), public.list_account_followers(uuid, int, int) to anon, authenticated;
```

Before applying, check two names live:
- `account_vote_summary` (via `execute_sql`: `select column_name from information_schema.columns where table_name='account_vote_summary'`) — it must expose `account_id` and `up_count`; adjust the column names in the join if not.
- `users.display_name` — it must exist.

- [ ] **Step 4: Apply and re-run the test**

Apply with MCP `apply_migration` (name `20261010_follow_graph`), then run the test file again.

Expected: `ROLLBACK`, with no assertion error.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261010_follow_graph.sql supabase/tests/follow_graph_test.sql
git commit -m "feat(db): follow graph tables, RLS and read RPCs"
```

---

### Task 2: Pure relations state (client)

**Files:**
- Create: `apps/expo/lib/relations-state.ts`
- Test: `apps/expo/lib/__tests__/relations-state.test.ts`

**Interfaces:**
- Produces:

```ts
export type RelationsSnapshot = {
  following: string[];          // account ids the viewer follows
  unfollowed: string[];         // account ids the viewer explicitly unfollowed
  muted: string[];              // account ids the viewer muted
  unfollowedWallets: string[];  // lowercased owner wallets of unfollowed PERSONAL accounts
  mutedWallets: string[];       // lowercased owner wallets of muted PERSONAL accounts
};
export const EMPTY_SNAPSHOT: RelationsSnapshot;
export type HiddenIndex = { feedIds: Set<string>; feedWallets: Set<string>; mutedIds: Set<string>; mutedWallets: Set<string> };
export function buildHiddenIndex(s: RelationsSnapshot): HiddenIndex;
export function hiddenAccountIds(s: RelationsSnapshot): string[];  // sorted, unfollowed ∪ muted
export function isAuthorHiddenInFeed(i: HiddenIndex, a: { account_id?: string | null; wallet_address?: string | null }): boolean;
export function isAuthorMuted(i: HiddenIndex, a: { account_id?: string | null; wallet_address?: string | null }): boolean;
export function applyRelationChange(s: RelationsSnapshot, c: RelationChange): RelationsSnapshot;
export type RelationChange =
  | { kind: 'follow'; ids: string[] } | { kind: 'unfollow'; ids: string[] }
  | { kind: 'mute'; id: string; wallet?: string | null } | { kind: 'unmute'; id: string; wallet?: string | null };
```

- [ ] **Step 1: Write the failing test**

```ts
import { EMPTY_SNAPSHOT, applyRelationChange, buildHiddenIndex, hiddenAccountIds, isAuthorHiddenInFeed, isAuthorMuted } from '../relations-state';

const snap = {
  ...EMPTY_SNAPSHOT,
  unfollowed: ['acc-u'],
  muted: ['acc-m'],
  unfollowedWallets: ['0xaaa'],
  mutedWallets: ['0xbbb'],
};

describe('relations-state', () => {
  it('hides unfollowed and muted accounts from the feed', () => {
    const i = buildHiddenIndex(snap);
    expect(isAuthorHiddenInFeed(i, { account_id: 'acc-u' })).toBe(true);
    expect(isAuthorHiddenInFeed(i, { account_id: 'acc-m' })).toBe(true);
    expect(isAuthorHiddenInFeed(i, { account_id: 'acc-x' })).toBe(false);
  });

  it('hides legacy posts without account_id by owner wallet, case-insensitively', () => {
    const i = buildHiddenIndex(snap);
    expect(isAuthorHiddenInFeed(i, { account_id: null, wallet_address: '0xAAA' })).toBe(true);
    expect(isAuthorHiddenInFeed(i, { account_id: null, wallet_address: '0xccc' })).toBe(false);
  });

  it('a person posting AS an org is not hidden by muting the person', () => {
    const i = buildHiddenIndex(snap);
    expect(isAuthorHiddenInFeed(i, { account_id: 'org-1', wallet_address: '0xbbb' })).toBe(false);
  });

  it('only mutes count for comments and notifications', () => {
    const i = buildHiddenIndex(snap);
    expect(isAuthorMuted(i, { account_id: 'acc-u' })).toBe(false);
    expect(isAuthorMuted(i, { account_id: 'acc-m' })).toBe(true);
    expect(isAuthorMuted(i, { wallet_address: '0xBBB' })).toBe(true);
  });

  it('follow clears unfollowed; unfollow clears following', () => {
    let s = applyRelationChange(snap, { kind: 'follow', ids: ['acc-u'] });
    expect(s.following).toContain('acc-u');
    expect(s.unfollowed).not.toContain('acc-u');
    s = applyRelationChange(s, { kind: 'unfollow', ids: ['acc-u'] });
    expect(s.following).not.toContain('acc-u');
    expect(s.unfollowed).toContain('acc-u');
  });

  it('mute keeps the follow (invisible to the target) and unmute restores', () => {
    let s = applyRelationChange({ ...EMPTY_SNAPSHOT, following: ['p'] }, { kind: 'mute', id: 'p', wallet: '0xDDD' });
    expect(s.following).toContain('p');
    expect(s.muted).toContain('p');
    expect(s.mutedWallets).toContain('0xddd');
    s = applyRelationChange(s, { kind: 'unmute', id: 'p', wallet: '0xddd' });
    expect(s.muted).not.toContain('p');
    expect(s.mutedWallets).not.toContain('0xddd');
  });

  it('hiddenAccountIds is sorted and deduped so it is a stable query key', () => {
    expect(hiddenAccountIds({ ...EMPTY_SNAPSHOT, unfollowed: ['b', 'a'], muted: ['a'] })).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd apps/expo && npx jest lib/__tests__/relations-state.test.ts --watchAll=false`

Expected: `Cannot find module '../relations-state'`.

- [ ] **Step 3: Implement**

```ts
// Pure follow/mute state: which authors the viewer hides, and how a change updates the snapshot.
// No React, no storage — RelationsContext and the tests share it.

export type RelationsSnapshot = {
  following: string[];
  unfollowed: string[];
  muted: string[];
  unfollowedWallets: string[];
  mutedWallets: string[];
};

export const EMPTY_SNAPSHOT: RelationsSnapshot = {
  following: [], unfollowed: [], muted: [], unfollowedWallets: [], mutedWallets: [],
};

export type HiddenIndex = {
  feedIds: Set<string>;
  feedWallets: Set<string>;
  mutedIds: Set<string>;
  mutedWallets: Set<string>;
};

export type RelationChange =
  | { kind: 'follow'; ids: string[] }
  | { kind: 'unfollow'; ids: string[] }
  | { kind: 'mute'; id: string; wallet?: string | null }
  | { kind: 'unmute'; id: string; wallet?: string | null };

type Author = { account_id?: string | null; wallet_address?: string | null };

const lower = (w: string) => w.toLowerCase();
const uniq = (xs: string[]) => [...new Set(xs)];
const without = (xs: string[], drop: string[]) => xs.filter((x) => !drop.includes(x));

export function buildHiddenIndex(s: RelationsSnapshot): HiddenIndex {
  return {
    feedIds: new Set([...s.unfollowed, ...s.muted]),
    feedWallets: new Set([...s.unfollowedWallets, ...s.mutedWallets].map(lower)),
    mutedIds: new Set(s.muted),
    mutedWallets: new Set(s.mutedWallets.map(lower)),
  };
}

export function hiddenAccountIds(s: RelationsSnapshot): string[] {
  return uniq([...s.unfollowed, ...s.muted]).sort();
}

// A wallet match only applies when the row has no account_id: with an account_id the row
// says exactly which identity posted (a person posting as their org is the org).
function matches(ids: Set<string>, wallets: Set<string>, a: Author): boolean {
  if (a.account_id) return ids.has(a.account_id);
  return !!a.wallet_address && wallets.has(lower(a.wallet_address));
}

export function isAuthorHiddenInFeed(i: HiddenIndex, a: Author): boolean {
  return matches(i.feedIds, i.feedWallets, a);
}

export function isAuthorMuted(i: HiddenIndex, a: Author): boolean {
  if (a.account_id && i.mutedIds.has(a.account_id)) return true;
  return !!a.wallet_address && i.mutedWallets.has(lower(a.wallet_address));
}

export function applyRelationChange(s: RelationsSnapshot, c: RelationChange): RelationsSnapshot {
  switch (c.kind) {
    case 'follow':
      return { ...s, following: uniq([...s.following, ...c.ids]), unfollowed: without(s.unfollowed, c.ids) };
    case 'unfollow':
      return { ...s, following: without(s.following, c.ids), unfollowed: uniq([...s.unfollowed, ...c.ids]) };
    case 'mute':
      return {
        ...s,
        muted: uniq([...s.muted, c.id]),
        mutedWallets: c.wallet ? uniq([...s.mutedWallets, lower(c.wallet)]) : s.mutedWallets,
      };
    case 'unmute':
      return {
        ...s,
        muted: without(s.muted, [c.id]),
        mutedWallets: c.wallet ? without(s.mutedWallets, [lower(c.wallet)]) : s.mutedWallets,
      };
  }
}
```

- [ ] **Step 4: Run, expect PASS** (same command).

- [ ] **Step 5: Commit**

```bash
git add apps/expo/lib/relations-state.ts apps/expo/lib/__tests__/relations-state.test.ts
git commit -m "feat(expo): pure follow/mute hidden-set logic"
```

---

### Task 3: `get_feed_page` exclusion

**Files:**
- Modify: `supabase/migrations/20261010_follow_graph.sql` (append)
- Modify: `apps/expo/supabase/migrations/feed_page_rpc.sql` (mirror the new definition, so the repo file stays the reference)
- Modify: `supabase/tests/follow_graph_test.sql` (append a block)

**Interfaces:**
- Consumes: the Task 1 tables.
- Produces: `get_feed_page(p_feed_type text, p_page int default 0, p_page_size int default 15, p_wallet text default null, p_exclude_account_ids uuid[] default null) → jsonb`, with the same output shape as today.

- [ ] **Step 1: Append the failing test block** to `supabase/tests/follow_graph_test.sql`, before `rollback;`:

```sql
do $$
declare
  v_w text := '0x00000000000000000000000000000000000000f3';
  v_a uuid; v_org uuid; v_res jsonb; v_ids text[];
begin
  insert into users (wallet_address, username) values (v_w, 'fgtest3');
  insert into accounts (account_type, name) values ('personal', 'FG Drei') returning id into v_a;
  insert into accounts (account_type, name, sub_type) values ('organisation', 'FG Verein', 'verein') returning id into v_org;
  insert into account_owners (account_id, wallet_address, role) values (v_a, v_w, 'owner'), (v_org, v_w, 'owner');
  -- legacy post (no account_id), personal post, org post by the same person
  insert into posts (wallet_address, content, feed_type, status, account_id, created_at) values
    (v_w, 'fg legacy', 'main', 'published', null, now() + interval '3 day'),
    (v_w, 'fg personal', 'main', 'published', v_a, now() + interval '2 day'),
    (v_w, 'fg org', 'main', 'published', v_org, now() + interval '1 day');

  v_res := public.get_feed_page('main', 0, 50, null, array[v_a]);
  select array_agg(p->>'content') into v_ids from jsonb_array_elements(v_res->'posts') p where p->>'content' like 'fg %';
  assert v_ids = array['fg org'], format('muting the person hides legacy + personal posts only, got %s', v_ids);

  v_res := public.get_feed_page('main', 0, 50, null, null);
  select array_agg(p->>'content') into v_ids from jsonb_array_elements(v_res->'posts') p where p->>'content' like 'fg %';
  assert cardinality(v_ids) = 3, 'no exclusion = unchanged feed';

  -- the old 4-argument call shape still resolves
  v_res := public.get_feed_page(p_feed_type => 'main', p_page => 0, p_page_size => 5, p_wallet => null);
  assert v_res ? 'posts', 'named 4-arg call works';
end $$;
```

The `posts` insert must satisfy `posts` NOT NULL columns. If it fails with a not-null violation, add the missing columns with harmless values; check with `select column_name from information_schema.columns where table_name='posts' and is_nullable='NO' and column_default is null`.

- [ ] **Step 2: Run, expect FAIL**

Expected: `function public.get_feed_page(unknown, integer, integer, unknown, uuid[]) does not exist`.

- [ ] **Step 3: Implement**

1. Fetch the live body: `select pg_get_functiondef('public.get_feed_page(text,integer,integer,text)'::regprocedure);`. Start from the live body, not the repo file.
2. Append the following to the migration, with the live body edited as shown:

```sql
drop function if exists public.get_feed_page(text, integer, integer, text);

create or replace function public.get_feed_page(
  p_feed_type text,
  p_page integer default 0,
  p_page_size integer default 15,
  p_wallet text default null,
  p_exclude_account_ids uuid[] default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  -- (all existing declarations, unchanged)
  v_hide uuid[] := coalesce(p_exclude_account_ids, '{}');
  v_hide_wallets text[] := '{}';
begin
  -- Legacy posts carry no account_id: hide them by the owner wallet of an excluded PERSONAL account.
  if cardinality(v_hide) > 0 then
    select coalesce(array_agg(distinct lower(ao.wallet_address)), '{}') into v_hide_wallets
    from public.account_owners ao
    join public.accounts a on a.id = ao.account_id and a.account_type = 'personal'
    where ao.account_id = any (v_hide);
  end if;

  -- In BOTH the page select and the pinned select, add after `status = 'published'`:
  --     and not coalesce(account_id = any (v_hide), false)
  --     and not (account_id is null and lower(wallet_address) = any (v_hide_wallets))
  -- (rest of the body unchanged)
end;
$$;

grant execute on function public.get_feed_page(text, integer, integer, text, uuid[]) to anon, authenticated;
```

3. Copy the final function into `apps/expo/supabase/migrations/feed_page_rpc.sql`, replacing the old `get_feed_page` and its grant.

- [ ] **Step 4: Apply and run the test**

Apply with `apply_migration` (name `20261010_follow_graph_feed`), containing only the appended part. Run the test file.

Expected: `ROLLBACK`, no assertion errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261010_follow_graph.sql apps/expo/supabase/migrations/feed_page_rpc.sql supabase/tests/follow_graph_test.sql
git commit -m "feat(db): get_feed_page hides excluded accounts incl. legacy posts"
```

---

### Task 4: Edge function `account-relations`

**Files:**
- Create: `apps/expo/supabase/functions/account-relations/core.ts`
- Create: `apps/expo/supabase/functions/account-relations/index.ts`
- Test: `apps/expo/lib/__tests__/account-relations-core.test.ts`

**Interfaces:**
- Consumes: Task 1 tables, `personal_account_id`; `_shared/verify-account-signature.ts`; `_shared/verify-session-token.ts`.
- Produces:
  - POST `/functions/v1/account-relations` with body `{ action, wallet, timestampSec, payload, signature? }`.
  - Signed message `roebel-relations-v1:<action>:<wallet>:<ts>:<sha256(sorted payload)>`.
  - Actions:
    - `list` `{}`
    - `follow` `{ targets: string[], source: 'onboarding'|'manual'|'intro' }`
    - `unfollow` `{ targets: string[] }`
    - `mute` `{ target: string }`
    - `unmute` `{ target: string }`
  - Every success returns `{ ok: true, data: RelationsSnapshot }` (the Task 2 type).
  - Error codes: `BAD_ACTION`, `BAD_WALLET`, `BAD_PAYLOAD`, `BAD_SIGNATURE`, `STALE`, `VERIFY_UNAVAILABLE`, `INTERNAL`.

- [ ] **Step 1: Write the failing core test**

```ts
import { MAX_TARGETS, parseFollowPayload, parseTargetPayload, followNotice } from '../../supabase/functions/account-relations/core';

const U = '11111111-1111-4111-8111-111111111111';
const V = '22222222-2222-4222-8222-222222222222';

describe('account-relations core', () => {
  it('accepts a deduped uuid list and a known source', () => {
    expect(parseFollowPayload({ targets: [U, U.toUpperCase(), V], source: 'onboarding' }))
      .toEqual({ ok: true, targets: [U, V], source: 'onboarding' });
  });
  it('rejects bad sources, non-uuids, empty and oversized lists', () => {
    expect(parseFollowPayload({ targets: [U], source: 'x' }).ok).toBe(false);
    expect(parseFollowPayload({ targets: ['nope'], source: 'manual' }).ok).toBe(false);
    expect(parseFollowPayload({ targets: [], source: 'manual' }).ok).toBe(false);
    const many = Array.from({ length: MAX_TARGETS + 1 }, (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
    expect(parseFollowPayload({ targets: many, source: 'manual' }).ok).toBe(false);
  });
  it('parses a single mute target', () => {
    expect(parseTargetPayload({ target: U })).toEqual({ ok: true, target: U });
    expect(parseTargetPayload({}).ok).toBe(false);
  });
  it('builds the German notice copy per source and target kind', () => {
    expect(followNotice({ followerName: 'Anna', source: 'onboarding', orgName: null }))
      .toEqual({ title: 'Neu in Röbel: Anna folgt dir', body: 'Sag doch Hallo!' });
    expect(followNotice({ followerName: 'Anna', source: 'manual', orgName: null }))
      .toEqual({ title: 'Anna folgt dir jetzt', body: '' });
    expect(followNotice({ followerName: 'Anna', source: 'intro', orgName: 'Angelverein' }))
      .toEqual({ title: 'Anna folgt jetzt Angelverein', body: '' });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd apps/expo && npx jest lib/__tests__/account-relations-core.test.ts --watchAll=false`

Expected: `Cannot find module`.

- [ ] **Step 3: Implement `core.ts`**

It must have no Deno or URL imports, so Jest can load it.

```ts
// Pure helpers for the account-relations edge function. No Deno imports: Jest loads this file.
export const MAX_TARGETS = 1000;
export const SOURCES = ['onboarding', 'manual', 'intro'] as const;
export type FollowSource = (typeof SOURCES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Fail = { ok: false; message: string };

function parseIds(raw: unknown): { ok: true; ids: string[] } | Fail {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, message: 'targets required' };
  if (raw.length > MAX_TARGETS) return { ok: false, message: `max ${MAX_TARGETS} targets` };
  const ids: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string' || !UUID_RE.test(t)) return { ok: false, message: 'target malformed' };
    const id = t.toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return { ok: true, ids };
}

export function parseFollowPayload(p: Record<string, unknown>):
  { ok: true; targets: string[]; source: FollowSource } | Fail {
  const ids = parseIds(p.targets);
  if (!ids.ok) return ids;
  if (!(SOURCES as readonly unknown[]).includes(p.source)) return { ok: false, message: 'source invalid' };
  return { ok: true, targets: ids.ids, source: p.source as FollowSource };
}

export function parseUnfollowPayload(p: Record<string, unknown>): { ok: true; targets: string[] } | Fail {
  const ids = parseIds(p.targets);
  return ids.ok ? { ok: true, targets: ids.ids } : ids;
}

export function parseTargetPayload(p: Record<string, unknown>): { ok: true; target: string } | Fail {
  if (typeof p.target !== 'string' || !UUID_RE.test(p.target)) return { ok: false, message: 'target malformed' };
  return { ok: true, target: p.target.toLowerCase() };
}

export function followNotice(a: { followerName: string; source: FollowSource; orgName: string | null }):
  { title: string; body: string } {
  if (a.orgName) return { title: `${a.followerName} folgt jetzt ${a.orgName}`, body: '' };
  if (a.source === 'manual') return { title: `${a.followerName} folgt dir jetzt`, body: '' };
  return { title: `Neu in Röbel: ${a.followerName} folgt dir`, body: 'Sag doch Hallo!' };
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Implement `index.ts`**

Start by copying the following verbatim from `apps/expo/supabase/functions/org-membership/index.ts`:
- the imports;
- `corsHeaders`;
- `gnosisClient`, `verifyAccountSignature`, `sessionLookup`;
- `hashPayload`, `json` / `ok` / `fail`, `isWellFormedSignature`;
- the whole auth block of `serve()` (OPTIONS → verified signer, lines ~897–998).

Then change:
- the scope string in the message builder → `roebel-relations-v1`;
- `ACTIONS` → `['list','follow','unfollow','mute','unmute']`.

Replace the `switch` with:

```ts
import { followNotice, parseFollowPayload, parseTargetPayload, parseUnfollowPayload, type FollowSource } from './core.ts';

async function snapshot(admin: Admin, viewer: string) {
  const [{ data: fol }, { data: hides }] = await Promise.all([
    admin.from('account_follows').select('target_account_id').eq('follower_wallet', viewer),
    admin.from('account_hides').select('target_account_id, kind').eq('viewer_wallet', viewer),
  ]);
  const unfollowed = (hides ?? []).filter((h: any) => h.kind === 'unfollowed').map((h: any) => h.target_account_id);
  const muted = (hides ?? []).filter((h: any) => h.kind === 'muted').map((h: any) => h.target_account_id);
  const ownerWallets = async (ids: string[]) => {
    if (ids.length === 0) return [] as string[];
    const { data } = await admin.from('account_owners')
      .select('wallet_address, accounts!inner(account_type)')
      .in('account_id', ids).eq('accounts.account_type', 'personal');
    return [...new Set((data ?? []).map((r: any) => String(r.wallet_address).toLowerCase()))];
  };
  return {
    following: (fol ?? []).map((f: any) => f.target_account_id),
    unfollowed, muted,
    unfollowedWallets: await ownerWallets(unfollowed),
    mutedWallets: await ownerWallets(muted),
  };
}

async function existingIds(admin: Admin, ids: string[]): Promise<string[]> {
  const { data, error } = await admin.from('accounts').select('id').in('id', ids);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.id);
}

async function handleFollow(admin: Admin, viewer: string, payload: Record<string, unknown>) {
  const parsed = parseFollowPayload(payload);
  if (!parsed.ok) return fail('BAD_PAYLOAD', 400, parsed.message);
  const own = await admin.rpc('personal_account_id', { p_wallet: viewer });
  const targets = (await existingIds(admin, parsed.targets)).filter((id) => id !== own.data);
  if (targets.length > 0) {
    // ignoreDuplicates + select → only NEWLY created rows come back: a retry sends no second notice.
    const { data: created, error } = await admin.from('account_follows')
      .upsert(targets.map((t) => ({ follower_wallet: viewer, target_account_id: t, source: parsed.source })),
        { onConflict: 'follower_wallet,target_account_id', ignoreDuplicates: true })
      .select('target_account_id');
    if (error) return fail('INTERNAL', 500, error.message);
    await admin.from('account_hides').delete().eq('viewer_wallet', viewer).eq('kind', 'unfollowed').in('target_account_id', targets);
    await insertNotices(admin, viewer, (created ?? []).map((r: any) => r.target_account_id), parsed.source);
  }
  return ok(await snapshot(admin, viewer));
}

async function insertNotices(admin: Admin, viewer: string, targetIds: string[], source: FollowSource) {
  if (targetIds.length === 0) return;
  const { data: me } = await admin.from('users').select('display_name, username').ilike('wallet_address', viewer).maybeSingle();
  const followerName = (me as any)?.display_name || (me as any)?.username || 'Jemand Neues';
  const { data: accounts } = await admin.from('accounts').select('id, name, account_type').in('id', targetIds);
  const { data: owners } = await admin.from('account_owners').select('account_id, wallet_address, role').in('account_id', targetIds);
  const rows: Record<string, unknown>[] = [];
  for (const acc of (accounts ?? []) as any[]) {
    const isOrg = acc.account_type === 'organisation';
    const recipients = ((owners ?? []) as any[])
      .filter((o) => o.account_id === acc.id && (isOrg ? ['owner', 'admin'].includes(o.role) : true))
      .map((o) => String(o.wallet_address).toLowerCase())
      .filter((w) => w !== viewer);
    const { title, body } = followNotice({ followerName, source, orgName: isOrg ? acc.name : null });
    for (const w of new Set(recipients)) {
      rows.push({ recipient_wallet: w, type: 'new_follower', title, body,
        metadata: { actor_wallet: viewer, follower_wallet: viewer, account_id: acc.id, source } });
    }
  }
  // Chunked: one onboarding can address a few hundred accounts.
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from('notifications').insert(rows.slice(i, i + 200));
    if (error) console.error('new_follower notices failed (non-fatal)', error);
  }
}

async function handleUnfollow(admin: Admin, viewer: string, payload: Record<string, unknown>) {
  const parsed = parseUnfollowPayload(payload);
  if (!parsed.ok) return fail('BAD_PAYLOAD', 400, parsed.message);
  const targets = await existingIds(admin, parsed.targets);
  if (targets.length > 0) {
    await admin.from('account_follows').delete().eq('follower_wallet', viewer).in('target_account_id', targets);
    const { error } = await admin.from('account_hides').upsert(
      targets.map((t) => ({ viewer_wallet: viewer, target_account_id: t, kind: 'unfollowed' })),
      { onConflict: 'viewer_wallet,target_account_id,kind', ignoreDuplicates: true });
    if (error) return fail('INTERNAL', 500, error.message);
  }
  return ok(await snapshot(admin, viewer));
}

async function handleMute(admin: Admin, viewer: string, payload: Record<string, unknown>, mute: boolean) {
  const parsed = parseTargetPayload(payload);
  if (!parsed.ok) return fail('BAD_PAYLOAD', 400, parsed.message);
  if ((await existingIds(admin, [parsed.target])).length === 0) return fail('BAD_PAYLOAD', 400, 'unknown account');
  const q = mute
    ? admin.from('account_hides').upsert({ viewer_wallet: viewer, target_account_id: parsed.target, kind: 'muted' },
        { onConflict: 'viewer_wallet,target_account_id,kind', ignoreDuplicates: true })
    : admin.from('account_hides').delete().eq('viewer_wallet', viewer).eq('target_account_id', parsed.target).eq('kind', 'muted');
  const { error } = await q;
  if (error) return fail('INTERNAL', 500, error.message);
  return ok(await snapshot(admin, viewer));
}

// in serve(), after `const signer = claimedWallet;`:
try {
  switch (action) {
    case 'list': return ok(await snapshot(admin, signer));
    case 'follow': return await handleFollow(admin, signer, payloadObj);
    case 'unfollow': return await handleUnfollow(admin, signer, payloadObj);
    case 'mute': return await handleMute(admin, signer, payloadObj, true);
    case 'unmute': return await handleMute(admin, signer, payloadObj, false);
  }
} catch (err) {
  console.error('account-relations failed', action, err);
  return fail('INTERNAL', 500, 'internal error');
}
```

If supabase-js 2.39 rejects `upsert(..., { ignoreDuplicates }).select()` returning only inserted rows, fall back. Query the existing follow ids for `targets` first, compute `newIds = targets − existing`, then use a plain `insert` for `newIds` and notify exactly those.

- [ ] **Step 6: Deploy and smoke-test**

Deploy with MCP `deploy_edge_function` (name `account-relations`, files `index.ts` + `core.ts` + the two `_shared/*.ts` it imports). Smoke test: a `list` call with a garbage signature must return 401 `BAD_SIGNATURE`:

```bash
curl -s -X POST https://wwbeqhkslxdxhktqzqti.supabase.co/functions/v1/account-relations \
  -H "Content-Type: application/json" -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -d '{"action":"list","wallet":"0x0000000000000000000000000000000000000001","timestampSec":'$(date +%s)',"payload":{},"signature":"0x'$(printf 'ab%.0s' {1..65})'"}'
```

Expected: `{"ok":false,"code":"BAD_SIGNATURE",...}`.

- [ ] **Step 7: Commit**

```bash
git add apps/expo/supabase/functions/account-relations apps/expo/lib/__tests__/account-relations-core.test.ts
git commit -m "feat(expo): account-relations edge function (follow, unfollow, mute)"
```

---

### Task 5: Push suppression, digest preference, weekly digest

**Files:**
- Create: `supabase/migrations/20261010_follow_graph_push.sql`
- Modify: `apps/expo/supabase/functions/send-notification/index.ts` (type union ~:19, pref switch ~:176)
- Modify: `supabase/tests/follow_graph_test.sql` (append)

**Interfaces:**
- Consumes: the Task 1 tables.
- Produces:
  - `notification_preferences.follower_digest_enabled boolean default true`;
  - `send_follower_digest() → int` (number of orgs pushed);
  - cron job `follower-digest-weekly`;
  - push type `follower_digest`;
  - `post_new` push data now carries `actorWallet` + `accountId`.

- [ ] **Step 1: Append the failing test** (before `rollback;`):

```sql
do $$
begin
  assert exists (select 1 from information_schema.columns
    where table_name = 'notification_preferences' and column_name = 'follower_digest_enabled'), 'pref column';
  assert exists (select 1 from cron.job where jobname = 'follower-digest-weekly'), 'cron job';
  assert position('account_hides' in pg_get_functiondef('public.notify_user_notification_push()'::regprocedure)) > 0,
    'push trigger checks mutes';
end $$;
```

- [ ] **Step 2: Run, expect FAIL** (`pref column`).

- [ ] **Step 3: Write the migration**

1. Fetch the live bodies of `notify_user_notification_push()` and `notify_new_main_post()` with `pg_get_functiondef`.
2. Into `notify_user_notification_push`, insert this block immediately after the `IF NEW.type NOT IN (...) THEN RETURN NEW; END IF;` guard. Leave the allow-list untouched: `new_follower` is not in it, so follows never push instantly.

```sql
  -- Muted actors never reach the recipient's lock screen (the inbox filters them client-side).
  IF NEW.metadata ? 'actor_wallet' AND EXISTS (
    SELECT 1 FROM public.account_hides h
    JOIN public.account_owners ao ON ao.account_id = h.target_account_id
    JOIN public.accounts a ON a.id = h.target_account_id AND a.account_type = 'personal'
    WHERE h.kind = 'muted'
      AND h.viewer_wallet = lower(NEW.recipient_wallet)
      AND lower(ao.wallet_address) = lower(NEW.metadata->>'actor_wallet')
  ) THEN
    RETURN NEW;
  END IF;
```

3. In `notify_new_main_post`, add `'actorWallet', lower(NEW.wallet_address), 'accountId', NEW.account_id` to the `data` object of the `net.http_post` body.
4. Write the two edited functions in full, then add:

```sql
alter table public.notification_preferences add column if not exists follower_digest_enabled boolean not null default true;

create or replace function public.send_follower_digest()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_url text; v_key text; v_sent int := 0; r record;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_send_notification_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'edge_send_notification_key';
  if v_url is null or v_key is null then
    raise warning 'send_follower_digest: missing vault secrets';
    return 0;
  end if;
  for r in
    select a.id, a.name, count(*)::int as n,
           (select jsonb_agg(distinct lower(ao.wallet_address)) from public.account_owners ao
            where ao.account_id = a.id and ao.role in ('owner','admin')) as wallets
    from public.account_follows f
    join public.accounts a on a.id = f.target_account_id and a.account_type = 'organisation'
    where f.created_at > now() - interval '7 days'
    group by a.id, a.name
  loop
    continue when r.wallets is null;
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object(
        'type', 'follower_digest',
        'title', r.name,
        'body', case when r.n = 1 then '1 neuer Follower diese Woche' else r.n || ' neue Follower diese Woche' end,
        'walletAddresses', r.wallets,
        'data', jsonb_build_object('type', 'org', 'accountId', r.id)
      )
    );
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;
revoke execute on function public.send_follower_digest() from public, anon, authenticated;

-- Monday 08:00 UTC = 10:00 CEST / 09:00 CET.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'follower-digest-weekly') then
    perform cron.unschedule('follower-digest-weekly');
  end if;
  perform cron.schedule('follower-digest-weekly', '0 8 * * 1', $cron$ select public.send_follower_digest(); $cron$);
end $$;
```

- [ ] **Step 4: Edit `send-notification/index.ts`**

1. Add `| 'follower_digest'` to the `type` union.
2. Add `follower_digest_enabled?: boolean` to the `NotificationPreference` interface.
3. In the switch, add:

```ts
        case 'follower_digest':
          // Weekly "N neue Follower" for org owners/admins — opt-out per device (defaults to on)
          return pref.follower_digest_enabled !== false;
```

4. After `eligibleTokens` is computed and before sending, drop viewers who hid the author of a `post_new`. Pushing a post the feed hides would contradict the feed.

```ts
    let deliverable = eligibleTokens;
    if (type === 'post_new' && (data?.accountId || data?.actorWallet)) {
      let target = data?.accountId as string | undefined;
      if (!target && data?.actorWallet) {
        const { data: pid } = await supabase.rpc('personal_account_id', { p_wallet: data.actorWallet as string });
        target = (pid as string | null) ?? undefined;
      }
      if (target) {
        const { data: hides } = await supabase.from('account_hides').select('viewer_wallet').eq('target_account_id', target);
        const hiders = new Set((hides ?? []).map((h: { viewer_wallet: string }) => h.viewer_wallet));
        deliverable = eligibleTokens.filter((t: PushToken) => !t.wallet_address || !hiders.has(t.wallet_address.toLowerCase()));
      }
    }
```

5. Use `deliverable` instead of `eligibleTokens` from there on. Add `wallet_address` to the token select and the `PushToken` type if it is missing; the column exists since `dm_push_notifications.sql`.

- [ ] **Step 5: Apply, deploy, test**

1. Apply with `apply_migration` (name `20261010_follow_graph_push`).
2. Deploy `send-notification` with `deploy_edge_function`.
3. Run the SQL test. Expected: `ROLLBACK`, no errors.
4. Run `select public.send_follower_digest();` once. Expected: `0`, since no follows exist yet.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261010_follow_graph_push.sql supabase/tests/follow_graph_test.sql apps/expo/supabase/functions/send-notification/index.ts
git commit -m "feat(db): mute-aware pushes and weekly follower digest for orgs"
```

---

### Task 6: Client calls, snapshot cache, `RelationsContext`

**Files:**
- Create: `apps/expo/lib/account-relations.ts`
- Create: `apps/expo/lib/supabase-follows.ts`
- Create: `apps/expo/context/RelationsContext.tsx`
- Modify: `apps/expo/app/_layout.tsx` (mount `<RelationsProvider>` directly inside `<SnackbarProvider>`)
- Test: `apps/expo/lib/__tests__/account-relations.test.ts`

**Interfaces:**
- Consumes: Task 2 types; Task 4 endpoint.
- Produces:

```ts
// lib/account-relations.ts
export type RelationsAction = 'list' | 'follow' | 'unfollow' | 'mute' | 'unmute';
export async function callRelations(account: SigningAccount, action: RelationsAction, payload: Record<string, unknown>): Promise<{ ok: true; data: RelationsSnapshot } | { ok: false; code: string; message: string }>;
export async function loadCachedSnapshot(wallet: string): Promise<RelationsSnapshot | null>;
export async function saveCachedSnapshot(wallet: string, s: RelationsSnapshot): Promise<void>;
// lib/supabase-follows.ts
export type FollowSuggestion = { account_id: string; name: string; avatar_url: string | null; account_type: 'personal' | 'organisation'; sub_type: string | null; followers: number };
export async function fetchFollowSuggestions(): Promise<FollowSuggestion[]>;
export async function fetchFollowStats(accountId: string): Promise<{ followers: number; following: number }>;
export async function fetchPersonalAccountId(wallet: string): Promise<string | null>;
// context/RelationsContext.tsx
export function useRelations(): {
  ready: boolean; snapshot: RelationsSnapshot; index: HiddenIndex; hiddenIds: string[];
  isFollowing(id: string): boolean; isMuted(id: string): boolean;
  follow(ids: string[], source: 'onboarding' | 'manual' | 'intro'): Promise<boolean>;
  unfollow(ids: string[]): Promise<boolean>;
  mute(id: string, wallet?: string | null): Promise<boolean>;
  unmute(id: string, wallet?: string | null): Promise<boolean>;
};
```

- [ ] **Step 1: Write the failing test**

```ts
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, s: string) => require('node:crypto').createHash('sha256').update(s).digest('hex'),
}));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' } } }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../passkey/active', () => ({ passkeySessionOf: () => null }));

import { buildRelationsMessage, callRelations, loadCachedSnapshot, saveCachedSnapshot } from '../account-relations';
import { EMPTY_SNAPSHOT } from '../relations-state';

describe('account-relations client', () => {
  it('signs the roebel-relations-v1 grammar', async () => {
    const msg = await buildRelationsMessage('follow', '0xABC', 1700000000, { targets: ['a'], source: 'manual' });
    expect(msg).toMatch(/^roebel-relations-v1:follow:0xabc:1700000000:[0-9a-f]{64}$/);
  });

  it('posts to the edge function and returns the snapshot', async () => {
    const account = { address: '0xABC', signMessage: jest.fn(async () => '0x' + 'ab'.repeat(65)) };
    const fetchMock = jest.fn(async () => ({ status: 200, json: async () => ({ ok: true, data: { ...EMPTY_SNAPSHOT, muted: ['m'] } }) }));
    (global as any).fetch = fetchMock;
    const res = await callRelations(account, 'mute', { target: 'm' });
    expect(res).toEqual({ ok: true, data: { ...EMPTY_SNAPSHOT, muted: ['m'] } });
    expect((fetchMock.mock.calls[0] as any)[0]).toBe('https://x.supabase.co/functions/v1/account-relations');
  });

  it('turns a network failure into NETWORK_ERROR instead of throwing', async () => {
    (global as any).fetch = jest.fn(async () => { throw new Error('offline'); });
    const account = { address: '0xABC', signMessage: jest.fn(async () => '0x' + 'ab'.repeat(65)) };
    const res = await callRelations(account, 'list', {});
    expect(res).toMatchObject({ ok: false, code: 'NETWORK_ERROR' });
  });

  it('caches the snapshot per lowercased wallet', async () => {
    await saveCachedSnapshot('0xABC', { ...EMPTY_SNAPSHOT, muted: ['m'] });
    expect((await loadCachedSnapshot('0xabc'))?.muted).toEqual(['m']);
    expect(await loadCachedSnapshot('0xdef')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (module missing).

- [ ] **Step 3: Implement `lib/account-relations.ts`**

Mirror `lib/org-membership.ts`: the same `Extra` config resolution and the same `post` / `signedOrSession` tail with `endpoint: 'edge:account-relations'`.

```ts
// Expo client for the account-relations edge function (follow / unfollow / mute). Same signed-request
// grammar as lib/org-membership.ts under its own scope, so a follow signature can never replay as an org action.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { passkeySessionOf } from './passkey/active';
import { signedOrSession } from './passkey/api-session-runtime';
import type { SigningAccount } from './org-membership';
import type { RelationsSnapshot } from './relations-state';

export type RelationsAction = 'list' | 'follow' | 'unfollow' | 'mute' | 'unmute';
type Result = { ok: true; data: RelationsSnapshot } | { ok: false; code: string; message: string };

async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(sorted));
}

export async function buildRelationsMessage(action: RelationsAction, wallet: string, ts: number, payload: Record<string, unknown>) {
  return `roebel-relations-v1:${action}:${wallet.toLowerCase()}:${ts}:${await hashPayload(payload)}`;
}

type Extra = { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };
const extra = (Constants.expoConfig?.extra ?? (Constants as any).manifest?.extra) as Extra | undefined;
const SUPABASE_URL = extra?.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = extra?.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export async function callRelations(account: SigningAccount, action: RelationsAction, payload: Record<string, unknown>): Promise<Result> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { ok: false, code: 'NOT_CONFIGURED', message: 'Supabase ist nicht konfiguriert.' };
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/account-relations`;
  const post = async (body: unknown, extraHeaders: Record<string, string> = {}) => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, ...extraHeaders },
        body: JSON.stringify(body),
      });
      return { status: res.status ?? 200, json: (await res.json()) as Result };
    } catch (err) {
      return { status: 0, json: { ok: false, code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Netzwerkfehler' } as Result };
    }
  };
  const wallet = account.address.toLowerCase();
  const withSignature = async () => {
    const timestampSec = Math.floor(Date.now() / 1000);
    const signature = await account.signMessage({ message: await buildRelationsMessage(action, wallet, timestampSec, payload) });
    return (await post({ action, wallet, timestampSec, payload, signature })).json;
  };
  if (!passkeySessionOf(account)) return withSignature();
  return signedOrSession<Result>(account, {
    kind: 'edge',
    endpoint: 'edge:account-relations',
    withToken: async (headers) => {
      const r = await post({ action, wallet, timestampSec: Math.floor(Date.now() / 1000), payload }, headers);
      return { status: r.status, code: r.json.ok ? undefined : r.json.code, value: r.json };
    },
    withSignature,
  });
}

const cacheKey = (wallet: string) => `@roebel/relations/${wallet.toLowerCase()}`;

export async function loadCachedSnapshot(wallet: string): Promise<RelationsSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(wallet));
    return raw ? (JSON.parse(raw) as RelationsSnapshot) : null;
  } catch {
    return null;
  }
}

export async function saveCachedSnapshot(wallet: string, s: RelationsSnapshot): Promise<void> {
  try { await AsyncStorage.setItem(cacheKey(wallet), JSON.stringify(s)); } catch { /* cache only */ }
}
```

- [ ] **Step 4: Implement `lib/supabase-follows.ts`**

```ts
import { supabase } from './supabase';

export type FollowSuggestion = {
  account_id: string; name: string; avatar_url: string | null;
  account_type: 'personal' | 'organisation'; sub_type: string | null; followers: number;
};

export async function fetchFollowSuggestions(): Promise<FollowSuggestion[]> {
  const { data, error } = await supabase.rpc('get_follow_suggestions');
  if (error) { console.error('get_follow_suggestions failed', error); return []; }
  return (data ?? []) as FollowSuggestion[];
}

export async function fetchFollowStats(accountId: string): Promise<{ followers: number; following: number }> {
  const { data, error } = await supabase.rpc('get_follow_stats', { p_account_id: accountId });
  if (error || !data) return { followers: 0, following: 0 };
  return { followers: Number((data as any).followers ?? 0), following: Number((data as any).following ?? 0) };
}

export async function fetchPersonalAccountId(wallet: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('personal_account_id', { p_wallet: wallet });
  return error ? null : ((data as string | null) ?? null);
}
```

- [ ] **Step 5: Implement `context/RelationsContext.tsx`**

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { useQueryClient } from '@tanstack/react-query';
import { callRelations, loadCachedSnapshot, saveCachedSnapshot } from '@/lib/account-relations';
import { canSignSilently } from '@/lib/passkey/api-session-runtime';
import {
  EMPTY_SNAPSHOT, applyRelationChange, buildHiddenIndex, hiddenAccountIds,
  type HiddenIndex, type RelationChange, type RelationsSnapshot,
} from '@/lib/relations-state';
import { useSnackbar } from '@/context/SnackbarContext';

type FollowSource = 'onboarding' | 'manual' | 'intro';
type Ctx = {
  ready: boolean; snapshot: RelationsSnapshot; index: HiddenIndex; hiddenIds: string[];
  isFollowing: (id: string) => boolean; isMuted: (id: string) => boolean;
  follow: (ids: string[], source: FollowSource) => Promise<boolean>;
  unfollow: (ids: string[]) => Promise<boolean>;
  mute: (id: string, wallet?: string | null) => Promise<boolean>;
  unmute: (id: string, wallet?: string | null) => Promise<boolean>;
};

const RelationsContext = createContext<Ctx | null>(null);

export function RelationsProvider({ children }: { children: React.ReactNode }) {
  const account = useActiveAccount();
  const wallet = account?.address?.toLowerCase() ?? null;
  const queryClient = useQueryClient();
  const { showSnackbar } = useSnackbar();
  const [snapshot, setSnapshot] = useState<RelationsSnapshot>(EMPTY_SNAPSHOT);
  const [ready, setReady] = useState(false);
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;

  // Cache first (no flash of muted posts), then a silent server refresh. Never prompts a passkey at launch.
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setSnapshot(EMPTY_SNAPSHOT);
    if (!wallet || !account) { setReady(true); return; }
    void (async () => {
      const cached = await loadCachedSnapshot(wallet);
      if (cancelled) return;
      if (cached) setSnapshot(cached);
      setReady(true);
      if (!(await canSignSilently(account))) return;
      const res = await callRelations(account, 'list', {});
      if (cancelled || !res.ok) return;
      setSnapshot(res.data);
      void saveCachedSnapshot(wallet, res.data);
    })();
    return () => { cancelled = true; };
  }, [wallet]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async (change: RelationChange, action: 'follow' | 'unfollow' | 'mute' | 'unmute', payload: Record<string, unknown>) => {
    if (!account || !wallet) return false;
    const before = snapRef.current;
    const optimistic = applyRelationChange(before, change);
    setSnapshot(optimistic);
    const res = await callRelations(account, action, payload);
    if (!res.ok) {
      setSnapshot(before);
      showSnackbar({ message: 'Das hat nicht geklappt. Bitte versuche es erneut.' });
      return false;
    }
    setSnapshot(res.data);
    void saveCachedSnapshot(wallet, res.data);
    void queryClient.invalidateQueries({ queryKey: ['feed', 'posts'] });
    return true;
  }, [account, wallet, queryClient, showSnackbar]);

  const value = useMemo<Ctx>(() => {
    const index = buildHiddenIndex(snapshot);
    const followingSet = new Set(snapshot.following);
    return {
      ready, snapshot, index, hiddenIds: hiddenAccountIds(snapshot),
      isFollowing: (id) => followingSet.has(id),
      isMuted: (id) => index.mutedIds.has(id),
      follow: (ids, source) => run({ kind: 'follow', ids }, 'follow', { targets: ids, source }),
      unfollow: (ids) => run({ kind: 'unfollow', ids }, 'unfollow', { targets: ids }),
      mute: (id, w) => run({ kind: 'mute', id, wallet: w }, 'mute', { target: id }),
      unmute: (id, w) => run({ kind: 'unmute', id, wallet: w }, 'unmute', { target: id }),
    };
  }, [snapshot, ready, run]);

  return <RelationsContext.Provider value={value}>{children}</RelationsContext.Provider>;
}

export function useRelations(): Ctx {
  const ctx = useContext(RelationsContext);
  if (!ctx) throw new Error('useRelations must be used inside RelationsProvider');
  return ctx;
}
```

In `app/_layout.tsx`, import it and mount `<RelationsProvider>` directly inside `<SnackbarProvider>`, wrapping its existing children. It needs `useSnackbar`, and `SnackbarProvider` sits below `AccountProvider`.

- [ ] **Step 6: Run the tests, expect PASS**

Run: `cd apps/expo && npx jest lib/__tests__/account-relations.test.ts lib/__tests__/relations-state.test.ts --watchAll=false`

- [ ] **Step 7: Commit**

```bash
git add apps/expo/lib/account-relations.ts apps/expo/lib/supabase-follows.ts apps/expo/context/RelationsContext.tsx apps/expo/app/_layout.tsx apps/expo/lib/__tests__/account-relations.test.ts
git commit -m "feat(expo): relations client, snapshot cache and RelationsContext"
```

---

### Task 7: Feed filtering (server param + client filter + quoted posts)

**Files:**
- Modify: `apps/expo/lib/supabase-posts.ts:110-190` (`fetchFeedPosts`)
- Modify: `apps/expo/hooks/useFeed.ts:51-118`
- Modify: the quoted-post renderer. Find it with `grep -rn "quoted_post" apps/expo/components/feed --include=*.tsx -l`.
- Create: `apps/expo/lib/feed-visibility.ts`
- Test: `apps/expo/lib/__tests__/feed-visibility.test.ts`

**Interfaces:**
- Consumes: `useRelations()` (Task 6), the `isAuthorHiddenInFeed` / `isAuthorMuted` index (Task 2).
- Produces:
  - `fetchFeedPosts({ …, excludeAccountIds?: string[] })`;
  - `filterVisiblePosts<T extends PostLike>(posts: T[], index: HiddenIndex): T[]`;
  - `isQuoteHidden(post: PostLike, index: HiddenIndex): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
import { filterVisiblePosts, isQuoteHidden } from '../feed-visibility';
import { EMPTY_SNAPSHOT, buildHiddenIndex } from '../relations-state';

const index = buildHiddenIndex({ ...EMPTY_SNAPSHOT, muted: ['m'], mutedWallets: ['0xmm'], unfollowed: ['u'] });

describe('feed-visibility', () => {
  it('drops posts by hidden accounts, including legacy rows', () => {
    const posts = [
      { id: '1', account_id: 'm', wallet_address: '0xmm' },
      { id: '2', account_id: null, wallet_address: '0xMM' },
      { id: '3', account_id: 'u', wallet_address: '0xuu' },
      { id: '4', account_id: 'ok', wallet_address: '0xok' },
    ];
    expect(filterVisiblePosts(posts, index).map((p) => p.id)).toEqual(['4']);
  });
  it('hides a quote only when its author is MUTED', () => {
    expect(isQuoteHidden({ id: 'r', quoted_post: { id: 'q', account_id: 'm', wallet_address: '0xmm' } }, index)).toBe(true);
    expect(isQuoteHidden({ id: 'r', quoted_post: { id: 'q', account_id: 'u', wallet_address: '0xuu' } }, index)).toBe(false);
    expect(isQuoteHidden({ id: 'r', quoted_post: null }, index)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `lib/feed-visibility.ts`**

```ts
import { isAuthorHiddenInFeed, isAuthorMuted, type HiddenIndex } from './relations-state';

type Authored = { account_id?: string | null; wallet_address?: string | null };
export type PostLike = Authored & { id: string; quoted_post?: (Authored & { id: string }) | null };

/** Client-side twin of get_feed_page's exclusion: applies a mute instantly, before the refetch lands. */
export function filterVisiblePosts<T extends PostLike>(posts: T[], index: HiddenIndex): T[] {
  return posts.filter((p) => !isAuthorHiddenInFeed(index, p));
}

/** A repost of someone you muted shows "Beitrag ausgeblendet" instead of their content. */
export function isQuoteHidden(post: PostLike, index: HiddenIndex): boolean {
  return !!post.quoted_post && isAuthorMuted(index, post.quoted_post);
}
```

- [ ] **Step 4: Wire `fetchFeedPosts`**

1. Add `excludeAccountIds?: string[]` to the options.
2. In the RPC call, add `p_exclude_account_ids: options.excludeAccountIds?.length ? options.excludeAccountIds : null`.
3. In the legacy branch, filter the rows before returning: `rows = rows.filter((r) => !options.excludeAccountIds?.includes(r.account_id ?? ''))`. Legacy null-`account_id` rows are left to the client filter in `useFeed`.

- [ ] **Step 5: Wire `useFeed`**

```ts
  const { hiddenIds, index, ready: relationsReady } = useRelations();
  const postsKey = ['feed', 'posts', feedType, hiddenIds.join(',')] as const;
  // in useInfiniteQuery: enabled: enabled && relationsReady,
  //   queryFn: … fetchFeedPosts({ feedType, page, walletAddress, excludeAccountIds: hiddenIds })
  // in the posts useMemo: return filterVisiblePosts(<existing deduped array>, index);  and add `index` to deps
```

Any other code that builds the key `['feed','posts',feedType]` directly must use the same prefix. Find it with `grep -rn "'feed', 'posts'" apps/expo`. Optimistic like/repost updates call `setQueryData` on that key, so switch them to `setQueriesData({ queryKey: ['feed','posts',feedType] }, …)`, which matches by prefix.

- [ ] **Step 6: Quoted post renderer**

1. In the component that renders `post.quoted_post`, call `useRelations()`.
2. If `isQuoteHidden(post, index)`, render instead of the quote body:

```tsx
<View style={[styles.quoteHidden, { borderColor: colors.border }]}>
  <Text style={{ color: colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 14 }}>Beitrag ausgeblendet</Text>
</View>
```

3. Add the style `quoteHidden: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12 }`, or reuse the existing quote container style if one exists.

- [ ] **Step 7: Run the tests**

Run: `cd apps/expo && npx jest lib/__tests__/feed-visibility.test.ts --watchAll=false`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/expo/lib/feed-visibility.ts apps/expo/lib/__tests__/feed-visibility.test.ts apps/expo/lib/supabase-posts.ts apps/expo/hooks/useFeed.ts <quoted-post component path>
git commit -m "feat(expo): Für Alle feed hides unfollowed and muted accounts"
```

---

### Task 8: Post options, comments, inbox

**Files:**
- Modify: `apps/expo/components/feed/PostOptionsDrawer.tsx`
- Modify: `apps/expo/components/feed/FeedHome.tsx:687-698` and `apps/expo/app/post/[id].tsx` (both render `PostOptionsDrawer`)
- Modify: `apps/expo/app/post/[id].tsx` (comment list) and `apps/expo/components/feed/CommentThread.tsx` (replies)
- Modify: `apps/expo/app/notifications/index.tsx` (filter + `new_follower` tap)
- Create: `apps/expo/lib/inbox-visibility.ts`
- Test: `apps/expo/lib/__tests__/inbox-visibility.test.ts`

**Interfaces:**
- Consumes: `useRelations()`; `isAuthorMuted`.
- Produces:
  - `PostOptionsDrawer` gets new optional props: `author?: { accountId: string | null; wallet: string | null; name: string } | null`, `isFollowing?: boolean`, `onToggleFollow?: () => void`, `onMute?: () => void`.
  - `filterMutedNotifications<T extends { metadata?: unknown }>(items: T[], index: HiddenIndex): T[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { filterMutedNotifications, filterMutedComments } from '../inbox-visibility';
import { EMPTY_SNAPSHOT, buildHiddenIndex } from '../relations-state';

const index = buildHiddenIndex({ ...EMPTY_SNAPSHOT, muted: ['m'], mutedWallets: ['0xmm'] });

describe('inbox-visibility', () => {
  it('drops notices whose actor is muted, keeps the rest', () => {
    const items = [
      { id: 1, metadata: { actor_wallet: '0xMM' } },
      { id: 2, metadata: { actor_wallet: '0xok' } },
      { id: 3, metadata: null },
    ];
    expect(filterMutedNotifications(items, index).map((i) => i.id)).toEqual([2, 3]);
  });
  it('drops comments and replies by muted authors', () => {
    const comments = [
      { id: 'a', account_id: 'm', wallet_address: '0xmm', replies: [] },
      { id: 'b', account_id: null, wallet_address: '0xok', replies: [{ id: 'c', account_id: null, wallet_address: '0xmm' }] },
    ];
    const out = filterMutedComments(comments, index);
    expect(out.map((c) => c.id)).toEqual(['b']);
    expect(out[0].replies).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `lib/inbox-visibility.ts`**

```ts
import { isAuthorMuted, type HiddenIndex } from './relations-state';

export function filterMutedNotifications<T extends { metadata?: unknown }>(items: T[], index: HiddenIndex): T[] {
  return items.filter((n) => {
    const actor = (n.metadata as { actor_wallet?: string } | null | undefined)?.actor_wallet;
    return !actor || !isAuthorMuted(index, { wallet_address: actor });
  });
}

type CommentLike = { account_id?: string | null; wallet_address?: string | null; replies?: CommentLike[] };

export function filterMutedComments<T extends CommentLike>(comments: T[], index: HiddenIndex): T[] {
  return comments
    .filter((c) => !isAuthorMuted(index, c))
    .map((c) => (c.replies ? { ...c, replies: c.replies.filter((r) => !isAuthorMuted(index, r)) } : c));
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Drawer rows**

1. In `PostOptionsDrawer`, in the non-owner branch, render these *above* "Melden", only when `author?.accountId` is set. Wrap the branch in a fragment.

```tsx
{author?.accountId && (
  <>
    <Pressable
      onPress={() => { onClose(); onToggleFollow?.(); }}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border }, pressed && { backgroundColor: colors.pressedOverlay }]}
    >
      <Ionicons name={isFollowing ? 'person-remove-outline' : 'person-add-outline'} size={20} color={colors.textPrimary} />
      <Text style={[styles.rowText, { color: colors.textPrimary }]}>
        {isFollowing ? `${author.name} entfolgen` : `${author.name} folgen`}
      </Text>
    </Pressable>
    <Pressable
      onPress={() => { onClose(); onMute?.(); }}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border }, pressed && { backgroundColor: colors.pressedOverlay }]}
    >
      <Ionicons name="volume-mute-outline" size={20} color={colors.textPrimary} />
      <Text style={[styles.rowText, { color: colors.textPrimary }]}>{`${author.name} stummschalten`}</Text>
    </Pressable>
  </>
)}
```

2. In `FeedHome.tsx`, use `const { isFollowing, follow, unfollow, mute } = useRelations();` and `const { user } = useUser();`, and pass to the drawer:

```tsx
author={user && selectedPost ? {
  accountId: selectedPost.account_id ?? (selectedPost.author as any)?.account?.id ?? null,
  wallet: selectedPost.wallet_address ?? null,
  name: (selectedPost.author as any)?.account?.name ?? selectedPost.author?.username ?? 'Konto',
} : null}
isFollowing={!!selectedPost?.account_id && isFollowing(selectedPost.account_id)}
onToggleFollow={() => {
  const id = selectedPost?.account_id; if (!id) return;
  void (isFollowing(id) ? unfollow([id]) : follow([id], 'manual'));
}}
onMute={() => {
  const id = selectedPost?.account_id; if (!id) return;
  void mute(id, selectedPost?.account_id && (selectedPost.author as any)?.account?.account_type === 'personal' ? selectedPost.wallet_address : null)
    .then((ok) => ok && showSnackbar({ message: 'Stummgeschaltet. Aufheben unter Einstellungen → Folgen & Stummschalten.' }));
}}
```

`user` being null for guests hides both rows (Review Focus 5). Before writing this, check the real `PostRecord` shape in `lib/types/feed.ts` and use its `account` / `author` fields instead of `as any` where they exist. For legacy posts with `account_id` null, resolve with `fetchPersonalAccountId(selectedPost.wallet_address)` before calling `mute` / `follow`.

3. Do the same in `app/post/[id].tsx`.

- [ ] **Step 6: Comments**

1. In `app/post/[id].tsx`, render `filterMutedComments(comments, index)` instead of `comments` in the list's `data`. Leave `comments` state untouched so counts stay correct.
2. In `CommentThread.tsx`, filter `comment.replies` the same way: `const replies = filterMutedComments(comment.replies ?? [], index);` using `useRelations().index`.

- [ ] **Step 7: Inbox**

In `app/notifications/index.tsx`:
1. Wrap the `userItems` source with `filterMutedNotifications(userNotifs.notifications, index)`.
2. In `handleUserNotifPress`, before the post/thread routing, add:

```ts
    if (notification.type === 'new_follower') {
      const w = (notification.metadata as { follower_wallet?: string } | undefined)?.follower_wallet;
      const profile = w ? actorProfiles.get(w.toLowerCase()) : undefined;
      if (profile?.username) router.push(`/user/${profile.username}` as any);
      return;
    }
```

`metadata.actor_wallet` is set (Task 4), so the existing actor avatar/name resolution already renders these rows. Check that `ActorProfile` carries `username`; add it to `fetchActorProfiles`' select if it doesn't.

- [ ] **Step 8: Commit**

```bash
git add apps/expo/lib/inbox-visibility.ts apps/expo/lib/__tests__/inbox-visibility.test.ts apps/expo/components/feed/PostOptionsDrawer.tsx apps/expo/components/feed/FeedHome.tsx apps/expo/app/post/[id].tsx apps/expo/components/feed/CommentThread.tsx apps/expo/app/notifications/index.tsx apps/expo/lib/supabase-member-notifications.ts
git commit -m "feat(expo): follow/mute from posts, mute filters comments and inbox"
```

---

### Task 9: Profile buttons and follower counts

**Files:**
- Create: `apps/expo/components/follow/FollowButton.tsx`
- Modify: `apps/expo/app/account/[id]/index.tsx` (org: `heroActions` ~:392, plus a stats line)
- Modify: `apps/expo/app/user/[username].tsx` (person profile header)
- Modify: `apps/expo/app/profile.tsx` (own counts)

**Interfaces:**
- Consumes: `useRelations()`, `fetchFollowStats`, `fetchPersonalAccountId`.
- Produces: `<FollowButton accountId={string} muteWallet={string | null} />`. It renders nothing for guests or for the viewer's own account.

- [ ] **Step 1: Implement `FollowButton.tsx`**

```tsx
import React from 'react';
import { Pressable, Text, StyleSheet, ActionSheetIOS, Platform, Alert } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useRelations } from '@/context/RelationsContext';

type Props = { accountId: string; muteWallet: string | null; ownAccountIds?: string[] };

/** Folgen / Entfolgt pill; long-press offers Stummschalten (silent, like X). */
export default function FollowButton({ accountId, muteWallet, ownAccountIds = [] }: Props) {
  const { colors } = useTheme();
  const { user } = useUser();
  const { isFollowing, isMuted, follow, unfollow, mute, unmute } = useRelations();
  if (!user || ownAccountIds.includes(accountId)) return null;
  const following = isFollowing(accountId);
  const muted = isMuted(accountId);

  const openMore = () => {
    const label = muted ? 'Stummschaltung aufheben' : 'Stummschalten';
    const act = () => void (muted ? unmute(accountId, muteWallet) : mute(accountId, muteWallet));
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [label, 'Abbrechen'], cancelButtonIndex: 1 }, (i) => i === 0 && act());
    } else {
      Alert.alert('', undefined, [{ text: label, onPress: act }, { text: 'Abbrechen', style: 'cancel' }]);
    }
  };

  return (
    <Pressable
      onPress={() => void (following ? unfollow([accountId]) : follow([accountId], 'manual'))}
      onLongPress={openMore}
      accessibilityRole="button"
      accessibilityLabel={following ? 'Entfolgen' : 'Folgen'}
      style={[
        styles.pill,
        following
          ? { backgroundColor: 'transparent', borderColor: colors.border }
          : { backgroundColor: colors.primary, borderColor: colors.primary },
      ]}
    >
      <Text style={[styles.label, { color: following ? colors.textPrimary : colors.onPrimary ?? '#FFFFFF' }]}>
        {muted ? 'Stummgeschaltet' : following ? 'Folgst du' : 'Folgen'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, alignSelf: 'flex-start' },
  label: { fontSize: 14, fontFamily: 'Inter-SemiBold' },
});
```

Check the `ThemeContext` color names (`grep -n "primary\|onPrimary" apps/expo/constants/theme.ts`) and use the real token for text on primary.

- [ ] **Step 2: Org profile**

In `app/account/[id]/index.tsx`:
1. Load stats with `const [stats, setStats] = useState({ followers: 0, following: 0 });` and `useEffect(() => { if (account?.id) fetchFollowStats(account.id).then(setStats); }, [account?.id]);`.
2. Render `<FollowButton accountId={account.id} muteWallet={null} ownAccountIds={canEdit ? [account.id] : []} />`, plus `<Text>{stats.followers} Follower</Text>` styled like the existing meta line, directly below the org name in the sheet content.
3. Add a `heroActions` entry for stummschalten only when the viewer isn't the owner:

```tsx
...(!canEdit && user ? [{
  key: 'mute',
  icon: <Ionicons name={isMuted(account.id) ? 'volume-high-outline' : 'volume-mute-outline'} size={22} color={colors.textPrimary} />,
  onPress: () => void (isMuted(account.id) ? unmute(account.id) : mute(account.id)),
  accessibilityLabel: isMuted(account.id) ? 'Stummschaltung aufheben' : 'Stummschalten',
}] : []),
```

- [ ] **Step 3: Person profile**

In `app/user/[username].tsx`:
1. After `profile` loads, resolve `const [personalId, setPersonalId] = useState<string | null>(null);` via `fetchPersonalAccountId(profile.wallet_address)`.
2. Load `fetchFollowStats(personalId)`.
3. Render `{stats.followers} Follower · folgt {stats.following}` and `<FollowButton accountId={personalId} muteWallet={profile.wallet_address} />` when `personalId && !isOwner`.

- [ ] **Step 4: Own profile**

In `app/profile.tsx`, show `{followers} Follower · folgt {following}` for the active personal account, with the same fetch.

- [ ] **Step 5: Type-check the touched files**

Run: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p . 2>&1 | grep -E "follow/|account/\[id\]|user/\[username\]|profile.tsx|RelationsContext|relations|feed-visibility|inbox-visibility"`

Expected: no lines. Judge only these files; the repo baseline has ~1235 unrelated errors.

- [ ] **Step 6: Commit**

```bash
git add apps/expo/components/follow/FollowButton.tsx apps/expo/app/account/[id]/index.tsx apps/expo/app/user/[username].tsx apps/expo/app/profile.tsx
git commit -m "feat(expo): Folgen button, follower counts and mute on profiles"
```

---

### Task 10: Follow list, onboarding step, intro sheet

**Files:**
- Create: `apps/expo/components/follow/FollowList.tsx`
- Create: `apps/expo/lib/follow-selection.ts`
- Test: `apps/expo/lib/__tests__/follow-selection.test.ts`
- Create: `apps/expo/app/welcome/follow.tsx`
- Modify: `apps/expo/app/welcome/_layout.tsx` (STEP_SCREENS + Screen)
- Modify: `apps/expo/context/welcome-wizard-state.ts` (selection state)
- Modify: `apps/expo/app/welcome/role.tsx:104`, `citizen-data.tsx:46,51` (route to `follow`), StoryProgress totals in `name.tsx:83`, `role.tsx:62`, `citizen-data.tsx:64`, `consent.tsx` (+1 step)
- Modify: `apps/expo/app/welcome/consent.tsx` (submit follows after onboarding persists)
- Create: `apps/expo/components/follow/FollowIntroSheet.tsx`
- Modify: `apps/expo/components/feed/FeedHome.tsx` (mount the intro sheet)

**Interfaces:**
- Consumes: `fetchFollowSuggestions`, `useRelations().follow/unfollow`.
- Produces:
  - `splitSelection(all: string[], unticked: Set<string>) → { follow: string[]; unfollow: string[] }`;
  - wizard state `followUnticked: string[]`, action `SET_FOLLOW_UNTICKED`;
  - `<FollowList suggestions unticked onToggle onAll onNone />`.

- [ ] **Step 1: Write the failing test**

```ts
import { splitSelection, filterSuggestions } from '../follow-selection';

describe('follow-selection', () => {
  it('everything ticked by default; unticked become explicit unfollows', () => {
    expect(splitSelection(['a', 'b', 'c'], new Set(['b']))).toEqual({ follow: ['a', 'c'], unfollow: ['b'] });
  });
  it('an empty town still produces a valid, empty submission', () => {
    expect(splitSelection([], new Set())).toEqual({ follow: [], unfollow: [] });
  });
  it('search matches name case- and accent-insensitively', () => {
    const s = [{ account_id: '1', name: 'Fischerei Müritz' }, { account_id: '2', name: 'Angelverein' }];
    expect(filterSuggestions(s as any, 'muritz').map((x) => x.account_id)).toEqual(['1']);
    expect(filterSuggestions(s as any, '').length).toBe(2);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `lib/follow-selection.ts`**

```ts
import type { FollowSuggestion } from './supabase-follows';

export function splitSelection(all: string[], unticked: Set<string>): { follow: string[]; unfollow: string[] } {
  return { follow: all.filter((id) => !unticked.has(id)), unfollow: all.filter((id) => unticked.has(id)) };
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterSuggestions(list: FollowSuggestion[], query: string): FollowSuggestion[] {
  const q = fold(query.trim());
  return q ? list.filter((s) => fold(s.name).includes(q)) : list;
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: `FollowList.tsx`**

It is a `FlatList` with:
- a search `TextInput` header;
- an "Allen folgen" / "Keinem folgen" text-button row;
- per row: avatar (`expo-image`, 40px circle, initials fallback), name, a secondary line (`sub_type` mapped `verein→Verein`, `restaurant→Gastronomie`, `unternehmen→Unternehmen`, `personal→Person`, plus `· {followers} Follower`), and a checkbox (`Ionicons` `checkmark-circle` filled `colors.primary` when ticked, `ellipse-outline` `colors.border` when unticked).

```tsx
type Props = {
  suggestions: FollowSuggestion[];
  unticked: Set<string>;
  onToggle: (id: string) => void;
  onAll: () => void;
  onNone: () => void;
  header?: React.ReactElement;
};
```

- Use `filterSuggestions` with a local `query` state.
- `keyExtractor={(s) => s.account_id}`, `initialNumToRender={20}`, `windowSize={7}`.
- Styling is `StyleSheet.create` + `useTheme()` colors only.

- [ ] **Step 6: Wizard state**

In `welcome-wizard-state.ts`:
- add `followUnticked: string[]` (initial `[]`);
- add the action `{ type: 'SET_FOLLOW_UNTICKED'; payload: string[] }` with the reducer case `return { ...state, followUnticked: action.payload };`.

- [ ] **Step 7: `app/welcome/follow.tsx`**

Copy the screen scaffold (SafeAreaView, `StoryProgress`, bottom nav button component) from `app/welcome/role.tsx`. Content:

```tsx
const [suggestions, setSuggestions] = useState<FollowSuggestion[] | null>(null);
useEffect(() => { fetchFollowSuggestions().then(setSuggestions); }, []);
const unticked = useMemo(() => new Set(state.followUnticked), [state.followUnticked]);
const setUnticked = (s: Set<string>) => dispatch({ type: 'SET_FOLLOW_UNTICKED', payload: [...s] });
// Title: "Wem möchtest du folgen?"
// Subline: "Du siehst trotzdem alle Beiträge – außer von Konten, denen du nicht folgst. Du kannst das jederzeit ändern."
// suggestions === null → ActivityIndicator; [] → Text "Noch keine Konten in Röbel." and Weiter stays enabled.
// Weiter → router.push('/welcome/consent')
```

`StoryProgress`: Bürger 4 of 5, others 3 of 4.

- [ ] **Step 8: Routing + step counts**

- `_layout.tsx`: `STEP_SCREENS = ['name','role','citizen-data','follow','consent']`, plus `<TransitionStack.Screen name="follow" />` before consent.
- `role.tsx:104`: route to `'/welcome/citizen-data'` for Bürger, else `'/welcome/follow'`.
- `citizen-data.tsx:46,51`: route to `'/welcome/follow'`.
- Totals: Bürger `5`, others `4`.
  - `name.tsx:83`: step 1.
  - `role.tsx:62`: step 2.
  - `citizen-data.tsx:64`: `step={3} totalSteps={5}`.
  - `follow.tsx`: Bürger 4, others 3.
  - `consent.tsx`: Bürger 5, others 4.

- [ ] **Step 9: Submit in `consent.tsx`**

Directly after `await refreshUser();` in `handleAccept`, before the Bürger block:

```ts
      // Default follows: never blocks onboarding — a failure only means the feed shows everyone, as today.
      try {
        const all = (await fetchFollowSuggestions()).map((s) => s.account_id);
        const { follow: toFollow, unfollow: toUnfollow } = splitSelection(all, new Set(state.followUnticked));
        if (toFollow.length) await follow(toFollow, 'onboarding');
        if (toUnfollow.length) await unfollow(toUnfollow);
      } catch (err) {
        console.error('onboarding follows failed (non-fatal):', err);
      }
```

`follow` and `unfollow` come from `useRelations()`. Mark the intro as seen too, so existing-user logic never re-prompts: `await AsyncStorage.setItem('@roebel/follow-intro-seen', '1')`.

Deferred passkey accounts: add `follow` to the profile-completion step list. Find it with `grep -n "citizen-data\|'role'" apps/expo/lib/profile-completion.ts`. In single mode, `follow.tsx` submits directly with the same `try` block, then `router.back()`.

- [ ] **Step 10: `FollowIntroSheet.tsx` + mount**

- Use `BottomDrawer`. Its title is "Neu: Folgen & Stummschalten".
- Body: "Wähle, wessen Beiträge du sehen möchtest. Stummgeschaltete Konten siehst du nirgends mehr – sie erfahren davon nichts."
- It contains a `FollowList` at 70% height and a primary button "Speichern" that submits with source `'intro'`, using the same `splitSelection` + `follow` / `unfollow` calls.
- It shows when all of these hold:
  - `user?.onboarding_completed_at`;
  - `relations.ready`;
  - `snapshot.following.length === 0 && snapshot.unfollowed.length === 0`;
  - AsyncStorage `@roebel/follow-intro-seen` is unset.
- Close or save sets the flag. Wrap AsyncStorage reads in try/catch.
- Mount it in `FeedHome.tsx` next to the other drawers.

- [ ] **Step 11: Run tests + type-check touched files**

```bash
cd apps/expo && npx jest lib/__tests__/follow-selection.test.ts --watchAll=false
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p . 2>&1 | grep -E "welcome/|follow/|follow-selection"
```

Expected: tests PASS; the grep prints nothing.

- [ ] **Step 12: Commit**

```bash
git add apps/expo/lib/follow-selection.ts apps/expo/lib/__tests__/follow-selection.test.ts apps/expo/components/follow apps/expo/app/welcome apps/expo/context/welcome-wizard-state.ts apps/expo/lib/profile-completion.ts apps/expo/components/feed/FeedHome.tsx
git commit -m "feat(expo): default follows in onboarding and one-time intro sheet"
```

---

### Task 11: Settings screen and notification toggle

**Files:**
- Create: `apps/expo/app/settings/follows.tsx`
- Modify: `apps/expo/app/settings.tsx` (row in the DATENSCHUTZ section, or a new "FOLGEN" section)
- Modify: `apps/expo/app/notifications/settings.tsx` (digest switch)
- Modify: `apps/expo/lib/supabase-notifications.ts` (pref type + update)
- Modify: `apps/expo/lib/supabase-accounts.ts` (`setSuggestToNewUsers`)
- Modify: `apps/expo/supabase/functions/org-membership/index.ts` (`UPDATE_WHITELIST` += `suggest_to_new_users`)

**Interfaces:**
- Consumes: `useRelations()`, `FollowList`, `callOrgMembership('update_account', …)`.
- Produces: route `/settings/follows`.

- [ ] **Step 1: `app/settings/follows.tsx`**

It has two segments ("Folge ich" / "Stummgeschaltet") and a toggle row.

- **Folge ich:** a `FollowList` from `fetchFollowSuggestions()`. `unticked` = ids not in `snapshot.following`. A toggle calls `follow([id], 'manual')` or `unfollow([id])` immediately.
- **Stummgeschaltet:** a list of `snapshot.muted`. Resolve names with `supabase.from('accounts').select('id,name,avatar_url').in('id', snapshot.muted)`. Each row has an "Aufheben" text button → `unmute(id, wallet)`, where `wallet` comes from `snapshot.mutedWallets` when the account is personal. Empty state: "Du hast niemanden stummgeschaltet."
- **Toggle row** "Neuen Nutzer:innen vorschlagen" with the hint "Dein Profil erscheint in der Liste, die neue Röbeler:innen beim Start sehen." It reads `accounts.suggest_to_new_users` for the active personal account. Writes go through `org-membership` `update_account` `{ accountId, suggest_to_new_users: boolean }`, since `accounts` writes are locked to that function.

- [ ] **Step 2: Whitelist the field server-side**

In `org-membership/index.ts`:
1. Add `'suggest_to_new_users'` to `UPDATE_WHITELIST`.
2. In the update handler's per-field validation, require `typeof value === 'boolean'` for it. Follow the existing pattern there; read the handler with `grep -n "UPDATE_WHITELIST" -A30`.
3. Redeploy `org-membership` with MCP `deploy_edge_function`.

- [ ] **Step 3: Digest switch**

1. In `lib/supabase-notifications.ts`, add `follower_digest_enabled?: boolean` to the preference type.
2. In `app/notifications/settings.tsx`, add a switch next to `org_invites_enabled`, with the same component and handler pattern. Label "Wöchentliche Follower-Übersicht (Organisationen)", default on.

- [ ] **Step 4: Settings entry**

In `app/settings.tsx`, add a row "Folgen & Stummschalten" → `router.push('/settings/follows')`, using the existing row component.

- [ ] **Step 5: Type-check touched files**

Run: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p . 2>&1 | grep -E "settings/follows|settings.tsx|notifications/settings|supabase-notifications|supabase-accounts"`

Expected: nothing.

- [ ] **Step 6: Commit**

```bash
git add apps/expo/app/settings/follows.tsx apps/expo/app/settings.tsx apps/expo/app/notifications/settings.tsx apps/expo/lib/supabase-notifications.ts apps/expo/lib/supabase-accounts.ts apps/expo/supabase/functions/org-membership/index.ts
git commit -m "feat(expo): Folgen & Stummschalten settings and follower digest toggle"
```

---

### Task 12: Full verification and handoff

- [ ] **Step 1: Full Jest run of the new suites**

```bash
cd apps/expo && npx jest lib/__tests__/relations-state.test.ts lib/__tests__/account-relations-core.test.ts lib/__tests__/account-relations.test.ts lib/__tests__/feed-visibility.test.ts lib/__tests__/inbox-visibility.test.ts lib/__tests__/follow-selection.test.ts lib/__tests__/onboarding-deferral.test.ts lib/__tests__/profile-completion.test.ts --watchAll=false
```

Expected: all PASS.

- [ ] **Step 2: SQL suite once more**

Run `supabase/tests/follow_graph_test.sql` via MCP. Expected: no assertion errors.

- [ ] **Step 3: Device pass (Android emulator, local dev build)**

1. Fresh account → onboarding shows the follow step. Untick 2 accounts → feed hides their posts.
2. A followed org owner sees "Neu in Röbel: … folgt dir" in the inbox. There is no push.
3. Mute a person from a post: their posts, comments and inbox entries vanish. A repost of them shows "Beitrag ausgeblendet".
4. Existing account → the intro sheet appears once and doesn't return after closing.
5. Settings → Stummgeschaltet → Aufheben brings the posts back after pull-to-refresh.
6. Logged out: the feed loads and shows no Folgen rows.

- [ ] **Step 4: Push and hand over**

1. `git push`.
2. Report to Max:
   - the commits;
   - that migrations and edge functions are live;
   - that the client needs his EAS update; runtime is unchanged (no native deps).
   - Ask him to remember the first Monday digest (08:00 UTC).

---

## Self-review notes (kept for the executor)

- **Spec §8 deviation:** the digest is a SQL function + `pg_cron` instead of a new `follower-digest` edge function. It is the same behaviour with one less deploy, and it uses the vault secrets the existing triggers already use.
- **Spec §5 extension:** `post_new` broadcast pushes also skip viewers who unfollowed or muted the author. Otherwise the lock screen would show posts the feed hides.
- **Spec §3:** `accounts` has no deleted flag, so suggestions exclude empty-name accounts and personal accounts without owners instead.
