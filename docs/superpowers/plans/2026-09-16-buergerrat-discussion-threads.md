# Bürgerrat Discussion Threads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Umfragen forum thread into a Facebook-style discussion, carry the 11 Bürgerrat recommendations as source-cited, stage-tracked threads, surface them in the main feed and the Umfragen tab, remove the Deliberate debate UI, and make sure every thread, reply and vote reaches the relay and the explorer.

**Architecture:** Supabase stays the app's read model (`forum_threads` gains `source`/`stage` columns plus a `forum_thread_stage_events` history table, admin-only through triggers); the app dual-writes kind 11/1111/7 events to the relay under the citizen's device key and a widened ledger sweep republishes anything unmirrored. New presentational components under `components/forum/` replace the inline reply rendering; pure helpers under `lib/` carry all logic that jest can reach.

**Tech Stack:** Expo SDK 56 / React Native 0.85, expo-router, `StyleSheet` + `useTheme()` (no NativeWind), `@tanstack/react-query`, Supabase (PostgREST + RLS, applied through the Supabase MCP), `@netizen-labs/nostr` (node:test), jest-expo.

**Spec:** `docs/superpowers/specs/2026-09-16-buergerrat-discussion-threads-design.md` (content source: `docs/buergerrat/2026-empfehlungen.md`)

## Global Constraints

- Styling: `StyleSheet.create()` + `useTheme()`; fonts via `fontFamily` tokens from `apps/expo/constants/theme.ts`. No NativeWind.
- Code identifiers and comments in English; UI copy in German. Never render a raw `0x` wallet address.
- Stage vocabulary is exactly `idee, entwurf, diskussion, meinungsbild, beschlussvorlage, beschlossen, abgelehnt, umgesetzt, ruhend, zurueckgezogen` (NSP-12 `STAGES`).
- Migrations live in `apps/expo/supabase/migrations/` and are applied to production through the Supabase MCP (`apply_migration`), project `wwbeqhkslxdxhktqzqti`. Verify `get_project_url` first.
- Stage the exact files you changed (`git add <paths>`), never `git add .`. Commit after every task; push at the end of each task (`git push -u origin feat/buergerrat-diskussion`).
- Full-project type check: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` — the baseline has ~1235 pre-existing errors; judge only the files this plan touches (`grep` the output for them). Per-file `tsc` false-passes under TS 6.
- Jest (expo): `cd apps/expo && npx jest <path> --watchAll=false`. Nostr package: `cd packages/nostr && pnpm test`.
- Never run `eas update`; Max runs it. Never touch the production node without Max's explicit OK (Task 12 stops at the commit).
- Bürgerrat citation string (identical in seed and app): `Bürgerräte für MV · Bürgerrat Röbel/Müritz · Broschüre 2026 (Abstimmung in der 4. Sitzung)`. NDR URL: `https://www.ndr.de/nachrichten/mecklenburg-vorpommern/haff-mueritz/roebel-buergerrat-macht-vorschlaege-fuer-lebenswertere-innenstadt,mvregioneubrandenburg-5162.html`.

---

## File map

| File | Responsibility |
|---|---|
| `apps/expo/app/forum/debate/*`, `components/forum/Debate*.tsx` | **deleted** (Task 1) |
| `apps/expo/components/feed/FeedEventCard.tsx` | border fix (Task 2) |
| `apps/expo/supabase/migrations/20260916_buergerrat_threads.sql` | schema: source/stage columns, stage events table, guards, categories (Task 3) |
| `apps/expo/supabase/migrations/20260916_buergerrat_2026_seed.sql` | the 11 threads + stage events (Task 4) |
| `apps/expo/lib/types/feed.ts` | new types (Task 3) |
| `apps/expo/lib/forum-replies.ts` | grouping, mention resolution, collapse rule (Task 5) |
| `apps/expo/lib/forum-stages.ts` | stage labels, stepper state, date format (Task 5) |
| `apps/expo/lib/buergerrat.ts` | copy constants, NEU window, summary reducer (Task 5) |
| `packages/nostr/src/forum.ts` | `extraTags` on kind-11 builder (Task 6) |
| `apps/expo/lib/nostr/forum-tags.ts`, `forum-sweep.ts` | official tags, sweep selection helpers (Task 6) |
| `apps/expo/lib/supabase-forum.ts`, `lib/nostr/publish.ts` | data layer + sweep (Task 7) |
| `apps/expo/components/forum/ForumReplyItem.tsx`, `ForumReplyThread.tsx`, `ForumStageStepper.tsx` | discussion UI (Task 8) |
| `apps/expo/app/forum/thread/[id].tsx` | thread screen (Task 9) |
| `apps/expo/components/forum/ForumThreadCard.tsx`, `ForumCategoryChips.tsx`, `BuergerratThreadRow.tsx`, `BuergerratTrackerCard.tsx`, `app/forum/buergerrat.tsx`, `components/feed/FeedHome.tsx` | Umfragen surfaces (Task 10) |
| `apps/expo/lib/feed-sections.ts`, `hooks/useFeed.ts`, `lib/feed-assembler.ts`, `components/feed/FeedBuergerratCard.tsx`, `components/feed/FeedList.tsx`, `components/feed/FeedHome.tsx` | main feed card (Task 11) |
| `packages/protocol/examples/roebel.netizen.json`, `packages/indexer/src/api.ts` | explorer kinds (Task 12) |

---

### Task 1: Remove the Deliberate debate UI

**Files:**
- Delete: `apps/expo/app/forum/debate/[id].tsx`, `apps/expo/app/forum/debate/new.tsx`, `apps/expo/components/forum/DebateComposerSheet.tsx`, `apps/expo/components/forum/DebateStakeSheet.tsx`, `apps/expo/components/forum/DebateStrip.tsx`
- Modify: `apps/expo/lib/supabase-app-settings.ts` (remove `isDeliberateDebatesEnabled`), `apps/expo/lib/supabase-forum.ts` (remove `attachDebateToThread`), `apps/expo/components/forum/ForumThreadCard.tsx`, `apps/expo/app/forum/thread/[id].tsx`, `apps/expo/lib/types/feed.ts`, `apps/expo/lib/deliberate/chain.ts`, `apps/expo/lib/deliberate/content.ts`, `apps/expo/lib/deliberate/protocol.ts`, `apps/expo/constants/deliberate.ts`

**Interfaces:**
- Produces: `ForumThreadRecord` without `debate_id` / `debate_created_by`; the thread screen compiles without any debate code (Task 9 rewrites it anyway).

- [ ] **Step 1: Delete the UI files**

```bash
cd apps/expo
git rm -q "app/forum/debate/[id].tsx" app/forum/debate/new.tsx components/forum/DebateComposerSheet.tsx components/forum/DebateStakeSheet.tsx components/forum/DebateStrip.tsx
```

- [ ] **Step 2: Remove the flag helper**

In `lib/supabase-app-settings.ts` delete the whole `isDeliberateDebatesEnabled` function including its doc comment (the block starting `/** * Pilot gate for Deliberate debates …` through its closing `}`).

- [ ] **Step 3: Remove `attachDebateToThread`**

In `lib/supabase-forum.ts` delete the block:

```ts
/** One-shot link from a thread to its on-chain Deliberate debate (owner only). */
export async function attachDebateToThread(
  threadId: string,
  walletAddress: string,
  debateId: number,
): Promise<void> {
  const { error } = await supabase.rpc('attach_debate_to_thread', {
    p_thread_id: threadId,
    p_wallet: walletAddress,
    p_debate_id: debateId,
  });
  if (error) throw error;
}
```

- [ ] **Step 4: Strip the card**

In `components/forum/ForumThreadCard.tsx` remove `import DebateStrip from '@/components/forum/DebateStrip';` and the line `{thread.debate_id != null ? <DebateStrip debateId={thread.debate_id} /> : null}`.

- [ ] **Step 5: Strip the thread screen**

In `app/forum/thread/[id].tsx`:
1. Remove the imports `import DebateStrip from '@/components/forum/DebateStrip';` and `import { isDeliberateDebatesEnabled } from '@/lib/supabase-app-settings';`.
2. Remove the `debatesEnabled` query (the `useQuery({ queryKey: ['flags', 'deliberate', …] })` block) and the `isThreadOwner` const that follows it.
3. Replace the JSX block that starts `{thread.debate_id != null ? (` and ends `) : null}` (the `DebateStrip` / "Strukturierte Debatte starten" ternary) with nothing.
4. Remove the `startDebate` and `startDebateText` entries from `styles`.

- [ ] **Step 6: Drop the type fields**

In `lib/types/feed.ts` remove from `ForumThreadRecord`:

```ts
  /** On-chain Deliberate debate this thread graduated into; null while none. */
  debate_id: number | null;
  debate_created_by?: string | null;
```

- [ ] **Step 7: Mark the protocol module dormant**

Prepend to each of `lib/deliberate/chain.ts`, `lib/deliberate/content.ts`, `lib/deliberate/protocol.ts` and `constants/deliberate.ts`:

```ts
// DORMANT (2026-09-16): the Deliberate debate UI was removed from the app
// (spec docs/superpowers/specs/2026-09-16-buergerrat-discussion-threads-design.md §4).
// The contract stays deployed on Gnosis; this module and its tests are kept
// so the feature can return without re-deriving the protocol rules.
```

- [ ] **Step 8: Verify nothing else references the removed code**

```bash
cd apps/expo
grep -rn "DebateStrip\|isDeliberateDebatesEnabled\|attachDebateToThread\|forum/debate\|debate_id" app components lib hooks context constants | grep -v "lib/deliberate/\|constants/deliberate.ts\|__tests__"
```
Expected: no output. Then run the existing deliberate tests to confirm the dormant module still passes:
```bash
npx jest lib/__tests__/deliberate-protocol.test.ts lib/__tests__/deliberate-content.test.ts --watchAll=false
```
Expected: PASS.

- [ ] **Step 9: Flip the remote flag (Supabase MCP)**

Run via `mcp__supabase__execute_sql` (after `get_project_url` shows `wwbeqhkslxdxhktqzqti`):
```sql
insert into app_settings (key, value) values ('deliberate_debates_enabled', 'false')
on conflict (key) do update set value = excluded.value;
select key, value from app_settings where key = 'deliberate_debates_enabled';
```
Expected: one row, value `false`.

- [ ] **Step 10: Commit**

```bash
git add -A apps/expo/app/forum/debate apps/expo/components/forum apps/expo/lib/supabase-app-settings.ts apps/expo/lib/supabase-forum.ts "apps/expo/app/forum/thread/[id].tsx" apps/expo/lib/types/feed.ts apps/expo/lib/deliberate apps/expo/constants/deliberate.ts
git commit -m "feat(expo): remove the Deliberate debate UI from the forum (protocol lib kept dormant)"
```

---

### Task 2: Event card border in dark mode

**Files:**
- Modify: `apps/expo/components/feed/FeedEventCard.tsx:43`

- [ ] **Step 1: Paint the frame in the background colour**

Replace
```ts
          borderColor: isDark ? colors.border : '#ffffff',
```
with
```ts
          // The 4px frame only exists to inset the image; painting it in the
          // surface colour keeps the inset without a halo in dark mode.
          borderColor: colors.background,
```
Then `grep -n "isDark" components/feed/FeedEventCard.tsx`. If the only remaining hit is the `useTheme()` destructure, change `const { colors, isDark } = useTheme();` to `const { colors } = useTheme();`.

- [ ] **Step 2: Commit**

```bash
git add apps/expo/components/feed/FeedEventCard.tsx
git commit -m "fix(expo): no light frame around feed event cards in dark mode"
```

---

### Task 3: Schema migration + types

**Files:**
- Create: `apps/expo/supabase/migrations/20260916_buergerrat_threads.sql`
- Modify: `apps/expo/lib/types/feed.ts` (forum types block, `FeedItem` union)

**Interfaces:**
- Produces (types): `ForumStage`, `ForumThreadSource`, `ForumStageEventRecord`, `BuergerratSummary`, extended `ForumThreadRecord` / `ForumReplyRecord` / `CreateForumReplyInput`, `FeedItem` member `{ type: 'buergerrat_card'; data: BuergerratSummary; id: string }`.
- Produces (DB): columns and table exactly as below; trigger names `forum_threads_guard_official`, `forum_replies_guard_author_kind`, `forum_thread_stage_apply`.

- [ ] **Step 1: Write the migration**

`apps/expo/supabase/migrations/20260916_buergerrat_threads.sql`:

```sql
-- Bürgerrat threads: source + stage on forum_threads, stage history, reply targets.
-- Spec: docs/superpowers/specs/2026-09-16-buergerrat-discussion-threads-design.md §6

-- ── forum_replies ───────────────────────────────────────────────────────────
ALTER TABLE public.forum_replies
  ADD COLUMN IF NOT EXISTS reply_to_reply_id uuid REFERENCES public.forum_replies(id),
  ADD COLUMN IF NOT EXISTS author_kind text NOT NULL DEFAULT 'citizen'
    CHECK (author_kind IN ('citizen', 'agent'));

-- Only the node (service role) may mark a reply as agent-authored. Clients
-- insert through the anon key and get 'citizen' regardless of what they send.
CREATE OR REPLACE FUNCTION public.forum_replies_guard_author_kind()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    NEW.author_kind := 'citizen';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS forum_replies_guard_author_kind ON public.forum_replies;
CREATE TRIGGER forum_replies_guard_author_kind
  BEFORE INSERT ON public.forum_replies
  FOR EACH ROW EXECUTE FUNCTION public.forum_replies_guard_author_kind();

-- ── forum_threads ───────────────────────────────────────────────────────────
ALTER TABLE public.forum_threads
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'citizen'
    CHECK (source IN ('citizen', 'buergerrat')),
  ADD COLUMN IF NOT EXISTS source_rank integer,
  ADD COLUMN IF NOT EXISTS source_score integer,
  ADD COLUMN IF NOT EXISTS source_citation text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS official_comment text,
  ADD COLUMN IF NOT EXISTS stage text
    CHECK (stage IN ('idee','entwurf','diskussion','meinungsbild','beschlussvorlage',
                     'beschlossen','abgelehnt','umgesetzt','ruhend','zurueckgezogen'));

CREATE INDEX IF NOT EXISTS forum_threads_source_rank_idx
  ON public.forum_threads (source, source_rank);

-- Official fields are admin-only: anything a client sends is stripped.
CREATE OR REPLACE FUNCTION public.forum_threads_guard_official()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    NEW.source := 'citizen';
    NEW.source_rank := NULL;
    NEW.source_score := NULL;
    NEW.source_citation := NULL;
    NEW.source_url := NULL;
    NEW.official_comment := NULL;
    NEW.stage := NULL;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS forum_threads_guard_official ON public.forum_threads;
CREATE TRIGGER forum_threads_guard_official
  BEFORE INSERT ON public.forum_threads
  FOR EACH ROW EXECUTE FUNCTION public.forum_threads_guard_official();

-- ── stage history ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.forum_thread_stage_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  stage       text NOT NULL
    CHECK (stage IN ('idee','entwurf','diskussion','meinungsbild','beschlussvorlage',
                     'beschlossen','abgelehnt','umgesetzt','ruhend','zurueckgezogen')),
  note        text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forum_thread_stage_events_thread_idx
  ON public.forum_thread_stage_events (thread_id, occurred_at);

ALTER TABLE public.forum_thread_stage_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS forum_thread_stage_events_select ON public.forum_thread_stage_events;
CREATE POLICY forum_thread_stage_events_select
  ON public.forum_thread_stage_events FOR SELECT USING (true);
-- No insert/update/delete policies: stage changes are SQL / service-role only.
GRANT SELECT ON public.forum_thread_stage_events TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.forum_thread_stage_apply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.forum_threads
     SET stage = NEW.stage, updated_at = now()
   WHERE id = NEW.thread_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS forum_thread_stage_apply ON public.forum_thread_stage_events;
CREATE TRIGGER forum_thread_stage_apply
  AFTER INSERT ON public.forum_thread_stage_events
  FOR EACH ROW EXECUTE FUNCTION public.forum_thread_stage_apply();

-- ── reply notifications: also the directly answered author ─────────────────
CREATE OR REPLACE FUNCTION public.notify_forum_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_thread_author text; v_parent_wallet text; v_target_wallet text; v_replier_name text;
  v_body text; v_recipient text;
BEGIN
  SELECT lower(t.wallet_address) INTO v_thread_author
    FROM public.forum_threads t WHERE t.id = NEW.thread_id;
  IF v_thread_author IS NULL THEN RETURN NEW; END IF;

  IF NEW.parent_reply_id IS NOT NULL THEN
    SELECT lower(wallet_address) INTO v_parent_wallet
      FROM public.forum_replies WHERE id = NEW.parent_reply_id;
  END IF;
  IF NEW.reply_to_reply_id IS NOT NULL THEN
    SELECT lower(wallet_address) INTO v_target_wallet
      FROM public.forum_replies WHERE id = NEW.reply_to_reply_id;
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
      UNION SELECT v_target_wallet
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

-- ── two more curated categories ─────────────────────────────────────────────
INSERT INTO public.forum_categories (slug, name, about, sort_order) VALUES
  ('gesundheit',    'Gesundheit & Sport', 'Ärzte, Fitness, Sportflächen',           5),
  ('zusammenleben', 'Zusammenleben',      'Begegnung, Engagement, Kommunikation',   6)
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply through the Supabase MCP**

`mcp__supabase__get_project_url` → must be `https://wwbeqhkslxdxhktqzqti.supabase.co`. Then `mcp__supabase__apply_migration` with `name: "20260916_buergerrat_threads"` and the file content as `query`.

