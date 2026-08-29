# Umfragen-Forum Slice A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Citizens create discussion threads (Themen) with optional curated categories on the Umfragen page; threads and replies dual-write to the civic Nostr relay as kind-11/1111 events.

**Architecture:** Same dual-write pattern as posts: Supabase row first (source of truth for the app), best-effort Nostr publish through the `nostr_publications` ledger. New `forum_*` tables feed the existing rathaus feed assembler; new `/forum/*` expo-router screens reuse the app's presentational idioms. Event grammar: kind 32107 category definitions (builder only in this slice), kind 11 threads (NIP-7D, `title` tag + optional `t` category tag), kind 1111 replies (NIP-22 `E/K/P` + `e/k/p`).

**Tech Stack:** Expo SDK 56 / RN 0.85, expo-router, TanStack Query, Supabase JS, `@netizen-labs/nostr` (@noble crypto, no NDK/nostr-tools), jest-expo, node:test + tsx (packages/nostr).

**Spec:** `docs/superpowers/specs/2026-08-29-umfragen-forum-design.md`

## Global Constraints

- Branch: `feat/umfragen-forum` off `feat/sdk56-upgrade` (NOT main — main is still SDK 55). Create the worktree/branch via superpowers:using-git-worktrees at execution start.
- Parallel sessions are active in this repo: EVERY commit uses explicit pathspecs (`git add <files>` / `git commit -- <files>`), never `git add .`. Push after every commit (first push: `git push -u origin feat/umfragen-forum`).
- Identifiers/comments in English; ALL user-facing text in German. Wording is "Diskussion"/"Thema"/"Antwort"/"Kategorie"; NEVER "Abstimmung" for anything advisory.
- Expo styling: `StyleSheet.create()` + `useTheme()` from `@/context/ThemeContext`; fonts via `fontFamily` tokens from `@/constants/theme`. NO NativeWind.
- Never render a raw `0x…` wallet or a raw npub; author display = `author.account?.name ?? author.username ?? 'Unbekannt'`.
- Do NOT run a full-repo `tsc` (≈431 pre-existing errors). Verify by targeted tests + simulator.
- Supabase operations go through the Supabase MCP tools only (no CLI). Before ANY write: call `mcp__supabase__get_project_url` and confirm the ref is `wwbeqhkslxdxhktqzqti`.
- Nostr kinds: category = 32107, thread = 11, reply = 1111. Relay URL: reuse `ROEBEL_RELAY_URL` in `apps/expo/lib/nostr/publish.ts` — do not add a second constant.
- Nostr publishing is best-effort: never awaited in a UI path, never fails a user action.
- Do NOT touch `packages/publisher`, `packages/protocol`, or the manifest (slice B — two-repo divergence hazard).

---

### Task 1: Forum event builders in packages/nostr

**Files:**
- Create: `packages/nostr/src/forum.ts`
- Create: `packages/nostr/test/forum.test.ts`
- Modify: `packages/nostr/src/index.ts` (add export block)

**Interfaces:**
- Consumes: `buildEvent`, `signEvent` internals from `./events`; `getPublicKeyHex` from `./keys`.
- Produces (used by Task 4):
  - `KIND_FORUM_CATEGORY = 32107`, `KIND_FORUM_THREAD = 11`, `KIND_FORUM_REPLY = 1111`
  - `forumCategoryAddress(pubkeyHex: string, slug: string): string`
  - `buildForumCategoryEvent(secretKey: Uint8Array, input: { slug: string; name: string; about?: string }, options?: { createdAt?: number }): NostrEvent`
  - `buildForumThreadEvent(secretKey: Uint8Array, input: { title: string; content: string; categorySlug?: string }, options?: { createdAt?: number }): NostrEvent`
  - `buildForumReplyEvent(secretKey: Uint8Array, content: string, root: { id: string; pubkey: string }, parent?: { id: string; pubkey: string; kind: number }, options?: { createdAt?: number }): NostrEvent`

- [ ] **Step 1: Write the failing tests**

Create `packages/nostr/test/forum.test.ts` (style mirrors `test/events.test.ts` — node:test + strict assert):

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyEvent } from "../src/events";
import {
  KIND_FORUM_CATEGORY,
  KIND_FORUM_REPLY,
  KIND_FORUM_THREAD,
  buildForumCategoryEvent,
  buildForumReplyEvent,
  buildForumThreadEvent,
  forumCategoryAddress,
} from "../src/forum";
import { deriveNostrSecretKey, getPublicKeyHex } from "../src/keys";

const SIGNATURE =
  "0x" +
  "9c1f2b3a4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8" +
  "1b2c3d4e5f60718293a4b5c6d7e8f9001a2b3c4d5e6f708192a3b4c5d6e7f809" +
  "1b";
const SECRET_KEY = deriveNostrSecretKey(SIGNATURE);
const PUBKEY = getPublicKeyHex(SECRET_KEY);
const CREATED_AT = 1_756_400_000;
const ROOT_ID = "a".repeat(64);
const PARENT_ID = "b".repeat(64);

describe("forum category (kind 32107)", () => {
  it("builds an addressable category definition", () => {
    const event = buildForumCategoryEvent(
      SECRET_KEY,
      { slug: "verkehr", name: "Verkehr", about: "Straßen, Wege, ÖPNV" },
      { createdAt: CREATED_AT },
    );
    assert.equal(event.kind, KIND_FORUM_CATEGORY);
    assert.deepEqual(event.tags.find((t) => t[0] === "d"), ["d", "category:verkehr"]);
    assert.deepEqual(event.tags.find((t) => t[0] === "name"), ["name", "Verkehr"]);
    assert.deepEqual(event.tags.find((t) => t[0] === "about"), ["about", "Straßen, Wege, ÖPNV"]);
    assert.ok(verifyEvent(event));
  });

  it("rejects an invalid slug", () => {
    assert.throws(() => buildForumCategoryEvent(SECRET_KEY, { slug: "Verkehr!", name: "x" }));
    assert.throws(() => buildForumCategoryEvent(SECRET_KEY, { slug: "", name: "x" }));
  });

  it("derives the a-tag address", () => {
    assert.equal(
      forumCategoryAddress(PUBKEY, "verkehr"),
      `32107:${PUBKEY}:category:verkehr`,
    );
  });
});

describe("forum thread (kind 11)", () => {
  it("carries title tag and body content", () => {
    const event = buildForumThreadEvent(
      SECRET_KEY,
      { title: "Radweg zur Müritz", content: "Der Radweg endet abrupt …" },
      { createdAt: CREATED_AT },
    );
    assert.equal(event.kind, KIND_FORUM_THREAD);
    assert.deepEqual(event.tags.find((t) => t[0] === "title"), ["title", "Radweg zur Müritz"]);
    assert.equal(event.content, "Der Radweg endet abrupt …");
    assert.equal(event.tags.find((t) => t[0] === "t"), undefined);
    assert.ok(verifyEvent(event));
  });

  it("attaches the optional category as a t tag", () => {
    const event = buildForumThreadEvent(
      SECRET_KEY,
      { title: "Radweg", content: "…", categorySlug: "verkehr" },
      { createdAt: CREATED_AT },
    );
    assert.deepEqual(event.tags.find((t) => t[0] === "t"), ["t", "verkehr"]);
  });

  it("rejects an empty title and an invalid category slug", () => {
    assert.throws(() => buildForumThreadEvent(SECRET_KEY, { title: "  ", content: "x" }));
    assert.throws(() =>
      buildForumThreadEvent(SECRET_KEY, { title: "ok", content: "x", categorySlug: "Bad Slug" }),
    );
  });
});

