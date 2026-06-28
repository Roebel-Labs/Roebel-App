# Comment Likes, Replies, Edit Polish & Notification Name Fix (apps/expo)

**Date:** 2026-06-28
**Scope:** apps/expo (mobile) + Supabase backend
**Status:** Approved — ready for implementation

## Problem

The Expo feed has flat post comments with no way to like or reply to a
comment. Push notifications for likes/comments resolve an actor name from
`account.name → display_name → username`, but some legacy rows store the
owner **wallet address** in those fields, so push titles can read `0x1234…`
instead of a real name. The messaging layer already guards against this with
`safeDisplayName()` (`apps/expo/lib/supabase-messages.ts:65`), but the
notification DB triggers do not.

## Goals

1. **Like a comment** — heart toggle + count, mirroring post likes.
2. **Reply to a comment** — single-level (Instagram/YouTube style) threads.
3. **Fix push notifications** — never show a wallet address; always the
   Supabase username/display name (or `Jemand`).
4. **Reply notifications** — a reply notifies only the parent comment's author
   and everyone who already replied to that comment (minus the replier). The
   post author is **not** notified for a reply.
5. **Comment-like notifications** — notify the comment author (unless self).
6. **Edit polish** — editing own comments/posts already works; add a
   `(bearbeitet)` marker.
7. **Auto-expanding comment input** — grow to a max height, then scroll.

## Non-goals

- Deep/unlimited reply nesting (explicitly single-level).
- New notification preference columns (reuse `likes_enabled` /
  `comments_enabled`).
- Reworking the existing edit flows themselves (they work).

## Design

### 1. Database — migration `apps/expo/supabase/migrations/comment_interactions.sql`

**New table `public.post_comment_likes`** — mirrors `post_likes`:
`id uuid pk`, `comment_id uuid NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE`,
`wallet_address text NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE`,
`created_at timestamptz NOT NULL DEFAULT now()`, `UNIQUE(comment_id, wallet_address)`,
indexes on `comment_id` and `wallet_address`, permissive RLS matching `post_likes`.

**`post_comments` additions:**
- `parent_comment_id uuid NULL REFERENCES post_comments(id) ON DELETE CASCADE`
  — a reply points at its **top-level** comment. Depth is capped at 1: replying
  to a reply resolves to that reply's top-level ancestor (enforced in lib/UI).
  Index on `parent_comment_id`.
- `likes_count int NOT NULL DEFAULT 0` — maintained by trigger on
  `post_comment_likes` (AFTER INSERT/DELETE).
- `reply_count int NOT NULL DEFAULT 0` — maintained by trigger on
  `post_comments` (AFTER INSERT/DELETE where `parent_comment_id IS NOT NULL`,
  incrementing the parent). Counts via trigger rather than client increments to
  avoid the count-drift class of bug.
- `edited_at timestamptz NULL`.

**`posts` addition:** `edited_at timestamptz NULL`.

**Wallet-safe name helper** — `public.safe_actor_name(p_account_id uuid, p_wallet text) RETURNS text`:
returns the first non-empty, non-wallet-shaped (`!~* '^0x[0-9a-fA-F]{40}$'`)
value among `accounts.name (by id) → users.display_name → users.username (by wallet)`,
else `'Jemand'`. SQL port of `safeDisplayName()`.

**Triggers:**
- Retrofit `notify_post_like` to resolve the liker name via `safe_actor_name`.
- Rewrite `notify_post_comment` to branch on `parent_comment_id`:
  - **NULL (top-level):** insert a `post_comment` notification to the **post
    author** (current behavior), name via `safe_actor_name`. Skip self.
  - **NOT NULL (reply):** insert `post_reply` notifications to the set
    `{parent comment author} ∪ {distinct authors of all replies to the parent}`
    minus the replier (deduped). Body = excerpt or
    `hat auf deinen Kommentar geantwortet`. **Post author not notified.**
- New `notify_post_comment_like` — AFTER INSERT on `post_comment_likes`:
  insert a `comment_like` notification to the comment author unless self-like.
- Extend the push hub `notify_user_notification_push` allowlist with
  `post_reply` and `comment_like`; deep-link payload carries `postId` +
  `comment_id`.
- Preference gating: `post_comment`/`post_reply` → `comments_enabled`;
  `comment_like` → `likes_enabled`.

### 2. Lib — `apps/expo/lib/supabase-posts.ts` + `lib/types/feed.ts`

`PostCommentRecord` gains: `parent_comment_id: string | null`,
`likes_count: number`, `reply_count: number`, `liked_by_me?: boolean`,
`edited_at: string | null`, `replies?: PostCommentRecord[]`.

New functions (mirroring the post-like helpers):
- `toggleCommentLike(commentId, walletAddress): Promise<boolean>`
- `getUserLikedCommentIds(commentIds, walletAddress): Promise<Set<string>>`
- `fetchCommentReplies(parentCommentId, walletAddress?): Promise<PostCommentRecord[]>`

Changes:
- `fetchPostComments` → filter `parent_comment_id IS NULL` (top-level only),
  select `likes_count`/`reply_count`/`edited_at`, hydrate `liked_by_me` for the
  viewer.
- `CreateCommentInput`/`createComment` → accept optional `parent_comment_id`.
- `updateComment` / `updatePost` → set `edited_at = now()`.

### 3. UI — `apps/expo`

- **`components/feed/CommentItem.tsx`**: heart button + count (optimistic
  toggle via `toggleCommentLike`), an "Antworten" button, a `(bearbeitet)`
  marker when `edited_at` is set, and an "Antworten anzeigen (N)" expander that
  lazy-loads replies via `fetchCommentReplies` and renders them in a compact,
  left-inset variant (smaller avatar). A reply's "Antworten" targets the
  top-level ancestor.
- **`components/feed/CommentInput.tsx`**: remove `numberOfLines={1}`; track
  `onContentSizeChange` to grow from ~38px to `maxHeight: 120`, then
  `scrollEnabled`. Show an "Antwort an {Name}" context chip (with cancel) in
  reply mode.
- **`app/post/[id].tsx`**: `replyingTo` state, hydrate comment like state on
  load, insert new replies into the correct thread and bump `reply_count`,
  manage optimistic comment-like toggles.

### 4. Reply notification recipients (precise)

For a reply `R` to top-level comment `C`:
`recipients = ({C.author} ∪ {authors of all replies to C}) − {R.author}`, deduped.
Each notification: title = `safe_actor_name(R)`, type `post_reply`.

## Deployment

The SQL migration must be applied to the live Supabase project
(`wwbeqhkslxdxhktqzqti`) — a code deploy does not run it. Per CLAUDE.md this
goes through the Supabase MCP (apply once OAuth-authenticated via
`claude /mcp`), or is handed to the maintainer to run. Lib + UI ship through
the normal Expo build.

## Verification

Manual / build (repo has ~431 pre-existing tsc errors; skip full `pnpm tsc`
per `feedback_skip_typecheck`):
- Like/unlike a comment updates heart + count; persists across reload.
- Reply creates a single-level threaded reply under the top comment; replying
  to a reply still attaches to the top comment.
- Notifications: top-level comment → post author; reply → comment author + prior
  repliers, **not** the post author; comment like → comment author; never to
  self.
- A user whose username/display_name is a wallet address shows `Jemand` in the
  push title, never `0x…`.
- `(bearbeitet)` appears after editing a comment or post.
- Long comment text grows the input to max height, then scrolls.