- [ ] **Step 3: Verify live schema**

`mcp__supabase__execute_sql`:
```sql
select
  (select count(*) from information_schema.columns where table_name='forum_threads' and column_name in ('source','source_rank','source_score','source_citation','source_url','official_comment','stage')) as thread_cols,
  (select count(*) from information_schema.columns where table_name='forum_replies' and column_name in ('reply_to_reply_id','author_kind')) as reply_cols,
  (select relrowsecurity from pg_class where relname='forum_thread_stage_events') as rls_on,
  (select count(*) from pg_trigger where tgname in ('forum_threads_guard_official','forum_replies_guard_author_kind','forum_thread_stage_apply')) as triggers,
  (select count(*) from forum_categories where slug in ('gesundheit','zusammenleben')) as new_categories;
```
Expected: `thread_cols 7`, `reply_cols 2`, `rls_on true`, `triggers 3`, `new_categories 2`.

- [ ] **Step 4: Types**

In `apps/expo/lib/types/feed.ts`, inside the `// ─── Forum (Umfragen-Diskussionen) Types` block:

Add before `ForumThreadRecord`:
```ts
/** NSP-12 stage vocabulary (packages/protocol/src/decisions.ts STAGES). */
export type ForumStage =
  | 'idee'
  | 'entwurf'
  | 'diskussion'
  | 'meinungsbild'
  | 'beschlussvorlage'
  | 'beschlossen'
  | 'abgelehnt'
  | 'umgesetzt'
  | 'ruhend'
  | 'zurueckgezogen';

export type ForumThreadSource = 'citizen' | 'buergerrat';

export type ForumStageEventRecord = {
  id: string;
  thread_id: string;
  stage: ForumStage;
  note: string | null;
  occurred_at: string;
  created_at: string;
};
```

Add to `ForumThreadRecord` after `edited_at: string | null;`:
```ts
  /** 'buergerrat' = quoted from the Bürgerrat brochure (admin-seeded); 'citizen' otherwise. */
  source: ForumThreadSource;
  source_rank: number | null;
  source_score: number | null;
  source_citation: string | null;
  source_url: string | null;
  /** Verbatim Bürgermeister comment from the brochure, or null. */
  official_comment: string | null;
  stage: ForumStage | null;
  stage_events?: ForumStageEventRecord[];
```

Add to `ForumReplyRecord` after `parent_reply_id: string | null;`:
```ts
  /** The directly answered reply (may itself be nested); parent_reply_id stays the top-level parent. */
  reply_to_reply_id: string | null;
  author_kind: 'citizen' | 'agent';
```

Add to `CreateForumReplyInput`:
```ts
  reply_to_reply_id?: string | null;
```

After `CreateForumReplyInput` add:
```ts
/** Aggregate over the Bürgerrat threads for the feed card and the tracker. */
export type BuergerratSummary = {
  count: number;
  newestCreatedAt: string | null;
  beschlossen: number;
  umgesetzt: number;
};
```

Add to the `FeedItem` union, after the `forum_thread` member:
```ts
  | { type: 'buergerrat_card'; data: BuergerratSummary; id: string }
```

- [ ] **Step 5: Commit**

```bash
git add apps/expo/supabase/migrations/20260916_buergerrat_threads.sql apps/expo/lib/types/feed.ts
git commit -m "feat(supabase): forum thread source/stage, stage history, reply targets"
```

---

### Task 4: Seed the 11 recommendations

**Files:**
- Create: `apps/expo/supabase/migrations/20260916_buergerrat_2026_seed.sql`

**Interfaces:**
- Produces: 11 `forum_threads` rows with ids `6b7e0000-2026-4a01-9000-0000000000NN` (NN = rank, zero-padded to 2) and 11 `forum_thread_stage_events` rows with ids `6b7e0000-2026-4a02-9000-0000000000NN`.

- [ ] **Step 1: Write the seed**

Body texts must match `docs/buergerrat/2026-empfehlungen.md` character for character (copy from there; the file below is the same text). Note the `created_at` offsets (rank 1 newest).