describe("forum reply (kind 1111, NIP-22)", () => {
  it("scopes a top-level reply to the thread root with E/K/P and mirrors it lowercase", () => {
    const event = buildForumReplyEvent(
      SECRET_KEY,
      "Gute Idee!",
      { id: ROOT_ID, pubkey: PUBKEY },
      undefined,
      { createdAt: CREATED_AT },
    );
    assert.equal(event.kind, KIND_FORUM_REPLY);
    assert.deepEqual(event.tags.find((t) => t[0] === "E"), ["E", ROOT_ID, "", PUBKEY]);
    assert.deepEqual(event.tags.find((t) => t[0] === "K"), ["K", "11"]);
    assert.deepEqual(event.tags.find((t) => t[0] === "P"), ["P", PUBKEY]);
    // No explicit parent → the root IS the parent.
    assert.deepEqual(event.tags.find((t) => t[0] === "e"), ["e", ROOT_ID, "", PUBKEY]);
    assert.deepEqual(event.tags.find((t) => t[0] === "k"), ["k", "11"]);
    assert.deepEqual(event.tags.find((t) => t[0] === "p"), ["p", PUBKEY]);
    assert.ok(verifyEvent(event));
  });

  it("points the lowercase tags at a nested parent while keeping the root scope", () => {
    const event = buildForumReplyEvent(
      SECRET_KEY,
      "Antwort auf Antwort",
      { id: ROOT_ID, pubkey: PUBKEY },
      { id: PARENT_ID, pubkey: PUBKEY, kind: 1111 },
      { createdAt: CREATED_AT },
    );
    assert.deepEqual(event.tags.find((t) => t[0] === "E"), ["E", ROOT_ID, "", PUBKEY]);
    assert.deepEqual(event.tags.find((t) => t[0] === "e"), ["e", PARENT_ID, "", PUBKEY]);
    assert.deepEqual(event.tags.find((t) => t[0] === "k"), ["k", "1111"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/nostr && npx tsx --test test/forum.test.ts`
Expected: FAIL — `Cannot find module '../src/forum'`.

- [ ] **Step 3: Write the implementation**

Create `packages/nostr/src/forum.ts`:

```ts
import { buildEvent, type NostrEvent } from "./events";

/**
 * Umfragen-Forum grammar (spec: docs/superpowers/specs/2026-08-29-umfragen-forum-design.md).
 *
 * Kind 32107 — Kategorie definition (addressable, d = "category:<slug>").
 *   Authored by the town/publisher identity, never by citizens.
 * Kind 11   — Thema (NIP-7D thread): title tag + optional t category tag.
 *   Regular immutable event: its id is a stable permalink a future NSP-12
 *   head can cite.
 * Kind 1111 — Antwort (NIP-22 comment): uppercase E/K/P = thread root scope,
 *   lowercase e/k/p = direct parent (the root itself for top-level replies).
 */
export const KIND_FORUM_CATEGORY = 32107;
export const KIND_FORUM_THREAD = 11;
export const KIND_FORUM_REPLY = 1111;

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function assertSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) throw new Error(`invalid forum category slug: "${slug}"`);
}

/** The a-tag address of a category definition: `32107:<pubkey>:category:<slug>`. */
export function forumCategoryAddress(pubkeyHex: string, slug: string): string {
  assertSlug(slug);
  return `${KIND_FORUM_CATEGORY}:${pubkeyHex}:category:${slug}`;
}

export interface ForumCategoryInput {
  slug: string;
  name: string;
  about?: string;
}

export function buildForumCategoryEvent(
  secretKey: Uint8Array,
  input: ForumCategoryInput,
  options: { createdAt?: number } = {},
): NostrEvent {
  assertSlug(input.slug);
  if (!input.name.trim()) throw new Error("a forum category needs a name");
  const tags = [
    ["d", `category:${input.slug}`],
    ["name", input.name.trim()],
    ...(input.about?.trim() ? [["about", input.about.trim()]] : []),
  ];
  return buildEvent(secretKey, KIND_FORUM_CATEGORY, "", { ...options, tags });
}

export interface ForumThreadInput {
  title: string;
  content: string;
  categorySlug?: string;
}

export function buildForumThreadEvent(
  secretKey: Uint8Array,
  input: ForumThreadInput,
  options: { createdAt?: number } = {},
): NostrEvent {
  const title = input.title.trim();
  if (!title) throw new Error("a forum thread needs a title");
  if (input.categorySlug !== undefined) assertSlug(input.categorySlug);
  const tags = [
    ["title", title],
    ...(input.categorySlug ? [["t", input.categorySlug]] : []),
  ];
  return buildEvent(secretKey, KIND_FORUM_THREAD, input.content, { ...options, tags });
}

export interface ForumEventRef {
  id: string;
  pubkey: string;
}

export function buildForumReplyEvent(
  secretKey: Uint8Array,
  content: string,
  root: ForumEventRef,
  parent?: ForumEventRef & { kind: number },
  options: { createdAt?: number } = {},
): NostrEvent {
  const p = parent ?? { ...root, kind: KIND_FORUM_THREAD };
  const tags = [
    ["E", root.id, "", root.pubkey],
    ["K", String(KIND_FORUM_THREAD)],
    ["P", root.pubkey],
    ["e", p.id, "", p.pubkey],
    ["k", String(p.kind)],
    ["p", p.pubkey],
  ];
  return buildEvent(secretKey, KIND_FORUM_REPLY, content, { ...options, tags });
}
```

Append to `packages/nostr/src/index.ts` (after the org export block, before the RelayClient export):

```ts
export {
  KIND_FORUM_CATEGORY,
  KIND_FORUM_REPLY,
  KIND_FORUM_THREAD,
  buildForumCategoryEvent,
  buildForumReplyEvent,
  buildForumThreadEvent,
  forumCategoryAddress,
} from "./forum";
export type { ForumCategoryInput, ForumEventRef, ForumThreadInput } from "./forum";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/nostr && npx tsx --test test/forum.test.ts`
Expected: all PASS. Then run the whole package suite: `npx tsx --test test/*.test.ts` — no regressions.

- [ ] **Step 5: Commit + push**

```bash
git add packages/nostr/src/forum.ts packages/nostr/test/forum.test.ts packages/nostr/src/index.ts
git commit -m "feat(nostr): Umfragen-Forum event builders — kind 32107 category, 11 thread, 1111 reply"
git push -u origin feat/umfragen-forum
```

---

### Task 2: Supabase migration — forum tables, RLS, counters, reply notification, seed

**Files:**
- Create: `supabase/migrations/20260829_forum_tables.sql`

**Interfaces:**
- Consumes: existing `users(wallet_address)`, `accounts(id)`, `notifications` tables (see `apps/expo/supabase/migrations/like_comment_invite_notifications.sql` for the notification idiom).
- Produces (used by Tasks 4–5): tables `forum_categories(slug, name, about, sort_order, created_at)`, `forum_threads(id, wallet_address, account_id, category_slug, title, body, status, reply_count, last_activity_at, created_at, updated_at)`, `forum_replies(id, thread_id, parent_reply_id, wallet_address, account_id, body, status, created_at)`; RPCs `delete_owned_forum_thread(p_thread_id uuid, p_wallet text)`, `delete_owned_forum_reply(p_reply_id uuid, p_wallet text)`; notification rows of `type = 'forum_reply'` with `metadata.thread_id` / `metadata.reply_id`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260829_forum_tables.sql`:

```sql
-- Umfragen-Forum slice A (spec: docs/superpowers/specs/2026-08-29-umfragen-forum-design.md)
-- Categories are a curated taxonomy (service-role writes only). Threads/replies
-- are citizen content following the proposal_comments idiom: client inserts,
-- soft-delete via owner-checked SECURITY DEFINER RPCs, RLS enabled from day one.

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.forum_categories (
  slug        text PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name        text NOT NULL,
  about       text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.forum_threads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address   text NOT NULL REFERENCES public.users(wallet_address),
  account_id       uuid REFERENCES public.accounts(id),
  category_slug    text REFERENCES public.forum_categories(slug),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  body             text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  status           text NOT NULL DEFAULT 'published' CHECK (status IN ('published','deleted','flagged')),
  reply_count      integer NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.forum_replies (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id        uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  parent_reply_id  uuid REFERENCES public.forum_replies(id),
  wallet_address   text NOT NULL REFERENCES public.users(wallet_address),
  account_id       uuid REFERENCES public.accounts(id),
  body             text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  status           text NOT NULL DEFAULT 'published' CHECK (status IN ('published','deleted')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forum_threads_activity_idx ON public.forum_threads (last_activity_at DESC);
CREATE INDEX IF NOT EXISTS forum_threads_category_idx ON public.forum_threads (category_slug);
CREATE INDEX IF NOT EXISTS forum_replies_thread_idx  ON public.forum_replies (thread_id, created_at);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_threads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_replies    ENABLE ROW LEVEL SECURITY;

-- Categories: world-readable, writes are service-role only (no insert policy).
CREATE POLICY forum_categories_select ON public.forum_categories FOR SELECT USING (true);

-- Threads/replies: world-readable; inserts must arrive as 'published'.
-- Updates/deletes have NO policy — they go through the owner-checked RPCs below.
CREATE POLICY forum_threads_select ON public.forum_threads FOR SELECT USING (true);
CREATE POLICY forum_threads_insert ON public.forum_threads FOR INSERT WITH CHECK (status = 'published');
CREATE POLICY forum_replies_select ON public.forum_replies FOR SELECT USING (true);
CREATE POLICY forum_replies_insert ON public.forum_replies FOR INSERT WITH CHECK (status = 'published');

-- ── Owner-checked soft delete (idiom: delete_owned_post) ───────────────────
CREATE OR REPLACE FUNCTION public.delete_owned_forum_thread(p_thread_id uuid, p_wallet text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.forum_threads SET status = 'deleted', updated_at = now()
   WHERE id = p_thread_id AND lower(wallet_address) = lower(p_wallet);
  IF NOT FOUND THEN RAISE EXCEPTION 'thread not found or not owned by %', p_wallet; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_owned_forum_reply(p_reply_id uuid, p_wallet text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.forum_replies SET status = 'deleted'
   WHERE id = p_reply_id AND lower(wallet_address) = lower(p_wallet);
  IF NOT FOUND THEN RAISE EXCEPTION 'reply not found or not owned by %', p_wallet; END IF;
END; $$;

-- ── Reply counters ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bump_forum_thread_on_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.forum_threads
     SET reply_count = reply_count + 1, last_activity_at = NEW.created_at
   WHERE id = NEW.thread_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_bump_forum_thread_on_reply ON public.forum_replies;
CREATE TRIGGER trg_bump_forum_thread_on_reply
  AFTER INSERT ON public.forum_replies
  FOR EACH ROW WHEN (NEW.status = 'published')
  EXECUTE FUNCTION public.bump_forum_thread_on_reply();

-- ── In-app notification: reply → thread author ─────────────────────────────
-- (idiom: notify_post_comment in like_comment_invite_notifications.sql)
CREATE OR REPLACE FUNCTION public.notify_forum_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_author_wallet text;
  v_replier_name  text;
  v_body          text;
BEGIN
  SELECT lower(t.wallet_address) INTO v_author_wallet
    FROM public.forum_threads t WHERE t.id = NEW.thread_id;
  IF v_author_wallet IS NULL OR v_author_wallet = lower(NEW.wallet_address) THEN
    RETURN NEW;
  END IF;

  v_replier_name := COALESCE(
    (SELECT NULLIF(btrim(a.name), '') FROM public.accounts a WHERE a.id = NEW.account_id),
    (SELECT NULLIF(btrim(u.display_name), '') FROM public.users u WHERE lower(u.wallet_address) = lower(NEW.wallet_address)),
    (SELECT NULLIF(btrim(u.username), '')     FROM public.users u WHERE lower(u.wallet_address) = lower(NEW.wallet_address))
  );

  v_body := NULLIF(btrim(NEW.body), '');
  IF v_body IS NULL THEN v_body := 'hat auf dein Thema geantwortet';
  ELSIF length(v_body) > 140 THEN v_body := left(v_body, 140) || '…';
  END IF;

  INSERT INTO public.notifications (recipient_wallet, type, title, body, metadata)
  VALUES (
    v_author_wallet, 'forum_reply', COALESCE(v_replier_name, 'Jemand'), v_body,
    jsonb_build_object('thread_id', NEW.thread_id, 'reply_id', NEW.id, 'actor_wallet', lower(NEW.wallet_address))
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_forum_reply ON public.forum_replies;
CREATE TRIGGER trg_notify_forum_reply
  AFTER INSERT ON public.forum_replies
  FOR EACH ROW WHEN (NEW.status = 'published')
  EXECUTE FUNCTION public.notify_forum_reply();

-- ── Seed categories ─────────────────────────────────────────────────────────
INSERT INTO public.forum_categories (slug, name, about, sort_order) VALUES
  ('verkehr',         'Verkehr',         'Straßen, Radwege, Parken, ÖPNV', 1),
  ('bildung',         'Bildung',         'Schule, Kita, Jugend',           2),
  ('haushalt',        'Haushalt',        'Gemeindefinanzen und Ausgaben',  3),
  ('ortsentwicklung', 'Ortsentwicklung', 'Bauen, Plätze, Tourismus',       4)
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 2: Verify the MCP target project**

Call `mcp__supabase__get_project_url`. Expected: URL containing `wwbeqhkslxdxhktqzqti`. If it does not match, STOP — the MCP is bound to the wrong project (`.mcp.json` of the working directory); fix before any write.

- [ ] **Step 3: Apply the migration**

Call `mcp__supabase__apply_migration` with name `forum_tables` and the file's SQL as the query.
Expected: success. Note: applied SQL migration names stay as-is forever (never rename after applying).

- [ ] **Step 4: Verify**

Call `mcp__supabase__execute_sql` with:
```sql
SELECT slug, name, sort_order FROM public.forum_categories ORDER BY sort_order;
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('forum_categories','forum_threads','forum_replies');
```
Expected: 4 seeded rows; `relrowsecurity = true` for all three tables. Also call `mcp__supabase__get_advisors` (type `security`) and confirm no NEW findings on `forum_*` beyond the repo's known baseline.

- [ ] **Step 5: Commit + push**

```bash
git add supabase/migrations/20260829_forum_tables.sql
git commit -m "feat(supabase): forum tables — categories, threads, replies, RLS, reply notifications"
git push
```

---

### Task 3: Extend the push hub to forward `forum_reply` notifications

The push-hub trigger function `notify_user_notification_push` whitelists notification types; its CURRENT body may differ from the version in `like_comment_invite_notifications.sql` (later migrations may have replaced it). Blind re-creation would drop types — read it first.

**Files:**
- Create: `supabase/migrations/20260829_forum_reply_push.sql`

**Interfaces:**
- Consumes: `notifications` rows of type `forum_reply` from Task 2.
- Produces: push payload `{"type":"forum_thread","threadId":<uuid>}` — the deep-link contract consumed by the app's existing push-routing (Task 8's thread screen route `/forum/thread/[id]`).

- [ ] **Step 1: Read the live function body**

Call `mcp__supabase__execute_sql`:
```sql
SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'notify_user_notification_push';
```

- [ ] **Step 2: Write the migration preserving the live body**

Create `supabase/migrations/20260829_forum_reply_push.sql` containing a `CREATE OR REPLACE FUNCTION public.notify_user_notification_push() …` that is EXACTLY the live body from Step 1 with two edits:

1. Add `'forum_reply'` to the type whitelist, e.g. `IF NEW.type NOT IN ('org_invite', 'post_like', 'post_comment', 'forum_reply') THEN` (keep whatever additional types the live body already lists).
2. Add a deep-link branch before the generic/else case:

```sql
  ELSIF NEW.type = 'forum_reply' THEN
    v_data := jsonb_build_object('type', 'forum_thread', 'threadId', NEW.metadata->>'thread_id');
```

Do not change anything else (vault lookups, net.http_post call, trigger itself stay untouched — the trigger already fires on every `notifications` insert).

- [ ] **Step 3: Apply and verify**

Apply via `mcp__supabase__apply_migration` (name `forum_reply_push`). Then verify with `mcp__supabase__execute_sql`:
```sql
SELECT prosrc LIKE '%forum_reply%' AS has_forum_reply FROM pg_proc p
 JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'notify_user_notification_push';
```
Expected: `true`.

- [ ] **Step 4: Commit + push**

```bash
git add supabase/migrations/20260829_forum_reply_push.sql
git commit -m "feat(supabase): forward forum_reply notifications through the push hub"
git push
```

---

### Task 4: Nostr publish helpers for threads and replies

**Files:**
- Modify: `apps/expo/lib/nostr/publish.ts`

**Interfaces:**
- Consumes: `buildForumThreadEvent`, `buildForumReplyEvent`, `KIND_FORUM_REPLY` from `@netizen-labs/nostr` (Task 1); existing `publish()`, `loadStoredIdentity()`, `nostr_publications` ledger.
- Produces (used by Task 5):
  - `publishForumThread(threadId: string, title: string, body: string, categorySlug?: string, createdAtSec?: number): Promise<PublicationStatus>`
  - `publishForumReply(replyId: string, threadId: string, content: string, parentReplyId?: string | null): Promise<PublicationStatus>`
  - Ledger `source_type` values: `'forum_thread'`, `'forum_reply'`.

- [ ] **Step 1: Add the helpers**

In `apps/expo/lib/nostr/publish.ts`, extend the package import at the top:

```ts
import {
  buildCalendarEvent,
  type NostrEvent,
  type ProfileMetadata,
  RelayClient,
  buildDeletionEvent,
  buildEvent,
  buildForumReplyEvent,
  buildForumThreadEvent,
  buildVanishEvent,
  buildNoteEvent,
  buildProfileEvent,
  KIND_FORUM_REPLY,
} from '@netizen-labs/nostr';
```

Below `publishedEventIdOf(…)`, add a variant that also returns the author pubkey (needed for NIP-22 `P`/`p` tags), then the two publishers:

```ts
/** Like publishedEventIdOf, but also returns the signing pubkey from the ledger. */
async function publishedEventOf(
  sourceType: string,
  sourceId: string,
): Promise<{ eventId: string; pubkey: string } | null> {
  try {
    const { data } = await supabase
      .from('nostr_publications')
      .select('event_id, pubkey_hex')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .eq('status', 'published')
      .maybeSingle();
    if (!data?.event_id || !data?.pubkey_hex) return null;
    return { eventId: data.event_id as string, pubkey: data.pubkey_hex as string };
  } catch {
    return null;
  }
}

/**
 * Mirror a forum thread (Thema) as a kind 11 NIP-7D thread. Same fire-and-forget
 * contract as publishPost: called AFTER the Supabase insert, never awaited in
 * the UI path. The original wall-clock is preserved so retried mirrors keep
 * their true date.
 */
export async function publishForumThread(
  threadId: string,
  title: string,
  body: string,
  categorySlug?: string,
  createdAtSec?: number,
): Promise<PublicationStatus> {
  const identity = await loadStoredIdentity();
  if (!identity) return 'pending';
  const event = buildForumThreadEvent(
    identity.secretKey,
    { title, content: body, categorySlug },
    createdAtSec ? { createdAt: createdAtSec } : {},
  );
  return publish(event, 'forum_thread', threadId);
}

/**
 * Mirror a forum reply (Antwort) as a kind 1111 NIP-22 comment. Only possible
 * once the thread itself is on the relay; a nested reply whose parent never
 * mirrored falls back to targeting the root (still a valid NIP-22 comment).
 */
export async function publishForumReply(
  replyId: string,
  threadId: string,
  content: string,
  parentReplyId?: string | null,
): Promise<PublicationStatus> {
  const identity = await loadStoredIdentity();
  if (!identity) return 'pending';
  const root = await publishedEventOf('forum_thread', threadId);
  if (!root) return 'pending';
  let parent: { id: string; pubkey: string; kind: number } | undefined;
  if (parentReplyId) {
    const parentPub = await publishedEventOf('forum_reply', parentReplyId);
    if (parentPub) parent = { id: parentPub.eventId, pubkey: parentPub.pubkey, kind: KIND_FORUM_REPLY };
  }
  const event = buildForumReplyEvent(
    identity.secretKey,
    content,
    { id: root.eventId, pubkey: root.pubkey },
    parent,
  );
  return publish(event, 'forum_reply', replyId);
}
```

- [ ] **Step 2: Sanity-check the file compiles in isolation**

Run: `cd apps/expo && npx tsc --noEmit lib/nostr/publish.ts 2>&1 | grep -v node_modules | head -20`
Expected: no NEW errors mentioning `publish.ts` lines you added (ambient/project errors from elsewhere are pre-existing and ignorable).

- [ ] **Step 3: Commit + push**

```bash
git add apps/expo/lib/nostr/publish.ts
git commit -m "feat(expo): forum thread + reply Nostr mirrors via the publications ledger"
git push
```

---

### Task 5: Forum types and Supabase data layer

**Files:**
- Modify: `apps/expo/lib/types/feed.ts`
- Create: `apps/expo/lib/supabase-forum.ts`

**Interfaces:**
- Consumes: tables/RPCs from Task 2; `publishForumThread`/`publishForumReply` from Task 4; `supabase` client from `@/lib/supabase`; `PostAuthor` type.
- Produces (used by Tasks 6–9):
  - Types: `ForumCategoryRecord`, `ForumThreadRecord`, `ForumReplyRecord`, `CreateForumThreadInput`, `CreateForumReplyInput`; `FeedItem` union member `{ type: 'forum_thread'; data: ForumThreadRecord; id: string }`.
  - Functions: `fetchForumCategories(): Promise<ForumCategoryRecord[]>`, `fetchRecentForumThreads(limit?: number, categorySlug?: string): Promise<ForumThreadRecord[]>`, `fetchForumThread(id: string): Promise<ForumThreadRecord | null>`, `fetchForumReplies(threadId: string): Promise<ForumReplyRecord[]>`, `createForumThread(input: CreateForumThreadInput): Promise<ForumThreadRecord | null>`, `createForumReply(input: CreateForumReplyInput): Promise<ForumReplyRecord | null>`, `deleteForumThread(id: string, walletAddress: string): Promise<void>`, `deleteForumReply(id: string, walletAddress: string): Promise<void>`.

- [ ] **Step 1: Add the types**

In `apps/expo/lib/types/feed.ts`, after the `ProposalCommentFeedRecord` block, add:

```ts
// ─── Forum (Umfragen-Diskussionen) Types ────────────────────

export type ForumCategoryRecord = {
  slug: string;
  name: string;
  about: string | null;
  sort_order: number;
  created_at: string;
};

export type ForumThreadRecord = {
  id: string;
  wallet_address: string;
  account_id: string | null;
  category_slug: string | null;
  title: string;
  body: string;
  status: 'published' | 'deleted' | 'flagged';
  reply_count: number;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
  author?: PostAuthor;
  category?: Pick<ForumCategoryRecord, 'slug' | 'name'> | null;
};

export type ForumReplyRecord = {
  id: string;
  thread_id: string;
  parent_reply_id: string | null;
  wallet_address: string;
  account_id: string | null;
  body: string;
  status: 'published' | 'deleted';
  created_at: string;
  author?: PostAuthor;
};

export type CreateForumThreadInput = {
  wallet_address: string;
  account_id?: string;
  title: string;
  body: string;
  category_slug?: string | null;
};

export type CreateForumReplyInput = {
  thread_id: string;
  wallet_address: string;
  account_id?: string;
  body: string;
  parent_reply_id?: string | null;
};
```

And extend the `FeedItem` union (before the `proposal_hero` sentinel line):

```ts
  | { type: 'forum_thread'; data: ForumThreadRecord; id: string }
```

- [ ] **Step 2: Write the data layer**

Create `apps/expo/lib/supabase-forum.ts`:

```ts
import { supabase } from './supabase';
import type {
  CreateForumReplyInput,
  CreateForumThreadInput,
  ForumCategoryRecord,
  ForumReplyRecord,
  ForumThreadRecord,
} from './types/feed';

// PostgREST embed strings — FK names follow the table_column_fkey convention
// (same idiom as proposal_comments).
const THREAD_SELECT = `
  *,
  author:users!forum_threads_wallet_address_fkey(
    wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
  ),
  account:accounts(id, account_type, name, avatar_url),
  category:forum_categories(slug, name)
`;

const REPLY_SELECT = `
  *,
  author:users!forum_replies_wallet_address_fkey(
    wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
  ),
  account:accounts(id, account_type, name, avatar_url)
`;

function mergeAccountIntoAuthor<T extends { author?: any; account?: any }>(row: T): T {
  if (row.account && row.author) {
    row.author = { ...row.author, account: row.account };
  }
  return row;
}

export async function fetchForumCategories(): Promise<ForumCategoryRecord[]> {
  const { data, error } = await supabase
    .from('forum_categories')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('Error fetching forum categories:', error);
    return [];
  }
  return (data ?? []) as ForumCategoryRecord[];
}

export async function fetchRecentForumThreads(
  limit: number = 30,
  categorySlug?: string,
): Promise<ForumThreadRecord[]> {
  let query = supabase
    .from('forum_threads')
    .select(THREAD_SELECT)
    .eq('status', 'published')
    .order('last_activity_at', { ascending: false })
    .limit(limit);
  if (categorySlug) query = query.eq('category_slug', categorySlug);
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching forum threads:', error);
    return [];
  }
  return (data as unknown as ForumThreadRecord[]).map(mergeAccountIntoAuthor);
}

export async function fetchForumThread(id: string): Promise<ForumThreadRecord | null> {
  const { data, error } = await supabase
    .from('forum_threads')
    .select(THREAD_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('Error fetching forum thread:', error);
    return null;
  }
  return mergeAccountIntoAuthor(data as unknown as ForumThreadRecord);
}

export async function fetchForumReplies(threadId: string): Promise<ForumReplyRecord[]> {
  const { data, error } = await supabase
    .from('forum_replies')
    .select(REPLY_SELECT)
    .eq('thread_id', threadId)
    .eq('status', 'published')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Error fetching forum replies:', error);
    return [];
  }
  return (data as unknown as ForumReplyRecord[]).map(mergeAccountIntoAuthor);
}

/** Personal-account content mirrors to the relay; organisation words are the
 *  node's to publish under the org key (same rule as mirrorPostToNostr). */
async function isOrgAccount(accountId: string | null | undefined): Promise<boolean> {
  if (!accountId) return false;
  const { data } = await supabase
    .from('accounts')
    .select('account_type')
    .eq('id', accountId)
    .maybeSingle();
  return data?.account_type === 'organisation';
}

export async function createForumThread(
  input: CreateForumThreadInput,
): Promise<ForumThreadRecord | null> {
  const { data, error } = await supabase
    .from('forum_threads')
    .insert({
      wallet_address: input.wallet_address,
      account_id: input.account_id || null,
      title: input.title.trim(),
      body: input.body.trim(),
      category_slug: input.category_slug || null,
      status: 'published',
    })
    .select(THREAD_SELECT)
    .single();
  if (error) {
    console.error('Error creating forum thread:', error);
    return null;
  }
  const thread = mergeAccountIntoAuthor(data as unknown as ForumThreadRecord);
  void mirrorThreadToNostr(thread);
  return thread;
}

async function mirrorThreadToNostr(thread: ForumThreadRecord): Promise<void> {
  try {
    if (await isOrgAccount(thread.account_id)) return;
    const { publishForumThread } = await import('./nostr/publish');
    const createdSec = Math.floor(Date.parse(thread.created_at) / 1000);
    await publishForumThread(
      thread.id,
      thread.title,
      thread.body,
      thread.category_slug ?? undefined,
      Number.isFinite(createdSec) ? createdSec : undefined,
    );
  } catch (err) {
    console.warn('[nostr] forum thread mirror skipped', (err as Error)?.message);
  }
}

export async function createForumReply(
  input: CreateForumReplyInput,
): Promise<ForumReplyRecord | null> {
  const { data, error } = await supabase
    .from('forum_replies')
    .insert({
      thread_id: input.thread_id,
      wallet_address: input.wallet_address,
      account_id: input.account_id || null,
      body: input.body.trim(),
      parent_reply_id: input.parent_reply_id || null,
      status: 'published',
    })
    .select(REPLY_SELECT)
    .single();
  if (error) {
    console.error('Error creating forum reply:', error);
    return null;
  }
  const reply = mergeAccountIntoAuthor(data as unknown as ForumReplyRecord);
  void mirrorReplyToNostr(reply);
  return reply;
}

async function mirrorReplyToNostr(reply: ForumReplyRecord): Promise<void> {
  try {
    if (await isOrgAccount(reply.account_id)) return;
    const { publishForumReply } = await import('./nostr/publish');
    await publishForumReply(reply.id, reply.thread_id, reply.body, reply.parent_reply_id);
  } catch (err) {
    console.warn('[nostr] forum reply mirror skipped', (err as Error)?.message);
  }
}

/** Best-effort NIP-09 retraction of a mirrored forum event (spec §8: author
 *  deletion = row soft-delete + kind-5 publish). Never blocks the delete. */
async function mirrorDeletionToNostr(sourceType: 'forum_thread' | 'forum_reply', sourceId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('nostr_publications')
      .select('event_id')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .eq('status', 'published')
      .maybeSingle();
    if (!data?.event_id) return;
    const { publishDeletions } = await import('./nostr/publish');
    await publishDeletions([data.event_id as string], 'Beitrag gelöscht');
  } catch (err) {
    console.warn('[nostr] forum deletion mirror skipped', (err as Error)?.message);
  }
}

