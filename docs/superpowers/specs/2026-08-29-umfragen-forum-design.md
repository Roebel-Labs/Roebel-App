# Umfragen-Forum — Nostr discussion threads that mature into on-chain proposals

- **Date:** 2026-08-29
- **Status:** Approved design, pre-implementation
- **Scope:** apps/expo (primary), Supabase migrations, packages/nostr; packages/publisher + packages/protocol + manifest in a separate server-rail slice
- **Relates to:** NSP-12 Public Decision Record (`docs/superpowers/specs/2026-07-31-nsp12-public-decision-record-design.md`), NSP-9 federation, `docs/STATE_OF_NOSTR.md`

## 1. Problem

The Umfragen page (feed key `rathaus`) shows finished governance artifacts — proposals, proposal comments, rathaus posts — but there is no place where a citizen can *start* a discussion that later becomes a proposal. Ethereum's governance works precisely because that space exists (Ethereum Magicians / Discourse forums) and because ideas are **promoted** through explicit stages rather than jumping straight to a binding vote.

This feature adds a public discussion forum on the Umfragen page, on Nostr, structured so that a matured thread can later climb the already-specified NSP-12 stage ladder (`idee → entwurf → diskussion → meinungsbild → beschlussvorlage → beschlossen/abgelehnt → umgesetzt`).

## 2. Research findings this design leans on

**Ethereum governance (EIP process + DAO funnel — Uniswap, Arbitrum, ENS, Optimism):**

1. A thread never *becomes* a proposal; it is **promoted** through named stages, each with an entry gate held by someone other than the author (template completeness, co-signers, thresholds, sponsor endorsement).
2. **Template as gate** — promotion out of "idea" requires Motivation / Specification / Rationale. This alone filters most noise.
3. **Editors judge form, never merit** — moderation checks completeness and civility, not whether the idea is good.
4. Minimum feedback windows before any vote; a non-binding signal poll (Snapshot ≈ our Meinungsbild) always precedes the binding on-chain vote.
5. **A human sponsorship gate beats token thresholds at small scale** (Optimism: 4 delegates must endorse). Our analog: an Attester sponsors the on-chain step — which matches the existing contract constraint (`OnlyAttestersCanPropose`, and the ~15.7M-gas poll deploy is web-only anyway).
6. EIP-1 **bans ephemeral discussion venues** — the permanent public permalink trail is a feature, not a leak. Governance discussion belongs on the public record.

**Nostr protocol landscape:** NIP-28 (chat channels) and NIP-72 (moderated communities) are both officially marked *unrecommended*. The modern stack is kind-11 threads (NIP-7D) + kind-1111 comments (NIP-22). NIP-29 managed groups were considered and **rejected**: their design intent is containment (group events must not leak off the group relay), which is the opposite of what public governance discussion wants, and they would require new relay software (archived upstream).

**Repo state:** the civic relay (`relay.roebel.app`, strfry) already enforces citizen-only writes (CitizenNFT allow-list via packages/relay-sync, fail-closed). The Expo app already derives a per-citizen Nostr identity (`apps/expo/lib/nostr/identity.ts`) and dual-writes posts/comments/likes (`apps/expo/lib/nostr/publish.ts`), but has never read relay content into a feed. NSP-12 slice 1 (stage grammar, transition validation) is shipped in `packages/protocol/src/decisions.ts`; its producers (slices 2–4) are deliberately unbuilt — this feature is the first app-side step toward them.

## 3. Decisions (settled with Max, 2026-08-29)

| Decision | Choice |
|---|---|
| Substrate | Existing civic relay + NSP grammar extension. No NIP-28/29/72, no new relay. |
| Read path | Nostr is the public record; the app keeps the existing dual-write pattern (Supabase row first, best-effort Nostr publish, `nostr_publications` dedupe ledger). Feed reads come from Supabase. |
| Membership | **None.** No join/leave, no member lists. Forum is open: citizens read and reply anywhere. |
| Structure | **Categories, not channels.** `Verkehr`, `Bildung`, … are a curated taxonomy. Citizens do NOT create containers; every citizen creates a **Thema** (thread) directly and *optionally* attaches one category. |
| Scope | Forum first (this spec); promotion ladder second (v2, separate spec/plan). |

