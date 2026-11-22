-- Elli ride log for the CO₂ balance (riders + LandStation pilot report).
-- Booking does not exist yet; whoever records a finished ride later (driver
-- app, admin, phone-booking entry) writes here with the service role. Only
-- distances and counts are stored — no addresses, no route — so the CO₂ method
-- can be recomputed when its factors change (lib/elli/co2.ts holds them).
-- wallet_address is null for phone bookings without an app account.

create table if not exists public.elli_rides (
  id uuid primary key default gen_random_uuid(),
  wallet_address text references public.users(wallet_address) on delete set null,
  passengers smallint not null default 1 check (passengers between 1 and 8),
  ride_km numeric(6,2) not null check (ride_km >= 0 and ride_km <= 300),
  empty_km numeric(6,2) not null default 0 check (empty_km >= 0 and empty_km <= 300),
  source text not null default 'app' check (source in ('app', 'phone', 'admin')),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists elli_rides_wallet_idx
  on public.elli_rides (lower(wallet_address), completed_at desc);

alter table public.elli_rides enable row level security;
-- No policies and no grants: the raw log is not readable from the app.
revoke all on public.elli_rides from anon, authenticated;

-- A rider's own rides (newest first). Same trust model as the rest of the
-- wallet-keyed app: the caller passes their own address.
create or replace function public.elli_my_rides(p_wallet text)
returns table (id uuid, completed_at timestamptz, passengers smallint, ride_km numeric, empty_km numeric)
language sql stable security definer set search_path = public as $$
  select r.id, r.completed_at, r.passengers, r.ride_km, r.empty_km
  from public.elli_rides r
  where p_wallet is not null and lower(r.wallet_address) = lower(p_wallet)
  order by r.completed_at desc
  limit 200;
$$;

-- Town-wide pilot totals: linear sums, so the app computes CO₂ from them
-- with the same factors as per ride.
create or replace function public.elli_pilot_totals()
returns table (rides bigint, passengers bigint, passenger_km numeric, vehicle_km numeric, ride_km numeric, empty_km numeric, since timestamptz)
language sql stable security definer set search_path = public as $$
  select count(*),
         coalesce(sum(passengers), 0),
         coalesce(sum(passengers * ride_km), 0),
         coalesce(sum(ride_km + empty_km), 0),
         coalesce(sum(ride_km), 0),
         coalesce(sum(empty_km), 0),
         min(completed_at)
  from public.elli_rides;
$$;

revoke all on function public.elli_my_rides(text) from public;
revoke all on function public.elli_pilot_totals() from public;
grant execute on function public.elli_my_rides(text) to anon, authenticated;
grant execute on function public.elli_pilot_totals() to anon, authenticated;
