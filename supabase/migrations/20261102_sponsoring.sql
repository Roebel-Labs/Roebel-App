-- Sponsoring campaigns: organisations book ad slots for a livestream (first: DanceCup 2026-11-07).
-- Clients read active campaigns + packages with the anon key and slot availability through a
-- read-only RPC. Bookings are written only by the signed web route (/api/sponsoring, service
-- role) through book_sponsoring_package(), which locks the package row so two orgs can never
-- take the last slot. Payment is outside the app for now: an optional Stripe Payment Link per
-- package, otherwise Max settles with the org directly. Purely additive migration.

create table if not exists sponsoring_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  title text not null check (char_length(title) between 1 and 120),
  subtitle text check (char_length(subtitle) <= 200),
  description text check (char_length(description) <= 4000),
  highlights text[] not null default '{}',
  hero_image_url text,
  event_starts_at timestamptz,
  venue text check (char_length(venue) <= 200),
  booking_deadline timestamptz not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sponsoring_packages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references sponsoring_campaigns(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  includes text[] not null default '{}',
  price_cents integer not null check (price_cents > 0),
  capacity integer check (capacity > 0),
  accepts text[] not null check (array_length(accepts, 1) > 0 and accepts <@ array['image', 'video']),
  max_video_seconds integer check (max_video_seconds > 0),
  payment_link_url text check (payment_link_url ~ '^https://'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sponsoring_packages_campaign_idx on sponsoring_packages (campaign_id, sort_order);

create table if not exists sponsoring_bookings (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references sponsoring_campaigns(id) on delete cascade,
  package_id uuid not null references sponsoring_packages(id),
  org_account_id uuid not null references accounts(id) on delete cascade,
  booked_by_wallet text not null,
  media_kind text check (media_kind in ('image', 'video')),
  media_url text check (media_url ~ '^https://'),
  note text check (char_length(note) <= 500),
  amount_cents integer not null,
  status text not null default 'requested'
    check (status in ('requested', 'paid', 'approved', 'rejected', 'cancelled')),
  review_note text check (char_length(review_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sponsoring_bookings_package_idx on sponsoring_bookings (package_id, status);
create index if not exists sponsoring_bookings_org_idx on sponsoring_bookings (org_account_id, campaign_id);

alter table sponsoring_campaigns enable row level security;
alter table sponsoring_packages enable row level security;
alter table sponsoring_bookings enable row level security;

drop policy if exists sponsoring_campaigns_read on sponsoring_campaigns;
create policy sponsoring_campaigns_read on sponsoring_campaigns for select using (is_active);
drop policy if exists sponsoring_packages_read on sponsoring_packages;
create policy sponsoring_packages_read on sponsoring_packages for select using (
  is_active and exists (select 1 from sponsoring_campaigns c where c.id = campaign_id and c.is_active)
);
revoke insert, update, delete on sponsoring_campaigns, sponsoring_packages from anon, authenticated;
revoke all on sponsoring_bookings from anon, authenticated;

-- Slots taken per package (requested, paid and approved bookings hold a slot). No buyer data.
create or replace function sponsoring_availability(p_campaign_id uuid)
returns table (package_id uuid, taken integer)
language sql stable security definer set search_path = public as $$
  select p.id, count(b.id)::int
  from sponsoring_packages p
  join sponsoring_campaigns c on c.id = p.campaign_id and c.is_active
  left join sponsoring_bookings b on b.package_id = p.id and b.status in ('requested', 'paid', 'approved')
  where p.campaign_id = p_campaign_id and p.is_active
  group by p.id;
$$;
revoke execute on function sponsoring_availability(uuid) from public, anon, authenticated;
grant execute on function sponsoring_availability(uuid) to anon, authenticated;

-- Books one slot. Called only by the service role (signed web route, which checks owner/admin).
create or replace function book_sponsoring_package(
  p_package_id uuid, p_org_account_id uuid, p_wallet text,
  p_media_kind text, p_media_url text, p_note text
) returns sponsoring_bookings
language plpgsql security definer set search_path = public as $$
declare
  v_pkg sponsoring_packages;
  v_campaign sponsoring_campaigns;
  v_taken integer;
  v_row sponsoring_bookings;
begin
  select * into v_pkg from sponsoring_packages where id = p_package_id for update;
  if v_pkg.id is null or not v_pkg.is_active then raise exception 'not_on_sale'; end if;
  select * into v_campaign from sponsoring_campaigns where id = v_pkg.campaign_id;
  if not v_campaign.is_active then raise exception 'not_on_sale'; end if;
  if now() > v_campaign.booking_deadline then raise exception 'deadline_passed'; end if;
  if p_media_kind is not null and not (p_media_kind = any(v_pkg.accepts)) then
    raise exception 'media_kind_not_accepted';
  end if;
  if exists (
    select 1 from sponsoring_bookings
    where package_id = v_pkg.id and org_account_id = p_org_account_id
      and status in ('requested', 'paid', 'approved')
  ) then raise exception 'already_booked'; end if;
  if v_pkg.capacity is not null then
    select count(*) into v_taken from sponsoring_bookings
    where package_id = v_pkg.id and status in ('requested', 'paid', 'approved');
    if v_taken >= v_pkg.capacity then raise exception 'sold_out'; end if;
  end if;
  insert into sponsoring_bookings (campaign_id, package_id, org_account_id, booked_by_wallet,
    media_kind, media_url, note, amount_cents)
  values (v_pkg.campaign_id, v_pkg.id, p_org_account_id, lower(p_wallet),
    p_media_kind, p_media_url, nullif(trim(p_note), ''), v_pkg.price_cents)
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function book_sponsoring_package(uuid, uuid, text, text, text, text) from public, anon, authenticated;

-- DanceCup 2026. Prices/slots/deadline/texts are Max's to change here at any time (no app update).
insert into sponsoring_campaigns (slug, title, subtitle, description, highlights, event_starts_at,
  venue, booking_deadline, is_active)
values (
  'dancecup-2026',
  'DanceCup 2026 – Livestream',
  'Zeigt euren Verein oder euer Geschäft im Livestream',
  'Der DanceCup Röbel wird am Samstag, 7. November, den ganzen Tag live übertragen – in der Röbel App, auf YouTube und auf Facebook. Mit einem Werbeplatz erreicht ihr Familien, Tanzfans und Gäste aus der ganzen Region und unterstützt gleichzeitig die Übertragung.',
  array['Live in der Röbel App, auf YouTube und Facebook', 'Den ganzen Turniertag lang sichtbar', 'Logo oder Video – wir bauen es professionell in den Stream ein'],
  '2026-11-07 09:00:00+01',
  'Röbel/Müritz',
  '2026-11-06 12:00:00+01',
  true
)
on conflict (slug) do nothing;

insert into sponsoring_packages (campaign_id, name, description, includes, price_cents, capacity, accepts, max_video_seconds, sort_order)
select c.id, p.name, p.description, p.includes, p.price_cents, p.capacity, p.accepts, p.max_video_seconds, p.sort_order
from sponsoring_campaigns c
cross join (values
  ('Unterstützer', 'Für alle, die die Übertragung unterstützen möchten.',
    array['Euer Name im Abspann', 'Dankes-Einblendung während des Streams', 'Logo optional'], 2900, 20, array['image'], null::int, 0),
  ('Logo im Werbebanner', 'Euer Logo ist den ganzen Turniertag im Bild.',
    array['Euer Logo läuft den ganzen Tag im Werbebanner mit', 'Zusätzlich im Abspann'], 7900, 10, array['image'], null::int, 1),
  ('Video-Spot', 'Euer Video läuft in den Pausen zwischen den Runden.',
    array['15–30 Sekunden Video in den Pausen', 'Mehrfach über den Tag verteilt', 'Logo im Werbebanner inklusive'], 19900, 5, array['video', 'image'], 30, 2),
  ('Präsentiert von', 'Der Hauptpartner des Livestreams.',
    array['„Präsentiert von“ im Intro und auf dem Pausenbild', 'Logo dauerhaft eingeblendet', 'Video-Spot inklusive', 'Nur einmal vergeben'], 44900, 1, array['image', 'video'], 30, 3)
) as p(name, description, includes, price_cents, capacity, accepts, max_video_seconds, sort_order)
where c.slug = 'dancecup-2026'
  and not exists (select 1 from sponsoring_packages x where x.campaign_id = c.id);
