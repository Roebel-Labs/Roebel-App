-- Sponsoring v2: "Jetzt kaufen" instead of a request. A booking is created as pending_payment
-- with a 35-minute hold (counts toward capacity), paid through Stripe Checkout as a direct
-- charge on the campaign's beneficiary connected account (MüritzPhone), settled by the Connect
-- webhook. Plus pre-generated personal AI ad cards per org and the public "Schon dabei" list.
-- Additive except: book_sponsoring_package() gains p_hold_minutes and returns pending_payment.

alter table sponsoring_campaigns
  add column if not exists beneficiary_account_id uuid references accounts(id);

alter table sponsoring_bookings
  add column if not exists expires_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists stripe_account_id text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists livemode boolean,
  add column if not exists late_payment boolean not null default false,
  add column if not exists creative_id uuid,
  add column if not exists upgraded_from_booking_id uuid references sponsoring_bookings(id);
create unique index if not exists sponsoring_bookings_session_uidx
  on sponsoring_bookings (stripe_checkout_session_id) where stripe_checkout_session_id is not null;

alter table sponsoring_bookings drop constraint if exists sponsoring_bookings_status_check;
alter table sponsoring_bookings add constraint sponsoring_bookings_status_check
  check (status in ('requested', 'pending_payment', 'paid', 'approved', 'rejected', 'cancelled', 'expired', 'refunded'));

-- Personal ad cards (AI-generated from the org's logo, or uploaded). Public: they are ads.
create table if not exists sponsoring_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references sponsoring_campaigns(id) on delete cascade,
  org_account_id uuid not null references accounts(id) on delete cascade,
  image_url text not null check (image_url ~ '^https://'),
  variant integer not null default 0,
  source text not null check (source in ('ai_logo', 'ai_wordmark', 'upload')),
  created_at timestamptz not null default now()
);
create index if not exists sponsoring_creatives_org_idx on sponsoring_creatives (campaign_id, org_account_id, variant);
alter table sponsoring_creatives enable row level security;
drop policy if exists sponsoring_creatives_read on sponsoring_creatives;
create policy sponsoring_creatives_read on sponsoring_creatives for select using (true);
revoke insert, update, delete on sponsoring_creatives from anon, authenticated;

alter table sponsoring_bookings drop constraint if exists sponsoring_bookings_creative_fk;
alter table sponsoring_bookings add constraint sponsoring_bookings_creative_fk
  foreign key (creative_id) references sponsoring_creatives(id) on delete set null;

-- A slot is held by: unexpired pending_payment, requested, paid, approved.
create or replace function sponsoring_slot_held(b sponsoring_bookings) returns boolean
language sql stable as $$
  select b.status in ('requested', 'paid', 'approved')
      or (b.status = 'pending_payment' and b.expires_at > now());
$$;

create or replace function sponsoring_availability(p_campaign_id uuid)
returns table (package_id uuid, taken integer)
language sql stable security definer set search_path = public as $$
  select p.id, count(b.id) filter (where b.id is not null and sponsoring_slot_held(b))::int
  from sponsoring_packages p
  join sponsoring_campaigns c on c.id = p.campaign_id and c.is_active
  left join sponsoring_bookings b on b.package_id = p.id
  where p.campaign_id = p_campaign_id and p.is_active
  group by p.id;
$$;
revoke execute on function sponsoring_availability(uuid) from public, anon, authenticated;
grant execute on function sponsoring_availability(uuid) to anon, authenticated;

-- "Schon dabei": paid/approved bookings with org name + logo + package (they air publicly
-- anyway). The app also uses it to see, without a signature, that the own org has bought.
drop function if exists sponsoring_supporters(uuid);
create or replace function sponsoring_supporters(p_campaign_id uuid)
returns table (org_account_id uuid, name text, avatar_url text, package_id uuid, paid_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.name, a.avatar_url, b.package_id, b.paid_at
  from sponsoring_bookings b join accounts a on a.id = b.org_account_id
  where b.campaign_id = p_campaign_id and b.status in ('paid', 'approved')
  order by b.paid_at nulls last;
$$;
revoke execute on function sponsoring_supporters(uuid) from public, anon, authenticated;
grant execute on function sponsoring_supporters(uuid) to anon, authenticated;

drop function if exists book_sponsoring_package(uuid, uuid, text, text, text, text);
create or replace function book_sponsoring_package(
  p_package_id uuid, p_org_account_id uuid, p_wallet text,
  p_media_kind text, p_media_url text, p_note text,
  p_creative_id uuid default null, p_hold_minutes integer default 35
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
  if p_creative_id is not null and not exists (
    select 1 from sponsoring_creatives where id = p_creative_id and org_account_id = p_org_account_id
  ) then raise exception 'bad_creative'; end if;
  -- An earlier unpaid attempt by the same org is released instead of blocking a retry.
  update sponsoring_bookings set status = 'cancelled', updated_at = now()
  where package_id = v_pkg.id and org_account_id = p_org_account_id and status = 'pending_payment';
  if exists (
    select 1 from sponsoring_bookings b
    where b.package_id = v_pkg.id and b.org_account_id = p_org_account_id and sponsoring_slot_held(b)
  ) then raise exception 'already_booked'; end if;
  if v_pkg.capacity is not null then
    select count(*) into v_taken from sponsoring_bookings b
    where b.package_id = v_pkg.id and sponsoring_slot_held(b);
    if v_taken >= v_pkg.capacity then raise exception 'sold_out'; end if;
  end if;
  insert into sponsoring_bookings (campaign_id, package_id, org_account_id, booked_by_wallet,
    media_kind, media_url, note, amount_cents, status, expires_at, creative_id)
  values (v_pkg.campaign_id, v_pkg.id, p_org_account_id, lower(p_wallet),
    p_media_kind, p_media_url, nullif(trim(p_note), ''), v_pkg.price_cents,
    'pending_payment', now() + make_interval(mins => p_hold_minutes), p_creative_id)
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function book_sponsoring_package(uuid, uuid, text, text, text, text, uuid, integer) from public, anon, authenticated;

-- Unpaid holds expire (the slot is free again); Stripe's own session expiry also reports here.
create or replace function expire_sponsoring_bookings() returns integer
language sql security definer set search_path = public as $$
  with x as (
    update sponsoring_bookings set status = 'expired', updated_at = now()
    where status = 'pending_payment' and expires_at <= now() returning 1
  ) select count(*)::int from x;
$$;
revoke execute on function expire_sponsoring_bookings() from public, anon, authenticated;
select cron.unschedule('expire-sponsoring-bookings') where exists (select 1 from cron.job where jobname = 'expire-sponsoring-bookings');
select cron.schedule('expire-sponsoring-bookings', '*/10 * * * *', 'select public.expire_sponsoring_bookings()');

-- Beneficiary for DanceCup = MüritzPhone (Max's Kleinunternehmen, live Stripe Connect account).
update sponsoring_campaigns set beneficiary_account_id = '0d50edc5-8db4-4831-8364-9c88026fc8f0'
where slug = 'dancecup-2026' and beneficiary_account_id is null;
