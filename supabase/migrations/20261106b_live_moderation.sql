-- Live room, part 3: chat moderation (spec Part 3).
-- author_key: stable per person per show, derived server-side (sha256 of show + wallet + secret salt),
-- public so viewers can block someone on their device without ever seeing a wallet.
alter table live_chat_messages add column if not exists author_key text;
grant select (author_key) on live_chat_messages to anon, authenticated;
create index if not exists live_chat_messages_author_idx on live_chat_messages (show_id, author_key);

create table if not exists live_reports (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references live_shows(id) on delete cascade,
  message_id uuid not null references live_chat_messages(id) on delete cascade,
  reporter_wallet text not null,
  reason text not null default 'other' check (reason in ('spam', 'abuse', 'other')),
  created_at timestamptz not null default now(),
  unique (message_id, reporter_wallet)
);
create index if not exists live_reports_show_idx on live_reports (show_id, created_at desc);
alter table live_reports enable row level security;
revoke all on live_reports from anon, authenticated;
