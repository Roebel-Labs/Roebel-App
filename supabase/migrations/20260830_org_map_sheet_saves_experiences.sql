-- Org map sheet, slice 2: saves ("Merken"/"Gewesen") and community experiences.
-- Design: docs/superpowers/specs/2026-08-30-org-map-sheet-design.md

-- ── Saves ────────────────────────────────────────────────────────────────
-- One row per person per org, carrying a single state. "Gewesen" supersedes
-- "Merken" rather than sitting alongside it, which is how it actually goes:
-- you save a place, you go, it has now been visited. It also keeps the
-- "Gespeichert von" rail unambiguous — one badge per avatar.
create table if not exists public.account_saves (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.accounts(id) on delete cascade,
  wallet_address text not null references public.users(wallet_address) on delete cascade,
  state          text not null check (state in ('to_try', 'been')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (account_id, wallet_address)
);

create index if not exists account_saves_account_idx
  on public.account_saves (account_id, state);

comment on table public.account_saves is
  'Per-person save state for an organisation: to_try ("Merken") or been ("Gewesen"). One row per wallet per org.';

-- ── Experiences ──────────────────────────────────────────────────────────
-- A visitor's photo + text ABOUT an org. Deliberately not event_experiences:
-- that table's account_id means "posted as this org", not "about this org",
-- and its event_id is NOT NULL with live consumers that assume it.
create table if not exists public.account_experiences (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.accounts(id) on delete cascade,
  wallet_address text not null references public.users(wallet_address) on delete cascade,
  content        text not null,
  media_urls     text[] default '{}',
  video_url      text,
  status         text not null default 'published' check (status in ('published', 'deleted')),
  created_at     timestamptz not null default now()
);

create index if not exists account_experiences_account_idx
  on public.account_experiences (account_id, status, created_at desc);

comment on table public.account_experiences is
  'Community-shared experience (photo + text) about an organisation. Mirrored into posts so it reaches the home feed.';

-- ── Save summary ─────────────────────────────────────────────────────────
-- Counted in the database so the sheet does not pull every save row just to
-- render two numbers.
create or replace view public.account_save_summary as
select account_id,
       count(*) filter (where state = 'to_try')::int as to_try_count,
       count(*) filter (where state = 'been')::int   as been_count,
       count(*)::int                                  as save_count
from public.account_saves
group by account_id;

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Same posture as slice 1 and every other user-content table here: public
-- read, anon writes, because the client authenticates with thirdweb smart
-- accounts rather than Supabase Auth. See the spec's RLS note.
alter table public.account_saves       enable row level security;
alter table public.account_experiences enable row level security;

create policy account_saves_read        on public.account_saves       for select using (true);
create policy account_saves_write       on public.account_saves       for all    using (true) with check (true);
create policy account_experiences_read  on public.account_experiences for select using (true);
create policy account_experiences_write on public.account_experiences for all    using (true) with check (true);
