-- Stripe Connect event tickets (slice A). Design: docs/future-research/2026-09-21_STRIPE_CONNECT_ASSESSMENT.md §7.
-- Access model: RLS on everywhere. Citizens read ticket_types with the anon key; every other read and
-- every write goes through apps/web API routes (service role) after wallet-signature verification.

create table if not exists stripe_connected_accounts (
  account_id uuid primary key references accounts(id) on delete cascade,
  stripe_account_id text not null unique,
  livemode boolean not null default false,
  dashboard_type text not null default 'full',
  details_submitted boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  requirements_currently_due jsonb not null default '[]'::jsonb,
  disabled_reason text,
  created_by_wallet text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table stripe_connected_accounts is 'One Stripe Connect account per org account. Mirror of Stripe state; Stripe is the truth.';

create table if not exists ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'eur',
  capacity integer check (capacity is null or capacity > 0),
  per_order_max integer not null default 10 check (per_order_max between 1 and 50),
  sales_start timestamptz,
  sales_end timestamptz,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ticket_types_event_idx on ticket_types (event_id, sort_order);

create table if not exists ticket_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  ticket_type_id uuid not null references ticket_types(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 50),
  buyer_wallet text not null,
  buyer_email text,
  amount_cents integer not null check (amount_cents >= 0),
  application_fee_cents integer not null default 0 check (application_fee_cents >= 0),
  currency text not null default 'eur',
  rail text not null default 'stripe' check (rail in ('stripe', 'free', 'eure')),
  livemode boolean not null default false,
  stripe_account_id text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled', 'refunded')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz
);
create unique index if not exists ticket_orders_session_uq on ticket_orders (stripe_checkout_session_id) where stripe_checkout_session_id is not null;
create index if not exists ticket_orders_buyer_idx on ticket_orders (buyer_wallet, created_at desc);
create index if not exists ticket_orders_type_status_idx on ticket_orders (ticket_type_id, status);
create index if not exists ticket_orders_pi_idx on ticket_orders (stripe_payment_intent_id) where stripe_payment_intent_id is not null;

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references ticket_orders(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  ticket_type_id uuid not null references ticket_types(id) on delete cascade,
  code text not null unique,
  holder_wallet text not null,
  status text not null default 'issued' check (status in ('issued', 'checked_in', 'refunded', 'void')),
  checked_in_at timestamptz,
  checked_in_by_wallet text,
  created_at timestamptz not null default now()
);
create index if not exists tickets_holder_idx on tickets (holder_wallet, created_at desc);
create index if not exists tickets_event_idx on tickets (event_id, status);

create table if not exists stripe_events (
  id text primary key,
  type text not null,
  account text,
  livemode boolean not null default false,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

alter table stripe_connected_accounts enable row level security;
alter table ticket_types enable row level security;
alter table ticket_orders enable row level security;
alter table tickets enable row level security;
alter table stripe_events enable row level security;

-- Only ticket_types is client-readable (active rows). No client writes anywhere.
drop policy if exists ticket_types_read_active on ticket_types;
create policy ticket_types_read_active on ticket_types for select using (is_active = true);
revoke all on stripe_connected_accounts, ticket_orders, tickets, stripe_events from anon, authenticated;
revoke insert, update, delete on ticket_types from anon, authenticated;

-- Reserve seats atomically: locks the ticket type row, counts paid + unexpired pending orders.
create or replace function reserve_tickets(
  p_ticket_type_id uuid, p_quantity integer, p_buyer_wallet text, p_hold_minutes integer default 35
) returns ticket_orders
language plpgsql security definer set search_path = public as $$
declare
  tt ticket_types%rowtype;
  ev events%rowtype;
  sold integer;
  pending_for_buyer integer;
  new_order ticket_orders%rowtype;
begin
  select * into tt from ticket_types where id = p_ticket_type_id for update;
  if not found or not tt.is_active then raise exception 'not_on_sale'; end if;
  if tt.sales_start is not null and tt.sales_start > now() then raise exception 'not_on_sale'; end if;
  if tt.sales_end is not null and tt.sales_end < now() then raise exception 'not_on_sale'; end if;
  if p_quantity < 1 or p_quantity > tt.per_order_max then raise exception 'per_order_max'; end if;

  select * into ev from events where id = tt.event_id;
  if not found or ev.status <> 'approved' or coalesce(ev.is_cancelled, false) then raise exception 'event_not_bookable'; end if;

  select count(*) into pending_for_buyer from ticket_orders
    where ticket_type_id = tt.id and buyer_wallet = lower(p_buyer_wallet)
      and status = 'pending' and expires_at > now();
  if pending_for_buyer >= 2 then raise exception 'too_many_pending'; end if;

  if tt.capacity is not null then
    select coalesce(sum(quantity), 0) into sold from ticket_orders
      where ticket_type_id = tt.id
        and (status = 'paid' or (status = 'pending' and expires_at > now()));
    if sold + p_quantity > tt.capacity then raise exception 'sold_out'; end if;
  end if;

  insert into ticket_orders (event_id, ticket_type_id, account_id, quantity, buyer_wallet, amount_cents, currency, rail, status, expires_at, paid_at)
  values (
    tt.event_id, tt.id, tt.account_id, p_quantity, lower(p_buyer_wallet),
    tt.price_cents * p_quantity, tt.currency,
    case when tt.price_cents = 0 then 'free' else 'stripe' end,
    case when tt.price_cents = 0 then 'paid' else 'pending' end,
    case when tt.price_cents = 0 then null else now() + make_interval(mins => p_hold_minutes) end,
    case when tt.price_cents = 0 then now() else null end
  ) returning * into new_order;
  return new_order;
end $$;

create or replace function expire_ticket_orders() returns integer
language sql security definer set search_path = public as $$
  with u as (
    update ticket_orders set status = 'expired'
    where status = 'pending' and expires_at is not null and expires_at < now()
    returning 1
  ) select count(*)::integer from u;
$$;

-- Supabase grants EXECUTE to anon/authenticated on every new function by default; these are service-role only.
revoke execute on function reserve_tickets(uuid, integer, text, integer) from public, anon, authenticated;
revoke execute on function expire_ticket_orders() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('expire-ticket-orders', '*/10 * * * *', $cron$ select public.expire_ticket_orders(); $cron$);
  end if;
end $$;
