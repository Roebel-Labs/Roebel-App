-- Folgen & Stummschalten (spec: docs/superpowers/specs/2026-10-10-follow-graph-design.md)
-- account_follows is public (follower counts); account_hides is private and only the
-- account-relations edge function (service role) reads or writes it.

create table if not exists public.account_follows (
  follower_wallet   text not null,
  target_account_id uuid not null references public.accounts(id) on delete cascade,
  source            text not null check (source in ('onboarding','manual','intro')),
  created_at        timestamptz not null default now(),
  primary key (follower_wallet, target_account_id),
  check (follower_wallet = lower(follower_wallet))
);
create index if not exists account_follows_target_idx on public.account_follows (target_account_id, created_at desc);

create table if not exists public.account_hides (
  viewer_wallet     text not null,
  target_account_id uuid not null references public.accounts(id) on delete cascade,
  kind              text not null check (kind in ('unfollowed','muted')),
  created_at        timestamptz not null default now(),
  primary key (viewer_wallet, target_account_id, kind),
  check (viewer_wallet = lower(viewer_wallet))
);
create index if not exists account_hides_target_idx on public.account_hides (target_account_id) where kind = 'muted';

alter table public.accounts add column if not exists suggest_to_new_users boolean not null default true;

alter table public.account_follows enable row level security;
alter table public.account_hides enable row level security;
revoke all on public.account_follows from anon, authenticated;
revoke all on public.account_hides from anon, authenticated;
-- No policies, no grants: service role only. Counts go through get_follow_stats (security definer).

create or replace function public.personal_account_id(p_wallet text)
returns uuid language sql stable security definer set search_path = public as $$
  select a.id from public.accounts a
  join public.account_owners ao on ao.account_id = a.id
  where a.account_type = 'personal' and lower(ao.wallet_address) = lower(p_wallet)
  order by a.created_at asc limit 1
$$;

create or replace function public.get_follow_stats(p_account_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'account_id', p_account_id,
    'followers', (select count(*) from public.account_follows f where f.target_account_id = p_account_id),
    -- "following" only means something for a personal account: its owner's follows.
    'following', (
      select count(*) from public.account_follows f
      where f.follower_wallet in (
        select lower(ao.wallet_address) from public.account_owners ao
        join public.accounts a on a.id = ao.account_id and a.account_type = 'personal'
        where ao.account_id = p_account_id
      )
    )
  )
$$;

create or replace function public.get_follow_suggestions()
returns table(account_id uuid, name text, avatar_url text, account_type text, sub_type text, followers int, score numeric)
language sql stable security definer set search_path = public as $$
  with eng as (
    select coalesce(p.account_id, public.personal_account_id(p.wallet_address)) as aid,
           sum(coalesce(p.likes_count,0)) as likes,
           sum(coalesce(p.comments_count,0)) as comments,
           sum(coalesce(p.views_count,0)) as views
    from public.posts p
    where p.status = 'published' and p.created_at > now() - interval '90 days'
    group by 1
  ),
  fol as (select target_account_id as aid, count(*)::int as n from public.account_follows group by 1)
  select a.id, a.name, a.avatar_url, a.account_type, a.sub_type,
         coalesce(fol.n, 0),
         3 * coalesce(fol.n,0) + coalesce(eng.likes,0) + 2 * coalesce(eng.comments,0)
           + 0.1 * coalesce(eng.views,0) + 2 * coalesce(v.up_count,0)
  from public.accounts a
  left join eng on eng.aid = a.id
  left join fol on fol.aid = a.id
  left join public.account_vote_summary v on v.account_id = a.id
  where a.suggest_to_new_users
    and coalesce(trim(a.name), '') <> ''
    and (a.account_type = 'organisation'
         or exists (select 1 from public.account_owners ao where ao.account_id = a.id))
  order by 7 desc, (a.account_type = 'organisation') desc, a.name asc
$$;

create or replace function public.list_account_followers(p_account_id uuid, p_limit int default 50, p_offset int default 0)
returns table(name text, avatar_url text, username text)
language sql stable security definer set search_path = public as $$
  -- No wallet in the output: the list is shown by name and links by username.
  select coalesce(u.display_name, u.username), u.profile_picture_url, u.username
  from public.account_follows f
  left join public.users u on lower(u.wallet_address) = f.follower_wallet
  where f.target_account_id = p_account_id
  order by f.created_at desc
  limit least(p_limit, 200) offset greatest(p_offset, 0)
$$;

revoke execute on function public.personal_account_id(text), public.list_account_followers(uuid, int, int) from public, anon, authenticated;
grant execute on function public.personal_account_id(text), public.get_follow_stats(uuid),
  public.get_follow_suggestions() to anon, authenticated;
-- list_account_followers stays service-role only (account-relations `followers` action).
