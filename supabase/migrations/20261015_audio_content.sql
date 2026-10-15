-- Hören: audio series (short stories, audiobooks, podcasts) with episodes
-- and a timed transcript the Expo player shows Spotify-lyrics style.
--
-- Writes go through the web admin with the service role only; anon and
-- authenticated may read published rows of published series.

create table if not exists public.audio_shows (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  kind text not null default 'short_story'
    check (kind in ('short_story', 'audiobook', 'podcast')),
  title text not null,
  author text,
  description text,
  cover_url text,
  -- Background tint of the player; hex like '#3B2416'. Picked from the cover in the admin.
  accent_color text,
  language text not null default 'de',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audio_episodes (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.audio_shows(id) on delete cascade,
  episode_number integer,
  title text not null,
  description text,
  -- Optional per-episode cover; falls back to the series cover.
  cover_url text,
  audio_url text,
  duration_seconds numeric,
  -- [{ "start": seconds, "end": seconds, "text": "..." }, ...] ordered by start.
  transcript jsonb not null default '[]'::jsonb,
  -- How the timings were made: plain (estimated), srt, vtt, lrc, tapped.
  transcript_source text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists audio_episodes_show_idx
  on public.audio_episodes (show_id, episode_number);
create index if not exists audio_shows_status_idx
  on public.audio_shows (status, sort_order);

create or replace function public.audio_content_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.audio_content_touch_updated_at() from public, anon, authenticated;

drop trigger if exists audio_shows_touch on public.audio_shows;
create trigger audio_shows_touch before update on public.audio_shows
  for each row execute function public.audio_content_touch_updated_at();

drop trigger if exists audio_episodes_touch on public.audio_episodes;
create trigger audio_episodes_touch before update on public.audio_episodes
  for each row execute function public.audio_content_touch_updated_at();

alter table public.audio_shows enable row level security;
alter table public.audio_episodes enable row level security;

revoke insert, update, delete, truncate on public.audio_shows from anon, authenticated;
revoke insert, update, delete, truncate on public.audio_episodes from anon, authenticated;
grant select on public.audio_shows to anon, authenticated;
grant select on public.audio_episodes to anon, authenticated;

drop policy if exists "audio_shows_read_published" on public.audio_shows;
create policy "audio_shows_read_published" on public.audio_shows
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists "audio_episodes_read_published" on public.audio_episodes;
create policy "audio_episodes_read_published" on public.audio_episodes
  for select to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.audio_shows s
      where s.id = audio_episodes.show_id and s.status = 'published'
    )
  );

-- Public bucket for covers + audio. Uploads only via signed upload URLs
-- minted by the admin (service role), so no insert policy for clients.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio-content',
  'audio-content',
  true,
  524288000, -- 500 MB: a long audiobook chapter as a high-bitrate MP3
  array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
        'audio/wav', 'audio/x-wav', 'audio/ogg', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