export async function deleteForumThread(id: string, walletAddress: string): Promise<void> {
  const { error } = await supabase.rpc('delete_owned_forum_thread', {
    p_thread_id: id,
    p_wallet: walletAddress,
  });
  if (error) throw error;
  void mirrorDeletionToNostr('forum_thread', id);
}

export async function deleteForumReply(id: string, walletAddress: string): Promise<void> {
  const { error } = await supabase.rpc('delete_owned_forum_reply', {
    p_reply_id: id,
    p_wallet: walletAddress,
  });
  if (error) throw error;
  void mirrorDeletionToNostr('forum_reply', id);
}
```

- [ ] **Step 3: Verify the PostgREST embeds against the live schema**

Call `mcp__supabase__execute_sql`:
```sql
SELECT conname FROM pg_constraint
 WHERE conname IN ('forum_threads_wallet_address_fkey','forum_replies_wallet_address_fkey');
```
Expected: both names present (they are Postgres' auto-generated names for the FK columns; if the actual names differ, adjust the two embed strings to the real names).

- [ ] **Step 4: Commit + push**

```bash
git add apps/expo/lib/types/feed.ts apps/expo/lib/supabase-forum.ts
git commit -m "feat(expo): forum data layer — categories, threads, replies with Nostr dual-write"
git push
```

---

### Task 6: Feed assembly plumbing (TDD)

**Files:**
- Create: `apps/expo/lib/__tests__/feed-assembler-forum.test.ts`
- Modify: `apps/expo/lib/feed-assembler.ts`
- Modify: `apps/expo/lib/feed-sections.ts`
- Modify: `apps/expo/hooks/useFeed.ts`

**Interfaces:**
- Consumes: `ForumThreadRecord`, `FeedItem` member `forum_thread` (Task 5); `fetchRecentForumThreads` (Task 5).
- Produces: `assembleFeed` accepts `forumThreads?: ForumThreadRecord[]` and, for `feedType === 'rathaus'`, merges items `{ type: 'forum_thread', data, id: 'forum-thread-<id>' }` by `created_at` desc alongside posts/proposals/comments; `FeedSections` gains `forumThreads: ForumThreadRecord[]`.

- [ ] **Step 1: Write the failing test**

Create `apps/expo/lib/__tests__/feed-assembler-forum.test.ts`:

```ts
import { assembleFeed } from '../feed-assembler';
import type { ForumThreadRecord, PostRecord } from '../types/feed';