```sql
-- Seed: Bürgerrat Röbel/Müritz 2026, 11 Empfehlungen als Diskussions-Threads.
-- Text source: docs/buergerrat/2026-empfehlungen.md (quoted from the brochure).
-- Runs as postgres via the Supabase MCP, so forum_threads_guard_official lets
-- the official fields through. Idempotent (fixed ids, ON CONFLICT DO NOTHING).

INSERT INTO public.forum_threads
  (id, wallet_address, account_id, category_slug, title, body, status, source, source_rank, source_score,
   source_citation, source_url, official_comment, stage, created_at, last_activity_at)
SELECT
  ('6b7e0000-2026-4a01-9000-0000000000' || lpad(r.rank::text, 2, '0'))::uuid,
  '0xc49de63ccfee46c6c5c3e393293f66779799fb28',
  NULL,
  r.category,
  r.title,
  r.body,
  'published',
  'buergerrat',
  r.rank,
  r.score,
  'Bürgerräte für MV · Bürgerrat Röbel/Müritz · Broschüre 2026 (Abstimmung in der 4. Sitzung)',
  'https://www.ndr.de/nachrichten/mecklenburg-vorpommern/haff-mueritz/roebel-buergerrat-macht-vorschlaege-fuer-lebenswertere-innenstadt,mvregioneubrandenburg-5162.html',
  r.official_comment,
  'diskussion',
  timestamptz '2026-09-16 12:00:00+02' + make_interval(secs => 11 - r.rank),
  timestamptz '2026-09-16 12:00:00+02' + make_interval(secs => 11 - r.rank)
FROM (VALUES
  (1, 13, 'ortsentwicklung', 'Offenen Begegnungsort nach dem Vorbild des „Kugellagers“ schaffen', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, einen Ort der Begegnung zu schaffen, der für alle Generationen attraktiv ist und verschiedene Funktionen erfüllt.

Vorschläge zur Umsetzung
• Die Qualitäten des ehemaligen „Kugellagers“ als Vorbild nutzen
• Geeignete Standorte ergebnisoffen prüfen
• Verschiedene Organisationsformen prüfen, z. B. eine Bürgergenossenschaft
• Möglichkeiten einer Mehrfachnutzung sowie einer schrittweisen Öffnung prüfen
• Bürgerinnen und Bürger frühzeitig zur Mitwirkung gewinnen

Wichtig sind insbesondere: gemütliche Atmosphäre, generationenübergreifende Nutzung, flexible Nutzungsmöglichkeiten, Musik, Kultur und Veranstaltungen, Café- bzw. Kneipencharakter, kleine Snacks, Billard, Dart, Tischkicker, Aufenthaltsqualität sowie Raum für Eigeninitiative und spontane Begegnungen.

Als ein zu prüfender Standort wurde unter anderem das „Vegas“ genannt.$b$, NULL),

  (2, 12, 'ortsentwicklung', 'Konzept gegen Leerstand', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, ein Konzept zu erarbeiten, das dem zunehmenden Leerstand von Gewerbeflächen entgegenwirkt und Möglichkeiten der Umnutzung in den Blick nimmt.

Vorschläge zur Umsetzung
• Forum für Gewerbetreibende einrichten
  – regelmäßiger Austausch zwischen den zuständigen Ämtern und Gewerbetreibenden
  – insbesondere Existenzgründer berücksichtigen und unterstützen
  – Erfahrungsaustausch mit ähnlichen Initiativen in nahegelegenen Städten
• Zwischennutzungen und alternative Versorgungsangebote unterstützen
  – zeitweise Nutzung leerstehender Räume, z. B. durch Pop-up-Cafés, Pop-up-Läden oder für kulturelle Zwecke
  – Automaten aufstellen, um ein Angebot an Grundnahrungsmitteln vorzuhalten
  – alternative Versorgungsangebote bewerben (z. B. Bäcker in Bollewick, der Bestellungen über Social Media annimmt, die samstags abgeholt werden können)
  – Discounter bei Baugenehmigung verpflichten, eine Zweigstelle in der Innenstadt zu eröffnen
  – planerische und baurechtliche Möglichkeiten prüfen
• Leerstehende Gewerbeflächen zu Wohnraum umnutzen
  – geeignete Flächen prüfen, um zusätzlichen Wohnraum für größere Familien und junge Menschen zu schaffen
• Verhältnis von Ferienwohnungen und Wohnraum prüfen
  – analysieren, wie groß der Verlust von dauerhaftem Wohnraum durch Ferienvermietung ist, und ggf. Maßnahmen zur Sicherung von Wohnraum ergreifen$b$,
   $c$Es gibt bereits einen halbjährlichen Unternehmerstammtisch und vor Saisonbeginn einen Stammtisch mit Hoteliers und Gastronomen. Außerdem arbeitet die Stadt an der Einführung einer Gutscheinkarte („Röbel Card“). Eine Zweckentfremdungssatzung ist bereits in Arbeit.$c$),

  (3, 12, 'gesundheit', 'Anreize für Fachärzte schaffen', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, die Ansiedlung von Fachärzten mit gezielten Angeboten aktiv zu bewerben.
• Stadt als Betreiber des Medizinischen Versorgungszentrums (MVZ)
• Abstimmung mit dem Angebot in den nahegelegenen Städten
• Bedarf ist besonders groß in den Bereichen HNO, Orthopädie und Innere sowie bei Augenärzten und Zahnärzten

Vorschläge zur Umsetzung
• Attraktiven Wohnraum und Grundstücke anbieten
• Den Standort an geeigneten Orten und über geeignete Kanäle aktiv bewerben und dabei Lage, Lebensqualität und Vorteile der Region hervorheben
• Willkommensangebote prüfen, z. B. finanzielle oder organisatorische Unterstützung$b$, NULL),

  (4, 11, 'ortsentwicklung', 'Sauberkeit und Müllentsorgung', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, die Sauberkeit der Innenstadt durch bessere Strukturierung und Umsetzung der Müllentsorgung zu erhöhen und die Bevölkerung zu aktivieren, ihren Beitrag dazu zu leisten.

Vorschläge zur Umsetzung
• Müllstandorte besser ausstatten und strukturieren
  – regelmäßige Leerung und mehr Reinigungskapazitäten
  – zusätzliche Glas- und Papiercontainer, insbesondere in dicht bewohnten Gebieten (z. B. Gildekamp), auf dem Netto-Parkplatz und in touristisch genutzten Bereichen
  – Standorte müssen leicht erreichbar und gut einsehbar sein
  – Standorte auf Infotafeln der Stadt kennzeichnen
  – einfache Infotafeln mit Bildern und in leichter Sprache an den Müllplätzen
  – Tauschecken an den Müllplätzen
  – saisonale Schwankungen berücksichtigen: häufigere Leerung in Stoßzeiten und Ferien
  – ggf. Hinweisschilder zur Kameraüberwachung an Problemstellen
• Mehr öffentliche Abfallbehälter an stark frequentierten Orten
• Müllsammelaktionen und Beteiligung der Bevölkerung
  – regelmäßige, städtisch organisierte Müllsammelaktionen (inkl. Getränke/Snacks als Anerkennung)
  – Schulaktionen/-projekte: einmal pro Quartal Spielplätze von Müll befreien
  – Schulen, Familien und Vereine einbinden
• Anreizsysteme und ergänzende Maßnahmen
  – Taschenaschenbecher mit Stadtlogo über das Haus des Gastes an Touristen verteilen, u. a. über die Stadtführer
  – Aschenbecher an öffentlichen Mülleimern$b$, NULL),

  (5, 10, 'gesundheit', 'Die Umstrukturierung eines Fitnessstudios unterstützen', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, die Umstrukturierung des Fitnessstudios in der Müritz-Therme zu unterstützen.

Folgende Bedarfe sind zu berücksichtigen:
• bezahlbare Mitgliedsbeiträge, ggf. Angebot von Rabatten
• moderne Trainingsmöglichkeiten
• Kursangebote
• Ansprechpartner vor Ort

Vorschläge zur Umsetzung
• Möglichkeiten der Zusammenarbeit mit bestehenden Sport- und Gesundheitseinrichtungen ausloten$b$, NULL),

  (6, 8, 'ortsentwicklung', 'Grünflächen und Pflege von Gehwegen verbessern', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, die Grünflächen sowie Spiel- und Freizeitflächen regelmäßig zu pflegen und an einigen Orten fehlende Bänke aufzustellen.

Vorschläge zur Umsetzung
• Regelmäßige Pflege von Grünflächen und Rückschnitt von Hecken (z. B. Warener Chaussee, Ringstraße, Innenhof, Schwarzer Weg)
  – Regelmäßige Pflege durch Stadtbauhof und Wohnungsgesellschaften, mit Rücksicht auf Vogelbrutzeiten
• Mehr Personal bzw. Unterstützung im Stadtbauhof, z. B. durch Bundesfreiwilligendienst (Bufdi) oder zusätzliche Unterstützungsstrukturen
• Grünpflege mit der Nachbarschaft in einzelnen Quartieren
  – wie früher der Wettbewerb „Unsere Stadt soll schöner werden“
  – Patenschaften für einzelne Grünflächen$b$, NULL),

  (7, 5, 'zusammenleben', 'Informations- und Kommunikationskanäle der Stadt ausbauen und stärken', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, verschiedene Möglichkeiten der Information und Kommunikation zu nutzen, auszubauen und zu stärken.

Vorschläge zur Umsetzung
• Die Mein-Ort-App als zentrale Informationsplattform für Röbel bekannter machen
• Informationen zusätzlich über Social Media, Presse, Litfaßsäulen sowie Aushänge in öffentlichen Einrichtungen, Apotheken und Supermärkten verbreiten
• Positive Beispiele und bestehende Angebote regelmäßig sichtbar machen
• Öffentlichkeitsarbeit der Stadt einbeziehen
• Unterschiedliche Kommunikationswege kombinieren
• Informationen niedrigschwellig und zielgruppengerecht bereitstellen$b$,
   $c$Die Röbel-App ist eine private Initiative; die Stadtverwaltung nutzt die Mein-Ort-App.$c$),

  (8, 5, 'zusammenleben', 'Begegnungsmöglichkeiten für alle Bevölkerungsgruppen unterstützen', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, regelmäßige Begegnungsangebote zu unterstützen und den Austausch im Alltag zwischen allen Generationen zu fördern.

Vorschläge zur Umsetzung
• Mögliche Formate für Austausch und gemeinschaftliche Aktivitäten:
  – Gesprächsabende
  – gemeinsame Koch- und Backangebote
  – Spiele- und Themenabende
  – Technikaustausch zwischen Jung und Alt
  – generationenübergreifende Patenschaften
  – regelmäßiger Abend- oder Heimatmarkt mit Angeboten für alle Generationen
• Bestehende öffentliche Räume stärker für Begegnung nutzen

Positive Beispiele: mobiler Steinbrotbackofen, selbstorganisierter Krankenhaus-Ehemaligen-Treff in der Bibliothek, Nutzung öffentlicher Räume wie der Bibliothek.$b$, NULL),

  (9, 5, 'zusammenleben', 'Eigeninitiative und gemeinschaftliches Engagement stärken', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, Eigeninitiative und gemeinschaftliches Engagement zu fördern und zu unterstützen. Bürgerinnen und Bürger sollen ermutigt werden, Begegnungsangebote selbst zu organisieren und dafür vorhandene Räume und Netzwerke zu nutzen.

Vorschläge zur Umsetzung
• Bürgerinnen und Bürger ermutigen, selbst Veranstaltungen und Begegnungsangebote zu organisieren
• Niedrigschwellige Nutzung vorhandener Räume unterstützen
• Gegenseitige Unterstützung bei Organisation und Werbung
• Vereine, Initiativen und bestehende Netzwerke einbeziehen, z. B. Kulturverein, Seniorenbeirat und weitere Akteure
• Bedürfnisse der Bürgerinnen und Bürger regelmäßig aufgreifen
• Ehrenamtsbörse einrichten$b$,
   $c$Vereine können zu Beginn jedes Jahres Förderung für Projekte beantragen, die sich auf die Stadt Röbel beziehen. Dafür stehen jährlich insgesamt 33.000 Euro zur Verfügung. Darüber hinaus stehen bei der Partnerschaft für Demokratie jährlich rund 55.000 Euro zur Verfügung, um Vereine und Initiativen im Amtsbereich zu fördern.$c$),

  (10, 2, 'bildung', 'Jugendangebote beteiligungsorientiert und bedarfsgerecht weiterentwickeln und ausbauen', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, die bestehenden Jugendangebote gemeinsam mit Jugendlichen bedarfsgerecht weiterzuentwickeln. Gleichzeitig sollen sie durch bessere Öffentlichkeitsarbeit bekannter werden, damit mehr junge Menschen die vorhandenen Möglichkeiten nutzen.
• Jugendhaus und Jugendrat einbeziehen
• Möglichkeiten für ungezwungene Treffen (z. B. Dart, Billard, Musik)
• Positive Beispiele sichtbar machen

Vorschläge zur Umsetzung
• Jugendliche regelmäßig nach ihren Interessen und Bedürfnissen befragen
• Jugendliche an der Planung und Umsetzung neuer Angebote beteiligen
• Bestehende Treff- und Freizeitmöglichkeiten bedarfsgerecht weiterentwickeln
• Bestehende Angebote über Social Media, Presse, Öffentlichkeitsarbeit und weitere Kanäle bekannter machen
• Längere Öffnungszeiten durch ehrenamtliches Engagement oder Bundesfreiwilligendienstleistende$b$, NULL),

  (11, 2, 'gesundheit', 'Sport- und Freizeitmöglichkeiten weiterentwickeln', $b$Empfehlung des Bürgerrats
Der Bürgerrat empfiehlt, die Sport- und Freizeitflächen im Freien weiterzuentwickeln und auszubauen.
• Bedürfnisse aller Generationen berücksichtigen
• Gut erreichbare und attraktive Aufenthaltsorte schaffen
• Jugendrat und weitere Interessengruppen einbeziehen

Vorschläge zur Umsetzung
• Sportanlagen im Freien installieren (Sportboxwand, Trimm-Dich-Geräte, bewegliche Geräte)
  – mögliche Orte: Elefantenspielplatz, Schildkrötenspielplatz (Gildekamp)
  – Vorbild: Sportanlage im Stadtgarten
• Sichtbarkeit schaffen, Öffentlichkeitsarbeit (z. B. Ort auf Infotafeln der Stadt kennzeichnen)
• Den Boden des Basketballplatzes am Elefantenspielplatz erneuern
• Pfütze am Elefantenspielplatz mit Sand auffüllen, dabei das Wiedervernässungsprojekt berücksichtigen$b$, NULL)
) AS r(rank, score, category, title, body, official_comment)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.forum_thread_stage_events (id, thread_id, stage, note, occurred_at)
SELECT
  ('6b7e0000-2026-4a02-9000-0000000000' || lpad(t.source_rank::text, 2, '0'))::uuid,
  t.id,
  'diskussion',
  'Empfohlen vom Bürgerrat Röbel/Müritz (4. Sitzung, ' || t.source_score || ' Punkte); am 15.09.2026 der Stadtvertretung vorgestellt',
  timestamptz '2026-09-15 18:00:00+02'
FROM public.forum_threads t
WHERE t.source = 'buergerrat' AND t.source_rank BETWEEN 1 AND 11
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Apply through the Supabase MCP**

`mcp__supabase__apply_migration` with `name: "20260916_buergerrat_2026_seed"` and the file content.

- [ ] **Step 3: Verify**

```sql
select source_rank, source_score, category_slug, stage, length(body) as body_len, official_comment is not null as has_comment
from forum_threads where source='buergerrat' order by source_rank;
select count(*) as events from forum_thread_stage_events;
```
Expected: 11 rows, ranks 1..11, scores 13,12,12,11,10,8,5,5,5,2,2, every `stage = diskussion`, `has_comment` true for ranks 2, 7, 9; `events = 11`.

- [ ] **Step 4: Commit**

```bash
git add apps/expo/supabase/migrations/20260916_buergerrat_2026_seed.sql
git commit -m "feat(supabase): seed the 11 Bürgerrat 2026 recommendations as tracked threads"
```

---

### Task 5: Pure helpers — replies, stages, Bürgerrat copy

**Files:**
- Create: `apps/expo/lib/forum-replies.ts`, `apps/expo/lib/forum-stages.ts`, `apps/expo/lib/buergerrat.ts`
- Test: `apps/expo/lib/__tests__/forum-replies.test.ts`, `apps/expo/lib/__tests__/forum-stages.test.ts`, `apps/expo/lib/__tests__/buergerrat.test.ts`

**Interfaces:**
- Produces: `groupReplies(replies): GroupedReply[]`, `replyDisplayName(reply): string`, `resolveMentionName(reply, byId): ReplyMention | null`, `isCollapsed(childCount, expanded): boolean`, `INLINE_CHILDREN_LIMIT = 2`; `STAGE_LABELS`, `STEPPER_STAGES`, `TERMINAL_STAGES`, `stepperState(stage): StepperState`, `formatStageDate(iso): string`; `BUERGERRAT_TITLE`, `BUERGERRAT_YEAR_LABEL`, `BUERGERRAT_TOTAL`, `BUERGERRAT_NDR_URL`, `BUERGERRAT_CITATION`, `isBuergerratNew(newestIso, nowMs?)`, `summarizeBuergerrat(rows): BuergerratSummary`.

- [ ] **Step 1: Write the failing tests**

`apps/expo/lib/__tests__/forum-replies.test.ts`:
```ts
import { groupReplies, isCollapsed, resolveMentionName, replyDisplayName } from '../forum-replies';
import type { ForumReplyRecord } from '../types/feed';

const reply = (
  id: string,
  wallet: string,
  extra: Partial<ForumReplyRecord> = {},
): ForumReplyRecord =>
  ({
    id,
    thread_id: 't1',
    parent_reply_id: null,
    reply_to_reply_id: null,
    wallet_address: wallet,
    account_id: null,
    body: `body ${id}`,
    status: 'published',
    upvotes_count: 0,
    downvotes_count: 0,
    created_at: '2026-09-16T10:00:00Z',
    edited_at: null,
    author_kind: 'citizen',
    author: { wallet_address: wallet, username: `user-${wallet}` } as ForumReplyRecord['author'],
    ...extra,
  }) as ForumReplyRecord;

describe('groupReplies', () => {
  it('nests children under their top-level parent and keeps orphans top-level', () => {
    const a = reply('a', '0x1');
    const b = reply('b', '0x2', { parent_reply_id: 'a' });
    const orphan = reply('c', '0x3', { parent_reply_id: 'missing' });
    const grouped = groupReplies([a, b, orphan]);
    expect(grouped.map((g) => g.id)).toEqual(['a', 'c']);
    expect(grouped[0].children.map((c) => c.id)).toEqual(['b']);
  });
});

describe('resolveMentionName', () => {
  const a = reply('a', '0x1');
  const b = reply('b', '0x2', { parent_reply_id: 'a', reply_to_reply_id: 'a' });
  const c = reply('c', '0x3', { parent_reply_id: 'a', reply_to_reply_id: 'b' });
  const self = reply('d', '0x2', { parent_reply_id: 'a', reply_to_reply_id: 'b' });
  const legacy = reply('e', '0x4', { parent_reply_id: 'a' });
  const byId = new Map([a, b, c, self, legacy].map((r) => [r.id, r]));

  it('names the directly answered author', () => {
    expect(resolveMentionName(c, byId)?.name).toBe('user-0x2');
  });
  it('names the top-level author when answering it directly', () => {
    expect(resolveMentionName(b, byId)?.name).toBe('user-0x1');
  });
  it('falls back to parent_reply_id for legacy rows', () => {
    expect(resolveMentionName(legacy, byId)?.name).toBe('user-0x1');
  });
  it('is null when answering yourself or a missing target', () => {
    expect(resolveMentionName(self, byId)).toBeNull();
    expect(resolveMentionName(reply('f', '0x9', { reply_to_reply_id: 'nope' }), byId)).toBeNull();
    expect(resolveMentionName(a, byId)).toBeNull();
  });
});

describe('replyDisplayName', () => {
  it('prefers the organisation name for org accounts', () => {
    const r = reply('a', '0x1', {
      author: {
        wallet_address: '0x1',
        username: 'person',
        account: { id: 'acc', account_type: 'organisation', name: 'TSV Röbel', avatar_url: null },
      } as ForumReplyRecord['author'],
    });
    expect(replyDisplayName(r)).toBe('TSV Röbel');
    expect(replyDisplayName(undefined)).toBe('Unbekannt');
  });
});

describe('isCollapsed', () => {
  it('collapses only above two children and only while not expanded', () => {
    expect(isCollapsed(2, false)).toBe(false);
    expect(isCollapsed(3, false)).toBe(true);
    expect(isCollapsed(3, true)).toBe(false);
  });
});
```

`apps/expo/lib/__tests__/forum-stages.test.ts`:
```ts
import { STAGE_LABELS, STEPPER_STAGES, formatStageDate, stepperState } from '../forum-stages';

describe('stepperState', () => {
  it('maps the four stepper stages to their index', () => {
    expect(stepperState('diskussion')).toEqual({ kind: 'steps', current: 0 });
    expect(stepperState('beschlussvorlage')).toEqual({ kind: 'steps', current: 1 });
    expect(stepperState('umgesetzt')).toEqual({ kind: 'steps', current: 3 });
  });
  it('places pre-stepper stages before the first step and meinungsbild after diskussion', () => {
    expect(stepperState('idee')).toEqual({ kind: 'steps', current: -1 });
    expect(stepperState('entwurf')).toEqual({ kind: 'steps', current: -1 });
    expect(stepperState('meinungsbild')).toEqual({ kind: 'steps', current: 0 });
  });
  it('renders terminal stages as a badge and null as nothing', () => {
    expect(stepperState('abgelehnt')).toEqual({ kind: 'terminal', stage: 'abgelehnt' });
    expect(stepperState('ruhend')).toEqual({ kind: 'terminal', stage: 'ruhend' });
    expect(stepperState(null)).toEqual({ kind: 'none' });
  });
  it('has a German label for every stage and the stepper order is fixed', () => {
    expect(STEPPER_STAGES).toEqual(['diskussion', 'beschlussvorlage', 'beschlossen', 'umgesetzt']);
    expect(STAGE_LABELS.zurueckgezogen).toBe('Zurückgezogen');
    expect(Object.keys(STAGE_LABELS)).toHaveLength(10);
  });
});

describe('formatStageDate', () => {
  it('formats dd.mm.yyyy', () => {
    expect(formatStageDate('2026-09-15T16:00:00Z')).toBe('15.09.2026');
  });
});
```

`apps/expo/lib/__tests__/buergerrat.test.ts`:
```ts
import { isBuergerratNew, summarizeBuergerrat, BUERGERRAT_TOTAL } from '../buergerrat';

describe('isBuergerratNew', () => {
  const now = Date.parse('2026-09-20T00:00:00Z');
  it('is true within 14 days of the newest thread and false after or without one', () => {
    expect(isBuergerratNew('2026-09-16T12:00:00Z', now)).toBe(true);
    expect(isBuergerratNew('2026-09-01T12:00:00Z', now)).toBe(false);
    expect(isBuergerratNew(null, now)).toBe(false);
  });
});

