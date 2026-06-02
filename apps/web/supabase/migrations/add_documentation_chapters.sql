-- Documentation Chapters — public chapter-based PDF reader.
-- Each row is one chapter with a single PDF; the public /dokumentation page
-- renders these as cover cards (page 1 as thumbnail) and an inline reader.
-- Writes are performed server-side via the admin (service-role) client.

create table if not exists public.documentation_chapters (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  slug          text not null unique,
  pdf_url       text not null,
  storage_path  text not null,
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists documentation_chapters_display_order_idx
  on public.documentation_chapters (display_order);

alter table public.documentation_chapters enable row level security;

-- Public read: anyone (anon + authenticated) can list/read chapters.
create policy "documentation_chapters_public_read"
  on public.documentation_chapters
  for select to anon, authenticated
  using (true);

-- No anon/authenticated write policy on purpose — create/update/delete/reorder
-- go through the service-role admin client used by the admin dashboard actions.
