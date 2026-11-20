-- Live Room: app-native livestream (DanceCup 2026-11-07 first).
-- Spec: docs/superpowers/specs/2026-11-05-live-room-design.md
-- Public tables are read by the app + the OBS overlay (anon key, Realtime); every write goes
-- through the web API with the service role. The legacy `livestreams` table is unrelated.

create table if not exists live_shows (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  event_id uuid references events(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  subtitle text check (char_length(subtitle) <= 200),
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended')),
  hls_url text,
  replay_url text,
  poster_url text,
  starts_at timestamptz,
  cf_live_input_id text,
  beneficiary_account_id uuid references accounts(id),
  current_item_id uuid,
  chat_enabled boolean not null default true,
  slow_mode_seconds integer not null default 3 check (slow_mode_seconds between 0 and 600),
  voting_open boolean not null default false,
  overlay jsonb not null default '{"lower_third": true, "next_up": false, "bug": true, "qr": false, "poll": false, "alerts": true, "reactions": true, "featured_message_id": null, "message": null}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists live_rundown_items (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references live_shows(id) on delete cascade,
  position integer not null default 0,
  title text not null check (char_length(title) between 1 and 160),
  subtitle text check (char_length(subtitle) <= 200),
  detail text check (char_length(detail) <= 400),
  org_account_id uuid references accounts(id) on delete set null,
  image_url text,
  planned_at timestamptz,
  status text not null default 'upcoming' check (status in ('upcoming', 'on_stage', 'done')),
  on_stage_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists live_rundown_items_show_idx on live_rundown_items (show_id, position);

alter table live_shows drop constraint if exists live_shows_current_item_fkey;
alter table live_shows add constraint live_shows_current_item_fkey
  foreign key (current_item_id) references live_rundown_items(id) on delete set null;

create table if not exists live_chat_messages (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references live_shows(id) on delete cascade,
  wallet text,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  body text not null default '' check (char_length(body) <= 280),
  kind text not null default 'chat' check (kind in ('chat', 'support', 'system')),
  amount_cents integer,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  featured_at timestamptz
);
create index if not exists live_chat_messages_show_idx on live_chat_messages (show_id, created_at desc);
create index if not exists live_chat_messages_wallet_idx on live_chat_messages (show_id, wallet, created_at desc);

create table if not exists live_supports (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references live_shows(id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  message text check (char_length(message) <= 140),
  show_name boolean not null default true,
  wallet text,
  amount_cents integer not null check (amount_cents between 100 and 50000),
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'refunded')),
  stripe_checkout_session_id text,
  stripe_account_id text,
  stripe_payment_intent_id text,
  livemode boolean,
  chat_message_id uuid references live_chat_messages(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists live_supports_pi_idx on live_supports (stripe_payment_intent_id);

create table if not exists live_votes (
  show_id uuid not null references live_shows(id) on delete cascade,
  item_id uuid not null references live_rundown_items(id) on delete cascade,
  wallet text not null,
  created_at timestamptz not null default now(),
  primary key (show_id, wallet)
);

create table if not exists live_reminders (
  item_id uuid not null references live_rundown_items(id) on delete cascade,
  wallet text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (item_id, wallet)
);

create table if not exists live_mutes (
  show_id uuid not null references live_shows(id) on delete cascade,
  wallet text not null,
  created_at timestamptz not null default now(),
  primary key (show_id, wallet)
);

alter table live_shows enable row level security;
alter table live_rundown_items enable row level security;
alter table live_chat_messages enable row level security;
alter table live_supports enable row level security;
alter table live_votes enable row level security;
alter table live_reminders enable row level security;
alter table live_mutes enable row level security;

drop policy if exists live_shows_read on live_shows;
create policy live_shows_read on live_shows for select using (true);
drop policy if exists live_rundown_items_read on live_rundown_items;
create policy live_rundown_items_read on live_rundown_items for select using (true);
drop policy if exists live_chat_messages_read on live_chat_messages;
create policy live_chat_messages_read on live_chat_messages for select using (hidden_at is null);

revoke insert, update, delete on live_shows, live_rundown_items, live_chat_messages from anon, authenticated;
revoke all on live_supports, live_votes, live_reminders, live_mutes from anon, authenticated;
-- The wallet column is server-side only (mute + slow mode); clients see display names.
revoke select (wallet) on live_chat_messages from anon, authenticated;
revoke select on live_chat_messages from anon, authenticated;
grant select (id, show_id, display_name, avatar_url, body, kind, amount_cents, created_at, hidden_at, featured_at)
  on live_chat_messages to anon, authenticated;

-- Publikumsliebling results (a Meinungsbild): counts only, never who voted.
create or replace function live_vote_results(p_show_id uuid)
returns table (item_id uuid, votes bigint)
language sql stable security definer set search_path = public as $$
  select v.item_id, count(*)::bigint from live_votes v where v.show_id = p_show_id group by v.item_id;
$$;
revoke execute on function live_vote_results(uuid) from public, anon, authenticated;
grant execute on function live_vote_results(uuid) to anon, authenticated;

-- Realtime for the app + overlay.
do $$
begin
  begin alter publication supabase_realtime add table live_shows; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table live_rundown_items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table live_chat_messages; exception when duplicate_object then null; end;
end $$;

-- Seed the DanceCup show. Linked to the DanceCup event if there is one on 2026-11-07; the
-- beneficiary is the sponsoring campaign's (Stripe connected account that receives the money).
insert into live_shows (slug, event_id, title, subtitle, starts_at, beneficiary_account_id)
select
  'dancecup-2026',
  (select e.id from events e where e.title ilike '%dance%cup%' and e.date::text like '2026-11-07%' limit 1),
  'DanceCup Röbel 2026',
  'Live aus der Halle – in der Röbel App',
  coalesce((select c.event_starts_at from sponsoring_campaigns c where c.slug = 'dancecup-2026'), '2026-11-07 10:00+01'),
  (select c.beneficiary_account_id from sponsoring_campaigns c where c.slug = 'dancecup-2026')
on conflict (slug) do nothing;
