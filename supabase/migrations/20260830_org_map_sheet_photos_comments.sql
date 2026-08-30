-- Org map sheet, slice 1: photos, threaded comments, comment likes.
-- Design: docs/superpowers/specs/2026-08-30-org-map-sheet-design.md

-- ── Photos ───────────────────────────────────────────────────────────────
-- Owner-maintained gallery shown in the map bottom sheet. A table rather than
-- an accounts.gallery_images array (the businesses pattern) because the
-- carousel needs stable ordering, per-photo delete, and attribution so
-- community photos can share the rail in slice 2.
create table if not exists public.account_photos (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  url         text not null,
  caption     text,
  sort_order  integer not null default 0,
  -- Lowercase wallet. Deliberately NOT an FK to users: an org's photo must
  -- survive the uploader deleting their account.
  uploaded_by text not null,
  created_at  timestamptz not null default now()
);

create index if not exists account_photos_account_idx
  on public.account_photos (account_id, sort_order, created_at);

comment on table public.account_photos is
  'Photo gallery for an organisation account, shown in the map bottom sheet and on the org profile.';

-- ── Comment replies ──────────────────────────────────────────────────────
-- account_ratings carries UNIQUE (account_id, wallet_address), so a reply
-- cannot live there as a parent_id row: relaxing that key to a partial unique
-- index would break the web app's upsert, because PostgREST cannot attach the
-- "WHERE parent_id IS NULL" predicate an ON CONFLICT arbiter needs.
create table if not exists public.account_rating_replies (
  id             uuid primary key default gen_random_uuid(),
  rating_id      uuid not null references public.account_ratings(id) on delete cascade,
  wallet_address text not null references public.users(wallet_address) on delete cascade,
  content        text not null,
  created_at     timestamptz not null default now()
);

create index if not exists account_rating_replies_rating_idx
  on public.account_rating_replies (rating_id, created_at);

comment on table public.account_rating_replies is
  'Replies to an account_ratings comment. Separate table so account_ratings keeps its one-row-per-wallet unique key.';

-- ── Comment likes ────────────────────────────────────────────────────────
-- Direct mirror of post_comment_likes, down to the unique key.
create table if not exists public.account_rating_likes (
  id             uuid primary key default gen_random_uuid(),
  rating_id      uuid not null references public.account_ratings(id) on delete cascade,
  wallet_address text not null references public.users(wallet_address) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (rating_id, wallet_address)
);

create index if not exists account_rating_likes_rating_idx
  on public.account_rating_likes (rating_id);

-- ── Comment without a star rating ────────────────────────────────────────
-- The sheet composer asks "what do you think?", not "rate this", so a comment
-- must be able to carry no stars. Widening only: existing rows keep theirs.
alter table public.account_ratings alter column stars drop not null;
alter table public.account_ratings drop constraint if exists account_ratings_stars_check;
alter table public.account_ratings add constraint account_ratings_stars_check
  check (stars is null or (stars >= 1 and stars <= 5));

-- ── Summary view must ignore unstarred comments ──────────────────────────
-- count(*) would otherwise report comments as ratings, and avg(stars) would
-- shift as soon as an unstarred row appears. rating_count keeps its meaning:
-- the number of star ratings, which is the figure the sheet shows.
create or replace view public.account_rating_summary as
select account_id,
       count(*) filter (where stars is not null)::int as rating_count,
       round(avg(stars) filter (where stars is not null), 1) as avg_stars
from public.account_ratings
group by account_id;

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Public read; writes permitted to anon, matching every other user-content
-- table here. The client authenticates with thirdweb smart accounts, not
-- Supabase Auth, so Postgres has no identity to check against. Photo
-- ownership is enforced client-side via account_owners. See the spec.
alter table public.account_photos          enable row level security;
alter table public.account_rating_replies  enable row level security;
alter table public.account_rating_likes    enable row level security;

create policy account_photos_read   on public.account_photos          for select using (true);
create policy account_photos_write  on public.account_photos          for all    using (true) with check (true);
create policy rating_replies_read   on public.account_rating_replies  for select using (true);
create policy rating_replies_write  on public.account_rating_replies  for all    using (true) with check (true);
create policy rating_likes_read     on public.account_rating_likes    for select using (true);
create policy rating_likes_write    on public.account_rating_likes    for all    using (true) with check (true);
