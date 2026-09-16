# Bürgerrat recommendations as tracked discussions — Umfragen tab

- **Date:** 2026-09-16
- **Status:** Approved by Max in conversation (2026-09-16), implementation follows
- **Scope:** apps/expo (primary), Supabase migrations, packages/nostr, packages/protocol manifest, node ops
- **Relates to:** Umfragen-Forum spec (`2026-08-29-umfragen-forum-design.md`), NSP-12 Public Decision Record (`2026-07-31-nsp12-public-decision-record-design.md`), Deliberate test env (`2026-09-02-deliberate-debates-test-env-design.md`)

## 1. Problem

The Bürgerrat Röbel/Müritz (Bürgerräte für MV) handed 11 recommendations for a more liveable Innenstadt to the Stadtvertretung on 2026-09-15 (NDR, 15.09.2026). The Röbel app has a forum on the Umfragen tab, but nothing that can carry an official recommendation, cite its source, show where it stands in the town's process, or let citizens discuss it in a thread that reads like a real discussion.

Three things are in the way:

1. The thread screen renders replies as a flat list with a small indent. It does not read like the discussion threads citizens know from Facebook groups (avatar rail, author badge, connector lines, collapsed replies, @-mentions).
2. Threads have no notion of source or stage. A Bürgerrat recommendation would look like any citizen post.
3. The Deliberate on-chain debate UI sits on the same screen and competes for the same space. Max decided to remove it for now.

End goal (unchanged, later slices): discussion → on-chain proposal → execution → results, with Mecky in the loop at every step, including "@Mecky" inside a thread.

## 2. Decisions (settled with Max, 2026-09-16)

