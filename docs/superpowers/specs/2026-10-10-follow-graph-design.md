# Folgen & Stummschalten — follow graph design

Date: 2026-10-10 · Status: DRAFT, awaiting Max's review · App: `apps/expo`

## 1. Why

Feedback from the town meeting (2026-10): citizens find **specific accounts annoying** in
"Austausch" and have no tool except "Melden". Today the feed is every published post of a
tab, newest first (`get_feed_page`, `apps/expo/supabase/migrations/feed_page_rpc.sql`).
There is no follow graph, no mute, no hide.

Second goal: make the app feel rewarding, especially for org accounts. Every new citizen
following the town's accounts by default produces a stream of real "X folgt dir" moments.

This is project 1 of 4 from the meeting (2 = quick wins: Erkunden toggles, citizen
onboarding without personal data, Prüfstelle label; 3 = account choice incl. passkey and
12-word phrase; 4 = Prüfstelle-attested data + ZK claims). Each gets its own spec.

## 2. Decisions taken (Max, 2026-10-10)

1. **One feed, "Für Alle"** — no separate "Folge ich" tab. It shows every post **except**
   posts by accounts the viewer unfollowed or muted.
2. **Undecided = shown.** Accounts the viewer has never acted on (e.g. people who joined
   later) appear in the feed; the viewer can follow or mute them from the post.
3. **Default follows at onboarding**: a new user is shown every account of the home town
   (today: Röbel only), most recognisable/popular first, all pre-ticked. Unticking =
   unfollowing.
4. **Entfolgen** hides that account's posts from the feed only. Comments, events, Erkunden
   are unaffected.
5. **Stummschalten** hides the account everywhere it can address you: feed posts, comments,
   replies, mentions, and notifications caused by them. Silent — they are never told.
6. **Notifications**: every follow lands in the inbox. Push only for orgs, only as a
   weekly digest. People get no follow push.

## 3. Data model

Targets are always `accounts.id` (uuid). It covers persons (each person has a personal
`accounts` row) and orgs, and it survives an org moving to a Safe (NSP-14 freezes
`orgId = keccak256("netizen:org:v1:" + uuid)`). The actor is `wallet_address`, like every
other per-user table in this schema.

```sql
-- Public: who follows whom. Read by anyone (counts, follower lists).
create table account_follows (
  follower_wallet   text not null references users(wallet_address) on delete cascade,
  target_account_id uuid not null references accounts(id)        on delete cascade,
  source            text not null check (source in ('onboarding','manual','intro')),
  created_at        timestamptz not null default now(),
  primary key (follower_wallet, target_account_id)
);
create index on account_follows (target_account_id, created_at desc);

-- Private: what the viewer chose to hide. Never readable with the anon key.
create table account_hides (
  viewer_wallet     text not null references users(wallet_address) on delete cascade,
  target_account_id uuid not null references accounts(id)        on delete cascade,
  kind              text not null check (kind in ('unfollowed','muted')),
  created_at        timestamptz not null default now(),
  primary key (viewer_wallet, target_account_id, kind)
);

alter table accounts add column suggest_to_new_users boolean not null default true;
```

- **Unfollow** = delete the `account_follows` row + insert `account_hides(kind='unfollowed')`.
  **Follow** = the reverse. No row in either table = undecided = shown.
- **Mute** is independent of follow. A muted account keeps its follow row, so the
  follower count never drops and a mute stays undetectable.
- **Hidden set** for a viewer = all targets with any `account_hides` row.
- **RLS**: `account_follows` select for everyone, no anon insert/update/delete.
  `account_hides`: no anon access at all. All writes go through the edge function (§4).
  This deliberately breaks with the open `WITH CHECK (true)` style of `post_likes`, which
  is forgeable (see `project_rls_lockdown_unapplied`).
- **Self-follow** is rejected. Following your own org is allowed.
- `suggest_to_new_users`: a person can opt out of the onboarding list (Settings →
  Datenschutz → "Neuen Nutzer:innen vorschlagen"). Default on for everyone; already-public
  profiles. Orgs always listed while the flag is true.

## 4. Edge function `account-relations`