describe('summarizeBuergerrat', () => {
  it('counts threads and terminal stages and keeps the newest created_at', () => {
    const s = summarizeBuergerrat([
      { created_at: '2026-09-16T12:00:10Z', stage: 'diskussion' },
      { created_at: '2026-09-16T12:00:09Z', stage: 'beschlossen' },
      { created_at: '2026-09-16T12:00:08Z', stage: 'umgesetzt' },
      { created_at: '2026-09-16T12:00:07Z', stage: null },
    ]);
    expect(s).toEqual({ count: 4, newestCreatedAt: '2026-09-16T12:00:10Z', beschlossen: 1, umgesetzt: 1 });
    expect(summarizeBuergerrat([])).toEqual({ count: 0, newestCreatedAt: null, beschlossen: 0, umgesetzt: 0 });
    expect(BUERGERRAT_TOTAL).toBe(11);
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

```bash
cd apps/expo && npx jest lib/__tests__/forum-replies.test.ts lib/__tests__/forum-stages.test.ts lib/__tests__/buergerrat.test.ts --watchAll=false
```
Expected: FAIL, "Cannot find module '../forum-replies'" (and the other two).

- [ ] **Step 3: Implement `lib/forum-replies.ts`**

```ts
import type { ForumReplyRecord, PostAuthor } from './types/feed';

export type GroupedReply = ForumReplyRecord & { children: ForumReplyRecord[] };

/** Children up to this many render inline; more collapse behind "N Antworten anzeigen". */
export const INLINE_CHILDREN_LIMIT = 2;

export type ReplyMention = { name: string; author: PostAuthor | undefined };

/**
 * Replies are single-level nested (forum spec §A2.4): parent_reply_id always
 * points at a top-level reply. Group into top-level + direct children; a
 * child whose parent is missing (deleted) is shown top-level rather than lost.
 */
export function groupReplies(replies: ForumReplyRecord[]): GroupedReply[] {
  const byId = new Map<string, GroupedReply>();
  replies.forEach((r) => byId.set(r.id, { ...r, children: [] }));
  const topLevel: GroupedReply[] = [];
  replies.forEach((r) => {
    const node = byId.get(r.id)!;
    if (r.parent_reply_id && byId.has(r.parent_reply_id)) {
      byId.get(r.parent_reply_id)!.children.push(r);
    } else {
      topLevel.push(node);
    }
  });
  return topLevel;
}

export function replyDisplayName(reply: Pick<ForumReplyRecord, 'author'> | undefined): string {
  const author = reply?.author;
  if (!author) return 'Unbekannt';
  if (author.account?.account_type === 'organisation' && author.account.name) return author.account.name;
  return author.username || 'Unbekannt';
}

/**
 * The "@Name" prefix of a nested reply: the author of the directly answered
 * reply (reply_to_reply_id), falling back to the top-level parent for rows
 * written before that column existed. Null when the target is missing or is
 * the reply's own author.
 */
export function resolveMentionName(
  reply: ForumReplyRecord,
  byId: Map<string, ForumReplyRecord>,
): ReplyMention | null {
  const targetId = reply.reply_to_reply_id ?? reply.parent_reply_id;
  if (!targetId) return null;
  const target = byId.get(targetId);
  if (!target) return null;
  if (target.wallet_address.toLowerCase() === reply.wallet_address.toLowerCase()) return null;
  return { name: replyDisplayName(target), author: target.author };
}

export function isCollapsed(childCount: number, expanded: boolean): boolean {
  return childCount > INLINE_CHILDREN_LIMIT && !expanded;
}
```

- [ ] **Step 4: Implement `lib/forum-stages.ts`**

```ts
import type { ForumStage } from './types/feed';

/** UI labels for the NSP-12 stage vocabulary. */
export const STAGE_LABELS: Record<ForumStage, string> = {
  idee: 'Idee',
  entwurf: 'Entwurf',
  diskussion: 'Diskussion',
  meinungsbild: 'Meinungsbild',
  beschlussvorlage: 'Beschlussvorlage',
  beschlossen: 'Beschlossen',
  abgelehnt: 'Abgelehnt',
  umgesetzt: 'Umgesetzt',
  ruhend: 'Ruhend',
  zurueckgezogen: 'Zurückgezogen',
};

/** The four steps the stepper draws for a Bürgerrat recommendation. */
export const STEPPER_STAGES: readonly ForumStage[] = [
  'diskussion',
  'beschlussvorlage',
  'beschlossen',
  'umgesetzt',
];

export const TERMINAL_STAGES: readonly ForumStage[] = ['abgelehnt', 'ruhend', 'zurueckgezogen'];

/** Stages that are not steps themselves: the index of the last step they sit after. */
const BETWEEN_STEPS: Partial<Record<ForumStage, number>> = {
  idee: -1,
  entwurf: -1,
  meinungsbild: 0,
};

export type StepperState =
  | { kind: 'steps'; current: number }
  | { kind: 'terminal'; stage: ForumStage }
  | { kind: 'none' };

export function stepperState(stage: ForumStage | null | undefined): StepperState {
  if (!stage) return { kind: 'none' };
  if (TERMINAL_STAGES.includes(stage)) return { kind: 'terminal', stage };
  const idx = STEPPER_STAGES.indexOf(stage);
  if (idx >= 0) return { kind: 'steps', current: idx };
  return { kind: 'steps', current: BETWEEN_STEPS[stage] ?? -1 };
}

/** dd.mm.yyyy in the device's local time. */
export function formatStageDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
```

- [ ] **Step 5: Implement `lib/buergerrat.ts`**

```ts
import type { BuergerratSummary, ForumStage } from './types/feed';

/** Copy + constants for the Bürgerrat Röbel/Müritz 2026 recommendation set. */
export const BUERGERRAT_TITLE = '11 Empfehlungen für eine lebenswerte Innenstadt';
export const BUERGERRAT_YEAR_LABEL = 'Bürgerrat 2026';
export const BUERGERRAT_TOTAL = 11;
export const BUERGERRAT_NDR_URL =
  'https://www.ndr.de/nachrichten/mecklenburg-vorpommern/haff-mueritz/roebel-buergerrat-macht-vorschlaege-fuer-lebenswertere-innenstadt,mvregioneubrandenburg-5162.html';
export const BUERGERRAT_CITATION =
  'Bürgerräte für MV · Bürgerrat Röbel/Müritz · Broschüre 2026 (Abstimmung in der 4. Sitzung)';

/** The feed card wears its "NEU" pill this long after the newest thread. */
export const BUERGERRAT_NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function isBuergerratNew(newestCreatedAt: string | null, nowMs: number = Date.now()): boolean {
  if (!newestCreatedAt) return false;
  const t = Date.parse(newestCreatedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t < BUERGERRAT_NEW_WINDOW_MS;
}

export function summarizeBuergerrat(
  rows: Array<{ created_at: string; stage: ForumStage | string | null }>,
): BuergerratSummary {
  let newest: string | null = null;
  let beschlossen = 0;
  let umgesetzt = 0;
  for (const r of rows) {
    if (!newest || r.created_at > newest) newest = r.created_at;
    if (r.stage === 'beschlossen') beschlossen++;
    if (r.stage === 'umgesetzt') umgesetzt++;
  }
  return { count: rows.length, newestCreatedAt: newest, beschlossen, umgesetzt };
}
```

- [ ] **Step 6: Run the tests**

```bash
cd apps/expo && npx jest lib/__tests__/forum-replies.test.ts lib/__tests__/forum-stages.test.ts lib/__tests__/buergerrat.test.ts --watchAll=false
```
Expected: PASS (3 suites).

- [ ] **Step 7: Commit**

```bash
git add apps/expo/lib/forum-replies.ts apps/expo/lib/forum-stages.ts apps/expo/lib/buergerrat.ts apps/expo/lib/__tests__/forum-replies.test.ts apps/expo/lib/__tests__/forum-stages.test.ts apps/expo/lib/__tests__/buergerrat.test.ts
git commit -m "feat(expo): forum reply grouping, stage ladder and Bürgerrat helpers"
```

---

### Task 6: Nostr builders — official tags and sweep selection

**Files:**
- Modify: `packages/nostr/src/forum.ts` (`ForumThreadInput`, `buildForumThreadEvent`)
- Test: `packages/nostr/test/forum.test.ts` (append a case)
- Create: `apps/expo/lib/nostr/forum-tags.ts`, `apps/expo/lib/nostr/forum-sweep.ts`
- Test: `apps/expo/lib/__tests__/forum-tags.test.ts`, `apps/expo/lib/__tests__/forum-sweep.test.ts`

**Interfaces:**
- Produces: `ForumThreadInput.extraTags?: string[][]`; `officialThreadTags(thread: OfficialThreadFields): string[][]`; `selectUnpublished(ownIds: string[], ledger: LedgerRow[]): string[]`; `parseVoteSourceId(sourceId: string): { targetType: 'thread' | 'reply'; targetId: string } | null`; `LedgerRow = { source_id: string; status: string }`.

- [ ] **Step 1: Failing test in packages/nostr**

Append to `packages/nostr/test/forum.test.ts` inside `describe("forum thread (kind 11)", …)` (or as a new describe if that block is named differently — keep it next to the existing thread tests):
```ts
  it("appends extra tags after title and category", () => {
    const event = buildForumThreadEvent(
      SECRET_KEY,
      {
        title: "Konzept gegen Leerstand",
        content: "…",
        categorySlug: "ortsentwicklung",
        extraTags: [["t", "buergerrat"], ["score", "12"]],
      },
      { createdAt: CREATED_AT },
    );
    assert.deepEqual(event.tags, [
      ["title", "Konzept gegen Leerstand"],
      ["t", "ortsentwicklung"],
      ["t", "buergerrat"],
      ["score", "12"],
    ]);
    assert.ok(verifyEvent(event));
  });
```
Run `cd packages/nostr && pnpm test` → expected FAIL (extraTags ignored, deepEqual mismatch).

- [ ] **Step 2: Implement in `packages/nostr/src/forum.ts`**

```ts
export interface ForumThreadInput {
  title: string;
  content: string;
  categorySlug?: string;
  /** Appended verbatim after the title/category tags (e.g. official-source markers). */
  extraTags?: string[][];
}
```
and in `buildForumThreadEvent`:
```ts
  const tags = [
    ["title", title],
    ...(input.categorySlug ? [["t", input.categorySlug]] : []),
    ...(input.extraTags ?? []),
  ];
```
Run `pnpm test` → PASS.

- [ ] **Step 3: Failing expo tests**

`apps/expo/lib/__tests__/forum-tags.test.ts`:
```ts
import { officialThreadTags } from '../nostr/forum-tags';

describe('officialThreadTags', () => {
  it('is empty for citizen threads', () => {
    expect(officialThreadTags({ source: 'citizen', source_url: null, source_citation: null, source_score: null, source_rank: null })).toEqual([]);
  });
  it('marks Bürgerrat threads with t/r/source/score/rank', () => {
    expect(
      officialThreadTags({
        source: 'buergerrat',
        source_url: 'https://www.ndr.de/x',
        source_citation: 'Broschüre 2026',
        source_score: 13,
        source_rank: 1,
      }),
    ).toEqual([
      ['t', 'buergerrat'],
      ['r', 'https://www.ndr.de/x'],
      ['source', 'Broschüre 2026'],
      ['score', '13'],
      ['rank', '1'],
    ]);
  });
});
```

`apps/expo/lib/__tests__/forum-sweep.test.ts`:
```ts
import { parseVoteSourceId, selectUnpublished } from '../nostr/forum-sweep';

describe('selectUnpublished', () => {
  it('keeps ids with no ledger row or a non-published row, in input order', () => {
    const ledger = [
      { source_id: 'a', status: 'published' },
      { source_id: 'b', status: 'pending' },
      { source_id: 'c', status: 'rejected' },
    ];
    expect(selectUnpublished(['a', 'b', 'c', 'd'], ledger)).toEqual(['b', 'c', 'd']);
  });
});

describe('parseVoteSourceId', () => {
  it('parses the type:id:pubkeyPrefix ledger key', () => {
    expect(parseVoteSourceId('thread:6b7e0000-2026-4a01-9000-000000000001:abcdef0123456789')).toEqual({
      targetType: 'thread',
      targetId: '6b7e0000-2026-4a01-9000-000000000001',
    });
    expect(parseVoteSourceId('reply:x:y')).toEqual({ targetType: 'reply', targetId: 'x' });
    expect(parseVoteSourceId('post:x:y')).toBeNull();
    expect(parseVoteSourceId('thread')).toBeNull();
  });
});
```
Run: `cd apps/expo && npx jest lib/__tests__/forum-tags.test.ts lib/__tests__/forum-sweep.test.ts --watchAll=false` → FAIL (modules missing).

- [ ] **Step 4: Implement**

`apps/expo/lib/nostr/forum-tags.ts`:
```ts
import type { ForumThreadRecord } from '@/lib/types/feed';

export type OfficialThreadFields = Pick<
  ForumThreadRecord,
  'source' | 'source_url' | 'source_citation' | 'source_score' | 'source_rank'
>;

/**
 * Kind-11 tags that mark a thread as quoted from an official source. Empty for
 * ordinary citizen threads so the event grammar of the forum spec is unchanged.
 */
export function officialThreadTags(thread: OfficialThreadFields): string[][] {
  if (thread.source !== 'buergerrat') return [];
  const tags: string[][] = [['t', 'buergerrat']];
  if (thread.source_url) tags.push(['r', thread.source_url]);
  if (thread.source_citation) tags.push(['source', thread.source_citation]);
  if (thread.source_score != null) tags.push(['score', String(thread.source_score)]);
  if (thread.source_rank != null) tags.push(['rank', String(thread.source_rank)]);
  return tags;
}
```

`apps/expo/lib/nostr/forum-sweep.ts`:
```ts
export type LedgerRow = { source_id: string; status: string };

/** Ids that still need a (re)publish: no ledger row, or one that is not 'published'. */
export function selectUnpublished(ownIds: string[], ledger: LedgerRow[]): string[] {
  const status = new Map(ledger.map((r) => [r.source_id, r.status]));
  return ownIds.filter((id) => status.get(id) !== 'published');
}

/** Inverse of the `${type}:${id}:${pubkeyPrefix}` key publishForumVote records. */
export function parseVoteSourceId(
  sourceId: string,
): { targetType: 'thread' | 'reply'; targetId: string } | null {
  const [type, id] = sourceId.split(':');
  if ((type === 'thread' || type === 'reply') && id) return { targetType: type, targetId: id };
  return null;
}
```
Run the two jest files → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/nostr/src/forum.ts packages/nostr/test/forum.test.ts apps/expo/lib/nostr/forum-tags.ts apps/expo/lib/nostr/forum-sweep.ts apps/expo/lib/__tests__/forum-tags.test.ts apps/expo/lib/__tests__/forum-sweep.test.ts
git commit -m "feat(nostr): official-source tags on kind-11 threads + forum sweep helpers"
```

---

### Task 7: Data layer — supabase-forum.ts and the Nostr sweep

**Files:**
- Modify: `apps/expo/lib/supabase-forum.ts`, `apps/expo/lib/nostr/publish.ts`, `apps/expo/lib/feed-sections.ts`, `apps/expo/hooks/useFeed.ts`

**Interfaces:**
- Consumes: Task 3 types, Task 5 `summarizeBuergerrat`, Task 6 `officialThreadTags`, `selectUnpublished`, `parseVoteSourceId`, `extraTags`.
- Produces: `fetchBuergerratThreads(): Promise<ForumThreadRecord[]>`, `fetchBuergerratSummary(): Promise<BuergerratSummary | null>`, `createForumReply` accepting `reply_to_reply_id`, `publishForumThread(threadId, title, body, categorySlug?, createdAtSec?, extraTags?)`, `publishForumReply(replyId, threadId, content, parentReplyId?, createdAtSec?)`, `FeedSections.buergerrat`.

- [ ] **Step 1: Thread select embeds stage events**

In `lib/supabase-forum.ts` change `THREAD_SELECT` to:
```ts
const THREAD_SELECT = `
  *,
  author:users!forum_threads_wallet_address_fkey(
    wallet_address, username, profile_picture_url, is_verified_citizen, tier, equipped_frame_asset_url
  ),
  account:accounts(id, account_type, name, avatar_url),
  category:forum_categories(slug, name),
  stage_events:forum_thread_stage_events(id, thread_id, stage, note, occurred_at, created_at)
`;
```
Add after `mergeAccountIntoAuthor`:
```ts
function normalizeThread(row: ForumThreadRecord): ForumThreadRecord {
  const merged = mergeAccountIntoAuthor(row);
  if (Array.isArray(merged.stage_events)) {
    merged.stage_events = [...merged.stage_events].sort((a, b) =>
      a.occurred_at < b.occurred_at ? -1 : a.occurred_at > b.occurred_at ? 1 : 0,
    );
  }
  return merged;
}
```
Replace every `mergeAccountIntoAuthor(data as unknown as ForumThreadRecord)` and `.map(mergeAccountIntoAuthor)` on **thread** results (`fetchRecentForumThreads`, `fetchForumThread`, `createForumThread`) with `normalizeThread(...)` / `.map(normalizeThread)`. Reply results keep `mergeAccountIntoAuthor`.

- [ ] **Step 2: Bürgerrat reads**

Add after `fetchForumThread`:
```ts
/** The Bürgerrat recommendation threads, best-ranked first. */
export async function fetchBuergerratThreads(): Promise<ForumThreadRecord[]> {
  const { data, error } = await supabase
    .from('forum_threads')
    .select(THREAD_SELECT)
    .eq('status', 'published')
    .eq('source', 'buergerrat')
    .order('source_rank', { ascending: true });
  if (error) {
    console.error('Error fetching Bürgerrat threads:', error);
    return [];
  }
  return (data as unknown as ForumThreadRecord[]).map(normalizeThread);
}

/** Aggregate for the feed card + tracker. Null on error so callers can hide. */
export async function fetchBuergerratSummary(): Promise<BuergerratSummary | null> {
  const { data, error } = await supabase
    .from('forum_threads')
    .select('created_at, stage')
    .eq('status', 'published')
    .eq('source', 'buergerrat');
  if (error) {
    console.error('Error fetching Bürgerrat summary:', error);
    return null;
  }
  return summarizeBuergerrat((data ?? []) as Array<{ created_at: string; stage: string | null }>);
}
```
Imports: add `BuergerratSummary` to the type import from `./types/feed` and `import { summarizeBuergerrat } from './buergerrat';`.

- [ ] **Step 3: Reply target + mirror parent**

In `createForumReply` add `reply_to_reply_id: input.reply_to_reply_id || null,` to the inserted object. In `mirrorReplyToNostr` change the publish call to:
```ts
    const createdSec = Math.floor(Date.parse(reply.created_at) / 1000);
    await publishForumReply(
      reply.id,
      reply.thread_id,
      reply.body,
      reply.reply_to_reply_id ?? reply.parent_reply_id,
      Number.isFinite(createdSec) ? createdSec : undefined,
    );
```
In `mirrorThreadToNostr` pass the official tags:
```ts
    const { publishForumThread } = await import('./nostr/publish');
    const { officialThreadTags } = await import('./nostr/forum-tags');
    const createdSec = Math.floor(Date.parse(thread.created_at) / 1000);
    await publishForumThread(
      thread.id,
      thread.title,
      thread.body,
      thread.category_slug ?? undefined,
      Number.isFinite(createdSec) ? createdSec : undefined,
      officialThreadTags(thread),
    );
```

- [ ] **Step 4: publish.ts signatures**

`publishForumThread`:
```ts
export async function publishForumThread(
  threadId: string,
  title: string,
  body: string,
  categorySlug?: string,
  createdAtSec?: number,
  extraTags?: string[][],
): Promise<PublicationStatus> {
  const identity = await loadStoredIdentity();
  if (!identity) return 'pending';
  const event = buildForumThreadEvent(
    identity.secretKey,
    { title, content: body, categorySlug, extraTags },
    createdAtSec ? { createdAt: createdAtSec } : {},
  );
  return publish(event, 'forum_thread', threadId);
}
```
`publishForumReply` gains `createdAtSec?: number` as the fifth parameter and passes `createdAtSec ? { createdAt: createdAtSec } : {}` as the fifth argument of `buildForumReplyEvent`.

- [ ] **Step 5: The forum sweep**

Add to `publish.ts` (above `retryPendingPublications`):
```ts
import { officialThreadTags, type OfficialThreadFields } from './forum-tags';
import { parseVoteSourceId, selectUnpublished, type LedgerRow } from './forum-sweep';

/**
 * Re-publish this citizen's forum content whose mirror never landed: threads
 * (incl. SQL-seeded official ones, signed here with the device key), replies
 * whose thread is on the relay, and votes that were recorded pending because
 * their target was not mirrored yet. Same scope rule as posts: only the
 * citizen's own, personal-account content; org words belong to the node.
 */
async function retryForumPublications(identity: NostrIdentity, walletAddress: string): Promise<void> {
  const wallet = walletAddress.toLowerCase();
  const isOrg = (row: { account?: unknown }) =>
    (row.account as { account_type?: string } | null)?.account_type === 'organisation';
  try {
    const { data: threads } = await supabase
      .from('forum_threads')
      .select('id, title, body, category_slug, created_at, source, source_url, source_citation, source_score, source_rank, account:account_id(account_type)')
      .eq('wallet_address', wallet)
      .eq('status', 'published')
      .order('created_at', { ascending: true })
      .limit(30);
    const ownThreads = (threads ?? []).filter((t) => !isOrg(t));
    if (ownThreads.length) {
      const ids = ownThreads.map((t) => String(t.id));
      const { data: ledger } = await supabase
        .from('nostr_publications')
        .select('source_id, status')
        .eq('source_type', 'forum_thread')
        .in('source_id', ids);
      const todo = new Set(selectUnpublished(ids, (ledger ?? []) as LedgerRow[]));
      for (const t of ownThreads) {
        if (!todo.has(String(t.id))) continue;
        const createdSec = Math.floor(Date.parse(String(t.created_at)) / 1000);
        await publishForumThread(
          String(t.id),
          String(t.title),
          String(t.body),
          (t.category_slug as string | null) ?? undefined,
          Number.isFinite(createdSec) ? createdSec : undefined,
          officialThreadTags(t as unknown as OfficialThreadFields),
        );
      }
    }

    const { data: replies } = await supabase
      .from('forum_replies')
      .select('id, thread_id, body, parent_reply_id, reply_to_reply_id, created_at, account:account_id(account_type)')
      .eq('wallet_address', wallet)
      .eq('status', 'published')
      .order('created_at', { ascending: true })
      .limit(30);
    const ownReplies = (replies ?? []).filter((r) => !isOrg(r));
    if (ownReplies.length) {
      const ids = ownReplies.map((r) => String(r.id));
      const { data: ledger } = await supabase
        .from('nostr_publications')
        .select('source_id, status')
        .eq('source_type', 'forum_reply')
        .in('source_id', ids);
      const todo = new Set(selectUnpublished(ids, (ledger ?? []) as LedgerRow[]));
      for (const r of ownReplies) {
        if (!todo.has(String(r.id))) continue;
        const createdSec = Math.floor(Date.parse(String(r.created_at)) / 1000);
        await publishForumReply(
          String(r.id),
          String(r.thread_id),
          String(r.body),
          (r.reply_to_reply_id as string | null) ?? (r.parent_reply_id as string | null),
          Number.isFinite(createdSec) ? createdSec : undefined,
        );
      }
    }

    const { data: votes } = await supabase
      .from('nostr_publications')
      .select('source_id')
      .eq('source_type', 'forum_vote')
      .eq('pubkey_hex', identity.publicKey)
      .in('status', ['pending', 'rejected'])
      .limit(30);
    for (const row of votes ?? []) {
      const parsed = parseVoteSourceId(String(row.source_id));
      if (!parsed) continue;
      const { data: vote } = await supabase
        .from('forum_votes')
        .select('value')
        .eq('target_type', parsed.targetType)
        .eq('target_id', parsed.targetId)
        .ilike('wallet_address', wallet)
        .maybeSingle();
      if (!vote) continue;
      await publishForumVote(parsed.targetType, parsed.targetId, vote.value === 1 ? 1 : -1);
    }
  } catch {
    // Best-effort; the next sweep tries again.
  }
}
```
Put the two imports next to the existing imports at the top of the file (not inline). At the end of `retryPendingPublications`, after the posts `try { … } catch { … }` block, add:
```ts
  if (walletAddress) await retryForumPublications(identity, walletAddress);
```

- [ ] **Step 6: Sections + hook**

`lib/feed-sections.ts`: import `fetchBuergerratSummary` from `@/lib/supabase-forum` and `BuergerratSummary` from `@/lib/types/feed`; add `buergerrat: BuergerratSummary | null;` to `FeedSections`; add to the `Promise.all` array (last position) `isMain || isRathaus ? fetchBuergerratSummary().catch(() => null) : Promise.resolve(null),`; add `buergerrat,` to the destructuring and `buergerrat: buergerrat as BuergerratSummary | null,` to the returned object.

`hooks/useFeed.ts`: add `buergerrat: s?.buergerrat ?? null,` to the `assembleFeed({...})` call (the assembler param arrives in Task 11; add it there first if TypeScript complains, order of tasks is 7 → 11, so temporarily leave this line out and add it in Task 11 Step 3 — the plan does that).

- [ ] **Step 7: Type-check the touched files**

```bash
cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep -E "lib/supabase-forum.ts|lib/nostr/publish.ts|lib/feed-sections.ts|lib/nostr/forum-" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 8: Commit**

```bash
git add apps/expo/lib/supabase-forum.ts apps/expo/lib/nostr/publish.ts apps/expo/lib/feed-sections.ts
git commit -m "feat(expo): Bürgerrat reads, reply targets, and a Nostr sweep for forum threads/replies/votes"
```

---

### Task 8: Discussion components — ForumReplyItem, ForumReplyThread, ForumStageStepper

**Files:**
- Create: `apps/expo/components/forum/ForumReplyItem.tsx`, `apps/expo/components/forum/ForumReplyThread.tsx`, `apps/expo/components/forum/ForumStageStepper.tsx`

**Interfaces:**
- Consumes: Task 5 helpers, `ForumVoteCluster`, `UserAvatarWithFrame`, `VerifiedBadge`, `openAuthorProfile`/`canOpenProfile` (`@/lib/profile-navigation`), `formatRelativeTimestamp` (`@/lib/utils`), `assets/icons/reply.svg`.
- Produces: `<ForumReplyItem reply isChild? isThreadAuthor mention myVote onVoted onReply onOptions />`, `<ForumReplyThread group byId threadAuthorWallet expanded onToggleExpanded myVote onVoted onReply onOptions />`, `<ForumStageStepper stage events? />`.

- [ ] **Step 1: `ForumReplyItem.tsx`**

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { formatRelativeTimestamp } from '@/lib/utils';
import { openAuthorProfile, canOpenProfile } from '@/lib/profile-navigation';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import VerifiedBadge from '@/components/VerifiedBadge';
import ForumVoteCluster from '@/components/forum/ForumVoteCluster';
import { replyDisplayName, type ReplyMention } from '@/lib/forum-replies';
import ReplyIcon from '@/assets/icons/reply.svg';
import type { ForumReplyRecord } from '@/lib/types/feed';

type Props = {
  reply: ForumReplyRecord;
  /** Compact, inset rendering under a top-level reply. */
  isChild?: boolean;
  /** The reply's author is the thread author → "Autor" badge. */
  isThreadAuthor: boolean;
  /** "@Name" prefix for a targeted reply; null for none. */
  mention: ReplyMention | null;
  myVote: 1 | -1 | null;
  onVoted: (next: 1 | -1 | null) => void;
  onReply: (reply: ForumReplyRecord) => void;
  onOptions: (reply: ForumReplyRecord) => void;
};

/**
 * One reply row in the Facebook-group idiom: avatar rail, name + badges,
 * body with an optional @-mention, "Antworten" and the vote cluster.
 * Long-press (or the "…" button) opens the options sheet.
 */
export default function ForumReplyItem({
  reply,
  isChild = false,
  isThreadAuthor,
  mention,
  myVote,
  onVoted,
  onReply,
  onOptions,
}: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const author = reply.author;
  const isOrg = author?.account?.account_type === 'organisation';
  const isAgent = reply.author_kind === 'agent';
  const displayName = replyDisplayName(reply);
  const avatarUri = isOrg ? author?.account?.avatar_url : author?.profile_picture_url;
  const isVerified = author?.is_verified_citizen ?? false;
  const canOpen = canOpenProfile({ author, account: author?.account });
  const openProfile = canOpen
    ? () => openAuthorProfile(router, { author, account: author?.account })
    : undefined;
  const mentionAuthor = mention?.author;
  const canOpenMention = !!mentionAuthor && canOpenProfile({ author: mentionAuthor, account: mentionAuthor.account });
  const openMention = canOpenMention
    ? () => openAuthorProfile(router, { author: mentionAuthor, account: mentionAuthor?.account })
    : undefined;

  return (
    <Pressable
      onLongPress={() => onOptions(reply)}
      delayLongPress={350}
      style={[styles.row, isChild && styles.rowChild]}
    >
      <Pressable onPress={openProfile} disabled={!openProfile} hitSlop={4}>
        <UserAvatarWithFrame
          size={isChild ? 28 : 32}
          uri={avatarUri ?? null}
          fallbackInitial={displayName.charAt(0).toUpperCase()}
          frameAssetUrl={isOrg ? null : (author?.equipped_frame_asset_url ?? null)}
          disabled={isOrg || isAgent}
        />
      </Pressable>

      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Pressable onPress={openProfile} disabled={!openProfile} hitSlop={4} style={styles.nameWrap}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {displayName}
            </Text>
          </Pressable>
          {isVerified && <VerifiedBadge size={14} />}
          {isThreadAuthor && (
            <View style={[styles.badge, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>Autor</Text>
            </View>
          )}
          {isAgent && (
            <View style={[styles.badge, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.badgeText, { color: colors.textSecondary }]}>KI</Text>
            </View>
          )}
          <Text style={[styles.time, { color: colors.textTertiary }]} numberOfLines={1}>
            · {formatRelativeTimestamp(reply.created_at)}
            {reply.edited_at ? ' · Bearbeitet' : ''}
          </Text>
          <Pressable
            onPress={() => onOptions(reply)}
            hitSlop={8}
            style={styles.more}
            accessibilityRole="button"
            accessibilityLabel="Optionen"
          >
            <Ionicons name="ellipsis-horizontal" size={14} color={colors.textTertiary} />
          </Pressable>
        </View>

        <Text style={[styles.body, { color: colors.textPrimary }]}>
          {mention ? (
            <Text style={[styles.mention, { color: colors.primary }]} onPress={openMention}>
              @{mention.name}{' '}
            </Text>
          ) : null}
          {reply.body}
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={() => onReply(reply)}
            hitSlop={8}
            style={styles.replyBtn}
            accessibilityRole="button"
            accessibilityLabel="Antworten"
          >
            <ReplyIcon width={16} height={16} color={colors.textSecondary} />
            <Text style={[styles.replyText, { color: colors.textSecondary }]}>Antworten</Text>
          </Pressable>
          <View style={styles.spacer} />
          <ForumVoteCluster
            targetType="reply"
            targetId={reply.id}
            upvotes={reply.upvotes_count ?? 0}
            downvotes={reply.downvotes_count ?? 0}
            myVote={myVote}
            onVoted={onVoted}
            compact
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  rowChild: {
    paddingLeft: 10,
    paddingTop: 10,
  },
  content: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nameWrap: { flexShrink: 1 },
  name: { fontSize: 13, fontFamily: fontFamily.semiBold },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  badgeText: { fontSize: 10, fontFamily: fontFamily.semiBold, letterSpacing: 0.3 },
  time: { fontSize: 12, fontFamily: fontFamily.regular, flexShrink: 1 },
  more: { marginLeft: 'auto', padding: 4 },
  body: { fontSize: 14, fontFamily: fontFamily.regular, lineHeight: 20 },
  mention: { fontFamily: fontFamily.semiBold },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  replyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  replyText: { fontSize: 12, fontFamily: fontFamily.semiBold },
  spacer: { flex: 1 },
});
```

- [ ] **Step 2: `ForumReplyThread.tsx`**

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ForumReplyItem from './ForumReplyItem';
import {
  INLINE_CHILDREN_LIMIT,
  isCollapsed,
  resolveMentionName,
  type GroupedReply,
} from '@/lib/forum-replies';
import type { ForumReplyRecord } from '@/lib/types/feed';

type Props = {
  group: GroupedReply;
  /** Every loaded reply by id, for @-mention resolution. */
  byId: Map<string, ForumReplyRecord>;
  threadAuthorWallet: string;
  expanded: boolean;
  onToggleExpanded: (topLevelId: string) => void;
  myVote: (replyId: string) => 1 | -1 | null;
  onVoted: (replyId: string, next: 1 | -1 | null) => void;
  onReply: (reply: ForumReplyRecord) => void;
  onOptions: (reply: ForumReplyRecord) => void;
};

/**
 * A top-level reply with its children under a connector rail. More than
 * INLINE_CHILDREN_LIMIT children collapse behind "N Antworten anzeigen".
 */
export default function ForumReplyThread({
  group,
  byId,
  threadAuthorWallet,
  expanded,
  onToggleExpanded,
  myVote,
  onVoted,
  onReply,
  onOptions,
}: Props) {
  const { colors } = useTheme();
  const isAuthor = (r: ForumReplyRecord) =>
    r.wallet_address.toLowerCase() === threadAuthorWallet.toLowerCase();
  const children = group.children;
  const collapsed = isCollapsed(children.length, expanded);

  const toggle = (label: string) => (
    <Pressable
      onPress={() => onToggleExpanded(group.id)}
      style={styles.expander}
      hitSlop={8}
      accessibilityRole="button"
    >
      <View style={[styles.elbow, { backgroundColor: colors.borderTertiary }]} />
      <Text style={[styles.expanderText, { color: colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.wrapper, { borderBottomColor: colors.borderTertiary }]}>
      <ForumReplyItem
        reply={group}
        isThreadAuthor={isAuthor(group)}
        mention={null}
        myVote={myVote(group.id)}
        onVoted={(next) => onVoted(group.id, next)}
        onReply={onReply}
        onOptions={onOptions}
      />
      {children.length > 0 && (
        <View style={[styles.rail, { borderLeftColor: colors.borderTertiary }]}>
          {collapsed ? (
            toggle(`${children.length} Antworten anzeigen`)
          ) : (
            <>
              {children.map((child) => (
                <ForumReplyItem
                  key={child.id}
                  reply={child}
                  isChild
                  isThreadAuthor={isAuthor(child)}
                  mention={resolveMentionName(child, byId)}
                  myVote={myVote(child.id)}
                  onVoted={(next) => onVoted(child.id, next)}
                  onReply={onReply}
                  onOptions={onOptions}
                />
              ))}
              {children.length > INLINE_CHILDREN_LIMIT && toggle('Antworten ausblenden')}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // x = 16px row padding + 16px (half of the 32px avatar): the rail hangs
  // from the centre of the parent avatar, like a Facebook reply thread.
  rail: {
    marginLeft: 32,
    borderLeftWidth: 1.5,
    paddingLeft: 4,
  },
  expander: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  elbow: { width: 16, height: 1.5 },
  expanderText: { fontSize: 12, fontFamily: fontFamily.semiBold },
});
```

- [ ] **Step 3: `ForumStageStepper.tsx`**

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { STAGE_LABELS, STEPPER_STAGES, formatStageDate, stepperState } from '@/lib/forum-stages';
import type { ForumStage, ForumStageEventRecord } from '@/lib/types/feed';

type Props = {
  stage: ForumStage | null;
  events?: ForumStageEventRecord[];
};

/**
 * Where a recommendation stands: four steps (Diskussion → Beschlussvorlage →
 * Beschlossen → Umgesetzt) or a terminal badge, plus the dated Verlauf.
 * Renders nothing for threads without a stage (ordinary citizen threads).
 */
export default function ForumStageStepper({ stage, events = [] }: Props) {
  const { colors } = useTheme();
  const state = stepperState(stage);
  if (state.kind === 'none') return null;

  return (
    <View style={styles.wrap}>
      {state.kind === 'terminal' ? (
        <View
          style={[
            styles.terminal,
            { backgroundColor: state.stage === 'abgelehnt' ? colors.errorBackground : colors.surfaceSecondary },
          ]}
        >
          <Text
            style={[
              styles.terminalText,
              { color: state.stage === 'abgelehnt' ? colors.error : colors.textSecondary },
            ]}
          >
            {STAGE_LABELS[state.stage]}
          </Text>
        </View>
      ) : (
        <View style={styles.steps}>
          {STEPPER_STAGES.map((s, i) => {
            const reached = i <= state.current;
            const current = i === state.current;
            const last = i === STEPPER_STAGES.length - 1;
            return (
              <View key={s} style={styles.step}>
                <View style={styles.dotRow}>
                  <View
                    style={[
                      styles.line,
                      { backgroundColor: i === 0 ? 'transparent' : reached ? colors.primary : colors.border },
                    ]}
                  />
                  <View
                    style={[
                      styles.dot,
                      {
                        borderColor: reached ? colors.primary : colors.border,
                        backgroundColor: reached ? colors.primary : colors.background,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.line,
                      { backgroundColor: last ? 'transparent' : i < state.current ? colors.primary : colors.border },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    {
                      color: current ? colors.textPrimary : colors.textTertiary,
                      fontFamily: current ? fontFamily.semiBold : fontFamily.regular,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {STAGE_LABELS[s]}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {events.length > 0 && (
        <View style={styles.history}>
          {events.map((e) => (
            <Text key={e.id} style={[styles.historyLine, { color: colors.textSecondary }]}>
              {formatStageDate(e.occurred_at)} · {STAGE_LABELS[e.stage]}
              {e.note ? ` · ${e.note}` : ''}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  steps: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  dotRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  line: { flex: 1, height: 2 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  stepLabel: { fontSize: 10, textAlign: 'center' },
  terminal: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  terminalText: { fontSize: 12, fontFamily: fontFamily.semiBold },
  history: { gap: 4 },
  historyLine: { fontSize: 12, fontFamily: fontFamily.regular, lineHeight: 17 },
});
```

- [ ] **Step 4: Type-check the three files**

```bash
cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep -E "components/forum/(ForumReplyItem|ForumReplyThread|ForumStageStepper)" || echo "clean"
```
Expected: `clean`. (If `errorBackground` is missing from the theme, check `constants/theme.ts`; `GovernanceNudge.tsx` already uses it, so it exists.)

- [ ] **Step 5: Commit**

```bash
git add apps/expo/components/forum/ForumReplyItem.tsx apps/expo/components/forum/ForumReplyThread.tsx apps/expo/components/forum/ForumStageStepper.tsx
git commit -m "feat(expo): discussion reply rows with connector rail, mentions, and the stage stepper"
```

---

### Task 9: Thread screen

**Files:**
- Modify (rewrite): `apps/expo/app/forum/thread/[id].tsx`

**Interfaces:**
- Consumes: Task 5 (`groupReplies`, `replyDisplayName`), Task 7 (`createForumReply` with `reply_to_reply_id`), Task 8 components, `BUERGERRAT_TOTAL` (Task 5).

- [ ] **Step 1: Replace the file**

Write `apps/expo/app/forum/thread/[id].tsx` in full:

```tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import ShareIcon from '@/assets/icons/share-02.svg';
import PostAuthorRow from '@/components/feed/PostAuthorRow';
import CommentInput from '@/components/feed/CommentInput';
import ReportDrawer from '@/components/feed/ReportDrawer';
import ForumVoteCluster from '@/components/forum/ForumVoteCluster';
import ForumOptionsDrawer from '@/components/forum/ForumOptionsDrawer';
import ForumReplyThread from '@/components/forum/ForumReplyThread';
import ForumStageStepper from '@/components/forum/ForumStageStepper';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import { useForumVotes } from '@/hooks/useForumVotes';
import { useActiveProfileImage } from '@/hooks/useActiveProfileImage';
import { supabase } from '@/lib/supabase';
import { shareForumThread, shareForumReply } from '@/lib/forum-share';
import { groupReplies, replyDisplayName, type GroupedReply } from '@/lib/forum-replies';
import { STAGE_LABELS } from '@/lib/forum-stages';
import { BUERGERRAT_TOTAL } from '@/lib/buergerrat';
import {
  createForumReply,
  deleteForumReply,
  deleteForumThread,
  fetchForumReplies,
  fetchForumThread,
  fetchThreadSubscription,
  toggleThreadSubscription,
  reportForumContent,
  updateForumReply,
  type ForumVoteTarget,
} from '@/lib/supabase-forum';
import type { ForumReplyRecord } from '@/lib/types/feed';

type ReplyTarget = { id: string; parentId: string; name: string };
type OptionsTarget = { type: ForumVoteTarget; id: string };

export default function ForumThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isCitizen } = useUser();
  const { activeAccount } = useAccount();
  const activeProfileImage = useActiveProfileImage();

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [editingReply, setEditingReply] = useState<ForumReplyRecord | null>(null);
  const [optionsFor, setOptionsFor] = useState<OptionsTarget | null>(null);
  const [reportFor, setReportFor] = useState<OptionsTarget | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

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
  const { data: isSubscribed = false } = useQuery({
    queryKey: ['forum', 'subscription', id, user?.wallet_address],
    queryFn: () => fetchThreadSubscription(id!, user!.wallet_address!),
    enabled: !!id && !!user?.wallet_address,
  });

  const groupedReplies = useMemo(() => groupReplies(replies), [replies]);
  const repliesById = useMemo(() => new Map(replies.map((r) => [r.id, r])), [replies]);

  const voteTargets = useMemo(() => {
    if (!id) return [];
    return [{ type: 'thread' as const, id }, ...replies.map((r) => ({ type: 'reply' as const, id: r.id }))];
  }, [id, replies]);
  const { myVote, setLocal } = useForumVotes(voteTargets);

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

  const toggleExpanded = useCallback((topLevelId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(topLevelId)) next.delete(topLevelId);
      else next.add(topLevelId);
      return next;
    });
  }, []);

  const handleSubmit = async (content: string) => {
    const body = content.trim();
    if (!body || sending || !user?.wallet_address || !id) return;
    setSending(true);
    setSendError(null);
    const parentId = replyTo?.parentId ?? null;
    const result = editingReply
      ? await updateForumReply(editingReply.id, user.wallet_address, body)
      : await createForumReply({
          thread_id: id,
          wallet_address: user.wallet_address,
          account_id: activeAccount?.id,
          body,
          parent_reply_id: parentId,
          reply_to_reply_id: replyTo?.id ?? null,
        });
    setSending(false);
    if (!result) {
      // CommentInput already cleared the parent draft optimistically before
      // this await resolved — restore it so a failed send doesn't lose the
      // user's typed text.
      setDraft(content);
      setSendError('Antwort konnte nicht gesendet werden.');
      return;
    }
    // Show the reply the user just wrote even when its parent was collapsed.
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    setDraft('');
    setReplyTo(null);
    setEditingReply(null);
    await queryClient.invalidateQueries({ queryKey: ['forum', 'replies', id] });
    await queryClient.invalidateQueries({ queryKey: ['forum', 'thread', id] });
  };

  const handleToggleSubscription = async () => {
    if (!id || !user?.wallet_address) return;
    try {
      await toggleThreadSubscription(id, user.wallet_address, !isSubscribed);
      await queryClient.invalidateQueries({
        queryKey: ['forum', 'subscription', id, user.wallet_address],
      });
    } catch {
      Alert.alert('Fehler', 'Benachrichtigungen konnten nicht geändert werden.');
    }
  };

  const isOwn = (walletAddress: string) =>
    !!user?.wallet_address && walletAddress.toLowerCase() === user.wallet_address.toLowerCase();

  const findReply = (replyId: string) => repliesById.get(replyId);

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

  const isOwnerOfTarget = (target: OptionsTarget | null): boolean => {
    if (!target || !thread) return false;
    if (target.type === 'thread') return isOwn(thread.wallet_address);
    const reply = findReply(target.id);
    return reply ? isOwn(reply.wallet_address) : false;
  };

  const handleShareTarget = (target: OptionsTarget | null) => {
    if (!target || !thread) return;
    if (target.type === 'thread') {
      void shareForumThread(thread.title, thread.id);
      return;
    }
    const reply = findReply(target.id);
    if (reply) void shareForumReply(reply.body, thread.id);
  };

  const handleCopyTarget = async (target: OptionsTarget | null) => {
    if (!target || !thread) return;
    const body = target.type === 'thread' ? thread.body : findReply(target.id)?.body;
    if (body) await Clipboard.setStringAsync(body);
  };

  const handleEditTarget = (target: OptionsTarget | null) => {
    if (!target || !thread) return;
    if (target.type === 'thread') {
      router.push(`/forum/new?edit=${thread.id}` as any);
      return;
    }
    const reply = findReply(target.id);
    if (reply) {
      setReplyTo(null);
      setEditingReply(reply);
      setDraft(reply.body);
    }
  };

  const handleDeleteTarget = (target: OptionsTarget | null) => {
    if (!target || !thread) return;
    if (target.type === 'thread') {
      handleDeleteThread();
      return;
    }
    const reply = findReply(target.id);
    if (reply) handleDeleteReply(reply);
  };

  const handleReport = async (reason: string) => {
    if (!reportFor || !user?.wallet_address) return;
    await reportForumContent(reportFor.type, reportFor.id, user.wallet_address, reason);
  };

  const startReply = useCallback((reply: ForumReplyRecord) => {
    setEditingReply(null);
    setReplyTo({
      id: reply.id,
      parentId: reply.parent_reply_id ?? reply.id,
      name: replyDisplayName(reply),
    });
  }, []);

  const openReplyOptions = useCallback((reply: ForumReplyRecord) => {
    setOptionsFor({ type: 'reply', id: reply.id });
  }, []);

  const renderGroup = ({ item }: { item: GroupedReply }) => (
    <ForumReplyThread
      group={item}
      byId={repliesById}
      // The thread is read INSIDE the callback body, never as `thread!.x` in
      // an argument list: React Compiler hoists such reads into the memo
      // check, which runs on the first render while the query is pending.
      threadAuthorWallet={thread ? thread.wallet_address : ''}
      expanded={expanded.has(item.id)}
      onToggleExpanded={toggleExpanded}
      myVote={(replyId) => myVote('reply', replyId)}
      onVoted={(replyId, next) => setLocal('reply', replyId, next)}
      onReply={startReply}
      onOptions={openReplyOptions}
    />
  );

  const isOfficial = thread?.source === 'buergerrat';

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
          {user?.wallet_address ? (
            <Pressable
              onPress={handleToggleSubscription}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={
                isSubscribed ? 'Benachrichtigungen deaktivieren' : 'Benachrichtigungen aktivieren'
              }
            >
              <Ionicons
                name={isSubscribed ? 'notifications' : 'notifications-outline'}
                size={22}
                color={isSubscribed ? colors.primary : colors.textPrimary}
              />
            </Pressable>
          ) : (
            <View style={{ width: 24 }} />
          )}
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
            data={groupedReplies}
            keyExtractor={(r) => r.id}
            renderItem={renderGroup}
            extraData={expanded}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={[styles.threadHead, { borderColor: colors.borderTertiary }]}>
                {isOfficial ? (
                  <View style={styles.officialRow}>
                    <Text style={[styles.category, { color: colors.primary }]}>
                      BÜRGERRAT · EMPFEHLUNG {thread.source_rank ?? '–'} VON {BUERGERRAT_TOTAL}
                    </Text>
                    {thread.source_score != null && (
                      <View style={[styles.scoreChip, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.scoreText, { color: colors.primary }]}>
                          {thread.source_score} Punkte
                        </Text>
                      </View>
                    )}
                  </View>
                ) : thread.category?.name ? (
                  <Text style={[styles.category, { color: colors.primary }]}>
                    {thread.category.name.toUpperCase()}
                  </Text>
                ) : null}

                <Text style={[styles.title, { color: colors.textPrimary }]}>{thread.title}</Text>

                {isOfficial && (
                  <ForumStageStepper stage={thread.stage} events={thread.stage_events ?? []} />
                )}

                <PostAuthorRow
                  author={thread.author}
                  createdAt={thread.created_at}
                  badge={isOfficial ? 'Eingestellt' : undefined}
                  onMore={() => setOptionsFor({ type: 'thread', id: thread.id })}
                />
                {thread.edited_at ? (
                  <Text style={[styles.editedText, { color: colors.textTertiary }]}>Bearbeitet</Text>
                ) : null}

                <Text style={[styles.body, { color: colors.textPrimary }]}>{thread.body}</Text>

                {isOfficial && thread.official_comment ? (
                  <View
                    style={[
                      styles.quote,
                      { borderLeftColor: colors.border, backgroundColor: colors.surfaceSecondary },
                    ]}
                  >
                    <Text style={[styles.quoteHeading, { color: colors.textSecondary }]}>
                      Kommentar des Bürgermeisters (aus der Broschüre)
                    </Text>
                    <Text style={[styles.quoteBody, { color: colors.textPrimary }]}>
                      {thread.official_comment}
                    </Text>
                  </View>
                ) : null}

                {isOfficial && thread.source_citation ? (
                  <Text style={[styles.citation, { color: colors.textSecondary }]}>
                    Quelle: {thread.source_citation}
                    {thread.source_url ? (
                      <Text
                        style={[styles.citationLink, { color: colors.primary }]}
                        onPress={() => {
                          if (thread.source_url) void Linking.openURL(thread.source_url);
                        }}
                      >
                        {' '}· NDR-Bericht
                      </Text>
                    ) : null}
                  </Text>
                ) : null}

                {thread.stage && !isOfficial ? (
                  <Text style={[styles.stageLine, { color: colors.textSecondary }]}>
                    Stand: {STAGE_LABELS[thread.stage]}
                  </Text>
                ) : null}

                <View style={styles.threadHeadActions}>
                  <ForumVoteCluster
                    targetType="thread"
                    targetId={thread.id}
                    upvotes={thread.upvotes_count ?? 0}
                    downvotes={thread.downvotes_count ?? 0}
                    myVote={myVote('thread', thread.id)}
                    onVoted={(next) => setLocal('thread', thread.id, next)}
                  />
                  <Pressable
                    onPress={() => void shareForumThread(thread.title, thread.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Teilen"
                  >
                    <ShareIcon width={20} height={20} color={colors.textSecondary} />
                  </Pressable>
                </View>
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
          <View style={styles.inputWrap}>
            {sendError ? (
              <Text style={[styles.sendError, { color: colors.error }]}>{sendError}</Text>
            ) : null}
            {editingReply && (
              <View style={[styles.editBanner, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={[styles.editBannerText, { color: colors.textSecondary }]}>
                  Antwort bearbeiten
                </Text>
                <Pressable
                  onPress={() => {
                    setEditingReply(null);
                    setDraft('');
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Bearbeiten abbrechen"
                >
                  <Text style={[styles.editBannerCancel, { color: colors.primary }]}>Abbrechen</Text>
                </Pressable>
              </View>
            )}
            <CommentInput
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                setSendError(null);
              }}
              isSubmitting={sending}
              disableAttachments
              replyingToName={editingReply ? null : (replyTo?.name ?? null)}
              onCancelReply={() => {
                setReplyTo(null);
                setEditingReply(null);
                setDraft('');
              }}
              walletAddress={user?.wallet_address}
              avatarUrl={activeProfileImage.url}
              avatarFallbackInitial={activeProfileImage.fallbackInitial}
              onSubmit={async (content) => {
                await handleSubmit(content);
              }}
            />
          </View>
        )}
      </KeyboardAvoidingView>

      <ForumOptionsDrawer
        visible={!!optionsFor}
        onClose={() => setOptionsFor(null)}
        targetType={optionsFor?.type ?? 'thread'}
        targetId={optionsFor?.id ?? ''}
        isOwner={isOwnerOfTarget(optionsFor)}
        onShare={() => handleShareTarget(optionsFor)}
        onCopy={() => void handleCopyTarget(optionsFor)}
        onReport={() => {
          if (optionsFor) setReportFor(optionsFor);
        }}
        onEdit={() => handleEditTarget(optionsFor)}
        onDelete={() => handleDeleteTarget(optionsFor)}
        isSubscribed={isSubscribed}
        onToggleSubscription={handleToggleSubscription}
      />

      <ReportDrawer
        visible={!!reportFor}
        onClose={() => setReportFor(null)}
        onReport={handleReport}
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
  officialRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  category: { fontSize: 11, fontFamily: fontFamily.semiBold, letterSpacing: 0.6, flexShrink: 1 },
  scoreChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  scoreText: { fontSize: 11, fontFamily: fontFamily.semiBold },
  title: { fontSize: 20, fontFamily: fontFamily.heading, lineHeight: 26 },
  body: { fontSize: 15, fontFamily: fontFamily.regular, lineHeight: 22 },
  quote: {
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  quoteHeading: { fontSize: 11, fontFamily: fontFamily.semiBold, letterSpacing: 0.4 },
  quoteBody: { fontSize: 14, fontFamily: fontFamily.regular, lineHeight: 20 },
  citation: { fontSize: 12, fontFamily: fontFamily.regular, lineHeight: 17 },
  citationLink: { fontFamily: fontFamily.semiBold },
  stageLine: { fontSize: 12, fontFamily: fontFamily.medium },
  replyCount: { fontSize: 12, fontFamily: fontFamily.regular },
  threadHeadActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  editedText: { fontSize: 12, fontFamily: fontFamily.regular },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontSize: 14,
    fontFamily: fontFamily.regular,
    paddingHorizontal: 32,
  },
  inputWrap: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
  sendError: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  editBannerText: { fontSize: 13, fontFamily: fontFamily.medium },
  editBannerCancel: { fontSize: 13, fontFamily: fontFamily.medium },
});
```

- [ ] **Step 2: Type-check**

```bash
cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep -E "app/forum/thread" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add "apps/expo/app/forum/thread/[id].tsx"
git commit -m "feat(expo): thread screen as a real discussion — reply threads, mentions, official Bürgerrat head"
```

---

### Task 10: Umfragen surfaces — card label, Bürgerrat chip, ranked list, tracker card

**Files:**
- Modify: `apps/expo/components/forum/ForumThreadCard.tsx`, `apps/expo/components/forum/ForumCategoryChips.tsx`, `apps/expo/components/feed/FeedHome.tsx` (rathaus `listHeader`)
- Create: `apps/expo/components/forum/BuergerratThreadRow.tsx`, `apps/expo/components/forum/BuergerratTrackerCard.tsx`, `apps/expo/app/forum/buergerrat.tsx`

**Interfaces:**
- Consumes: Task 5 (`STAGE_LABELS`, `BUERGERRAT_*`), Task 7 (`fetchBuergerratThreads`, `fetchBuergerratSummary`).
- Produces: route `/forum/buergerrat`; `<BuergerratTrackerCard />` (self-hiding); `<BuergerratThreadRow thread />`.

- [ ] **Step 1: Card label + stage chip**

In `components/forum/ForumThreadCard.tsx` add `import { STAGE_LABELS } from '@/lib/forum-stages';` and replace the header block:
```tsx
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.primary }]}>
          {thread.source === 'buergerrat'
            ? `BÜRGERRAT · ${thread.source_score ?? 0} PUNKTE`
            : 'DISKUSSION'}
        </Text>
        <View style={styles.headerRight}>
          {thread.stage ? (
            <View style={[styles.categoryChip, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.categoryText, { color: colors.textSecondary }]}>
                {STAGE_LABELS[thread.stage]}
              </Text>
            </View>
          ) : null}
          {thread.category?.name ? (
            <View style={[styles.categoryChip, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.categoryText, { color: colors.primary }]}>{thread.category.name}</Text>
            </View>
          ) : null}
          {thread.edited_at ? (
            <Text style={[styles.editedText, { color: colors.textTertiary }]}>Bearbeitet</Text>
          ) : null}
        </View>
      </View>
```

- [ ] **Step 2: Bürgerrat chip**

In `components/forum/ForumCategoryChips.tsx` change the `chip` navigation to handle the special slug and insert the chip after "Alle":
```tsx
  const chip = (slug: string, name: string) => {
    const active = activeSlug === slug;
    const target = slug === 'alle' ? '/forum' : slug === 'buergerrat' ? '/forum/buergerrat' : `/forum/${slug}`;
    return (
      <Pressable
        key={slug}
        onPress={() => router.push(target as any)}
```
and in the JSX:
```tsx
        {chip('alle', 'Alle')}
        {chip('buergerrat', 'Bürgerrat')}
        {categories.map((c) => chip(c.slug, c.name))}
```
Update the doc comment above `activeSlug` in `Props` to mention `'buergerrat'` as a valid highlighted slug.

- [ ] **Step 3: `BuergerratThreadRow.tsx`**

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { STAGE_LABELS } from '@/lib/forum-stages';
import CommentIcon from '@/assets/icons/comment-02.svg';
import type { ForumThreadRecord } from '@/lib/types/feed';

type Props = { thread: ForumThreadRecord };

/** One recommendation in the ranked Bürgerrat list: rank, title, Punkte, stage, replies. */
export default function BuergerratThreadRow({ thread }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/forum/thread/${thread.id}` as any)}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.borderTertiary },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
      accessibilityRole="button"
    >
      <View style={[styles.rank, { backgroundColor: colors.primaryLight }]}>
        <Text style={[styles.rankText, { color: colors.primary }]}>{thread.source_rank ?? '·'}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {thread.title}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {thread.source_score ?? 0} Punkte
          </Text>
          {thread.stage ? (
            <View style={[styles.stageChip, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.stageText, { color: colors.textSecondary }]}>
                {STAGE_LABELS[thread.stage]}
              </Text>
            </View>
          ) : null}
          <View style={styles.replies}>
            <CommentIcon width={14} height={14} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>{thread.reply_count}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 13, fontFamily: fontFamily.bold },
  body: { flex: 1, gap: 6 },
  title: { fontSize: 15, fontFamily: fontFamily.semiBold, lineHeight: 20 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  metaText: { fontSize: 12, fontFamily: fontFamily.regular },
  stageChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  stageText: { fontSize: 11, fontFamily: fontFamily.medium },
  replies: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
```

- [ ] **Step 4: `app/forum/buergerrat.tsx`**

```tsx
import React from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, RefreshControl, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import ForumCategoryChips from '@/components/forum/ForumCategoryChips';
import BuergerratThreadRow from '@/components/forum/BuergerratThreadRow';
import { fetchBuergerratThreads } from '@/lib/supabase-forum';
import {
  BUERGERRAT_CITATION,
  BUERGERRAT_NDR_URL,
  BUERGERRAT_TITLE,
  BUERGERRAT_YEAR_LABEL,
} from '@/lib/buergerrat';

/** The 11 recommendations, ranked by Punkte, each opening its discussion thread. */
export default function BuergerratScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data: threads = [], isFetching, refetch } = useQuery({
    queryKey: ['forum', 'buergerrat', 'threads'],
    queryFn: fetchBuergerratThreads,
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{BUERGERRAT_YEAR_LABEL}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ForumCategoryChips activeSlug="buergerrat" showNewCta={false} />
      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <BuergerratThreadRow thread={item} />}
        ListHeaderComponent={
          <View style={[styles.intro, { borderBottomColor: colors.borderTertiary }]}>
            <Text style={[styles.introTitle, { color: colors.textPrimary }]}>{BUERGERRAT_TITLE}</Text>
            <Text style={[styles.introText, { color: colors.textSecondary }]}>
              Zitiert aus der Broschüre. Quelle: {BUERGERRAT_CITATION}.{' '}
              <Text
                style={[styles.introLink, { color: colors.primary }]}
                onPress={() => void Linking.openURL(BUERGERRAT_NDR_URL)}
              >
                NDR-Bericht
              </Text>
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.textSecondary} />
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            Noch keine Empfehlungen eingetragen.
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
  headerTitle: { fontSize: 17, fontFamily: fontFamily.semiBold },
  intro: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  introTitle: { fontSize: 20, fontFamily: fontFamily.heading, lineHeight: 26 },
  introText: { fontSize: 12, fontFamily: fontFamily.regular, lineHeight: 17 },
  introLink: { fontFamily: fontFamily.semiBold },
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

- [ ] **Step 5: `BuergerratTrackerCard.tsx`**

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { fetchBuergerratSummary } from '@/lib/supabase-forum';
import { BUERGERRAT_YEAR_LABEL } from '@/lib/buergerrat';

const ILLUSTRATION = require('@/assets/illustration/buergerumfragen-cropped.png');

/**
 * Pinned entry at the top of the Umfragen tab: how many recommendations,
 * how many decided / done. Hides itself when there is nothing to track.
 */
export default function BuergerratTrackerCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ['forum', 'buergerrat', 'summary'],
    queryFn: fetchBuergerratSummary,
    staleTime: 5 * 60_000,
  });
  if (!data || data.count === 0) return null;

  return (
    <Pressable
      onPress={() => router.push('/forum/buergerrat' as any)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surfaceSecondary },
        pressed && { opacity: 0.92 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Bürgerrat-Empfehlungen ansehen"
    >
      <Image source={ILLUSTRATION} style={styles.illustration} contentFit="contain" />
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{BUERGERRAT_YEAR_LABEL}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
          {data.count} Empfehlungen · {data.beschlossen} beschlossen · {data.umgesetzt} umgesetzt
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
  },
  illustration: { width: 44, height: 44 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontFamily: fontFamily.semiBold },
  sub: { fontSize: 12, fontFamily: fontFamily.regular },
});
```

- [ ] **Step 6: Mount the tracker on the Umfragen tab**

In `components/feed/FeedHome.tsx` add `import BuergerratTrackerCard from '../forum/BuergerratTrackerCard';` and change the rathaus `listHeader` to:
```tsx
            listHeader={
              <View>
                <ForumCategoryChips activeSlug="alle" showNewCta={false} />
                <BuergerratTrackerCard />
              </View>
            }
```

- [ ] **Step 7: Type-check**

```bash
cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep -E "ForumThreadCard|ForumCategoryChips|Buergerrat|forum/buergerrat|FeedHome" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 8: Commit**

```bash
git add apps/expo/components/forum/ForumThreadCard.tsx apps/expo/components/forum/ForumCategoryChips.tsx apps/expo/components/forum/BuergerratThreadRow.tsx apps/expo/components/forum/BuergerratTrackerCard.tsx apps/expo/app/forum/buergerrat.tsx apps/expo/components/feed/FeedHome.tsx
git commit -m "feat(expo): Bürgerrat chip, ranked recommendation list, and tracker card on the Umfragen tab"
```

---

### Task 11: Main feed card after the first post

**Files:**
- Modify: `apps/expo/lib/feed-assembler.ts`, `apps/expo/hooks/useFeed.ts`, `apps/expo/components/feed/FeedList.tsx`, `apps/expo/components/feed/FeedHome.tsx`
- Create: `apps/expo/components/feed/FeedBuergerratCard.tsx`
- Test: `apps/expo/lib/__tests__/feed-assembler-buergerrat.test.ts`

**Interfaces:**
- Consumes: `BuergerratSummary`, `FeedSections.buergerrat` (Task 7), `isBuergerratNew`, `BUERGERRAT_TITLE` (Task 5).
- Produces: `assembleFeed({ …, buergerrat?: BuergerratSummary | null })`, `FeedList` prop `onOpenUmfragen?: () => void`, `<FeedBuergerratCard summary onPress />`.

- [ ] **Step 1: Failing assembler test**

`apps/expo/lib/__tests__/feed-assembler-buergerrat.test.ts`:
```ts
import { assembleFeed } from '../feed-assembler';
import type { BuergerratSummary, PostRecord } from '../types/feed';

const post = (id: string, createdAt: string): PostRecord =>
  ({ id, created_at: createdAt, post_type: 'user', pinned_until: null }) as unknown as PostRecord;

const summary: BuergerratSummary = {
  count: 11,
  newestCreatedAt: '2026-09-16T10:00:10Z',
  beschlossen: 0,
  umgesetzt: 0,
};

const base = {
  alerts: [],
  deals: [],
  marketplaceListings: [],
  upcomingEvents: [],
};

describe('assembleFeed Bürgerrat card', () => {
  it('sits right after the first post on the main feed', () => {
    const items = assembleFeed({
      ...base,
      posts: [post('p1', '2026-09-16T10:00:00Z'), post('p2', '2026-09-16T09:00:00Z')],
      buergerrat: summary,
      feedType: 'main',
    });
    expect(items.map((i) => i.id)).toEqual(['post-p1', 'buergerrat-card', 'post-p2']);
    expect(items[1].type).toBe('buergerrat_card');
  });

  it('is absent without recommendations and on the rathaus feed', () => {
    const none = assembleFeed({ ...base, posts: [post('p1', '2026-09-16T10:00:00Z')], buergerrat: { ...summary, count: 0 }, feedType: 'main' });
    expect(none.find((i) => i.type === 'buergerrat_card')).toBeUndefined();
    const rathaus = assembleFeed({ ...base, posts: [post('p1', '2026-09-16T10:00:00Z')], buergerrat: summary, feedType: 'rathaus' });
    expect(rathaus.find((i) => i.type === 'buergerrat_card')).toBeUndefined();
  });
});
```
Run: `cd apps/expo && npx jest lib/__tests__/feed-assembler-buergerrat.test.ts --watchAll=false` → FAIL (`buergerrat` not a known param / card missing).

- [ ] **Step 2: Assembler**

In `lib/feed-assembler.ts`:
- Add `BuergerratSummary` to the type import from `./types/feed`.
- Add the constant next to the other positions: `const BUERGERRAT_CARD_POSITION = 1; // right after the first post`.
- Add `buergerrat?: BuergerratSummary | null;` to the params type and `buergerrat = null,` to the destructuring.
- Add `buergerrat: false,` to `sectionInjected`.
- Insert as the FIRST check inside the `while` loop (before the special-menus block):
```ts
    // Bürgerrat card right after the first post (spec §10). Checked first so
    // it wins position 1; the other sections cascade one slot down.
    if (
      !sectionInjected.buergerrat &&
      buergerrat &&
      buergerrat.count > 0 &&
      feedPosition >= BUERGERRAT_CARD_POSITION
    ) {
      items.push({ type: 'buergerrat_card', data: buergerrat, id: 'buergerrat-card' });
      sectionInjected.buergerrat = true;
      feedPosition++;
      continue;
    }
```
Run the test → PASS. Also run `npx jest lib/__tests__/feed-assembler-forum.test.ts --watchAll=false` → still PASS.

- [ ] **Step 3: Hook**

In `hooks/useFeed.ts` add `buergerrat: s?.buergerrat ?? null,` to the `assembleFeed({ … })` call (after `forumThreads`).

- [ ] **Step 4: `FeedBuergerratCard.tsx`**

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { BUERGERRAT_TITLE, isBuergerratNew } from '@/lib/buergerrat';
import type { BuergerratSummary } from '@/lib/types/feed';

const ILLUSTRATION = require('@/assets/illustration/buergerumfragen.png');

type Props = {
  summary: BuergerratSummary;
  onPress: () => void;
};

/** Main-feed entry into the Bürgerrat recommendations (Max's mockup, 2026-09-16). */
export default function FeedBuergerratCard({ summary, onPress }: Props) {
  const { colors } = useTheme();
  const isNew = isBuergerratNew(summary.newestCreatedAt);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surfaceSecondary },
        pressed && { opacity: 0.92 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Bürgerrat: Empfehlungen ansehen"
    >
      <Image source={ILLUSTRATION} style={styles.illustration} contentFit="contain" />
      <View style={styles.labelRow}>
        {isNew && (
          <View style={[styles.pill, { borderColor: colors.border }]}>
            <Text style={[styles.pillText, { color: colors.textSecondary }]}>NEU</Text>
          </View>
        )}
        <Text style={[styles.label, { color: colors.primary }]}>Bürgerrat</Text>
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{BUERGERRAT_TITLE}</Text>
      <View style={[styles.button, { backgroundColor: colors.primary }]}>
        <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Mehr dazu</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.onPrimary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12,
  },
  illustration: { width: 190, height: 190 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12, fontFamily: fontFamily.medium, letterSpacing: 0.4 },
  label: { fontSize: 17, fontFamily: fontFamily.medium },
  title: { fontSize: 26, lineHeight: 32, fontFamily: fontFamily.heading, textAlign: 'center' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  buttonText: { fontSize: 16, fontFamily: fontFamily.semiBold },
});
```

- [ ] **Step 5: FeedList**

In `components/feed/FeedList.tsx`:
- Add `import FeedBuergerratCard from './FeedBuergerratCard';` and `BuergerratSummary` to the type import from `@/lib/types/feed`.
- Add to `Props` (after `showProposalHero`):
```ts
  /** Opens the Umfragen tab (or the ranked list for users without city tabs) from the Bürgerrat card. */
  onOpenUmfragen?: () => void;
```
- Destructure `onOpenUmfragen,` with the other props.
- Add a case before `case 'proposal_hero':`:
```tsx
        case 'buergerrat_card':
          return (
            <View style={styles.moduleWrap}>
              <FeedBuergerratCard
                summary={item.data as BuergerratSummary}
                onPress={onOpenUmfragen ?? (() => {})}
              />
            </View>
          );
```
- Add `onOpenUmfragen` to the dependency array of the `renderItem` `useCallback` (the list that already contains `forumMyVote, setForumVoteLocal`).

- [ ] **Step 6: FeedHome**

In `components/feed/FeedHome.tsx`, on the **main** `FeedList` add:
```tsx
            onOpenUmfragen={
              canAccessCityTabs
                ? () => handleTabChange('rathaus')
                : () => router.push('/forum/buergerrat' as any)
            }
```

- [ ] **Step 7: Type-check + tests**

```bash
cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep -E "feed-assembler|useFeed|FeedList|FeedHome|FeedBuergerratCard" || echo "clean"
npx jest lib/__tests__ --watchAll=false
```
Expected: `clean`; all suites in `lib/__tests__` pass (the two pre-existing env-broken suites `xmtp/native.test.ts` and `ThemedText-test.tsx` are outside this path).

- [ ] **Step 8: Commit**

```bash
git add apps/expo/lib/feed-assembler.ts apps/expo/hooks/useFeed.ts apps/expo/components/feed/FeedList.tsx apps/expo/components/feed/FeedHome.tsx apps/expo/components/feed/FeedBuergerratCard.tsx apps/expo/lib/__tests__/feed-assembler-buergerrat.test.ts
git commit -m "feat(expo): Bürgerrat card after the first post, opening the Umfragen tab"
```

---

### Task 12: Explorer kinds (manifest + indexer help)

**Files:**
- Modify: `packages/protocol/examples/roebel.netizen.json` (`services.indexer.kinds`), `packages/indexer/src/api.ts` (HTML kind list)

- [ ] **Step 1: Widen the indexer kinds**

In `packages/protocol/examples/roebel.netizen.json`, in `services.indexer.kinds`, insert `11, 1111,` after `1,` and append `32107` after `32106` (keep JSON valid, 8-space indentation like the neighbours).

- [ ] **Step 2: Document them in the explorer**

In `packages/indexer/src/api.ts`, after the `<li>` for kind 1 add:
```html
<li><a href="/events?kinds=11&amp;limit=20">11</a> / <a href="/events?kinds=1111&amp;limit=20">1111</a> — Umfragen-Forum: Themen (NIP-7D threads, <code>title</code>/<code>t</code> tags; <code>t:buergerrat</code> = quoted Bürgerrat recommendation with <code>score</code>/<code>rank</code>/<code>r</code>) and Antworten (NIP-22 comments)</li>
```

- [ ] **Step 3: Run the manifest consumers' tests**

```bash
cd packages/protocol && pnpm test
cd ../cli && pnpm test
cd ../indexer && pnpm test
```
Expected: all green (rule from the NSP-12 work: whenever `examples/roebel.netizen.json` changes, the CLI suite runs too). If a snapshot of the kinds list fails, update it to include 11, 1111, 32107.

- [ ] **Step 4: Commit — and STOP here for the node**

```bash
git add packages/protocol/examples/roebel.netizen.json packages/indexer/src/api.ts
git commit -m "feat(node): index forum kinds 11/1111/32107 so threads and replies reach index.roebel.app"
```
Deploying (`netizen render` + `netizen up --host` on the CX23, then let the indexer backfill from the relay) touches the production node and waits for Max's explicit OK. Do not SSH.

---

### Task 13: Verification and handoff

**Files:** none new.

- [ ] **Step 1: Full jest + type check**

```bash
cd apps/expo && npx jest --watchAll=false 2>&1 | tail -15
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep -E "forum|buergerrat|Buergerrat|feed-assembler|feed-sections|useFeed|FeedList|FeedHome|FeedEventCard|nostr/publish|types/feed" || echo "touched files clean"
```
Expected: only the two known env-broken suites fail; `touched files clean`.

- [ ] **Step 2: Run the app on the Android emulator**

Follow the `run` skill for this project. Verify by eye: (a) main feed shows the Bürgerrat card after the first post, tap switches to Umfragen; (b) Umfragen shows the tracker card + "Bürgerrat" chip; (c) `/forum/buergerrat` lists 11 rows ranked 1..11; (d) a Bürgerrat thread shows label, score chip, stepper with "Diskussion" current and one Verlauf line, body, Bürgermeister quote on ranks 2/7/9, citation with NDR link; (e) replying to a reply shows the "@Name" prefix and the rail; three or more children collapse; (f) no light frame on the first event card in dark mode; (g) no "Strukturierte Debatte" anywhere.

- [ ] **Step 3: Relay check**

After Max opens the app once (sweep runs on enrollment + after posting), count kind-11 events on the relay:
```bash
node -e '
const ws = new WebSocket("wss://relay.roebel.app"); const c={};
ws.onopen=()=>ws.send(JSON.stringify(["REQ","q",{kinds:[11,1111],limit:200}]));
ws.onmessage=(m)=>{const d=JSON.parse(m.data); if(d[0]==="EVENT"){c[d[2].kind]=(c[d[2].kind]||0)+1;} if(d[0]==="EOSE"){console.log(c);process.exit(0);}};
setTimeout(()=>process.exit(0),10000);'
```
Expected: kind 11 = 14 (3 existing + 11 seeded) once Max's device has swept.

- [ ] **Step 4: Push and hand over**

```bash
git push -u origin feat/buergerrat-diskussion
```
Report to Max: what shipped, that the migration + seed are live in production, the flag flip, the two things only he does (run `eas update`; OK the node redeploy for the explorer), and that the first app open on his device mirrors the 11 threads to the relay.
