# Umfragen-Forum A2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reddit-grade interactions on the shipped forum: FAB morph ("Thema starten"), up/downvotes (Supabase-first + NIP-25 mirror), share, `CommentInput` reuse with single-level nested replies, options sheets (share/copy/report/edit/delete/subscribe), and the author-centric + opt-in notification model.

**Architecture:** Extends slice A in place. Votes: `forum_votes` + denormalized counters via trigger, optimistic UI, best-effort kind-7 mirror per the like/unlike idiom. Notifications: rewritten reply fanout (author ∪ parent author ∪ subscribers − actor) + new anonymous-in-app `forum_vote` type. Edit: Supabase-only + `edited_at` (posts precedent — relay keeps the original event).

**Tech Stack:** as slice A (Expo SDK 56, TanStack Query, Supabase MCP, `@netizen-labs/nostr`), plus expo-clipboard (already installed), RN `Share`, reanimated (FAB morph).

**Spec:** `docs/superpowers/specs/2026-08-29-umfragen-forum-design.md` — §"Slice A2" (A2.1–A2.6) is the binding text for this plan.

## Global Constraints

- Branch: continue on `feat/umfragen-forum` in the existing worktree (`.claude/worktrees/umfragen-forum`). Pathspec-only commits; push after every commit.
- Supabase via MCP only; before ANY write call `mcp__supabase__get_project_url` and require ref `wwbeqhkslxdxhktqzqti`. Applied migration names are permanent.
- German UI, English identifiers. Votes UI shows aggregates only — no voter names anywhere in-app; the `forum_vote` notification names no actor and carries no actor in metadata.
- Icons from `assets/icons` (`circle-arrow-up-02.svg`, `circle-arrow-down-02.svg`, `share-02.svg`, `comment-02.svg`); Ionicons only inside drawers (PostOptionsDrawer precedent). Styling: StyleSheet + `useTheme()` + `fontFamily` tokens.
- Active vote tints: up = `colors.primary`, down = `colors.error`; inactive = `colors.textSecondary`.
- Do NOT run per-file `npx tsc --noEmit <file>` as evidence (TS6 TS5112 false-pass); type-verify via the jest runs and, where a task says so, a scoped tsconfig or full-project tsc.
- Nostr mirrors stay best-effort (`void`, never awaited in UI paths); org-account content never mirrors under a personal key (`isOrgAccount` fail-closed idiom).
- Do NOT touch `packages/publisher`, `packages/protocol`, the manifest, or `mirrorPostToNostr`.

---

### Task 1: Migration A2 — votes, subscriptions, reports, edited_at, notification triggers

**Files:**
- Create: `supabase/migrations/20260830_forum_a2_votes_subscriptions.sql`

**Interfaces:**
- Consumes: slice-A tables; `notifications(recipient_wallet, type, title, body, metadata)` hub.
- Produces (Tasks 3–7 rely on): `forum_votes(target_type, target_id, wallet_address, value, …)` with toggle-friendly UNIQUE; `upvotes_count`/`downvotes_count`/`edited_at` columns on `forum_threads` + `forum_replies`; `forum_thread_subscriptions(thread_id, wallet_address)`; `forum_reports(target_type, target_id, reporter_wallet, reason)`; notification types `forum_reply` (fanout) and `forum_vote` (metadata: `thread_id`, `target_type`, `target_id` — deliberately NO actor).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260830_forum_a2_votes_subscriptions.sql`:

```sql
-- Umfragen-Forum slice A2 (spec §A2.2/A2.5/A2.6):
-- votes with denormalized counters, per-thread subscriptions, reports,
-- edited_at, upvote notifications (anonymous in-app), reply-notification fanout.

-- ── Votes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.forum_votes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type    text NOT NULL CHECK (target_type IN ('thread','reply')),
  target_id      uuid NOT NULL,
  wallet_address text NOT NULL REFERENCES public.users(wallet_address),
  value          smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, wallet_address)
);
CREATE INDEX IF NOT EXISTS forum_votes_target_idx ON public.forum_votes (target_type, target_id);

ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS upvotes_count   integer NOT NULL DEFAULT 0;
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS downvotes_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.forum_threads ADD COLUMN IF NOT EXISTS edited_at       timestamptz;
ALTER TABLE public.forum_replies ADD COLUMN IF NOT EXISTS upvotes_count   integer NOT NULL DEFAULT 0;
ALTER TABLE public.forum_replies ADD COLUMN IF NOT EXISTS downvotes_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.forum_replies ADD COLUMN IF NOT EXISTS edited_at       timestamptz;

CREATE OR REPLACE FUNCTION public.forum_votes_apply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d_up int := 0; d_down int := 0; v_type text; v_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_type := NEW.target_type; v_id := NEW.target_id;
    IF NEW.value = 1 THEN d_up := 1; ELSE d_down := 1; END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_type := OLD.target_type; v_id := OLD.target_id;
    IF OLD.value = 1 THEN d_up := -1; ELSE d_down := -1; END IF;
  ELSE
    IF OLD.value = NEW.value THEN RETURN NEW; END IF;
    v_type := NEW.target_type; v_id := NEW.target_id;
    IF NEW.value = 1 THEN d_up := 1; d_down := -1; ELSE d_up := -1; d_down := 1; END IF;
  END IF;
  IF v_type = 'thread' THEN
    UPDATE public.forum_threads
       SET upvotes_count = GREATEST(0, upvotes_count + d_up),
           downvotes_count = GREATEST(0, downvotes_count + d_down)
     WHERE id = v_id;
  ELSE
    UPDATE public.forum_replies
       SET upvotes_count = GREATEST(0, upvotes_count + d_up),
           downvotes_count = GREATEST(0, downvotes_count + d_down)
     WHERE id = v_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_forum_votes_apply ON public.forum_votes;
CREATE TRIGGER trg_forum_votes_apply
  AFTER INSERT OR UPDATE OF value OR DELETE ON public.forum_votes
  FOR EACH ROW EXECUTE FUNCTION public.forum_votes_apply();

-- ── Subscriptions + reports ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.forum_thread_subscriptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id      uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  wallet_address text NOT NULL REFERENCES public.users(wallet_address),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, wallet_address)
);

CREATE TABLE IF NOT EXISTS public.forum_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type     text NOT NULL CHECK (target_type IN ('thread','reply')),
  target_id       uuid NOT NULL,
  reporter_wallet text NOT NULL,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, reporter_wallet)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.forum_votes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_thread_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_reports              ENABLE ROW LEVEL SECURITY;