const post = (id: string, createdAt: string): PostRecord =>
  ({
    id,
    created_at: createdAt,
    post_type: 'user',
    pinned_until: null,
  }) as unknown as PostRecord;

const thread = (id: string, createdAt: string): ForumThreadRecord =>
  ({
    id,
    title: `Thema ${id}`,
    created_at: createdAt,
    status: 'published',
  }) as unknown as ForumThreadRecord;

describe('assembleFeed rathaus forum threads', () => {
  it('interleaves forum threads with posts by created_at desc', () => {
    const items = assembleFeed({
      posts: [post('p1', '2026-08-29T10:00:00Z'), post('p2', '2026-08-29T08:00:00Z')],
      alerts: [],
      deals: [],
      marketplaceListings: [],
      upcomingEvents: [],
      forumThreads: [thread('t1', '2026-08-29T09:00:00Z')],
      feedType: 'rathaus',
    });
    expect(items.map((i) => i.id)).toEqual(['post-p1', 'forum-thread-t1', 'post-p2']);
    expect(items[1].type).toBe('forum_thread');
  });

  it('ignores forum threads outside the rathaus feed', () => {
    const items = assembleFeed({
      posts: [],
      alerts: [],
      deals: [],
      marketplaceListings: [],
      upcomingEvents: [],
      forumThreads: [thread('t1', '2026-08-29T09:00:00Z')],
      feedType: 'main',
    });
    expect(items.find((i) => i.type === 'forum_thread')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/expo && npx jest --watchAll=false lib/__tests__/feed-assembler-forum.test.ts`
Expected: FAIL — expected ids include `forum-thread-t1` but the assembler ignores the (unknown) param.

- [ ] **Step 3: Implement**

In `apps/expo/lib/feed-assembler.ts`:
1. Add `ForumThreadRecord` to the type import from `./types/feed`.
2. Add `forumThreads?: ForumThreadRecord[];` to the params type and `forumThreads = [],` to the destructuring defaults.
3. In the `if (feedType === 'rathaus')` branch, after the `proposalComments` loop, add:

```ts
    for (const thread of forumThreads) {
      sortable.push({
        item: { type: 'forum_thread', data: thread, id: `forum-thread-${thread.id}` },
        ts: new Date(thread.created_at).getTime(),
      });
    }
```

In `apps/expo/lib/feed-sections.ts`:
1. Import: `import { fetchRecentForumThreads } from '@/lib/supabase-forum';` and add `ForumThreadRecord` to the type import from `@/lib/types/feed`.
2. Add `forumThreads: ForumThreadRecord[];` to `FeedSections`.
3. Add to the `Promise.all` array (after `proposalComments`): `isRathaus ? fetchRecentForumThreads(30).catch(() => []) : emptyArr,` with a matching `forumThreads,` destructuring name, and `forumThreads: forumThreads as ForumThreadRecord[],` in the returned object.

In `apps/expo/hooks/useFeed.ts`, add `forumThreads: s?.forumThreads ?? [],` to the `assembleFeed({ … })` call.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/expo && npx jest --watchAll=false lib/__tests__/feed-assembler-forum.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit + push**

```bash
git add apps/expo/lib/__tests__/feed-assembler-forum.test.ts apps/expo/lib/feed-assembler.ts apps/expo/lib/feed-sections.ts apps/expo/hooks/useFeed.ts
git commit -m "feat(expo): forum threads join the rathaus feed assembly"
git push
```

---

### Task 7: ForumThreadCard and ForumCategoryChips components

**Files:**
- Create: `apps/expo/components/forum/ForumThreadCard.tsx`
- Create: `apps/expo/components/forum/ForumCategoryChips.tsx`

**Interfaces:**
- Consumes: `ForumThreadRecord`, `ForumCategoryRecord` (Task 5); `fetchForumCategories` (Task 5); `PostAuthorRow` (`author: PostAuthor | undefined`, `createdAt: string` props); `useTheme`, `fontFamily`; `useUser` for the citizen gate.
- Produces: `<ForumThreadCard thread={ForumThreadRecord} />` (used by FeedList in Task 9 and the list screen in Task 8); `<ForumCategoryChips activeSlug?: string />` (rathaus `listHeader` in Task 9 and the list screens' header in Task 8).

- [ ] **Step 1: ForumThreadCard**

Create `apps/expo/components/forum/ForumThreadCard.tsx` (modeled on `FeedProposalCard`; label DISKUSSION, category chip, title, 2-line snippet, author row, reply count):

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import PostAuthorRow from '@/components/feed/PostAuthorRow';
import type { ForumThreadRecord } from '@/lib/types/feed';

type Props = {
  thread: ForumThreadRecord;
};

export default function ForumThreadCard({ thread }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/forum/thread/${thread.id}` as any)}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.background },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.primary }]}>DISKUSSION</Text>
        {thread.category?.name ? (
          <View style={[styles.categoryChip, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.categoryText, { color: colors.primary }]}>{thread.category.name}</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
        {thread.title}
      </Text>
      {thread.body ? (
        <Text style={[styles.snippet, { color: colors.textSecondary }]} numberOfLines={2}>
          {thread.body}
        </Text>
      ) : null}

      <PostAuthorRow author={thread.author} createdAt={thread.created_at} />

      <Text style={[styles.replies, { color: colors.textSecondary }]}>
        {thread.reply_count === 1 ? '1 Antwort' : `${thread.reply_count} Antworten`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
    letterSpacing: 0.6,
  },
  categoryChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  categoryText: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
  },
  title: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
    lineHeight: 22,
  },
  snippet: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    lineHeight: 18,
  },
  replies: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
  },
});
```

NOTE: check `colors.pressedOverlay` exists in `apps/expo/constants/theme.ts` (FeedProposalCard uses it, so it does); `fontFamily.medium`/`semiBold`/`regular` are the token names from the theme file.

- [ ] **Step 2: ForumCategoryChips**

Create `apps/expo/components/forum/ForumCategoryChips.tsx`:

```tsx
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { useUser } from '@/context/UserContext';
import { fetchForumCategories } from '@/lib/supabase-forum';