## 4. Terminology (UI, German)

- **Kategorie** — curated topic label (seeded: Verkehr, Bildung, Haushalt, Ortsentwicklung; extendable by admins without an app release).
- **Thema** — a discussion thread: title + body, optional single category, created by any verified citizen.
- **Antwort** — a reply in a Thema.
- Section label on the Umfragen page: **"Diskussionen"** (matches the existing empty state "Noch keine Diskussionen").

Code identifiers in English: `forum_categories`, `forum_threads`, `forum_replies`, `ForumThreadCard`, etc.

## 5. Nostr event grammar (NSP extension)

All events on `relay.roebel.app` (writes already citizen-gated relay-wide). No raw wallet addresses in any event (standing NSP rule).

### Kind 32107 — Kategorie definition (addressable)

- `d = "category:<slug>"` (ASCII slug, e.g. `category:verkehr`)
- Tags: `["name", "Verkehr"]`, `["about", "<one-line description>"]`, `["published_at", …]`
- Author: the town/publisher identity (seeded server-side or via one-time script), not individual citizens. New categories are an admin act (Supabase insert + 32107 publish), not a UI feature.
- Next free slot after the existing NSP kinds 32100–32106.

### Kind 11 — Thema (NIP-7D thread)

- `["title", "<thread title>"]`
- Optional `["t", "<category-slug>"]` — standard Nostr topic tag; taxonomy labels use `t`, not `a` (the NSP a-tag rule covers event cross-references, not labels).
- Content: the thread body (plain text, same conventions as kind-1 posts).
- Kind 11 is a **regular immutable event** — its event id is a stable permalink, so a future NSP-12 head (kind 32100) can permanently cite the originating discussion with an `e` tag. This is the v2 seam.

### Kind 1111 — Antwort (NIP-22 comment)

- Uppercase root scope: `["E", <thread event id>]`, `["K", "11"]`, `["P", <thread author pubkey>]`
- Lowercase parent pointers (`e`/`k`/`p`) — parent = the thread root for top-level replies, or another 1111 for a nested reply. Rendered flat (see §7).

### Reused as-is

- Kind 7 likes / kind 5 deletions / NIP-62 vanish — existing publish paths apply unchanged to kinds 11 and 1111.
- Why kind 11 instead of kind 1: keeps forum threads out of the social timeline in external clients, uses the modern threading model (Flotilla/Chachi-compatible), and cleanly separates forum content from the X-style feed in the backfeed.

## 6. Data model (Supabase)

Dual-write, same as posts today: app inserts the Supabase row, then best-effort publishes the Nostr event via new helpers in `apps/expo/lib/nostr/publish.ts` (`publishForumThread`, `publishForumReply`); failures land in the existing `nostr_publications` retry ledger.

- **`forum_categories`**: `slug` (pk), `name`, `about`, `sort_order`, `created_at`. Seeded in the migration with the four launch categories.
- **`forum_threads`**: `id` (uuid pk), `author_account_id`, `category_slug` (nullable fk), `title`, `body`, `nostr_event_id` (nullable), `reply_count`, `last_activity_at`, `created_at`, moderation columns matching posts (`hidden`, report linkage).
- **`forum_replies`**: `id`, `thread_id` (fk), `parent_reply_id` (nullable), `author_account_id`, `body`, `nostr_event_id`, `created_at`, moderation columns.

**RLS ships with the tables from day one** (standing lockdown gap must not grow): authenticated read; insert/update constrained to the caller's own account rows, following the hardened pattern already in HEAD for posts. Exact policies are an implementation-plan item.

**Push:** reply-to-your-Thema notification via a DB trigger into the existing notifications hub (same pattern as like/comment push). No digests, no category subscriptions in v1.

**Realtime/refresh:** TanStack Query + pull-to-refresh like the rest of the rathaus feed; a Supabase realtime subscription on `forum_replies` for the open thread screen only.