A single signed endpoint, same request-signing scheme as `org-membership`
(`_shared/verify-account-signature.ts`: EOA, ERC-1271, ERC-6492) plus the passkey
API-session token (`_shared/verify-session-token.ts`). thirdweb in-app wallets sign
silently; passkey users spend at most one fingerprint per session — no prompt per tap
(`feedback_max_onchain_min_fingerprints`).

| action | input | effect |
|---|---|---|
| `list` | — | returns `{ following: uuid[], unfollowed: uuid[], muted: uuid[] }` for the signer |
| `follow` | `targets: uuid[]`, `source` | upsert follows, delete `unfollowed` hides, insert inbox notices |
| `unfollow` | `targets: uuid[]` | delete follows, insert `unfollowed` hides |
| `mute` / `unmute` | `target: uuid` | insert / delete `muted` hide |

- Batch limit 1000 targets per call (Röbel has a few hundred accounts). Onboarding is one
  call.
- Validates that every target exists and is not deleted; drops self.
- Idempotent: repeating a call changes nothing and sends no second notice.

## 5. Feed and other surfaces

**Feed.** `get_feed_page` gets one new parameter `p_exclude_account_ids uuid[] default
null`. The client passes its hidden set; the RPC drops posts where
`account_id = any(p_exclude_account_ids)`, or where `account_id is null` and
`wallet_address` owns an excluded personal account (legacy posts). Passing the list from
the client means the server never needs to read a viewer's private hides in an anon RPC.
If the RPC instead looked them up from `p_wallet`, anyone could query someone else's
wallet and see whom they muted.

- The old 4-argument function is dropped and recreated with the defaulted 5th argument,
  so there is no overload ambiguity; old clients keep working unchanged.
- The client fallback path in `fetchFeedPosts` (`lib/supabase-posts.ts:110-190`) applies
  the same filter.
- Reposts by a hidden account are hidden. A quoted post by a muted account renders as
  "Beitrag ausgeblendet". The feed section cards (Marktplatz, Gastro, Vorschläge …) are
  not posts and are not filtered.

**Client state.** A `RelationsContext` loads `list` once per session (React Query, key
`['relations']`), exposes `isFollowing / isMuted / hiddenIds`, and applies optimistic
updates on follow/unfollow/mute.

**Mute-only surfaces** (filtered client-side from `muted`):
- comments in `components/feed/CommentThread.tsx` / `CommentItem.tsx`;
- the inbox list (`app/notifications/index.tsx`): notices whose actor is muted.

**Push suppression.** The `notify_user_notification_push` trigger (latest definition in
`supabase/migrations/20261001_vorhaben_push.sql`) skips the push when the recipient has
muted the actor. Which metadata key holds the actor (`liker_wallet`, `commenter_wallet`
…) has to be checked per type during implementation.

## 6. UI

- **Onboarding step `app/welcome/follow.tsx`** — after `role`, before `consent`, for all
  roles.
  - Title "Wem möchtest du folgen?" with the subline "Du siehst trotzdem alle Beiträge –
    außer von Konten, denen du nicht folgst."
  - Virtualised list, all pre-ticked, a "Allen folgen / Keinem folgen" toggle and a search
    field.
  - Orgs and people in one list, ranked by score (§7), with avatar, name, sub-type and
    follower count.
  - The choices are submitted together with the consent step (one signed call).
  - Deferred passkey accounts get it as one more step in "Profil vervollständigen".
- **Existing users** get a one-time sheet "Neu: Folgen & Stummschalten" on the next app
  open. It opens the same list pre-ticked, with source `intro`. Dismissing it changes
  nothing, because everything stays shown. Flag: AsyncStorage
  `@roebel/follow-intro-seen`.
- **Post options** (`components/feed/PostOptionsDrawer.tsx`) gets two new rows:
  "@name folgen / entfolgen" and "@name stummschalten".
- **Profiles** (`app/account/[id]/index.tsx`, `OrgProfileHero` `HeroAction`, the person
  branch):
  - a Folgen/Entfolgt button;
  - "N Follower · folgt M" (tappable lists);
  - "Stummschalten" in the overflow menu.
