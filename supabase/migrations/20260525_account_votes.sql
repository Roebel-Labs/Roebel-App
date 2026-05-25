-- Thumbs up/down votes for org accounts. Mirrors menu_item_votes.
-- Applied to remote via Supabase MCP (apply_migration: create_account_votes).
create table if not exists public.account_votes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  wallet_address text not null,
  vote smallint not null check (vote in (1, -1)),
  created_at timestamptz not null default now(),
  unique (account_id, wallet_address)
);

create index if not exists idx_account_votes_account on public.account_votes (account_id);
create index if not exists idx_account_votes_wallet on public.account_votes (wallet_address);

alter table public.account_votes enable row level security;

-- Mirror menu_item_votes policies (apply to all roles, wallet-based app auth)
drop policy if exists "Votes viewable by all" on public.account_votes;
create policy "Votes viewable by all" on public.account_votes for select using (true);

drop policy if exists "Users can submit votes" on public.account_votes;
create policy "Users can submit votes" on public.account_votes for insert with check (true);

drop policy if exists "Users can update own votes" on public.account_votes;
create policy "Users can update own votes" on public.account_votes for update using (true);

drop policy if exists "Users can delete own votes" on public.account_votes;
create policy "Users can delete own votes" on public.account_votes for delete using (true);

-- Aggregate summary view (exposes up_count for ordering "most liked")
create or replace view public.account_vote_summary as
  select
    account_id,
    sum(case when vote = 1 then 1 else 0 end)::integer as up_count,
    sum(case when vote = -1 then 1 else 0 end)::integer as down_count,
    count(*)::integer as vote_count,
    round(100.0 * sum(case when vote = 1 then 1 else 0 end)::numeric / nullif(count(*), 0)::numeric)::integer as percent_liked
  from public.account_votes
  group by account_id;