## 7. App UI (apps/expo)

1. **Umfragen page** (`rathaus` page in `components/feed/FeedHome.tsx`):
   - A **category chip row** under the tab bar: `Alle · Verkehr · Bildung · Haushalt · Ortsentwicklung`, plus a **"Neues Thema"** CTA. Chips navigate to the filtered thread list.
   - **Threads interleave into the rathaus feed**: new `forum_thread` member of the `FeedItem` union, new case in `FeedList.tsx`'s `renderItem` switch, merged by `assembleFeed()`'s `rathaus` branch like the other three streams. A thread card shows category badge, title, body snippet, author row, reply count, last activity.
2. **`/forum/index` + `/forum/[category]`** — thread list (all / filtered), newest-activity-first, same card component.
3. **`/forum/thread/[id]`** — thread root + **flat reply list** (NIP-22 hierarchy rendered flat with a quoted-parent affordance for nested replies, matching the existing `CommentThread` pattern). Reply input pinned at the bottom.
4. **Composer** — a lightweight dedicated screen (`/forum/new`): title, body, optional category picker. Not the 682-line `PostComposer`, not the create-wizard.
5. **Reuse, don't generalize:** presentational components (`PostAuthorRow`, `CommentThread`/`CommentItem`/`CommentInput`, avatar/badge components) are reused; state comes from new hooks (`useForumThreads`, `useForumThread`) + `lib/supabase-forum.ts`. `useConversation` is not touched.
6. **Gates:** page visibility unchanged (`canAccessCityTabs`); creating threads/replies requires `isCitizen` (orgs: same rules as rathaus posts). Display names via the existing wallet-safe resolvers — never raw `0x`, never raw npubs.

## 8. Moderation

Post-hoc and form-based ("editors judge form, never merit"): author deletion = row soft-delete + kind-5 publish (existing path); NIP-62 vanish already covers full-identity erasure. No pre-approval of threads. The report/hide affordance on thread and reply cards is a fast-follow after slice A (the tables carry moderation columns from day one).

## 9. Server rail — separate slice B

Extending `packages/publisher` (mappers claim kinds 11/1111/32107; backfeed ingests externally-authored threads/replies into the forum tables, gated on bound citizens as today) and widening `services.indexer.kinds` in the manifest. **Held out of slice A** because `packages/publisher`/`packages/protocol`/manifest have the documented two-repo divergence hazard with `netizen_labs` — slice B starts with a divergence check and deploys from the verified-current copy. Until slice B lands, app-originated content is fully functional; only externally-authored Nostr events won't surface in-app.

Federation note: forum kinds are ordinary public-record kinds — peers may opt in via `peers[].kinds` per NSP-9. No containment requirement (that was the NIP-29 concern; it does not apply here).

## 10. v2 seams (explicitly out of scope now)

- Thread cards reserve a "Zum Vorschlag entwickeln" affordance (hidden/disabled in v1).
- The promotion ladder — Entwurf template gate (Motivation/Spezifikation/Begründung), citizen co-signing, 32104 Meinungsbild (pinned `advisory` tag, wording "Meinungsbild" never "Abstimmung"), Attester sponsorship into the web propose flow, kind-2100 stage transitions against the shipped NSP-12 validators — is the follow-up project with its own spec.
- Category subscriptions / "follow for notifications".
- Admin UI for category management (admin act = SQL + publish script for now).

## 11. Slices, branch, testing

- **Slice A (this spec's build):** Expo UI + migrations/RLS + dual-write publish helpers + push trigger.
- **Slice B:** server rail (§9).
- **Branch:** `feat/umfragen-forum` off `feat/sdk56-upgrade` (inherits the RN 0.85 fixes; main still carries SDK 55).
- **Testing:** TDD on event builders (kind 11/1111/32107 construction in packages/nostr / publish helpers) and on data mappers/hooks logic; UI verified on simulator/emulator. Full-repo tsc is skipped per standing preference (~431 pre-existing errors); new files must be individually clean.
- **Commit discipline:** parallel sessions are active — pathspec-only commits, never `git add .`.
