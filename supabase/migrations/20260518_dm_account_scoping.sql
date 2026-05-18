-- DM account scoping: switch the messaging tables from wallet-keyed to
-- account-keyed identity so users can DM org accounts and have a separate
-- inbox per active account (personal vs each owned org).
--
-- Additive: keep the existing wallet columns so any in-flight rows still work.
-- New writes target the *_account_id columns. App-side validation is kept
-- (matches existing allow_all RLS pattern on this table set).

-- ── conversations: add account participants ────────────────────────
alter table conversations
  add column if not exists participant_one_account_id uuid references accounts(id) on delete cascade,
  add column if not exists participant_two_account_id uuid references accounts(id) on delete cascade;

-- Pair uniqueness on the new columns. Partial index so legacy wallet-only
-- rows (with NULL account ids) don't collide.
create unique index if not exists conversations_account_pair_unique
  on conversations (participant_one_account_id, participant_two_account_id)
  where participant_one_account_id is not null
    and participant_two_account_id is not null;

create index if not exists conversations_p1_account_idx
  on conversations (participant_one_account_id);
create index if not exists conversations_p2_account_idx
  on conversations (participant_two_account_id);

-- The existing `ordered_participants check (participant_one < participant_two)`
-- only covers the wallet columns. We enforce uuid ordering for the account
-- columns app-side (see `findOrCreateConversation` in apps/expo/lib/supabase-messages.ts)
-- to keep the migration backward-compatible — adding a CHECK here would
-- require backfilling every legacy row first.

-- ── direct_messages: add account sender ────────────────────────────
alter table direct_messages
  add column if not exists sender_account_id uuid references accounts(id) on delete set null;

create index if not exists direct_messages_sender_account_idx
  on direct_messages (sender_account_id);

-- ── conversation_participants: add account-based read tracking ─────
-- Drop the old composite PK so we can keep both wallet- and account-keyed
-- read-tracking rows during the transition. Re-add it as a unique index on
-- the wallet column only, since the table needs *some* identifier per row.
alter table conversation_participants
  add column if not exists account_id uuid references accounts(id) on delete cascade,
  add column if not exists id uuid default gen_random_uuid();

-- New unique index on the account_id form (partial — old wallet rows have NULL here).
create unique index if not exists conv_participants_account_unique
  on conversation_participants (conversation_id, account_id)
  where account_id is not null;

-- Keep the wallet uniqueness too so legacy upserts keep working.
-- (The original primary key on (conversation_id, wallet_address) already
-- enforces this; no change needed.)

-- ── search_accounts RPC ────────────────────────────────────────────
-- Ranked search across personal + organisation accounts. Used by the DM
-- search screen. Excludes external orgs that are not yet approved so users
-- can't start chats with pending applicants.
create or replace function search_accounts(
  p_query text,
  p_scope text,        -- 'all' | 'personal' | 'organisation'
  p_exclude uuid,      -- caller's active account id, excluded from results
  p_limit int default 30
)
returns table (
  id uuid,
  account_type text,
  sub_type text,
  name text,
  slug text,
  avatar_url text,
  is_verified boolean,
  username text,            -- personal accounts only (joined via account_owners → users)
  match_rank real
)
language sql stable as $$
  with q as (select lower(trim(p_query)) as term)
  select
    a.id,
    a.account_type::text,
    a.sub_type::text,
    a.name,
    a.slug,
    a.avatar_url,
    a.is_verified,
    u.username,
    case
      when lower(a.slug)       = (select term from q) then 1.0::real
      when lower(u.username)   = (select term from q) then 1.0::real
      when lower(a.name)     ilike (select term from q) || '%' then 0.8::real
      when lower(a.slug)     ilike (select term from q) || '%' then 0.7::real
      when lower(u.username) ilike (select term from q) || '%' then 0.7::real
      else 0.4::real
    end as match_rank
  from accounts a
  left join account_owners ao
    on ao.account_id = a.id and a.account_type = 'personal'
  left join users u
    on u.wallet_address = ao.wallet_address
  where (p_exclude is null or a.id <> p_exclude)
    and (p_scope = 'all' or a.account_type::text = p_scope)
    and (
      lower(a.name)        like '%' || (select term from q) || '%'
      or lower(a.slug)     like '%' || (select term from q) || '%'
      or lower(u.username) like '%' || (select term from q) || '%'
    )
    and length((select term from q)) >= 2
    and (a.is_extern = false or a.extern_status = 'approved')
  order by match_rank desc, a.is_verified desc, a.name asc
  limit p_limit;
$$;

grant execute on function search_accounts(text, text, uuid, int) to anon, authenticated;

-- ── get_unread_count: add account-keyed variant ────────────────────
-- Overload (different parameter name) so the wallet variant keeps working
-- for any legacy callers. App now calls the uuid form.
create or replace function get_unread_count(p_account_id uuid)
returns integer as $$
  select coalesce(count(*)::integer, 0)
  from direct_messages m
  join conversation_participants cp on cp.conversation_id = m.conversation_id
  where cp.account_id = p_account_id
    and (m.sender_account_id is null or m.sender_account_id <> p_account_id)
    and m.created_at > cp.last_read_at;
$$ language sql stable;

grant execute on function get_unread_count(uuid) to anon, authenticated;
