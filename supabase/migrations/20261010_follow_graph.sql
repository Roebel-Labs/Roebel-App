-- Folgen & Stummschalten (spec: docs/superpowers/specs/2026-10-10-follow-graph-design.md)
-- account_follows and account_hides are both private: only the account-relations edge
-- function (service role) reads or writes them. Counts are public only through
-- get_follow_stats (security definer); follower lists only via the signed `followers` action.

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
  fol as (select target_account_id as aid, count(*)::int as n from public.account_follows group by 1),
  -- Personal accounts.name is mostly a wallet string in prod: persons are named by their
  -- oldest owner's users.display_name / username instead. Orgs keep accounts.name.
  named as (
    select a.*,
           case when a.account_type = 'organisation' then nullif(trim(a.name), '')
                else (select coalesce(
                               nullif(regexp_replace(trim(u.display_name), '^0x[0-9a-f].*$', '', 'i'), ''),
                               nullif(regexp_replace(trim(u.username), '^0x[0-9a-f].*$', '', 'i'), ''))
                      from public.account_owners ao
                      join public.users u on lower(u.wallet_address) = lower(ao.wallet_address)
                      where ao.account_id = a.id
                      order by ao.joined_at asc nulls last
                      limit 1)
           end as shown_name
    from public.accounts a
    where a.suggest_to_new_users
  )
  select a.id, a.shown_name, a.avatar_url, a.account_type, a.sub_type,
         coalesce(fol.n, 0),
         3 * coalesce(fol.n,0) + coalesce(eng.likes,0) + 2 * coalesce(eng.comments,0)
           + 0.1 * coalesce(eng.views,0) + 2 * coalesce(v.up_count,0)
  from named a
  left join eng on eng.aid = a.id
  left join fol on fol.aid = a.id
  left join public.account_vote_summary v on v.account_id = a.id
  where a.shown_name is not null
    -- never surface a wallet address as a name
    and a.shown_name !~* '^0x[0-9a-f]'
  order by 7 desc, (a.account_type = 'organisation') desc, a.shown_name asc
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

-- ============================================================
-- Task 3 / migration step `20261010_follow_graph_feed`: get_feed_page exclusion
-- (apply separately; contains only what follows)
-- ============================================================
drop function if exists public.get_feed_page(text, integer, integer, text);

create or replace function public.get_feed_page(
  p_feed_type text,
  p_page integer default 0,
  p_page_size integer default 15,
  p_wallet text default null,
  p_exclude_account_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from integer := greatest(p_page, 0) * p_page_size;
  v_wallet text := nullif(lower(coalesce(p_wallet, '')), '');
  v_page_ids uuid[] := '{}';
  v_pinned_ids uuid[] := '{}';
  v_rest_ids uuid[] := '{}';
  v_ids uuid[] := '{}';
  v_target_ids uuid[] := '{}';
  v_posts jsonb := '[]'::jsonb;
  v_liked jsonb := '[]'::jsonb;
  v_reposted jsonb := '[]'::jsonb;
  v_hide uuid[] := coalesce(p_exclude_account_ids, '{}');
  v_hide_wallets text[] := '{}';
begin
  -- Legacy posts carry no account_id: hide them by the owner wallet of an excluded PERSONAL account.
  if cardinality(v_hide) > 0 then
    select coalesce(array_agg(distinct lower(ao.wallet_address)), '{}') into v_hide_wallets
    from public.account_owners ao
    join public.accounts a on a.id = ao.account_id and a.account_type = 'personal'
    where ao.account_id = any (v_hide);
  end if;

  -- array_agg has no implicit input order — the subquery's ORDER BY is not
  -- guaranteed to survive into the aggregate, so order explicitly inside it.
  select coalesce(array_agg(id order by created_at desc), '{}') into v_page_ids
  from (
    select id, created_at from public.posts
    where feed_type = p_feed_type and status = 'published'
      and not coalesce(account_id = any (v_hide), false)
      and not (account_id is null and lower(wallet_address) = any (v_hide_wallets))
    order by created_at desc
    offset v_from limit p_page_size
  ) s;

  -- Page 0 surfaces currently-pinned posts first (pins expire by time),
  -- mirroring the legacy client logic.
  if p_page = 0 then
    select coalesce(array_agg(id order by pinned_until desc), '{}') into v_pinned_ids
    from (
      select id, pinned_until from public.posts
      where feed_type = p_feed_type and status = 'published'
        and not coalesce(account_id = any (v_hide), false)
        and not (account_id is null and lower(wallet_address) = any (v_hide_wallets))
        and pinned_until > now()
      order by pinned_until desc
    ) s;
  end if;

  select coalesce(array_agg(id order by ord), '{}') into v_rest_ids
  from unnest(v_page_ids) with ordinality as t(id, ord)
  where id <> all (v_pinned_ids);

  v_ids := v_pinned_ids || v_rest_ids;

  if coalesce(array_length(v_ids, 1), 0) > 0 then
    select coalesce(jsonb_agg(public.feed_post_json(p, true) order by t.ord), '[]'::jsonb)
    into v_posts
    from unnest(v_ids) with ordinality as t(id, ord)
    join public.posts p on p.id = t.id;

    -- Like/repost state binds to the TARGET post: the original on reposts.
    -- UNION (not UNION ALL) already dedupes, so array_agg needs no DISTINCT.
    select coalesce(array_agg(x), '{}') into v_target_ids
    from (
      select unnest(v_ids) as x
      union
      select quoted_post_id from public.posts
      where id = any (v_ids) and quoted_post_id is not null
    ) s(x);

    if v_wallet is not null then
      select coalesce(jsonb_agg(distinct pl.post_id), '[]'::jsonb) into v_liked
      from public.post_likes pl
      where lower(pl.wallet_address) = v_wallet
        and pl.post_id = any (v_target_ids);

      select coalesce(jsonb_agg(distinct pr.quoted_post_id), '[]'::jsonb) into v_reposted
      from public.posts pr
      where lower(pr.wallet_address) = v_wallet
        and pr.post_type = 'repost' and pr.status = 'published'
        and pr.quoted_post_id = any (v_target_ids);
    end if;
  end if;

  return jsonb_build_object(
    'posts', v_posts,
    'has_more', coalesce(array_length(v_page_ids, 1), 0) = p_page_size,
    'liked_post_ids', v_liked,
    'reposted_post_ids', v_reposted
  );
end;
$$;

grant execute on function public.get_feed_page(text, integer, integer, text, uuid[]) to anon, authenticated;