| Decision | Choice |
|---|---|
| Where the 11 recommendations live | As forum threads (Themen) in the Umfragen tab, one per recommendation. Not feed posts. |
| Who posts them | The "Stadt Röbel" organisation account (Max's decision 2026-09-16, revised from his personal account; Max co-owns that account). Row owner (wallet) stays Max for edit/delete. |
| Neutrality | Every thread is labelled as a quote from the brochure, carries the citation and the NDR link, and includes the Bürgermeister comments verbatim where the brochure has one. Empfehlung 7 stays complete including the Mein-Ort-App remark. |
| Deliberate | UI removed from the app. `lib/deliberate` and `constants/deliberate.ts` stay as a dormant, tested protocol module. Remote flag set to `false` so already-shipped builds hide it too. |
| Discussion UI | Facebook-group style thread: avatar rail, "Autor" badge, connector lines, `@Name` prefix on targeted replies, replies collapsed behind "N Antworten anzeigen" when more than two. Chronological order, no "Beste" sort yet. |
| Stage tracking | `stage` on threads using the NSP-12 vocabulary, plus a history table. Admin-only writes (SQL for now, no admin page). |
| Main feed | A Bürgerrat card after the first post (Max's mockup). Tap switches to the Umfragen tab. |
| Nostr | Threads, replies and votes stay on the relay (already dual-written). The explorer must index them. Sweep gains forum retries so nothing stays unmirrored. |
| Mecky in threads | Next slice. This slice reserves the seams (AI badge on replies, `author_kind` column, watcher and backfeed kinds named in §11). |

## 3. Scope

**In:** Deliberate UI removal; thread screen redesign; Bürgerrat data model, rendering, ranked list screen, category chip, tracker card on the Umfragen tab; main-feed Bürgerrat card; dark-mode event card border fix; seed of the 11 recommendations; kind-11 tags for official threads; Nostr sweep for forum content; manifest indexer kinds; two new forum categories.

**Out (named next slices):** kind-2100 stage transitions on Nostr; Mecky answering inside threads; backfeed of kind 1111; admin page for stage changes; kind 32107 category publication (still slice B of the forum spec); "Beste" sort; web forum pages.

## 4. Deliberate removal

Delete:

- `apps/expo/app/forum/debate/[id].tsx`, `apps/expo/app/forum/debate/new.tsx`
- `apps/expo/components/forum/DebateComposerSheet.tsx`, `DebateStakeSheet.tsx`, `DebateStrip.tsx`
- `isDeliberateDebatesEnabled` in `lib/supabase-app-settings.ts`
- `attachDebateToThread` in `lib/supabase-forum.ts`
- the `DebateStrip` usage in `ForumThreadCard.tsx`, and the strip, the "Strukturierte Debatte starten" button and the `debatesEnabled` query in `app/forum/thread/[id].tsx`
- `debate_id` / `debate_created_by` from `ForumThreadRecord` (the columns stay in the database; nothing reads them)

Keep, with a header comment marking them dormant: `lib/deliberate/*` (+ tests), `constants/deliberate.ts`. The contract on Gnosis is unchanged.

Operational: `app_settings.deliberate_debates_enabled` = `'false'`.

Routes are file-based (expo-router); no `_layout.tsx` registration exists for the debate screens, so deleting the files removes the routes.

## 5. Thread screen — discussion UI

`app/forum/thread/[id].tsx` keeps its data flow (react-query, realtime invalidation, `CommentInput`, options drawer, report drawer). The reply rendering moves into two new components under `components/forum/`:

**`ForumReplyItem`** — one reply row.
- Left: `UserAvatarWithFrame` (32px top-level, 28px nested), tappable to the profile via the existing `openAuthorProfile` / `canOpenProfile` helpers.
- Name row: display name (org name for org accounts), `VerifiedBadge`, "· relative time", "· Bearbeitet" when edited, an **"Autor"** badge when `reply.wallet_address` equals the thread author's wallet, and a **"KI"** badge when `reply.author_kind === 'agent'` (AI Act Art. 50 label; nothing sets it yet).
- Body: when `reply.reply_to_reply_id` resolves to a loaded reply whose author differs from the direct parent's author, the body is prefixed with `@Name` in `colors.primary` (tappable to that profile). Otherwise plain body.
- Action row: "Antworten" with the new `assets/icons/reply.svg`, then the `ForumVoteCluster` (compact) right-aligned.
- Long-press on the row opens the existing options drawer for that reply (`setOptionsFor({type:'reply', id})`). A small "…" in the name row does the same for discoverability.
- Fonts via `fontFamily` tokens from `constants/theme.ts`.

**`ForumReplyThread`** — a top-level reply plus its children.
- Children render inside a container with a vertical connector rail (`borderLeftWidth` 1.5 in `colors.borderTertiary`) whose x aligns with the parent avatar's centre, and a short horizontal elbow into each child avatar.
- When `children.length > 2` and the thread is not expanded, children are hidden behind a "N Antworten anzeigen" pressable (with a short connector, same idiom as `CommentThread`). "Antworten ausblenden" when expanded. Two or fewer children render inline.
- Expanded set lives in the screen (`Set<string>` of top-level ids). A parent is auto-expanded when the viewer just replied under it.

**Grouping** stays single-level (`parent_reply_id` always points at a top-level reply). `groupReplies` moves to `lib/forum-replies.ts` as a pure function with jest coverage, and gains `resolveMentionName(reply, byId)` for the `@Name` prefix.

**Reply target.** `replyTo` keeps `{ id, parentId, name }`. `createForumReply` now sends `reply_to_reply_id: replyTo.id` in addition to `parent_reply_id: replyTo.parentId`. The Nostr mirror uses `reply_to_reply_id ?? parent_reply_id` as the NIP-22 parent so the `e` tag points at the actually answered comment.

**Thread head** (same file): unchanged for citizen threads except the vote cluster stays; Bürgerrat threads render the official block described in §7.

Empty state, comment bar, edit banner, subscription bell: unchanged.

## 6. Data model (Supabase, one migration `20260916_buergerrat_threads.sql`)

`forum_replies`:
- `reply_to_reply_id uuid null references forum_replies(id)` — the directly answered reply (may be nested); `parent_reply_id` keeps pointing at the top-level parent.
- `author_kind text not null default 'citizen' check (author_kind in ('citizen','agent'))`.
- `notify_forum_reply` also notifies the author of `reply_to_reply_id` (deduplicated with the existing recipients).

`forum_threads`:
- `source text not null default 'citizen' check (source in ('citizen','buergerrat'))`
- `source_rank int null`, `source_score int null` (Punkte), `source_citation text null`, `source_url text null`, `official_comment text null` (the Bürgermeister comment, verbatim)
- `stage text null check (stage in ('idee','entwurf','diskussion','meinungsbild','beschlussvorlage','beschlossen','abgelehnt','umgesetzt','ruhend','zurueckgezogen'))` — the NSP-12 `STAGES` list from `packages/protocol/src/decisions.ts`, mirrored as a CHECK.
- Guard trigger `forum_threads_guard_official` (BEFORE INSERT): unless `current_user` is `postgres`, `supabase_admin` or `service_role`, force `source='citizen'`, and null `source_rank`, `source_score`, `source_citation`, `source_url`, `official_comment`, `stage`. Clients insert through the anon key (`forum_threads_insert` policy is `status='published'` for `public`), so this is what keeps official fields admin-only. Direct client UPDATEs do not exist (no update policy); the owner-checked RPC touches only title/body/category.

`forum_thread_stage_events` (new):
- `id uuid pk default gen_random_uuid()`, `thread_id uuid not null references forum_threads(id) on delete cascade`, `stage text not null` (same CHECK), `note text null`, `occurred_at timestamptz not null default now()`, `created_at timestamptz not null default now()`.
- RLS on; `select` for `public`; no insert/update/delete policies (service role and SQL only).
- AFTER INSERT trigger sets `forum_threads.stage = NEW.stage` and `updated_at = now()`.
- Index `(thread_id, occurred_at)`.

`forum_categories`: insert `gesundheit` ("Gesundheit & Sport", "Ärzte, Fitness, Sportflächen", sort 5) and `zusammenleben` ("Zusammenleben", "Begegnung, Engagement, Kommunikation", sort 6). Kind-32107 publication of categories remains slice B of the forum spec.

Types: `ForumThreadRecord` gains `source`, `source_rank`, `source_score`, `source_citation`, `source_url`, `official_comment`, `stage`, optional `stage_events`; `ForumReplyRecord` gains `reply_to_reply_id`, `author_kind`. `CreateForumReplyInput` gains `reply_to_reply_id`.

## 7. Bürgerrat threads — rendering

**Feed card (`ForumThreadCard`)** for `source === 'buergerrat'`: label "BÜRGERRAT · 13 PUNKTE" instead of "DISKUSSION", a stage chip (§8 labels) next to the category chip. Everything else unchanged.

**Thread head** for `source === 'buergerrat'`, top to bottom:
1. Label row: "BÜRGERRAT · EMPFEHLUNG 1 VON 11" in `colors.primary`, score chip "13 Punkte" on the right.
2. Title.
3. Stage stepper (§8).
4. Author row (`PostAuthorRow`) with badge "eingestellt" — the poster is the person who typed it in, not the Bürgerrat.
5. Body (plain text; structure in §9).
6. Official comment block when present: quote-styled (left rule in `colors.border`, `surfaceSecondary` background), heading "Kommentar des Bürgermeisters (aus der Broschüre)", then the verbatim text.
7. Citation line: "Quelle: <source_citation>" with a "NDR-Bericht" link when `source_url` is set (opens via `Linking.openURL`).
8. Vote cluster + share, reply count (unchanged).

`fetchForumThread` also loads `stage_events` (ordered by `occurred_at`) via a PostgREST embed.

## 8. Stage tracking

Stage vocabulary and German labels (UI):

| stage | label |
|---|---|
| idee | Idee |
| entwurf | Entwurf |
| diskussion | Diskussion |
| meinungsbild | Meinungsbild |
| beschlussvorlage | Beschlussvorlage |
| beschlossen | Beschlossen |
| abgelehnt | Abgelehnt |
| umgesetzt | Umgesetzt |
| ruhend | Ruhend |
| zurueckgezogen | Zurückgezogen |

`lib/forum-stages.ts` exports `STAGE_LABELS`, `STEPPER_STAGES = ['diskussion','beschlussvorlage','beschlossen','umgesetzt']`, `TERMINAL_STAGES = ['abgelehnt','ruhend','zurueckgezogen']`, and `stepperState(stage)` returning the index of the current step or the terminal badge. Jest-covered.

**`ForumStageStepper`** (`components/forum/`): four dots joined by lines, current step filled in `colors.primary`, past steps filled, future steps outlined; the label under the current step; a terminal stage renders a single badge ("Abgelehnt" in `colors.error`, "Ruhend"/"Zurückgezogen" in `colors.textSecondary`) in place of the stepper. Below it, the **Verlauf** list: one line per stage event, "15.09.2026 · Diskussion · Empfohlen vom Bürgerrat (4. Sitzung, 13 Punkte)".

Bürgerrat threads enter at `diskussion` with one stage event dated 2026-09-15 (the handover to the Stadtvertretung reported by NDR). Stage changes are SQL inserts into `forum_thread_stage_events` for now.

Citizen threads keep `stage = null` and show no stepper. The v2 promotion ladder for citizen threads (forum spec §10) reuses this column.

## 9. Content and seeding

Source of truth for the texts: `docs/buergerrat/2026-empfehlungen.md` (committed with this spec). The seed migration `20260916_buergerrat_2026_seed.sql` mirrors it exactly.

Per thread:
- `wallet_address` = `0xc49de63ccfee46c6c5c3e393293f66779799fb28` (Max, keeps edit/delete rights), `account_id` = the "Stadt Röbel" organisation account `07d8223c-0b94-46db-89d3-5b342980cd75` (changed from Max's personal account on 2026-09-16 at Max's request: the threads show "Stadt Röbel" as author), `status = 'published'`, `source = 'buergerrat'`. Consequence: organisation content is not signed by a citizen device, so these 11 threads reach the relay only once the node publisher maps forum threads (next slice), not through the device sweep.
- `title` = recommendation title without the "Empfehlung N:" prefix.
- `body` (markdown, ≤ 10 000 chars, rendered by the app's `MarkdownRenderer` — Max asked for styled text on 2026-09-16):
  ```
  #### Empfehlung des Bürgerrats
  <recommendation sentence(s)>

  #### Vorschläge zur Umsetzung
  - <item>
    - <sub-item>
  ```
  Additional paragraphs from the brochure (e.g. "Wichtig sind insbesondere …", "Positive Beispiele …") follow as plain paragraphs.
- `official_comment` = the Bürgermeister comment verbatim, or null.
- `source_rank` 1..11, `source_score` = Punkte, `source_citation` = "Bürgerräte für MV — Bürgerrat Röbel/Müritz, Broschüre 2026 (Abstimmung in der 4. Sitzung)", `source_url` = the NDR article URL.
- `category_slug`: 1 ortsentwicklung · 2 ortsentwicklung · 3 gesundheit · 4 ortsentwicklung · 5 gesundheit · 6 ortsentwicklung · 7 zusammenleben · 8 zusammenleben · 9 zusammenleben · 10 bildung · 11 gesundheit.
- `created_at` = seed base time + (11 − rank) seconds, so rank 1 is newest and sorts first in recency lists.
- One `forum_thread_stage_events` row: `stage='diskussion'`, `occurred_at='2026-09-15 18:00+02'`, `note='Empfohlen vom Bürgerrat Röbel/Müritz (4. Sitzung, N Punkte); am 15.09.2026 der Stadtvertretung vorgestellt'`.

The handwritten note about Taschenaschenbecher (Empfehlung 4) is not part of the brochure text and is not seeded; it belongs in a reply from Max if he confirms it.

Idempotency: the seed uses fixed UUIDs (`ON CONFLICT (id) DO NOTHING`) so re-running is safe.

## 10. Umfragen tab and main feed surfaces

**Category rail** (`ForumCategoryChips`): a "Bürgerrat" chip after "Alle" that navigates to `/forum/buergerrat`. It is a source filter, not a category.

**Ranked list screen** `app/forum/buergerrat.tsx`: header "Bürgerrat 2026"; intro line "11 Empfehlungen für eine lebenswerte Innenstadt · Quelle: Broschüre Bürgerräte für MV" with the NDR link; rows via new `BuergerratThreadRow` (rank number, title, "13 Punkte", stage chip, reply count), ordered by `source_rank`. Data: `fetchBuergerratThreads()` in `lib/supabase-forum.ts` (`source = 'buergerrat'`, published, ordered by rank). Reachable by everyone with the app (no citizen gate to read).

**Tracker card on the Umfragen tab** (`BuergerratTrackerCard`, rendered in the rathaus `listHeader` under the chips): small ballot illustration, "Bürgerrat 2026", "11 Empfehlungen · N beschlossen · M umgesetzt" (counts from stages), "Alle ansehen →" to `/forum/buergerrat`. Self-hides when there are no Bürgerrat threads.

**Main feed card** (`FeedBuergerratCard`, new `FeedItem` type `buergerrat_card`): built from Max's mockup — `surfaceSecondary` background, radius 16, no border, centred `assets/illustration/buergerumfragen.png`, a "NEU" pill (outlined, `textSecondary`) next to "Bürgerrat" in `colors.primary`, headline "11 Empfehlungen für eine lebenswerte Innenstadt" (`fontFamily.heading`, centred), a primary button "Mehr dazu →". The "NEU" pill shows for 14 days after the newest Bürgerrat thread's `created_at`. The assembler injects it at feed position 1 (after the first post) on the main feed only; other sections shift by one as they already do for each other.

Data: `fetchBuergerratSummary()` (count, newest `created_at`, stage counts) added to `fetchFeedSections` for main and rathaus; the assembler receives `buergerrat?: BuergerratSummary | null`.

Tap: `FeedList` gets `onOpenUmfragen?: () => void`. `FeedHome` passes `() => handleTabChange('rathaus')` when `canAccessCityTabs`, otherwise `() => router.push('/forum/buergerrat')`.

## 11. Nostr and the explorer

**Already true:** the app dual-writes kind 11 (thread), 1111 (reply), 7 (vote) under the citizen's device key; verified 2026-09-16 on `wss://relay.roebel.app` (3 × kind 11, 5 × kind 1111).

**Explorer gap:** `services.indexer.kinds` in `packages/protocol/examples/roebel.netizen.json` lacks 11, 1111 and 32107, so `index.roebel.app` shows none of them. Add the three kinds; update the kind list in `packages/indexer/src/api.ts`'s HTML help. Deploy = `netizen render` + `netizen up --host` on the CX23 and let the indexer backfill from the relay. **This touches the production node and waits for Max's explicit OK.**

**Official thread tags** (kind 11, `buildForumThreadEvent` gains `extraTags?: string[][]`): `["t","buergerrat"]`, `["r", source_url]`, `["source", source_citation]`, `["score", "13"]`, `["rank", "1"]`. `publishForumThread` passes them when `source === 'buergerrat'`.

**Sweep** (`retryPendingPublications`): after the post branch, for this device's wallet:
1. own personal-account `forum_threads` (published, oldest first, limit 30) that have no ledger row or a `pending`/`rejected` one → `publishForumThread` with the original `created_at`;
2. own `forum_replies` whose thread is on the relay and whose own row is unledgered/pending/rejected → `publishForumReply`;
3. own `nostr_publications` rows of `source_type='forum_vote'` in `pending`/`rejected` → re-read the vote value from `forum_votes` and `publishForumVote`.
Org-account content is skipped (node publishes under the org key, same rule as posts). This is how the SQL-seeded Bürgerrat threads reach the relay: Max opens the app, the sweep signs them with his device key.

**Reply parent:** the NIP-22 `e` parent becomes the directly answered reply (`reply_to_reply_id ?? parent_reply_id`).

**Named next-slice seams (not built here):**
- Stage changes → kind-2100 transitions and a 32100 head citing the kind-11 thread id (NSP-12 slice 2; mover key lives on the node).
- Mecky in threads → `packages/agent-watcher` widens its mention query from `kinds:[1]` to `[1, 11, 1111]`, fetches the thread root + replies from the relay as context, answers as kind 1111 under the agent key; `packages/publisher/src/backfeed.ts` widens `kinds:[1,6,7]` to include 1111 and writes `forum_replies` rows with `author_kind='agent'`. The app's "KI" badge and `author_kind` column are ready for it.

## 12. Dark-mode event card border

`components/feed/FeedEventCard.tsx` paints its 4px frame in `colors.border` in dark mode (a lighter halo) and white in light mode. Both modes now use `colors.background`, which keeps the inset and removes the halo.

## 13. Testing and verification

- Jest: `lib/forum-replies.ts` (grouping, mention resolution, collapse threshold), `lib/forum-stages.ts` (stepper state), `feed-assembler` (card at position 1 on main only, absent on rathaus), `packages/nostr` forum builder (extra tags), sweep selection helper (pure function over ledger + rows).
- Types: full-project `tsc --noEmit` with `NODE_OPTIONS=--max-old-space-size=8192`; judge only files touched here (per-file tsc false-passes under TS 6).
- Live schema check via the Supabase MCP after applying the migration: columns, trigger, RLS on the new table, seed count = 11, stage events = 11.
- Relay: after Max opens the app once, `index.roebel.app/events?kinds=11` should list 14 threads (3 + 11) once the indexer kinds are deployed; until then, query the relay directly.
- Run the thread screen and the main feed on the Android emulator before calling the UI done (lesson from A2: nothing that only renders after a query resolves is validated by tests).

## 14. Rollout

1. Migration + seed applied to production via the Supabase MCP (the 11 threads become visible to current app builds immediately as ordinary threads; the official rendering arrives with the OTA).
2. `app_settings.deliberate_debates_enabled = 'false'`.
3. Commit + push on `feat/buergerrat-diskussion`; Max runs `eas update` himself (standing rule).
4. Indexer kinds: manifest edit committed now; node redeploy only after Max's OK.