- **Own profile**: follower and following counts.
- **Settings → "Folgen & Stummschalten"**:
  - the following list, using the same component as onboarding;
  - a muted list with "Aufheben";
  - the `suggest_to_new_users` toggle.
- **Copy**: "Follower" (the word as used in German), "folgt dir", "Stummgeschaltet". No
  wallet addresses anywhere; resolve to display names.

## 7. Ranking for the onboarding list

RPC `get_follow_suggestions()`, public, SECURITY DEFINER, returns the accounts where
`suggest_to_new_users` is true, the account is not deleted, and it has a display name.
Score:

```
score = 3 * followers
      + likes_90d + 2 * comments_90d + 0.1 * views_90d   (posts by the account)
      + 2 * account_vote_summary.up_count                (orgs)
```

On launch day the follower term is 0, so engagement and org ratings carry the ranking.
Afterwards followers take over. Ties are broken org-first, then by name. The ranking is
computed live; at a few hundred accounts no materialisation is needed.

## 8. Notifications

- **Inbox.** For every new follow, the edge function inserts one `notifications` row of
  type `new_follower` per recipient:
  - for a person: the personal account's owner wallet;
  - for an org: its `owner` and `admin` wallets from `account_owners`.
  - Copy for onboarding/intro follows: "Neu in Röbel: {Name} folgt dir"; for an org,
    "{Name} folgt jetzt {Org}".
  - Copy for manual follows: "{Name} folgt dir jetzt".
  - Metadata: `{ follower_wallet, account_id, source }`.
  - The inbox gets a row renderer for the type, and a tap opens the follower's profile.
- **No instant push.** `new_follower` is excluded from `notify_user_notification_push`.
  One signup can produce hundreds of rows.
- **Weekly org digest.**
  - A `pg_cron` job runs Monday 10:00 Europe/Berlin and calls a new edge function
    `follower-digest`.
  - It counts `account_follows` per org account created in the last 7 days, then sends
    via `send-notification` with `walletAddresses` = owners and admins: "{Org}: 12 neue
    Follower diese Woche".
  - Orgs with 0 new followers get nothing.
  - Preference: `notification_preferences.follower_digest_enabled boolean default true`
    (per device, like the other toggles). Filtered in `send-notification`; a switch is
    added in `app/notifications/settings.tsx`.

## 9. Out of scope

- Prüfstelle label, Erkunden toggles, the account-choice login (projects 2 and 3).
- Following topics or tabs.
- Mute effects on Erkunden, map, events, marketplace, or DMs (DMs already have
  "Blockieren").
- Web app (`project_expo_is_the_only_citizen_client`).
- Multi-town scoping. All accounts count as "home town" until a second community exists.
  The RPC is the single place to add a community filter later.

## 10. Rollout and risks

Order:
1. migration (tables, RLS, column, RPCs, trigger change, cron)
2. edge functions deploy
3. client commit/push; Max runs EAS (`feedback_user_runs_eas_updates`)

Old clients are unaffected: no hides means the feed is unchanged.

Risks:
- **Follower inflation.** Counts reflect defaults, not intent. Accepted: the "Neu in
  Röbel" framing is honest about it.
- **Sybil follows.** A follow carries no value on-chain or in Münzen, so this is ignored.
- **Large onboarding list as the town grows.** Search plus "Keinem folgen" covers it;
  revisit above ~2000 accounts.

## 11. Testing

- SQL:
  - `get_feed_page` with and without exclusions, including legacy null-`account_id` posts
    and reposts;
  - RLS: anon cannot read `account_hides` or write `account_follows`;
  - the push trigger skips `new_follower` and muted actors.
- Edge function:
  - signature rejection;
  - batch idempotency (no double notice);
  - self-follow dropped;
  - recipients resolved correctly for persons vs orgs.
- Client unit tests:
  - the `RelationsContext` hidden-set merge and optimistic rollback;
  - the comment and inbox filters.
- Device pass on Android:
  - onboarding with all ticked and some unticked;
  - the intro sheet for an existing user;
  - mute from a post, then confirm that the comments and inbox are gone too.
