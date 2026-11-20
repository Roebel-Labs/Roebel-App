-- Live room, part 2: phone guests (LiveKit) + a test show for the app's developer settings.
-- Spec: docs/superpowers/specs/2026-11-05-live-room-design.md (§ Guests, § Test show)

alter table live_shows add column if not exists is_test boolean not null default false;
alter table live_shows add column if not exists guests_enabled boolean not null default true;

-- A viewer asks to join the stream from their phone; the studio accepts or declines.
create table if not exists live_guest_requests (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references live_shows(id) on delete cascade,
  wallet text not null,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  note text check (char_length(note) <= 140),
  status text not null default 'requested' check (status in ('requested', 'accepted', 'declined', 'ended', 'cancelled')),
  room text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  ended_at timestamptz
);
create index if not exists live_guest_requests_show_idx on live_guest_requests (show_id, status, created_at);
create unique index if not exists live_guest_requests_open_uq on live_guest_requests (show_id, wallet)
  where status in ('requested', 'accepted');
alter table live_guest_requests enable row level security;
revoke all on live_guest_requests from anon, authenticated;

-- Test show: always "live" on a public test stream, sample rundown, voting open, no real money.
insert into live_shows (slug, title, subtitle, status, hls_url, starts_at, is_test, voting_open, slow_mode_seconds, overlay)
values (
  'testlauf', 'Testlauf Livestream', 'Zum Ausprobieren – nichts hier ist echt', 'live',
  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', now(), true, true, 0,
  '{"lower_third": true, "next_up": true, "bug": true, "qr": true, "poll": true, "alerts": true, "reactions": true, "featured_message_id": null, "message": "Testlauf – alles hier ist nur zum Ausprobieren"}'::jsonb
)
on conflict (slug) do update set is_test = true;

insert into live_rundown_items (show_id, position, title, subtitle, detail)
select s.id, v.pos, v.title, v.subtitle, v.detail
from live_shows s
cross join (values
  (0, 'Testgruppe Sonnenschein', 'Kinder · Röbel', 'Jazz Dance'),
  (1, 'Die Wirbelwinde', 'Jugend · Waren', 'Hip-Hop'),
  (2, 'Formation Müritzwelle', 'Erwachsene · Malchow', 'Showtanz'),
  (3, 'Crew Seeblick', 'Jugend · Röbel', 'Streetdance'),
  (4, 'Tanzwerk Plau', 'Erwachsene · Plau am See', 'Contemporary')
) as v(pos, title, subtitle, detail)
where s.slug = 'testlauf'
  and not exists (select 1 from live_rundown_items i where i.show_id = s.id);
