# Org map sheet — Corner-style place detail for organisations

**Date:** 2026-08-30
**Status:** approved, slice 1 in implementation
**Predecessor:** [2026-08-30-map-corner-core-design.md](2026-08-30-map-corner-core-design.md),
org-map-presence slice (commit `cdc2d80d`)

## Problem

Tapping a pin on the map opens `MapPlaceSheet`, which shows a thin card:
image, title, category chip, address, one action button. For an organisation
that is far less than we already know about it. The app holds star ratings,
up/down votes, opening hours and an owner-maintained profile for every org,
and none of it reaches the map.

The Corner reference designs show what the sheet should be: a photo carousel,
a live open/closed line that expands to the full week, reaction counts, a
"saved by" rail of faces, and a comment thread the community writes.

## Scope

**Slice 1 (this spec).** Org sheet shell, org photo upload and carousel,
comments with replies and likes, up/down reactions, expandable weekly hours,
and the share / directions / site / ig action row.

**Slice 2 (deferred, specified here only as far as slice 1 must not block it).**
"to try" / "been" saves, the 🔖 saves count, the SAVED BY avatar rail, and
community experience sharing (a photo plus text posted by a visitor rather
than the owner). The save and been buttons render in slice 1 but are inert.

**Explicitly out of scope.** Events and POIs keep today's card — they have no
org account to hang photos, votes or comments on. Map pin styling, clustering
and the filter bar are unchanged from the Corner core slice.

## What already exists

Reuse is the dominant fact about this feature. Before adding anything:

| Capability | Where it lives | State |
| --- | --- | --- |
| 👍/👎 reactions | `account_votes`, `account_vote_summary` view | live, 64 rows |
| ⭐ ratings + one comment per user | `account_ratings`, `account_rating_summary` view | live, 13 rows |
| Rating/vote client | `apps/expo/lib/supabase-ratings.ts` | complete, **no mobile UI calls it** |
| Rating/vote UI reference | `apps/web/src/app/app/orgs/[slug]/OrgDetailClient.tsx` | live on web |
| Weekly opening hours | `accounts.opening_hours` jsonb | populated |
| Open/closed evaluation | `isRestaurantOpen()` in `lib/utils` | used by the current sheet |
| Image upload | `uploadMediaFile()` — HEIC→JPEG, compression, `images` bucket | used by `edit-org.tsx` |
| Owner picker pattern | `edit-org.tsx` `pickImage()` for logo + cover | copy for the gallery |
| Comment-like pattern | `post_comment_likes` + `toggleCommentLike()` | mirror for ratings |

The mobile app is simply missing the UI. Slice 1 is therefore mostly a
rendering and wiring job with three small tables attached.

## Architecture

### Sheet composition

`MapPlaceSheet` remains the container. It already owns the `BottomSheet`, the
snap points, the horizontal swipe between places in a cluster, and the
share / directions / site / ig row — all of which the org sheet needs
unchanged. Adding the org body inline would roughly double an 800-line file
that already serves five entity types.

Instead:

- `PlaceItem` gains an optional `accountId: string | null`.
- A new `components/map/OrgSheetDetail.tsx` renders the rich body: photo
  carousel, description line, counts row, comment composer and thread.
- `MapPlaceSheet`'s detail slot renders `OrgSheetDetail` when the selected
  item carries an `accountId`, and today's `PlaceDetail` otherwise.
- Snap points become `[PEEK_HEIGHT, '92%']` for org items so the expanded
  sheet can hold the thread; non-org items keep `'62%'`.

Rejected: a separate `MapOrgSheet` component. It duplicates the sheet
plumbing and breaks when one cluster contains both an org pin and a POI,
because the swipe carousel spans entity types.

### Pin → org resolution

Every pin type can stand for an org, so the sheet must resolve the tapped pin
to an `accounts.id`:

| Pin | Resolution |
| --- | --- |
| org | the account itself |
| restaurant | `restaurants.account_id` (a real FK) |
| business | `belongsToOrg()` name match from `lib/org-location.ts` |
| event, poi | none — today's card |