-- Votes/subscriptions follow the poll_votes idiom (anon-key model: API-readable,
-- UI shows aggregates only — documented in spec §A2.2). Reports are write-only.
CREATE POLICY forum_votes_select ON public.forum_votes FOR SELECT USING (true);
CREATE POLICY forum_votes_insert ON public.forum_votes FOR INSERT WITH CHECK (true);
CREATE POLICY forum_votes_update ON public.forum_votes FOR UPDATE USING (true);
CREATE POLICY forum_votes_delete ON public.forum_votes FOR DELETE USING (true);
CREATE POLICY forum_thread_subscriptions_select ON public.forum_thread_subscriptions FOR SELECT USING (true);
CREATE POLICY forum_thread_subscriptions_insert ON public.forum_thread_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY forum_thread_subscriptions_delete ON public.forum_thread_subscriptions FOR DELETE USING (true);
CREATE POLICY forum_reports_insert ON public.forum_reports FOR INSERT WITH CHECK (true);

-- Author edits (spec §A2.5): slice A locked all updates behind RPCs; edits need
-- a direct UPDATE path. Published-only on both sides so soft-deleted content
-- stays frozen (the delete RPCs are SECURITY DEFINER and bypass RLS anyway).
CREATE POLICY forum_threads_update ON public.forum_threads FOR UPDATE
  USING (status = 'published') WITH CHECK (status = 'published');
CREATE POLICY forum_replies_update ON public.forum_replies FOR UPDATE
  USING (status = 'published') WITH CHECK (status = 'published');

-- ── Upvote notification — anonymous in-app (spec §A2.6) ────────────────────
CREATE OR REPLACE FUNCTION public.notify_forum_upvote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner text; v_thread_id uuid; v_body text;
BEGIN
  IF NEW.value <> 1 THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.value = 1 THEN RETURN NEW; END IF;
  IF NEW.target_type = 'thread' THEN
    SELECT lower(wallet_address), id INTO v_owner, v_thread_id
      FROM public.forum_threads WHERE id = NEW.target_id;
    v_body := 'Jemand hat dein Thema hochgewählt';
  ELSE
    SELECT lower(wallet_address), thread_id INTO v_owner, v_thread_id
      FROM public.forum_replies WHERE id = NEW.target_id;
    v_body := 'Jemand hat deine Antwort hochgewählt';
  END IF;
  IF v_owner IS NULL OR v_owner = lower(NEW.wallet_address) THEN RETURN NEW; END IF;
  -- Deliberately no actor name/wallet: votes stay aggregate-anonymous in-app.
  INSERT INTO public.notifications (recipient_wallet, type, title, body, metadata)
  VALUES (v_owner, 'forum_vote', 'Neue Zustimmung', v_body,
    jsonb_build_object('thread_id', v_thread_id, 'target_type', NEW.target_type, 'target_id', NEW.target_id));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_forum_upvote ON public.forum_votes;
CREATE TRIGGER trg_notify_forum_upvote
  AFTER INSERT OR UPDATE OF value ON public.forum_votes
  FOR EACH ROW EXECUTE FUNCTION public.notify_forum_upvote();

-- ── Reply-notification fanout (spec §A2.6) ─────────────────────────────────
-- Recipients: thread author ∪ parent-reply author ∪ subscribers, minus actor.
CREATE OR REPLACE FUNCTION public.notify_forum_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_thread_author text; v_parent_wallet text; v_replier_name text;
  v_body text; v_recipient text;
BEGIN
  SELECT lower(t.wallet_address) INTO v_thread_author
    FROM public.forum_threads t WHERE t.id = NEW.thread_id;
  IF v_thread_author IS NULL THEN RETURN NEW; END IF;

  IF NEW.parent_reply_id IS NOT NULL THEN
    SELECT lower(wallet_address) INTO v_parent_wallet
      FROM public.forum_replies WHERE id = NEW.parent_reply_id;
  END IF;

  v_replier_name := COALESCE(
    (SELECT NULLIF(btrim(a.name), '') FROM public.accounts a WHERE a.id = NEW.account_id),
    (SELECT NULLIF(btrim(u.display_name), '') FROM public.users u WHERE lower(u.wallet_address) = lower(NEW.wallet_address)),
    (SELECT NULLIF(btrim(u.username), '')     FROM public.users u WHERE lower(u.wallet_address) = lower(NEW.wallet_address))
  );

  v_body := NULLIF(btrim(NEW.body), '');
  IF v_body IS NULL THEN v_body := 'hat auf ein Thema geantwortet';
  ELSIF length(v_body) > 140 THEN v_body := left(v_body, 140) || '…';
  END IF;

  FOR v_recipient IN
    SELECT DISTINCT r.wallet FROM (
      SELECT v_thread_author AS wallet
      UNION SELECT v_parent_wallet
      UNION SELECT lower(s.wallet_address) FROM public.forum_thread_subscriptions s WHERE s.thread_id = NEW.thread_id
    ) r
    WHERE r.wallet IS NOT NULL AND r.wallet <> lower(NEW.wallet_address)
  LOOP
    INSERT INTO public.notifications (recipient_wallet, type, title, body, metadata)
    VALUES (v_recipient, 'forum_reply', COALESCE(v_replier_name, 'Jemand'), v_body,
      jsonb_build_object('thread_id', NEW.thread_id, 'reply_id', NEW.id, 'actor_wallet', lower(NEW.wallet_address)));
  END LOOP;
  RETURN NEW;
END; $$;
-- trg_notify_forum_reply (from 20260829_forum_tables.sql) keeps firing this
-- CREATE OR REPLACE'd body — the trigger itself needs no change.
```

- [ ] **Step 2: Verify MCP target** — `mcp__supabase__get_project_url` must show `wwbeqhkslxdxhktqzqti`; STOP otherwise.

- [ ] **Step 3: Apply** via `mcp__supabase__apply_migration` (name `forum_a2_votes_subscriptions`).

- [ ] **Step 4: Verify** via `mcp__supabase__execute_sql` — paste outputs into your report:

```sql
SELECT relname, relrowsecurity FROM pg_class
 WHERE relname IN ('forum_votes','forum_thread_subscriptions','forum_reports');
SELECT column_name FROM information_schema.columns
 WHERE table_name='forum_threads' AND column_name IN ('upvotes_count','downvotes_count','edited_at');
SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_forum_votes_apply','trg_notify_forum_upvote','trg_notify_forum_reply');
SELECT prosrc LIKE '%forum_thread_subscriptions%' AS has_fanout FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='notify_forum_reply';
SELECT polname FROM pg_policy WHERE polname IN ('forum_threads_update','forum_replies_update');
```

Expected: RLS true ×3; 3 columns; 3 triggers; `has_fanout = true`; both update policies present.

- [ ] **Step 5: Commit + push**

```bash
git add supabase/migrations/20260830_forum_a2_votes_subscriptions.sql
git commit -m "feat(supabase): forum votes + counters, thread subscriptions, reports, reply fanout, anonymous upvote notifications"
git push
```

---

### Task 2: Push hub gains `forum_vote`

**Files:**
- Create: `supabase/migrations/20260830_forum_vote_push.sql`

Same procedure as the slice-A push-hub task — the live body is authoritative:

- [ ] **Step 1:** Read the live `prosrc` of `public.notify_user_notification_push` via `mcp__supabase__execute_sql` (`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='notify_user_notification_push';`).
- [ ] **Step 2:** Write the migration as EXACTLY that body with two edits: `'forum_vote'` added to the type whitelist, and a branch beside the existing `forum_reply` one:

```sql
  ELSIF NEW.type = 'forum_vote' THEN
    v_data := jsonb_build_object('type', 'forum_thread', 'threadId', NEW.metadata->>'thread_id');
```

(The existing `forum_reply` branch produces the same payload shape, so both deep-link identically; keep them as separate branches for clarity.) Nothing else changes.
- [ ] **Step 3:** Verify project ref, apply via `mcp__supabase__apply_migration` (name `forum_vote_push`), then verify `prosrc LIKE '%forum_vote%'` → true. Paste outputs.
- [ ] **Step 4: Commit + push**

```bash
git add supabase/migrations/20260830_forum_vote_push.sql
git commit -m "feat(supabase): forward forum_vote notifications through the push hub"
git push
```

---

### Task 3: Vote mirror + data layer A2 (TDD on the transition helper)

**Files:**
- Modify: `apps/expo/lib/nostr/publish.ts`
- Modify: `apps/expo/lib/types/feed.ts`
- Modify: `apps/expo/lib/supabase-forum.ts`
- Create: `apps/expo/lib/__tests__/forum-vote-transition.test.ts`

**Interfaces:**
- Consumes: `publishedEventOf` (private, in publish.ts), `buildEvent`, `buildDeletionEvent`, ledger idiom of `publishLike`/`publishUnlike`; Task 1 tables.
- Produces (Tasks 4–7 rely on):
  - `decideVoteTransition(current: 1 | -1 | null, tapped: 1 | -1): { action: 'insert' | 'delete' | 'flip'; value?: 1 | -1 }` (exported from `lib/supabase-forum.ts`)
  - `castForumVote(targetType: 'thread' | 'reply', targetId: string, walletAddress: string, tapped: 1 | -1, current: 1 | -1 | null): Promise<1 | -1 | null>` (returns the new vote state)
  - `fetchMyForumVotes(walletAddress: string, targets: Array<{ type: 'thread' | 'reply'; id: string }>): Promise<Map<string, 1 | -1>>` (key = `` `${type}:${id}` ``)
  - `updateForumThread(id: string, walletAddress: string, updates: { title?: string; body?: string; category_slug?: string | null }): Promise<ForumThreadRecord | null>`
  - `updateForumReply(id: string, walletAddress: string, body: string): Promise<ForumReplyRecord | null>`
  - `fetchThreadSubscription(threadId: string, walletAddress: string): Promise<boolean>`, `toggleThreadSubscription(threadId: string, walletAddress: string, subscribe: boolean): Promise<void>`
  - `reportForumContent(targetType: 'thread' | 'reply', targetId: string, reporterWallet: string, reason?: string): Promise<void>`
  - publish.ts: `publishForumVote(targetType, targetId, value: 1 | -1)`, `publishForumUnvote(targetType, targetId)`
  - Types: `upvotes_count: number; downvotes_count: number; edited_at: string | null;` added to `ForumThreadRecord` AND `ForumReplyRecord`.

- [ ] **Step 1: Write the failing test**

Create `apps/expo/lib/__tests__/forum-vote-transition.test.ts`:

```ts
import { decideVoteTransition } from '../supabase-forum';

describe('decideVoteTransition', () => {
  it('inserts on first tap', () => {
    expect(decideVoteTransition(null, 1)).toEqual({ action: 'insert', value: 1 });
    expect(decideVoteTransition(null, -1)).toEqual({ action: 'insert', value: -1 });
  });
  it('removes when tapping the active arrow again', () => {
    expect(decideVoteTransition(1, 1)).toEqual({ action: 'delete' });
    expect(decideVoteTransition(-1, -1)).toEqual({ action: 'delete' });
  });
  it('flips when tapping the opposite arrow', () => {
    expect(decideVoteTransition(1, -1)).toEqual({ action: 'flip', value: -1 });
    expect(decideVoteTransition(-1, 1)).toEqual({ action: 'flip', value: 1 });
  });
});
```

- [ ] **Step 2:** Run `cd apps/expo && npx jest --watchAll=false lib/__tests__/forum-vote-transition.test.ts` — expect FAIL (export missing).

- [ ] **Step 3: Implement**

Types (`apps/expo/lib/types/feed.ts`): add to `ForumThreadRecord` and `ForumReplyRecord`:

```ts
  upvotes_count: number;
  downvotes_count: number;
  edited_at: string | null;
```

publish.ts — after `publishForumReply`, following the `publishLike`/`publishUnlike` idiom exactly (ledger key scoped by voter pubkey; kind-5 retraction advisory):

```ts
/**
 * Mirror a forum vote as a NIP-25 reaction ('+' / '-') on the target's mirrored
 * event. Public and attributable by design (spec §A2.2): the relay is the
 * operator-independent audit trail; the app UI shows aggregates only.
 */
export async function publishForumVote(
  targetType: 'thread' | 'reply',
  targetId: string,
  value: 1 | -1,
): Promise<PublicationStatus> {
  const identity = await loadStoredIdentity();
  if (!identity) return 'pending';
  const target = await publishedEventOf(
    targetType === 'thread' ? 'forum_thread' : 'forum_reply',
    targetId,
  );
  if (!target) return 'pending';
  const event = buildEvent(identity.secretKey, 7, value === 1 ? '+' : '-', {
    tags: [['e', target.eventId], ['p', target.pubkey]],
  });
  return publish(event, 'forum_vote', `${targetType}:${targetId}:${identity.publicKey.slice(0, 16)}`);
}

