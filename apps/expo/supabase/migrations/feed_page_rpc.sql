-- apps/expo/supabase/migrations/feed_page_rpc.sql
--
-- One-round-trip feed page: posts + all embeds + quoted originals +
-- pinned-first ordering + the caller's liked/reposted ids. Replaces the
-- client's 4 serial PostgREST requests (page → pinned → quoted-post
-- hydration → mini-app hydration) plus 2 like/repost state requests.
-- The client falls back to the legacy path while this function is missing
-- (see fetchFeedPosts), so applying this migration is a pure speedup.
--
-- REQUIRES (must already be applied): social_feed_enhancements.sql
-- (posts.quoted_post_id), post_pinning.sql (posts.pinned_until),
-- add_mini_app_share.sql (posts.linked_mini_app_id).
--
-- posts.id is uuid (verified against existing migrations: post_pinning.sql's
-- pin_own_post(p_post_id uuid, ...) does `WHERE p.id = p_post_id`;
-- feed_views_reposts.sql adds `quoted_post_id uuid REFERENCES
-- public.posts(id)`, a self-referencing FK requiring posts.id to be uuid) —
-- so the uuid[] declarations below are used as-is, no text[] adaptation.

create or replace function public.feed_post_json(
  p_post public.posts,
  p_include_quoted boolean default true
)
returns jsonb
language plpgsql
stable
as $$
declare
  v jsonb;
  v_quoted public.posts;
begin
  -- Shape mirrors the client's FEED_POST_SELECT PostgREST embed exactly:
  -- author/account/sticker/linked_event/linked_marketplace/linked_mini_app as
  -- objects (null when absent), links as array, poll as object (unique
  -- post_id), quoted_post one level deep. mergeAccountIntoAuthor on the
  -- client does the author.account fold, same as for PostgREST responses.
  v := to_jsonb(p_post) || jsonb_build_object(
    'author', (
      select jsonb_build_object(
        'wallet_address', u.wallet_address,
        'username', u.username,
        'profile_picture_url', u.profile_picture_url,
        'is_verified_citizen', u.is_verified_citizen,
        'tier', u.tier,
        'equipped_frame_asset_url', u.equipped_frame_asset_url
      )
      from public.users u
      where u.wallet_address = p_post.wallet_address
    ),
    'account', (
      select jsonb_build_object(
        'id', a.id, 'account_type', a.account_type,
        'name', a.name, 'avatar_url', a.avatar_url
      )
      from public.accounts a
      where a.id = p_post.account_id
    ),
    'links', coalesce(
      (select jsonb_agg(to_jsonb(l))
       from public.post_links l where l.post_id = p_post.id),
      '[]'::jsonb
    ),
    'poll', (
      select to_jsonb(pp)
      from public.post_polls pp
      where pp.post_id = p_post.id
      limit 1
    ),
    'linked_event', (
      select jsonb_build_object(
        'id', e.id, 'title', e.title, 'date', e.date, 'time', e.time,
        'location', e.location, 'image_url', e.image_url, 'category', e.category
      )
      from public.events e
      where e.id = p_post.linked_event_id
    ),
    'linked_marketplace', (
      select jsonb_build_object(
        'id', m.id, 'title', m.title, 'price', m.price,
        'price_type', m.price_type, 'category', m.category,
        'condition', m.condition, 'media_urls', m.media_urls,
        'neighborhood', m.neighborhood
      )
      from public.marketplace_listings m
      where m.id = p_post.linked_marketplace_id
    ),
    'sticker', (
      select jsonb_build_object(
        'id', lr.id, 'type', lr.type, 'name', lr.name, 'asset_url', lr.asset_url
      )
      from public.lootbox_rewards lr
      where lr.id = p_post.sticker_reward_id
    ),
    'linked_mini_app', (
      select jsonb_build_object(
        'id', ma.id, 'slug', ma.slug, 'name', ma.name,
        'description', ma.description, 'icon_url', ma.icon_url,
        'primary_color', ma.primary_color, 'category', ma.category
      )
      from public.mini_apps ma
      where ma.id = p_post.linked_mini_app_id and ma.status = 'live'
    )
  );

  if p_include_quoted and p_post.quoted_post_id is not null then
    select * into v_quoted
    from public.posts
    where id = p_post.quoted_post_id and status = 'published';
    if found then
      v := v || jsonb_build_object(
        'quoted_post', public.feed_post_json(v_quoted, false)
      );
    else
      v := v || jsonb_build_object('quoted_post', null);
    end if;
  end if;

  return v;
end;
$$;

create or replace function public.get_feed_page(
  p_feed_type text,
  p_page integer default 0,
  p_page_size integer default 15,
  p_wallet text default null
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
begin
  select coalesce(array_agg(id), '{}') into v_page_ids
  from (
    select id from public.posts
    where feed_type = p_feed_type and status = 'published'
    order by created_at desc
    offset v_from limit p_page_size
  ) s;

  -- Page 0 surfaces currently-pinned posts first (pins expire by time),
  -- mirroring the legacy client logic.
  if p_page = 0 then
    select coalesce(array_agg(id), '{}') into v_pinned_ids
    from (
      select id from public.posts
      where feed_type = p_feed_type and status = 'published'
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
    select coalesce(array_agg(distinct x), '{}') into v_target_ids
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

grant execute on function public.feed_post_json(public.posts, boolean) to anon, authenticated;
grant execute on function public.get_feed_page(text, integer, integer, text) to anon, authenticated;