The map screen already loads accounts, restaurants and businesses to build
the GeoJSON. The lookup is therefore built **once** in `app/location.tsx`
after `fetchMapData()` resolves, as a `Map<string, string>` keyed by
`"<entityType>-<id>"`, not recomputed per tap.

`belongsToOrg` is deliberately one-directional (`org === biz` or
`org.startsWith(biz + " ")`). It must keep matching "KABIMA Inhaber Karl
Kneile" → "KABIMA" while refusing "Bistro" → "Bistro zur Waage". That trap
gets a unit test.

### Data flow

`hooks/useOrgSheetData.ts` fetches lazily when a sheet opens on an org, in one
`Promise.all`:

1. `fetchAccountPhotos(accountId)`
2. `fetchAccountVoteSummary(accountId)` — exists
3. `fetchAccountRatingSummary(accountId)` — exists
4. `fetchAccountComments(accountId)` — ratings + author + replies + like counts
5. viewer's own vote and rating, when a wallet is connected

Votes, comment likes and comment submission write optimistically and roll back
on error, matching how `post_likes` already behaves. Nothing about the sheet
blocks on the network before first paint: the header, hours and action row
render from the `PlaceItem` the map already holds.

## Data model

Three new tables, one widened column, one corrected view.

### `account_photos` (new)

```sql
create table public.account_photos (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  url         text not null,
  caption     text,
  sort_order  integer not null default 0,
  uploaded_by text not null,
  created_at  timestamptz not null default now()
);
create index account_photos_account_idx
  on public.account_photos (account_id, sort_order, created_at);
```

Chosen over an `accounts.gallery_images text[]` column (the existing
`businesses.gallery_images` pattern) because the carousel needs stable
ordering, per-photo delete, and — in slice 2 — attribution so community
photos can share the rail with the owner's own. `uploaded_by` is a lowercase
wallet, deliberately **not** an FK to `users`, so an org photo survives the
uploader deleting their account.

### `account_rating_replies` (new)

```sql
create table public.account_rating_replies (
  id             uuid primary key default gen_random_uuid(),
  rating_id      uuid not null references public.account_ratings(id) on delete cascade,
  wallet_address text not null references public.users(wallet_address) on delete cascade,
  content        text not null,
  created_at     timestamptz not null default now()
);
create index account_rating_replies_rating_idx
  on public.account_rating_replies (rating_id, created_at);
```

**Why a separate table rather than `account_ratings.parent_id`.**
`account_ratings` carries `UNIQUE (account_id, wallet_address)`. A reply row
would occupy that key, so replies would have to relax it to a partial unique
index `WHERE parent_id IS NULL`. PostgREST's upsert cannot attach that
predicate to its `ON CONFLICT` clause, so the live web app's
`upsertAccountRating` would start failing. A separate table leaves every
existing call path untouched. The cost is one more table and a join.

### `account_rating_likes` (new)

```sql
create table public.account_rating_likes (
  id             uuid primary key default gen_random_uuid(),
  rating_id      uuid not null references public.account_ratings(id) on delete cascade,
  wallet_address text not null references public.users(wallet_address) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (rating_id, wallet_address)
);
```

A direct mirror of `post_comment_likes`, down to the unique key, so
`toggleCommentLike`'s read-then-write shape can be copied verbatim.

### `account_ratings.stars` becomes nullable

The design's composer says "what do you think?", not "rate this". Today
`stars` is `NOT NULL CHECK (stars >= 1 AND stars <= 5)`, so a comment without
a star rating is impossible.

```sql
alter table public.account_ratings alter column stars drop not null;
alter table public.account_ratings drop constraint account_ratings_stars_check;
alter table public.account_ratings add constraint account_ratings_stars_check
  check (stars is null or (stars >= 1 and stars <= 5));
```

This is a widening: every existing row keeps its stars, and every existing
writer still sends them.

### `account_rating_summary` must ignore unstarred comments

The view currently reads:

```sql
select account_id, count(*)::int as rating_count, round(avg(stars),1) as avg_stars
from account_ratings group by account_id;
```

Once unstarred comments exist, `count(*)` overstates the rating count and
`avg(stars)` skews toward null handling. Corrected:

