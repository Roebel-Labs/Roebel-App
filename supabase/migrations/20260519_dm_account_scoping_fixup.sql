-- DM account scoping — round 2 fixup.
-- 1) Relax NOT NULL on legacy wallet columns so the new app code (which only
--    writes *_account_id) can INSERT successfully.
-- 2) Backfill existing rows so previous personal-account chats reappear in
--    the inbox after the round-1 migration introduced account-keyed reads.

-- ── 1. relax NOT NULL on legacy wallet columns ─────────────────────
alter table conversations  alter column participant_one drop not null;
alter table conversations  alter column participant_two drop not null;
alter table direct_messages alter column sender_address drop not null;

-- conversation_participants previously had primary key (conversation_id, wallet_address).
-- The round-1 migration added a synthetic `id uuid default gen_random_uuid()` column;
-- promote it to PK so wallet_address can become nullable.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'conversation_participants_pkey'
  ) then
    alter table conversation_participants drop constraint conversation_participants_pkey;
  end if;
end $$;

alter table conversation_participants alter column wallet_address drop not null;

-- Re-add the synthetic PK if it isn't already present.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'conversation_participants'::regclass
      and contype = 'p'
  ) then
    alter table conversation_participants add primary key (id);
  end if;
end $$;

-- ── 2. backfill *_account_id from legacy wallet columns ────────────
-- Resolve each wallet to its personal account via account_owners. Idempotent
-- thanks to the `is null` guards.

update conversations c
   set participant_one_account_id = ao.account_id
  from account_owners ao
  join accounts a on a.id = ao.account_id
 where lower(c.participant_one) = lower(ao.wallet_address)
   and a.account_type = 'personal'
   and c.participant_one_account_id is null;

update conversations c
   set participant_two_account_id = ao.account_id
  from account_owners ao
  join accounts a on a.id = ao.account_id
 where lower(c.participant_two) = lower(ao.wallet_address)
   and a.account_type = 'personal'
   and c.participant_two_account_id is null;

update direct_messages m
   set sender_account_id = ao.account_id
  from account_owners ao
  join accounts a on a.id = ao.account_id
 where lower(m.sender_address) = lower(ao.wallet_address)
   and a.account_type = 'personal'
   and m.sender_account_id is null;

update conversation_participants cp
   set account_id = ao.account_id
  from account_owners ao
  join accounts a on a.id = ao.account_id
 where lower(cp.wallet_address) = lower(ao.wallet_address)
   and a.account_type = 'personal'
   and cp.account_id is null;
