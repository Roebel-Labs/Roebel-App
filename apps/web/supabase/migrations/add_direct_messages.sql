-- Direct Messaging tables for Supabase-based chat

-- conversations: canonical pair (participant_one < participant_two)
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  participant_one text not null,
  participant_two text not null,
  created_at timestamptz not null default now(),
  constraint unique_conversation unique (participant_one, participant_two),
  constraint ordered_participants check (participant_one < participant_two)
);

-- messages
create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_address text not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- per-user read tracking
create table if not exists conversation_participants (
  conversation_id uuid not null references conversations(id) on delete cascade,
  wallet_address text not null,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, wallet_address)
);

-- Indexes
create index if not exists idx_dm_conversation on direct_messages(conversation_id, created_at);
create index if not exists idx_conv_p1 on conversations(participant_one);
create index if not exists idx_conv_p2 on conversations(participant_two);

-- RLS (permissive — wallet validation happens app-side, matching existing pattern)
alter table conversations enable row level security;
alter table direct_messages enable row level security;
alter table conversation_participants enable row level security;

create policy "allow_all" on conversations for all using (true) with check (true);
create policy "allow_all" on direct_messages for all using (true) with check (true);
create policy "allow_all" on conversation_participants for all using (true) with check (true);

-- Enable Realtime on messages
alter publication supabase_realtime add table direct_messages;

-- RPC for unread count
create or replace function get_unread_count(p_wallet text)
returns integer as $$
  select coalesce(count(*)::integer, 0)
  from direct_messages m
  join conversation_participants cp on cp.conversation_id = m.conversation_id
  where cp.wallet_address = p_wallet
    and m.sender_address != p_wallet
    and m.created_at > cp.last_read_at;
$$ language sql stable;
