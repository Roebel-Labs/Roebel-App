-- App Release Config — singleton row that drives the in-app "Update available" modal.
-- The mobile app polls this row at boot / on foreground and compares
-- Constants.expoConfig?.version against the platform-specific latest_version.
-- Writes are performed server-side via the admin (service-role) client.

create table if not exists public.app_release_config (
  id                      integer primary key default 1,
  ios_latest_version      text not null default '0.0.0',
  android_latest_version  text not null default '0.0.0',
  ios_store_url           text not null default 'https://apps.apple.com/de/app/r%C3%B6bel/id6754984699',
  android_store_url       text not null default 'https://play.google.com/store/apps/details?id=com.maxbrych.roebelonchain',
  title_de                text not null default 'Update verfügbar',
  body_de                 text not null default 'Eine neue Version der Röbel App ist verfügbar. Aktualisiere jetzt, um die neuesten Funktionen und Verbesserungen zu erhalten.',
  cta_label_de            text not null default 'Jetzt aktualisieren',
  dismiss_label_de        text not null default 'Später',
  is_active               boolean not null default true,
  updated_at              timestamptz not null default now(),
  constraint app_release_config_singleton check (id = 1)
);

insert into public.app_release_config (id) values (1)
on conflict (id) do nothing;

alter table public.app_release_config enable row level security;

-- Public read: anyone (anon + authenticated) can read the singleton config.
create policy "app_release_config_public_read"
  on public.app_release_config
  for select to anon, authenticated
  using (true);

-- No anon/authenticated write policy on purpose — writes go through the
-- service-role admin client used by the admin dashboard server actions.