type Props = {
  /** Highlighted category slug; 'alle' highlights the all-threads chip. */
  activeSlug?: string;
};

/**
 * Horizontal category rail for the Umfragen page and the forum list screens.
 * Chips navigate to the (filtered) thread list; the trailing CTA opens the
 * composer (citizens only — the button self-hides otherwise).
 */
export default function ForumCategoryChips({ activeSlug }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const { isCitizen } = useUser();

  const { data: categories = [] } = useQuery({
    queryKey: ['forum', 'categories'],
    queryFn: fetchForumCategories,
    staleTime: 5 * 60_000,
  });

  const chip = (slug: string, name: string) => {
    const active = activeSlug === slug;
    return (
      <Pressable
        key={slug}
        onPress={() =>
          router.push((slug === 'alle' ? '/forum' : `/forum/${slug}`) as any)
        }
        style={[
          styles.chip,
          {
            backgroundColor: active ? colors.primary : colors.surface,
            borderColor: active ? colors.primary : colors.border,
          },
        ]}
      >
        <Text
          style={[
            styles.chipText,
            { color: active ? colors.primaryForeground : colors.textPrimary },
          ]}
        >
          {name}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.row}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {chip('alle', 'Alle')}
        {categories.map((c) => chip(c.slug, c.name))}
        {isCitizen && (
          <Pressable
            onPress={() => router.push('/forum/new' as any)}
            style={[styles.chip, styles.newChip, { borderColor: colors.primary }]}
          >
            <Text style={[styles.chipText, { color: colors.primary }]}>+ Neues Thema</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  newChip: {
    borderStyle: 'dashed',
  },
  chipText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
  },
});
```

- [ ] **Step 3: Sanity-check both files in isolation**

Run: `cd apps/expo && npx tsc --noEmit components/forum/ForumThreadCard.tsx components/forum/ForumCategoryChips.tsx 2>&1 | grep "components/forum" | head -20`
Expected: no errors pointing into `components/forum/`. If `colors.pressedOverlay` or a token name errors, use the actual token from `constants/theme.ts`.

- [ ] **Step 4: Commit + push**

```bash
git add apps/expo/components/forum/ForumThreadCard.tsx apps/expo/components/forum/ForumCategoryChips.tsx
git commit -m "feat(expo): forum thread card + category chip rail"
git push
```

---

### Task 8: Forum screens — list, composer, thread detail

**Files:**
- Create: `apps/expo/components/forum/ForumThreadList.tsx`
- Create: `apps/expo/app/forum/index.tsx`
- Create: `apps/expo/app/forum/[category].tsx`
- Create: `apps/expo/app/forum/new.tsx`
- Create: `apps/expo/app/forum/thread/[id].tsx`

**Interfaces:**
- Consumes: data layer (Task 5), `ForumThreadCard` + `ForumCategoryChips` (Task 7), `PostAuthorRow`, `useUser` (`{ user, isCitizen }`, `user.wallet_address`), `useAccount` (`{ activeAccount }`) from `@/context/AccountContext`, `ChevronLeftIcon` from `@/assets/icons/chevron-left.svg`.
- Produces: routes `/forum`, `/forum/[category]`, `/forum/new`, `/forum/thread/[id]` (expo-router auto-registers; root layout renders headers hidden, screens own their header). `/forum/thread/[id]` is the deep-link target of the Task 3 push payload.

- [ ] **Step 1: Shared thread list component**

Create `apps/expo/components/forum/ForumThreadList.tsx`:

```tsx
import React from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import ForumThreadCard from './ForumThreadCard';
import ForumCategoryChips from './ForumCategoryChips';
import { fetchRecentForumThreads } from '@/lib/supabase-forum';

type Props = {
  /** undefined = all categories */
  categorySlug?: string;
  title: string;
};

export default function ForumThreadList({ categorySlug, title }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const { data: threads = [], isFetching, refetch } = useQuery({
    queryKey: ['forum', 'threads', categorySlug ?? 'alle'],
    queryFn: () => fetchRecentForumThreads(50, categorySlug),
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ForumCategoryChips activeSlug={categorySlug ?? 'alle'} />
      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <ForumThreadCard thread={item} />}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.borderTertiary }]} />
        )}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.textSecondary} />
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            Noch keine Diskussionen. Starte das erste Thema!
          </Text>
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: fontFamily.semiBold,
  },
  separator: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  listContent: { paddingBottom: 32 },
  empty: {
    textAlign: 'center',
    marginTop: 48,
    fontSize: 14,
    fontFamily: fontFamily.regular,
    paddingHorizontal: 32,
  },
});
```

- [ ] **Step 2: Route screens for the lists**

Create `apps/expo/app/forum/index.tsx`:

```tsx
import React from 'react';
import ForumThreadList from '@/components/forum/ForumThreadList';

