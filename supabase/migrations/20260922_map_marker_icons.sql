-- Map marker icons (applied remotely 2026-09-22 via MCP migration `map_marker_icons`).
--
-- One optional row per map pin (event / restaurant / business / poi / org):
-- an emoji override and/or a custom circular PNG for the pin. The apps
-- compute the default emoji from category / type (apps/expo/lib/map/markers.ts,
-- apps/web/src/lib/maps/marker-emoji.ts); a row exists only where an admin
-- changed something in /admin/dashboard/karten-icons.
--
-- Custom marker files are uploaded to `images/map-markers/<type>-<id>-<ts>.png`.
-- That prefix is deliberately NOT on the weekly orphan reaper's list
-- (storage_cleanup_list_orphans), so marker files are never reaped; a replaced
-- file simply lingers (~20 KB each).
create table if not exists public.map_marker_icons (
  entity_type text not null
    check (entity_type in ('event', 'restaurant', 'business', 'poi', 'org')),
  entity_id text not null,
  -- Override for the computed default; null = default.
  emoji text check (emoji is null or char_length(emoji) between 1 and 16),
  -- Public URL of the processed pin image (288 px circle, transparent corners).
  image_url text,
  updated_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

alter table public.map_marker_icons enable row level security;

drop policy if exists "map_marker_icons_public_read" on public.map_marker_icons;
create policy "map_marker_icons_public_read"
  on public.map_marker_icons for select using (true);
-- No insert/update/delete policies: writes go through the service role only.

grant select on public.map_marker_icons to anon, authenticated;
