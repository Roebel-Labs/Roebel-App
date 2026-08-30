-- Org map presence: give organisation accounts a location of their own.
--
-- Until now an org could only appear on the map through a linked `restaurants`
-- row (sub_type='restaurant') or through a `businesses` row owned by one of its
-- owner wallets. Vereine, Fraktionen and the Stadt have neither, so they were
-- invisible. These columns let any account carry its own coordinates.
--
-- Convention: only populate latitude/longitude for orgs that have NO
-- restaurants/businesses row of their own — otherwise the org would render a
-- second pin on top of its own place. `address` may be set either way.
alter table public.accounts
  add column if not exists address   text,
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;

comment on column public.accounts.address is
  'Public postal address of the organisation. Free text, as displayed in the app.';
comment on column public.accounts.latitude is
  'WGS84 latitude for the map pin. Only set when the org has no own restaurants/businesses row.';
comment on column public.accounts.longitude is
  'WGS84 longitude for the map pin. Only set when the org has no own restaurants/businesses row.';

-- Map queries filter on "has coordinates"; keep that cheap.
create index if not exists accounts_coordinates_idx
  on public.accounts (latitude, longitude)
  where latitude is not null and longitude is not null;
