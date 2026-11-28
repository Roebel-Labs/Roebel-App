-- Native booking via a seller's Calendly (first: Anna Janzen, 1:1 Personal Training).
-- Both tables are service-role only: the Calendly token never leaves the server, bookings hold
-- personal data (name, email, phone). The app talks to /api/booking/*.

create table if not exists booking_calendly (
  seller_wallet text primary key check (seller_wallet ~ '^0x[a-f0-9]{40}$'),
  seller_account_id uuid not null references accounts(id) on delete cascade,
  calendly_token text not null,
  calendly_user_uri text not null,
  -- {name} {datum} {uhrzeit} are filled in; null = default text
  auto_reply text check (char_length(auto_reply) <= 600),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  seller_wallet text not null references booking_calendly(seller_wallet) on delete cascade,
  booker_wallet text,
  event_type_uri text not null,
  event_name text,
  start_time timestamptz not null,
  end_time timestamptz,
  name text not null check (char_length(name) <= 80),
  email text not null check (char_length(email) <= 160),
  phone text check (char_length(phone) <= 40),
  answer text check (char_length(answer) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'booked', 'failed', 'cancelled')),
  via text check (via in ('api', 'calendly_page')),
  calendly_event_uri text,
  calendly_invitee_uri text,
  conversation_id uuid,
  auto_replied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bookings_seller_start_idx on bookings (seller_wallet, start_time);

alter table booking_calendly enable row level security;
alter table bookings enable row level security;
revoke all on booking_calendly from anon, authenticated;
revoke all on bookings from anon, authenticated;