/** Retract a mirrored vote (NIP-09; advisory like publishUnlike). */
export async function publishForumUnvote(
  targetType: 'thread' | 'reply',
  targetId: string,
): Promise<void> {
  const identity = await loadStoredIdentity();
  if (!identity) return;
  const voteEventId = await publishedEventIdOf(
    'forum_vote',
    `${targetType}:${targetId}:${identity.publicKey.slice(0, 16)}`,
  );
  if (!voteEventId) return;
  try {
    await relay().publish(
      buildDeletionEvent(identity.secretKey, [voteEventId], { reason: 'Stimme zurückgenommen' }),
    );
  } catch {
    // Advisory anyway; the app state is authoritative for the UI.
  }
}
```

supabase-forum.ts — append:

```ts
// ─── Votes (spec §A2.2) ─────────────────────────────────────

export type ForumVoteTarget = 'thread' | 'reply';

export function decideVoteTransition(
  current: 1 | -1 | null,
  tapped: 1 | -1,
): { action: 'insert' | 'delete' | 'flip'; value?: 1 | -1 } {
  if (current === tapped) return { action: 'delete' };
  if (current === null) return { action: 'insert', value: tapped };
  return { action: 'flip', value: tapped };
}

/** Apply a vote tap. Returns the new vote state for optimistic UI. */
export async function castForumVote(
  targetType: ForumVoteTarget,
  targetId: string,
  walletAddress: string,
  tapped: 1 | -1,
  current: 1 | -1 | null,
): Promise<1 | -1 | null> {
  const t = decideVoteTransition(current, tapped);
  if (t.action === 'delete') {
    const { error } = await supabase
      .from('forum_votes')
      .delete()
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .eq('wallet_address', walletAddress);
    if (error) throw error;
    void mirrorUnvote(targetType, targetId);
    return null;
  }
  const { error } = await supabase.from('forum_votes').upsert(
    {
      target_type: targetType,
      target_id: targetId,
      wallet_address: walletAddress,
      value: t.value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'target_type,target_id,wallet_address' },
  );
  if (error) throw error;
  void mirrorVote(targetType, targetId, t.value!, t.action === 'flip');
  return t.value!;
}

async function mirrorVote(
  targetType: ForumVoteTarget,
  targetId: string,
  value: 1 | -1,
  isFlip: boolean,
): Promise<void> {
  try {
    const { publishForumVote, publishForumUnvote } = await import('./nostr/publish');
    if (isFlip) await publishForumUnvote(targetType, targetId);
    await publishForumVote(targetType, targetId, value);
  } catch (err) {
    console.warn('[nostr] forum vote mirror skipped', (err as Error)?.message);
  }
}

async function mirrorUnvote(targetType: ForumVoteTarget, targetId: string): Promise<void> {
  try {
    const { publishForumUnvote } = await import('./nostr/publish');
    await publishForumUnvote(targetType, targetId);
  } catch (err) {
    console.warn('[nostr] forum unvote mirror skipped', (err as Error)?.message);
  }
}

/** The viewer's own votes for a batch of targets, keyed `${type}:${id}`. */
export async function fetchMyForumVotes(
  walletAddress: string,
  targets: Array<{ type: ForumVoteTarget; id: string }>,
): Promise<Map<string, 1 | -1>> {
  const map = new Map<string, 1 | -1>();
  if (!walletAddress || targets.length === 0) return map;
  const ids = [...new Set(targets.map((t) => t.id))];
  const { data, error } = await supabase
    .from('forum_votes')
    .select('target_type, target_id, value')
    .eq('wallet_address', walletAddress)
    .in('target_id', ids);
  if (error) {
    console.error('Error fetching own forum votes:', error);
    return map;
  }
  for (const row of (data ?? []) as Array<{ target_type: string; target_id: string; value: number }>) {
    map.set(`${row.target_type}:${row.target_id}`, row.value === 1 ? 1 : -1);
  }
  return map;
}

// ─── Edit (posts precedent: Supabase-only, relay keeps the original) ────────