export default function ForumIndexScreen() {
  return <ForumThreadList title="Diskussionen" />;
}
```

Create `apps/expo/app/forum/[category].tsx`:

```tsx
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import ForumThreadList from '@/components/forum/ForumThreadList';
import { fetchForumCategories } from '@/lib/supabase-forum';

export default function ForumCategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const { data: categories = [] } = useQuery({
    queryKey: ['forum', 'categories'],
    queryFn: fetchForumCategories,
    staleTime: 5 * 60_000,
  });
  const name = categories.find((c) => c.slug === category)?.name ?? 'Diskussionen';
  return <ForumThreadList categorySlug={category} title={name} />;
}
```

- [ ] **Step 3: Composer screen**

Create `apps/expo/app/forum/new.tsx`:

```tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import { createForumThread, fetchForumCategories } from '@/lib/supabase-forum';

export default function ForumNewScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isCitizen } = useUser();
  const { activeAccount } = useAccount();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['forum', 'categories'],
    queryFn: fetchForumCategories,
    staleTime: 5 * 60_000,
  });

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !user?.wallet_address) return;
    setSubmitting(true);
    setError(null);
    const thread = await createForumThread({
      wallet_address: user.wallet_address,
      account_id: activeAccount?.id,
      title,
      body,
      category_slug: categorySlug,
    });
    setSubmitting(false);
    if (!thread) {
      setError('Thema konnte nicht erstellt werden. Bitte versuche es erneut.');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['forum', 'threads'] });
    await queryClient.invalidateQueries({ queryKey: ['feed', 'sections', 'rathaus'] });
    router.replace(`/forum/thread/${thread.id}` as any);
  };

  if (!isCitizen) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Neues Thema</Text>
          <View style={{ width: 24 }} />
        </View>
        <Text style={[styles.locked, { color: colors.textSecondary }]}>
          Nur verifizierte Bürger können Themen erstellen.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Neues Thema</Text>
          <Pressable onPress={handleSubmit} disabled={!canSubmit} hitSlop={12}>
            {submitting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text
                style={[
                  styles.submit,
                  { color: canSubmit ? colors.primary : colors.textTertiary },
                ]}
              >
                Erstellen
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Titel deines Themas"
            placeholderTextColor={colors.textTertiary}
            maxLength={200}
            style={[styles.titleInput, { color: colors.textPrimary, borderColor: colors.border }]}
          />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Worum geht es? Beschreibe dein Anliegen …"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={10000}
            style={[styles.bodyInput, { color: colors.textPrimary, borderColor: colors.border }]}
          />

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            Kategorie (optional)
          </Text>
          <View style={styles.categoryRow}>
            {categories.map((c) => {
              const active = categorySlug === c.slug;
              return (
                <Pressable
                  key={c.slug}
                  onPress={() => setCategorySlug(active ? null : c.slug)}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: active ? colors.primary : colors.surface,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      { color: active ? colors.primaryForeground : colors.textPrimary },
                    ]}
                  >
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {error ? <Text style={[styles.error, { color: colors.error ?? '#d33' }]}>{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 17, fontFamily: fontFamily.semiBold },
  submit: { fontSize: 15, fontFamily: fontFamily.semiBold },
  locked: {
    textAlign: 'center',
    marginTop: 48,
    fontSize: 14,
    fontFamily: fontFamily.regular,
    paddingHorizontal: 32,
  },
  form: { padding: 16, gap: 16 },
  titleInput: {
    fontSize: 17,
    fontFamily: fontFamily.semiBold,
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  bodyInput: {
    fontSize: 15,
    fontFamily: fontFamily.regular,
    minHeight: 140,
    textAlignVertical: 'top',
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  sectionLabel: { fontSize: 12, fontFamily: fontFamily.medium },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  categoryChipText: { fontSize: 13, fontFamily: fontFamily.medium },
  error: { fontSize: 13, fontFamily: fontFamily.regular },
});
```

NOTE: if `colors.error` does not exist in `constants/theme.ts`, use the existing error/danger token from that file (check its light/dark palettes) rather than the `#d33` fallback.

- [ ] **Step 4: Thread detail screen**

Create `apps/expo/app/forum/thread/[id].tsx`:

```tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import PostAuthorRow from '@/components/feed/PostAuthorRow';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import {
  createForumReply,
  fetchForumReplies,
  fetchForumThread,
} from '@/lib/supabase-forum';
import type { ForumReplyRecord } from '@/lib/types/feed';

export default function ForumThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isCitizen } = useUser();
  const { activeAccount } = useAccount();

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const { data: thread, isPending } = useQuery({
    queryKey: ['forum', 'thread', id],
    queryFn: () => fetchForumThread(id!),
    enabled: !!id,
  });
  const { data: replies = [] } = useQuery({
    queryKey: ['forum', 'replies', id],
    queryFn: () => fetchForumReplies(id!),
    enabled: !!id,
  });

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending || !user?.wallet_address || !id) return;
    setSending(true);
    const reply = await createForumReply({
      thread_id: id,
      wallet_address: user.wallet_address,
      account_id: activeAccount?.id,
      body,
    });
    setSending(false);
    if (reply) {
      setDraft('');
      await queryClient.invalidateQueries({ queryKey: ['forum', 'replies', id] });
      await queryClient.invalidateQueries({ queryKey: ['forum', 'thread', id] });
    }
  };

  const renderReply = ({ item }: { item: ForumReplyRecord }) => (
    <View style={[styles.reply, { borderColor: colors.borderTertiary }]}>
      <PostAuthorRow author={item.author} createdAt={item.created_at} />
      <Text style={[styles.replyBody, { color: colors.textPrimary }]}>{item.body}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Diskussion</Text>
          <View style={{ width: 24 }} />
        </View>

        {isPending || !thread ? (
          <View style={styles.loading}>
            {isPending ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={[styles.notFound, { color: colors.textSecondary }]}>
                Thema nicht gefunden.
              </Text>
            )}
          </View>
        ) : (
          <FlatList
            data={replies}
            keyExtractor={(r) => r.id}
            renderItem={renderReply}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={[styles.threadHead, { borderColor: colors.borderTertiary }]}>
                {thread.category?.name ? (
                  <Text style={[styles.category, { color: colors.primary }]}>
                    {thread.category.name.toUpperCase()}
                  </Text>
                ) : null}
                <Text style={[styles.title, { color: colors.textPrimary }]}>{thread.title}</Text>
                <PostAuthorRow author={thread.author} createdAt={thread.created_at} />
                <Text style={[styles.body, { color: colors.textPrimary }]}>{thread.body}</Text>
                <Text style={[styles.replyCount, { color: colors.textSecondary }]}>
                  {thread.reply_count === 1 ? '1 Antwort' : `${thread.reply_count} Antworten`}
                </Text>
              </View>
            }
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                Noch keine Antworten. Schreib die erste!
              </Text>
            }
          />
        )}

        {isCitizen && thread && (
          <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Antworten …"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={10000}
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface }]}
            />
            <Pressable onPress={handleSend} disabled={!draft.trim() || sending} hitSlop={8}>
              {sending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text
                  style={[
                    styles.send,
                    { color: draft.trim() ? colors.primary : colors.textTertiary },
                  ]}
                >
                  Senden
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 17, fontFamily: fontFamily.semiBold },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 14, fontFamily: fontFamily.regular },
  listContent: { paddingBottom: 24 },
  threadHead: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  category: { fontSize: 11, fontFamily: fontFamily.semiBold, letterSpacing: 0.6 },
  title: { fontSize: 20, fontFamily: fontFamily.heading, lineHeight: 26 },
  body: { fontSize: 15, fontFamily: fontFamily.regular, lineHeight: 22 },
  replyCount: { fontSize: 12, fontFamily: fontFamily.regular },
  reply: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  replyBody: { fontSize: 14, fontFamily: fontFamily.regular, lineHeight: 20 },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontSize: 14,
    fontFamily: fontFamily.regular,
    paddingHorizontal: 32,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: fontFamily.regular,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 120,
  },
  send: { fontSize: 15, fontFamily: fontFamily.semiBold, paddingBottom: 8 },
});
```

- [ ] **Step 5: Realtime replies + author deletion on the thread screen**

Extend `apps/expo/app/forum/thread/[id].tsx` (spec §6 realtime, §8 author delete):

1. Widen two imports and add supabase + delete helpers:

```tsx
import React, { useEffect, useState } from 'react';
// Alert joins the react-native import list:
import { /* …existing names…, */ Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import {
  createForumReply,
  deleteForumReply,
  deleteForumThread,
  fetchForumReplies,
  fetchForumThread,
} from '@/lib/supabase-forum';
```

2. After the two `useQuery` blocks, subscribe to new replies for THIS thread only (spec: realtime on the open thread screen only):

```tsx
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`forum-replies-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'forum_replies', filter: `thread_id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['forum', 'replies', id] });
          queryClient.invalidateQueries({ queryKey: ['forum', 'thread', id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);
```

3. Add the two delete handlers above `renderReply` (native confirm, German copy):

```tsx
  const isOwn = (walletAddress: string) =>
    !!user?.wallet_address && walletAddress.toLowerCase() === user.wallet_address.toLowerCase();

  const handleDeleteThread = () => {
    if (!thread || !user?.wallet_address) return;
    Alert.alert('Thema löschen?', 'Das Thema wird dauerhaft entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteForumThread(thread.id, user.wallet_address);
            await queryClient.invalidateQueries({ queryKey: ['forum', 'threads'] });
            await queryClient.invalidateQueries({ queryKey: ['feed', 'sections', 'rathaus'] });
            router.back();
          } catch {
            Alert.alert('Fehler', 'Thema konnte nicht gelöscht werden.');
          }
        },
      },
    ]);
  };

  const handleDeleteReply = (reply: ForumReplyRecord) => {
    if (!user?.wallet_address) return;
    Alert.alert('Antwort löschen?', 'Die Antwort wird dauerhaft entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteForumReply(reply.id, user.wallet_address);
            await queryClient.invalidateQueries({ queryKey: ['forum', 'replies', id] });
          } catch {
            Alert.alert('Fehler', 'Antwort konnte nicht gelöscht werden.');
          }
        },
      },
    ]);
  };
```

4. Surface the affordances: in `renderReply`, after the body `<Text>`, add

```tsx
      {isOwn(item.wallet_address) && (
        <Pressable onPress={() => handleDeleteReply(item)} hitSlop={8}>
          <Text style={[styles.deleteLink, { color: colors.textTertiary }]}>Löschen</Text>
        </Pressable>
      )}
```

and in the `ListHeaderComponent` thread head, after the reply-count `<Text>`, add the same pattern calling `handleDeleteThread()` when `isOwn(thread.wallet_address)`. Add the style:

```tsx
  deleteLink: { fontSize: 12, fontFamily: fontFamily.regular },
```

- [ ] **Step 6: Sanity-check the screens in isolation**

Run: `cd apps/expo && npx tsc --noEmit app/forum/index.tsx "app/forum/[category].tsx" app/forum/new.tsx "app/forum/thread/[id].tsx" components/forum/ForumThreadList.tsx 2>&1 | grep -E "forum" | head -20`
Expected: no errors pointing into the new files. Fix token/prop mismatches against the real `constants/theme.ts` / `PostAuthorRow` definitions if any appear.

- [ ] **Step 7: Commit + push**

```bash
git add apps/expo/components/forum/ForumThreadList.tsx apps/expo/app/forum/index.tsx "apps/expo/app/forum/[category].tsx" apps/expo/app/forum/new.tsx "apps/expo/app/forum/thread/[id].tsx"
git commit -m "feat(expo): forum screens — thread lists, composer, thread detail with replies"
git push
```

---

### Task 9: Wire the forum into FeedList and the Umfragen page

**Files:**
- Modify: `apps/expo/components/feed/FeedList.tsx`
- Modify: `apps/expo/components/feed/FeedHome.tsx`

**Interfaces:**
- Consumes: `ForumThreadCard` (Task 7), `ForumCategoryChips` (Task 7), FeedItem member `forum_thread` (Task 5).
- Produces: forum thread cards render inside the rathaus feed; the category rail sits at the top of the Umfragen page.

- [ ] **Step 1: FeedList render case**

In `apps/expo/components/feed/FeedList.tsx`:
1. Add import: `import ForumThreadCard from '../forum/ForumThreadCard';` (after the `FeedProposalHeroCard` import).
2. In `renderItem`'s switch, after the `case 'proposal_comment':` block, add:

```tsx
        case 'forum_thread':
          return (
            <View style={styles.moduleWrap}>
              <ForumThreadCard thread={item.data} />
            </View>
          );
```

- [ ] **Step 2: Category rail on the Umfragen page**

In `apps/expo/components/feed/FeedHome.tsx`:
1. Add import: `import ForumCategoryChips from '../forum/ForumCategoryChips';`
2. On the rathaus `<FeedList …>` (the `key="rathaus"` page), add the prop:

```tsx
            listHeader={<ForumCategoryChips activeSlug="alle" />}
```

(`listHeader` is the same prop the main page uses for `HomeStoryBar`.)

- [ ] **Step 3: Route the forum_reply push tap**

The Task 3 push payload is `{"type":"forum_thread","threadId":<uuid>}`. Find the notification-tap router: `cd apps/expo && grep -rn "data?.type === 'post'\|type === 'post'" lib app hooks context --include='*.ts' --include='*.tsx' | grep -iv test` — the file that maps `type: 'post'` → a `/post/…`-style `router.push` is the tap handler (expected in the push/notification lib or the root layout's notification-response listener). Alongside its `'post'` case, add:

```ts
if (data?.type === 'forum_thread' && data?.threadId) {
  router.push(`/forum/thread/${data.threadId}` as any);
  return;
}
```

(match the surrounding handler's exact navigation idiom — if it uses a different router accessor or a `handled = true` pattern, follow it). Include the touched file in this task's commit pathspec.

- [ ] **Step 4: Run the jest suite for the assembler to catch regressions**

Run: `cd apps/expo && npx jest --watchAll=false lib/__tests__/feed-assembler-forum.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit + push**

```bash
git add apps/expo/components/feed/FeedList.tsx apps/expo/components/feed/FeedHome.tsx <notification-tap-handler-file>
git commit -m "feat(expo): forum threads + category rail on the Umfragen feed, push deep-link"
git push
```

---

### Task 10: End-to-end verification on simulator

**Files:** none (verification only; fix-forward commits allowed with pathspecs).

- [ ] **Step 1: Launch**

Run: `cd apps/expo && pnpm start` and open the dev client on the iOS simulator (or Android emulator — whichever dev client is installed; ask Max if neither boots).

- [ ] **Step 2: Walk the feature as a citizen**

1. Umfragen tab: category rail renders (`Alle · Verkehr · Bildung · Haushalt · Ortsentwicklung · + Neues Thema`).
2. `+ Neues Thema` → create a thread with title "Testthema Radweg", a body, category Verkehr. Expect: redirect to the thread detail.
3. Back to Umfragen: the thread card appears in the feed (label DISKUSSION, category chip, author display name — no raw `0x`).
4. Chip "Verkehr" → filtered list shows the thread; chip "Bildung" → empty state.
5. Open the thread, send a reply. Expect: reply appears, reply count increments (pull to refresh).

- [ ] **Step 3: Verify the dual-write and notification rows**

Call `mcp__supabase__execute_sql`:
```sql
SELECT source_type, status, event_id IS NOT NULL AS has_event
  FROM public.nostr_publications
 WHERE source_type IN ('forum_thread','forum_reply')
 ORDER BY updated_at DESC LIMIT 5;
SELECT type, title, body, metadata->>'thread_id' AS thread_id
  FROM public.notifications WHERE type = 'forum_reply'
 ORDER BY created_at DESC LIMIT 3;
```
Expected: ledger rows exist. `status = 'published'` with an event id when the device's citizen key is allow-listed; `pending`/`rejected` is the documented not-yet-allow-listed state, not a bug (note which it was). A `forum_reply` notification row exists iff the reply author ≠ thread author (replying to your own test thread correctly produces none — if so, note that instead of a false failure).

- [ ] **Step 4: Verify the events on the relay (only if step 3 showed `published`)**

In the app: Einstellungen → Nostr screen uses `readFromRelay`; alternatively run a one-off node script against `wss://relay.roebel.app` querying `{ kinds: [11], authors: [<pubkey_hex from the ledger>], limit: 5 }` and confirm the kind-11 event carries the `title` tag and `["t","verkehr"]`.

- [ ] **Step 5: Report**

Report verification results honestly (per superpowers:verification-before-completion): what was exercised, what passed, exact failures if any. Then hand back for review — merging `feat/umfragen-forum` into `feat/sdk56-upgrade` is Max's call (superpowers:finishing-a-development-branch).

---

## Out of scope (do NOT build in this slice)

- Publisher mappers / backfeed / indexer kinds (slice B — two-repo divergence check first).
- Publishing kind-32107 category events (needs the town identity; ships with slice B's server rail).
- Promotion ladder, Meinungsbild, co-signing, "Zum Vorschlag entwickeln" (v2).
- Nested-reply UI (schema + event builder support it; UI stays flat).
- Report/hide affordance on forum content (fast-follow; the moderation columns exist, author delete ships in this slice — spec §8 amended accordingly).
- Likes/media/stickers on threads or replies; category subscriptions; admin category UI.