```sql
create or replace view public.account_rating_summary as
select account_id,
       count(*) filter (where stars is not null)::int as rating_count,
       round(avg(stars) filter (where stars is not null), 1) as avg_stars
from public.account_ratings
group by account_id;
```

`rating_count` keeps its meaning — number of star ratings — which is what the
⭐ figure in the design shows. The web app reads this view and needs no change.

### Row level security

The three new tables get RLS enabled with public read. Writes are permitted to
the anon role, matching every other user-content table in this app: the client
authenticates with thirdweb smart accounts, not Supabase Auth, so Postgres has
no identity to check a policy against. Ownership for photo writes is enforced
client-side via `account_owners`.

This is a real limitation, not a design goal. It is consistent with the
existing posture — Supabase currently reports 34 tables with RLS disabled
entirely, including `businesses`, `restaurants` and `events` — and a proper
fix means routing writes through a signed edge function like
`org-membership` already does. Tracked separately; not solved here.

## Components

| File | Responsibility |
| --- | --- |
| `components/map/OrgSheetDetail.tsx` | Rich body: photos, description, counts, comments |
| `components/map/OrgPhotoCarousel.tsx` | Horizontal photo rail with the popularity sticker |
| `components/map/OrgOpeningHours.tsx` | Collapsed "open 7am–6pm ⌄" ⇄ expanded week |
| `components/map/OrgCommentThread.tsx` | Composer, comment rows, replies, like button |
| `hooks/useOrgSheetData.ts` | One lazy parallel fetch + optimistic mutations |
| `lib/supabase-account-photos.ts` | Photo CRUD, ordering |
| `lib/supabase-account-comments.ts` | Comments, replies, likes on `account_ratings` |
| `lib/map/org-lookup.ts` | Build the `"<entityType>-<id>" → accountId` map |

Each is small enough to hold in context whole. `MapPlaceSheet` gains a branch
and a prop; it does not grow a second personality.

## UI details from the designs

- Header: emoji, name in the condensed heading face, saves chip, category
  and price, popularity line, hours line. Existing theme tokens only —
  `StyleSheet.create()` + `useTheme()`, no NativeWind.
- The pink "POPULAR #4 bakery" starburst overlays the last carousel tile.
- Description line reads `Stadtteil • Straße • bio`, truncated to two lines.
- Counts row sits above the comment thread; in slice 1 it shows 👍 and 👎 from
  `account_vote_summary` and ⭐ from `account_rating_summary`. The 🔖 saves
  figure renders as `—` until slice 2.
- Comment row: name, ☆ marker when the author left stars, relative age
  ("fav'd 4mo ago"), body, then reply and heart buttons.
- All copy German, per the app-wide rule; identifiers and comments English.

## Testing

Unit tests, run with the existing jest setup:

- `org-lookup`: restaurant resolves via `account_id`; business resolves via
  name; "Bistro" must **not** claim "Bistro zur Waage"; "KABIMA Inhaber Karl
  Kneile" must claim "KABIMA"; events and POIs resolve to null.
- `account_rating_summary` semantics: a reply and an unstarred comment must
  not move `rating_count` or `avg_stars`. Asserted against the live view via
  a scratch account, then rolled back.
- Photo ordering: `sort_order` wins, `created_at` breaks ties.
- Optimistic vote: rollback restores the previous count on a failed write.

The sheet's layout and the upload flow are verified on device — Max runs EAS
builds himself, so "done" means committed and pushed with tests green.

## Implementation order

1. Migration: three tables, nullable stars, corrected view.
2. `lib/supabase-account-photos.ts` + `lib/supabase-account-comments.ts`.
3. `lib/map/org-lookup.ts` + tests; wire `accountId` onto `PlaceItem`.
4. `hooks/useOrgSheetData.ts`.
5. `OrgOpeningHours`, `OrgPhotoCarousel`, `OrgCommentThread`.
6. `OrgSheetDetail` composing them; branch in `MapPlaceSheet`.
7. "Fotos" section in `edit-org.tsx`.
8. Tests green, typecheck clean, commit and push.