export async function updateForumThread(
  id: string,
  walletAddress: string,
  updates: { title?: string; body?: string; category_slug?: string | null },
): Promise<ForumThreadRecord | null> {
  const { data, error } = await supabase
    .from('forum_threads')
    .update({ ...updates, edited_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('wallet_address', walletAddress)
    .select(THREAD_SELECT)
    .single();
  if (error) {
    console.error('Error updating forum thread:', error);
    return null;
  }
  return mergeAccountIntoAuthor(data as unknown as ForumThreadRecord);
}

export async function updateForumReply(
  id: string,
  walletAddress: string,
  body: string,
): Promise<ForumReplyRecord | null> {
  const { data, error } = await supabase
    .from('forum_replies')
    .update({ body: body.trim(), edited_at: new Date().toISOString() })
    .eq('id', id)
    .eq('wallet_address', walletAddress)
    .select(REPLY_SELECT)
    .single();
  if (error) {
    console.error('Error updating forum reply:', error);
    return null;
  }
  return mergeAccountIntoAuthor(data as unknown as ForumReplyRecord);
}

// ─── Subscriptions + reports (spec §A2.5/A2.6) ─────────────────────────────

export async function fetchThreadSubscription(
  threadId: string,
  walletAddress: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('forum_thread_subscriptions')
    .select('id')
    .eq('thread_id', threadId)
    .eq('wallet_address', walletAddress)
    .maybeSingle();
  return !!data;
}

export async function toggleThreadSubscription(
  threadId: string,
  walletAddress: string,
  subscribe: boolean,
): Promise<void> {
  if (subscribe) {
    const { error } = await supabase
      .from('forum_thread_subscriptions')
      .upsert(
        { thread_id: threadId, wallet_address: walletAddress },
        { onConflict: 'thread_id,wallet_address' },
      );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('forum_thread_subscriptions')
      .delete()
      .eq('thread_id', threadId)
      .eq('wallet_address', walletAddress);
    if (error) throw error;
  }
}

export async function reportForumContent(
  targetType: ForumVoteTarget,
  targetId: string,
  reporterWallet: string,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.from('forum_reports').insert({
    target_type: targetType,
    target_id: targetId,
    reporter_wallet: reporterWallet,
    reason: reason || null,
  });
  // Unique-reporter constraint: a duplicate report is a no-op, not an error worth surfacing.
  if (error && !`${error.message}`.includes('duplicate')) throw error;
}
```

Note: the UPDATE policies these edit functions rely on (`forum_threads_update`/`forum_replies_update`) ship in Task 1's migration — nothing to do here.

- [ ] **Step 4:** Run the jest test → PASS; then run the full forum jest set: `npx jest --watchAll=false lib/__tests__/forum-vote-transition.test.ts lib/__tests__/feed-assembler-forum.test.ts` → all green.

- [ ] **Step 5: Commit + push**

```bash
git add apps/expo/lib/nostr/publish.ts apps/expo/lib/types/feed.ts apps/expo/lib/supabase-forum.ts apps/expo/lib/__tests__/forum-vote-transition.test.ts
git commit -m "feat(expo): forum votes with NIP-25 mirror, edits, subscriptions, reports — data layer"
git push
```

---

### Task 4: ForumVoteCluster + share helper + useForumVotes hook + card action row

**Files:**
- Create: `apps/expo/components/forum/ForumVoteCluster.tsx`
- Create: `apps/expo/lib/forum-share.ts`
- Create: `apps/expo/hooks/useForumVotes.ts`
- Modify: `apps/expo/components/forum/ForumThreadCard.tsx`

**Interfaces:**
- Consumes: Task 3 (`castForumVote`, `fetchMyForumVotes`, `decideVoteTransition` semantics), icons, `useUser`.
- Produces (Tasks 6–7 rely on):
  - `<ForumVoteCluster targetType targetId upvotes downvotes myVote onVoted(next, deltaUp, deltaDown)? compact? />` — self-contained tap handling (calls `castForumVote` with optimistic local state; disabled when no wallet).
  - `shareForumThread(title: string, threadId: string): Promise<void>` and `shareForumReply(body: string, threadId: string): Promise<void>` in `lib/forum-share.ts` (RN `Share.share`, text = title/excerpt + `roebel://forum/thread/<id>`; mirror the `sharePost` idiom at `apps/expo/hooks/usePostActions.ts:254`).
  - `useForumVotes(targets: Array<{type:'thread'|'reply'; id:string}>)` → `{ myVote(type,id): 1|-1|null, setLocal(type,id,v): void }` backed by one `useQuery(['forum','myvotes', walletAddress, hash-of-ids])` + local optimistic overlay.

- [ ] **Step 1: ForumVoteCluster**

```tsx
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { useUser } from '@/context/UserContext';
import ArrowUpIcon from '@/assets/icons/circle-arrow-up-02.svg';
import ArrowDownIcon from '@/assets/icons/circle-arrow-down-02.svg';
import { castForumVote, type ForumVoteTarget } from '@/lib/supabase-forum';

type Props = {
  targetType: ForumVoteTarget;
  targetId: string;
  upvotes: number;
  downvotes: number;
  /** The viewer's current vote, from useForumVotes hydration. */
  myVote: 1 | -1 | null;
  /** Notifies the parent so hydration caches stay in sync. */
  onVoted?: (next: 1 | -1 | null) => void;
  compact?: boolean;
};

/**
 * Reddit-style vote cluster: up-arrow · net score · down-arrow. Optimistic —
 * the tap applies locally first; castForumVote reconciles Supabase + the
 * NIP-25 mirror in the background.
 */
export default function ForumVoteCluster({
  targetType,
  targetId,
  upvotes,
  downvotes,
  myVote,
  onVoted,
  compact = false,
}: Props) {
  const { colors } = useTheme();
  const { user, isCitizen } = useUser();
  const [local, setLocal] = useState<{ vote: 1 | -1 | null; dUp: number; dDown: number } | null>(null);

  const vote = local ? local.vote : myVote;
  const score = upvotes + (local?.dUp ?? 0) - (downvotes + (local?.dDown ?? 0));

  const tap = (tapped: 1 | -1) => {
    if (!user?.wallet_address || !isCitizen) return;
    const current = vote;
    const next = current === tapped ? null : tapped;
    const dUp = (next === 1 ? 1 : 0) - (current === 1 ? 1 : 0) + (local?.dUp ?? 0);
    const dDown = (next === -1 ? 1 : 0) - (current === -1 ? 1 : 0) + (local?.dDown ?? 0);
    setLocal({ vote: next, dUp, dDown });
    onVoted?.(next);
    castForumVote(targetType, targetId, user.wallet_address, tapped, current).catch(() => {
      setLocal(null); // reconcile back to server truth on failure
      onVoted?.(myVote);
    });
  };

  const size = compact ? 18 : 22;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => tap(1)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Hochwählen"
        accessibilityState={{ selected: vote === 1 }}
      >
        <ArrowUpIcon width={size} height={size} color={vote === 1 ? colors.primary : colors.textSecondary} />
      </Pressable>
      <Text style={[styles.score, compact && styles.scoreCompact, { color: colors.textSecondary }]}>
        {score}
      </Text>
      <Pressable
        onPress={() => tap(-1)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Runterwählen"
        accessibilityState={{ selected: vote === -1 }}
      >
        <ArrowDownIcon width={size} height={size} color={vote === -1 ? colors.error : colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  score: { fontSize: 13, fontFamily: fontFamily.medium, minWidth: 16, textAlign: 'center' },
  scoreCompact: { fontSize: 12 },
});
```

- [ ] **Step 2: forum-share.ts**

```ts
import { Share } from 'react-native';

/** Deep link into the app; a web URL arrives with the web forum (spec §A2.3). */
const threadLink = (threadId: string) => `roebel://forum/thread/${threadId}`;

export async function shareForumThread(title: string, threadId: string): Promise<void> {
  try {
    await Share.share({ message: `${title}\n\n${threadLink(threadId)}` });
  } catch {
    // User dismissed or share sheet unavailable — nothing to handle.
  }
}

export async function shareForumReply(body: string, threadId: string): Promise<void> {
  const excerpt = body.length > 120 ? `${body.slice(0, 120)}…` : body;
  try {
    await Share.share({ message: `„${excerpt}“\n\n${threadLink(threadId)}` });
  } catch {
    // ditto
  }
}
```

(Before finalizing, read `sharePost` in `apps/expo/hooks/usePostActions.ts:254` — if it uses a different message/url convention, mirror it.)

- [ ] **Step 3: useForumVotes hook**

```ts
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/context/UserContext';
import { fetchMyForumVotes, type ForumVoteTarget } from '@/lib/supabase-forum';

/**
 * Batch-hydrates the viewer's own votes for a set of targets and overlays
 * optimistic local taps (written by ForumVoteCluster via setLocal/onVoted).
 */
export function useForumVotes(targets: Array<{ type: ForumVoteTarget; id: string }>) {
  const { user } = useUser();
  const wallet = user?.wallet_address ?? null;
  const [overlay, setOverlay] = useState<Map<string, 1 | -1 | null>>(new Map());

  const key = useMemo(() => targets.map((t) => `${t.type}:${t.id}`).sort().join(','), [targets]);

  const { data } = useQuery({
    queryKey: ['forum', 'myvotes', wallet, key],
    enabled: !!wallet && targets.length > 0,
    queryFn: () => fetchMyForumVotes(wallet!, targets),
    staleTime: 60_000,
  });

  const myVote = useCallback(
    (type: ForumVoteTarget, id: string): 1 | -1 | null => {
      const k = `${type}:${id}`;
      if (overlay.has(k)) return overlay.get(k) ?? null;
      return data?.get(k) ?? null;
    },
    [overlay, data],
  );

  const setLocal = useCallback((type: ForumVoteTarget, id: string, v: 1 | -1 | null) => {
    setOverlay((prev) => new Map(prev).set(`${type}:${id}`, v));
  }, []);

  return { myVote, setLocal };
}
```

- [ ] **Step 4: ForumThreadCard action row**

Add to `ForumThreadCard.tsx`: new optional prop `myVote?: 1 | -1 | null` and `onVoted?: (next: 1 | -1 | null) => void`; replace the bottom `replies` Text with an action row:

```tsx
      <View style={styles.actions}>
        <ForumVoteCluster
          targetType="thread"
          targetId={thread.id}
          upvotes={thread.upvotes_count ?? 0}
          downvotes={thread.downvotes_count ?? 0}
          myVote={myVote ?? null}
          onVoted={onVoted}
          compact
        />
        <View style={styles.actionItem}>
          <CommentIcon width={18} height={18} color={colors.textSecondary} />
          <Text style={[styles.actionText, { color: colors.textSecondary }]}>{thread.reply_count}</Text>
        </View>
        <Pressable
          onPress={() => void shareForumThread(thread.title, thread.id)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Teilen"
        >
          <ShareIcon width={18} height={18} color={colors.textSecondary} />
        </Pressable>
      </View>
```

with imports `ForumVoteCluster`, `shareForumThread`, `CommentIcon from '@/assets/icons/comment-02.svg'`, `ShareIcon from '@/assets/icons/share-02.svg'`, and styles:

```tsx
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 2 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: 12, fontFamily: fontFamily.regular },
```

Card tap still opens the thread; the cluster/share Pressables sit inside the card's Pressable — that nesting works (inner Pressables win), matching FeedPostCard's action-row pattern. Also render an "· Bearbeitet" suffix next to the category chip when `thread.edited_at` is set:

```tsx
        {thread.edited_at ? (
          <Text style={[styles.categoryText, { color: colors.textTertiary }]}>Bearbeitet</Text>
        ) : null}
```

Callers (`ForumThreadList`, FeedList in Task 7) hydrate `myVote` via `useForumVotes`.

- [ ] **Step 5:** Run `cd apps/expo && npx jest --watchAll=false lib/__tests__/forum-vote-transition.test.ts` (regression net) → PASS.

- [ ] **Step 6: Commit + push**

```bash
git add apps/expo/components/forum/ForumVoteCluster.tsx apps/expo/lib/forum-share.ts apps/expo/hooks/useForumVotes.ts apps/expo/components/forum/ForumThreadCard.tsx
git commit -m "feat(expo): vote cluster, share helper, vote hydration hook, thread-card action row"
git push
```

---

### Task 5: FAB morph + chips CTA gating

**Files:**
- Modify: `apps/expo/components/feed/FeedFAB.tsx`
- Modify: `apps/expo/components/feed/FeedHome.tsx`
- Modify: `apps/expo/components/forum/ForumCategoryChips.tsx`
- Modify: `apps/expo/components/forum/ForumThreadList.tsx`

**Interfaces:**
- Consumes: existing `FeedFAB` (reanimated scale/visibility), `FeedHome`'s `effectiveTab` state and `handleCompose`.
- Produces: `FeedFAB` props gain `label?: string` (expands into a pill when set) and `accessibilityLabel?: string`; `ForumCategoryChips` props gain `showNewCta?: boolean` (default true).

- [ ] **Step 1: FeedFAB morph**

Rework `FeedFAB.tsx` (keep the existing scale/visibility behavior):

```tsx
import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavigation';

import PencilIcon from '@/assets/icons/pencil.svg';

type AnimatedScalar = { readonly value: number };

const COLLAPSED_WIDTH = 56;
const EXPANDED_WIDTH = 178;

type Props = {
  onPress: () => void;
  /** Visibility scale driven externally (1 = visible, 0 = hidden). */
  visibilityScale?: AnimatedScalar;
  /** When set, the FAB expands into a pill carrying this label (icon kept). */
  label?: string;
  accessibilityLabel?: string;
};

export default function FeedFAB({ onPress, visibilityScale, label, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const expanded = useSharedValue(label ? 1 : 0);

  useEffect(() => {
    expanded.value = withSpring(label ? 1 : 0, { damping: 18, stiffness: 220 });
  }, [label, expanded]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * (visibilityScale?.value ?? 1) }],
    opacity: visibilityScale?.value ?? 1,
  }));

  const pillStyle = useAnimatedStyle(() => ({
    width: interpolate(expanded.value, [0, 1], [COLLAPSED_WIDTH, EXPANDED_WIDTH]),
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expanded.value, [0, 0.6, 1], [0, 0, 1]),
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.92, { damping: 15, stiffness: 300 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  return (
    <Animated.View
      style={[styles.container, { bottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 }, animatedStyle]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? 'Neuen Beitrag erstellen'}
      >
        <Animated.View style={[styles.fab, { backgroundColor: colors.primary }, pillStyle]}>
          <PencilIcon width={24} height={24} color={colors.onPrimary} />
          {label ? (
            <Animated.Text numberOfLines={1} style={[styles.label, { color: colors.onPrimary }, labelStyle]}>
              {label}
            </Animated.Text>
          ) : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    zIndex: 31,
  },
  fab: {
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  label: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
  },
});
```

- [ ] **Step 2: FeedHome wiring**

In `FeedHome.tsx`, where `<FeedFAB onPress={handleCompose} …/>` renders, branch on the active tab (the same state that drives the pager, e.g. `effectiveTab`):

```tsx
      {walletAddress && (
        <FeedFAB
          onPress={effectiveTab === 'rathaus' ? () => router.push('/forum/new' as any) : handleCompose}
          label={effectiveTab === 'rathaus' ? 'Thema starten' : undefined}
          accessibilityLabel={effectiveTab === 'rathaus' ? 'Neues Thema starten' : 'Neuen Beitrag erstellen'}
          visibilityScale={fabVisibilityScale}
        />
      )}
```

(Use the file's actual tab-state variable and its existing `router` — read the surrounding code and match; if no router instance exists in scope, add `useRouter()`.)

- [ ] **Step 3: Chips CTA gating**

`ForumCategoryChips.tsx`: add prop `showNewCta?: boolean` (default `true`); wrap the "+ Neues Thema" Pressable in `{showNewCta && isCitizen && (…)}`. In `FeedHome.tsx`, the rathaus `listHeader` becomes `<ForumCategoryChips activeSlug="alle" showNewCta={false} />`. `ForumThreadList.tsx` keeps the default (CTA visible on `/forum` screens, which have no FAB).

- [ ] **Step 4:** Run `cd apps/expo && npx jest --watchAll=false lib/__tests__/feed-assembler-forum.test.ts` → PASS (regression net).

- [ ] **Step 5: Commit + push**

```bash
git add apps/expo/components/feed/FeedFAB.tsx apps/expo/components/feed/FeedHome.tsx apps/expo/components/forum/ForumCategoryChips.tsx apps/expo/components/forum/ForumThreadList.tsx
git commit -m "feat(expo): FAB morphs into 'Thema starten' on the Umfragen tab"
git push
```

---

### Task 6: ForumOptionsDrawer + CommentInput attachments prop

**Files:**
- Create: `apps/expo/components/forum/ForumOptionsDrawer.tsx`
- Modify: `apps/expo/components/feed/CommentInput.tsx`

**Interfaces:**
- Consumes: `BottomDrawer`, Ionicons, `nostr_publications` proof-lookup idiom (PostOptionsDrawer:41-65), theme.
- Produces (Task 7 relies on):
  - `<ForumOptionsDrawer visible onClose targetType={'thread'|'reply'} targetId isOwner onShare onCopy onReport onEdit onDelete isSubscribed? onToggleSubscription? />` — subscription row renders only for `targetType === 'thread'` when `onToggleSubscription` given; proof row self-gates on the ledger like PostOptionsDrawer.
  - `CommentInput` gains `disableAttachments?: boolean` (default false): hides the sticker and image affordances; submit passes `(content, null, null)`.

- [ ] **Step 1: ForumOptionsDrawer**

Model directly on `PostOptionsDrawer.tsx` (same BottomDrawer + row styles). Rows in order:

1. **Digitaler Nachweis** — lazy ledger lookup with `source_type` = `'forum_thread' | 'forum_reply'` per `targetType` and `source_id = targetId`; opens `https://index.roebel.app/events?ids=<eventId>` (copy the effect from PostOptionsDrawer:44-65, adjusting the source_type).
2. **Teilen** — `share-social-outline`, calls `onShare`.
3. **Text kopieren** — `copy-outline`, calls `onCopy`.
4. **Benachrichtigungen** (thread only, when `onToggleSubscription` provided) — `notifications-outline`/`notifications-off-outline`, label `isSubscribed ? 'Benachrichtigungen deaktivieren' : 'Benachrichtigungen aktivieren'`, calls `onToggleSubscription`.
5. Owner: **Bearbeiten** (`create-outline`, `onEdit`) + **Löschen** (`trash-outline`, `colors.error`, `onDelete`). Non-owner: **Melden** (`flag-outline`, `onReport`).

Every row closes the drawer first (`onClose()` then the callback — PostOptionsDrawer idiom). Full file, same styles block as PostOptionsDrawer (copy the `container/row/rowText` styles verbatim; that local duplication matches the repo's per-drawer style idiom).

- [ ] **Step 2: CommentInput prop**

In `CommentInput.tsx` add to Props:

```ts
  /** Text-only mode: hides the sticker and image affordances (forum replies). */
  disableAttachments?: boolean;
```

Destructure with default `false`; wrap the sticker-picker button and the image-attach button in `{!disableAttachments && (…)}` (locate them by reading the file — they set `showPicker` / launch the image flow). Behavior otherwise unchanged; all existing call sites compile untouched.

- [ ] **Step 3:** Run `cd apps/expo && npx jest --watchAll=false lib/__tests__/forum-vote-transition.test.ts` (net) → PASS.

- [ ] **Step 4: Commit + push**

```bash
git add apps/expo/components/forum/ForumOptionsDrawer.tsx apps/expo/components/feed/CommentInput.tsx
git commit -m "feat(expo): forum options drawer; CommentInput text-only mode"
git push
```

---

### Task 7: Thread screen rework + list/feed vote hydration + edit mode

**Files:**
- Modify: `apps/expo/app/forum/thread/[id].tsx` (major rework)
- Modify: `apps/expo/app/forum/new.tsx` (edit mode)
- Modify: `apps/expo/components/forum/ForumThreadList.tsx` (vote hydration)
- Modify: `apps/expo/components/feed/FeedList.tsx` (vote hydration for `forum_thread` cards)

**Interfaces:**
- Consumes: everything from Tasks 3–6; `ReportDrawer` (`visible`, `onClose`, `onReport(reason)` — read its Props first and match), `CommentInput` (controlled `value`/`onChangeText`, `onSubmit(content, sticker, image)`, `replyingToName`, `onCancelReply`, `disableAttachments`), `useActiveProfileImage` if the post screen uses it for the avatar props (mirror the post/[id].tsx wiring).
- Produces: the complete A2 thread experience.

- [ ] **Step 1: Thread screen rework** (`app/forum/thread/[id].tsx`)

Keep: header, thread-head layout, realtime effect, query wiring, KeyboardAvoidingView, delete handlers. Change:

1. **Replies become single-level nested.** Group client-side: top-level replies = `parent_reply_id === null`; children attach to their parent (`parentId = reply.parent_reply_id ?? reply.id` — post/[id].tsx:413 idiom). Render children indented (`marginLeft: 32`) directly below their parent inside the parent's cell (map top-level replies in the FlatList; each renders its children below itself).
2. **Reply affordance per reply row:** "Antworten" link (textSecondary, `fontFamily.medium`) → `setReplyTo(reply)` (`{ id, parentId, name }` where `name = reply.author?.account?.name ?? reply.author?.username ?? 'Unbekannt'`).
3. **CommentInput replaces the custom input row:**

```tsx
        {isCitizen && thread && (
          <CommentInput
            value={draft}
            onChangeText={setDraft}
            isSubmitting={sending}
            disableAttachments
            replyingToName={editingReply ? 'Antwort bearbeiten' : replyTo?.name ?? null}
            onCancelReply={() => {
              setReplyTo(null);
              setEditingReply(null);
              setDraft('');
            }}
            walletAddress={user?.wallet_address}
            onSubmit={async (content) => {
              await handleSubmit(content);
            }}
          />
        )}
```

with `handleSubmit(content)`: if `editingReply` → `updateForumReply(editingReply.id, wallet, content)`; else `createForumReply({ thread_id, wallet_address, account_id, body: content, parent_reply_id: replyTo?.parentId ?? null })`; on success clear `draft`/`replyTo`/`editingReply` and invalidate `['forum','replies',id]` + `['forum','thread',id]`; on `null` result show an inline error Text ("Antwort konnte nicht gesendet werden.") above the bar (state `sendError`, cleared on next change).
4. **Vote cluster + share on the thread head** (below PostAuthorRow) and **per reply row** (compact cluster + "Antworten" + share icon + ⋯). Reply/head `myVote` hydration via `useForumVotes` over `[{type:'thread',id}, ...replies.map(r=>({type:'reply',id:r.id}))]`; pass `onVoted={(next) => setLocal(type, id, next)}`.
5. **⋯ everywhere:** `more-02.svg` icon button on the thread head and each reply row → opens `ForumOptionsDrawer` with the right target: share → `shareForumThread`/`shareForumReply`; copy → `Clipboard.setStringAsync(thread.body | reply.body)` (`import * as Clipboard from 'expo-clipboard'`); report → opens `ReportDrawer`, whose `onReport(reason)` calls `reportForumContent(...)` then closes; edit (thread) → `router.push('/forum/new?edit=' + thread.id)`; edit (reply) → `setEditingReply(reply); setDraft(reply.body)`; delete → the existing Alert-confirmed handlers. Subscription (thread drawer only): `isSubscribed` from `useQuery(['forum','subscription',id,wallet], () => fetchThreadSubscription(...))`, toggle calls `toggleThreadSubscription` + invalidates that key. Also surface the bell as a header icon button next to the title (Ionicons `notifications-outline`/`notifications` filled when subscribed) for one-tap toggle.
6. Remove the slice-A bare "Löschen" links (the drawer owns destructive actions now). Show "Bearbeitet" (textTertiary, 12px) beside the timestamp/meta when `edited_at` is set — thread head and reply rows.

- [ ] **Step 2: /forum/new edit mode**

`useLocalSearchParams<{ edit?: string }>()`; when `edit` is present: fetch the thread (`useQuery(['forum','thread',edit], …)` reusing `fetchForumThread`), gate on `thread.wallet_address === user.wallet_address` (else render the locked state), prefill `title`/`body`/`categorySlug` once via a `useEffect` guarded by a `prefilled` ref, header title "Thema bearbeiten", submit button "Speichern" → `updateForumThread(edit, wallet, { title, body, category_slug: categorySlug })`, then invalidate `['forum','threads']`, `['forum','thread',edit]`, `['feed','sections','rathaus']` and `router.back()`.

- [ ] **Step 3: Vote hydration in the two lists**

- `ForumThreadList.tsx`: `const { myVote, setLocal } = useForumVotes(threads.map(t => ({ type: 'thread' as const, id: t.id })))`; pass `myVote={myVote('thread', t.id)}` and `onVoted={(n) => setLocal('thread', t.id, n)}` to each `ForumThreadCard`.
- `FeedList.tsx`: the `forum_thread` case needs the same. Collect thread ids once near the top of the component (`const forumThreadTargets = useMemo(() => items.filter(i => i.type === 'forum_thread').map(i => ({ type: 'thread' as const, id: (i.data as ForumThreadRecord).id })), [items])`), call `useForumVotes(forumThreadTargets)` (unconditional hook, fine with empty array), and wire `myVote`/`onVoted` in the case. Import `ForumThreadRecord` type.

- [ ] **Step 4:** Jest net: `cd apps/expo && npx jest --watchAll=false lib/__tests__/forum-vote-transition.test.ts lib/__tests__/feed-assembler-forum.test.ts` → all PASS.

- [ ] **Step 5: Commit + push**

```bash
git add "apps/expo/app/forum/thread/[id].tsx" apps/expo/app/forum/new.tsx apps/expo/components/forum/ForumThreadList.tsx apps/expo/components/feed/FeedList.tsx
git commit -m "feat(expo): forum thread screen A2 — votes, nested replies via CommentInput, options sheets, edit mode, subscriptions"
git push
```

---

### Task 8: Verification (agent-safe scope)

**Files:** none (fix-forward only with pathspec commits if a check fails on THIS branch's files — else report BLOCKED).

- [ ] **Step 1:** Full forum jest set + whole suite tail: `cd apps/expo && npx jest --watchAll=false 2>&1 | tail -15` — forum tests green; pre-existing failures (ThemedText, xmtp native mocks) may persist, judge and report honestly.
- [ ] **Step 2:** Metro bundle: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx expo export --platform ios --output-dir <scratchpad>/expo-export-a2 2>&1 | tail -10` → exit 0; then delete the output dir.
- [ ] **Step 3:** Read-only MCP checks (project-ref gate first): the Task 1 Step 4 queries all still true; plus `SELECT prosrc LIKE '%forum_vote%' FROM pg_proc … proname='notify_user_notification_push';` → true; plus `SELECT polname FROM pg_policy WHERE polname IN ('forum_threads_update','forum_replies_update');` → both present.
- [ ] **Step 4:** Report per check with outputs. NO simulator, NO native builds, NO live-data writes, NO pushes (the device walkthrough remains Max's).

---

## Out of scope (do NOT build)

Media/stickers in forum replies; vote milestones/batching; notification-level settings (binary toggle only); web forum; Semaphore zk vote rail; any `packages/publisher`/`protocol`/manifest change; changes to `mirrorPostToNostr`.
