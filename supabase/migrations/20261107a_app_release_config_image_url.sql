-- Optional hero image for the app-update modal (DanceCup 2026: flyer on the 'update for the livestream' prompt).
alter table public.app_release_config add column if not exists image_url text;
