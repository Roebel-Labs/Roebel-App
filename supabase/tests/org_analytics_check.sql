-- Run via Supabase MCP execute_sql. Always rolls back: the final error 'ALL_OK' means every check passed.
do $$
declare
  v_org uuid := gen_random_uuid();
  v_post uuid := gen_random_uuid();
  v_owner text := '0xanalyticsowner' || substr(md5(random()::text), 1, 8);
  v_member text := '0xanalyticsmember' || substr(md5(random()::text), 1, 8);
  v_n int;
  v_views int;
  v_rows int;
  v_raised boolean;
begin
  insert into users(wallet_address, tier) values (v_owner, 'tourist'), (v_member, 'tourist'); -- account_owners FK
  insert into accounts(id, account_type, name) values (v_org, 'organisation', 'Analytics Testverein');
  insert into account_owners(account_id, wallet_address, role) values (v_org, v_owner, 'owner'), (v_org, v_member, 'member');
  insert into posts(id, wallet_address, content, status, account_id) values (v_post, v_owner, 'test', 'published', v_org);

  -- two impressions → daily count 2 (posts.views_count is owned by increment_post_views, untouched)
  perform track_events(jsonb_build_array(
    jsonb_build_object('object_type','post','object_id',v_post::text,'metric','impression','surface','feed'),
    jsonb_build_object('object_type','post','object_id',v_post::text,'metric','impression','surface','feed')), v_member);
  select count into v_n from analytics_daily where owner_account_id = v_org and object_id = v_post::text and metric = 'impression';
  if v_n is distinct from 2 then raise exception 'FAIL daily count %', v_n; end if;
  select views_count into v_views from posts where id = v_post;
  if v_views is distinct from 0 then raise exception 'FAIL post views double-counted %', v_views; end if;

  -- unknown object → nothing recorded
  select track_events(jsonb_build_array(jsonb_build_object('object_type','post','object_id',gen_random_uuid()::text,'metric','view')), null) into v_n;
  if v_n <> 0 then raise exception 'FAIL unknown object recorded'; end if;

  -- client may not send like (trigger-only metric)
  select track_events(jsonb_build_array(jsonb_build_object('object_type','post','object_id',v_post::text,'metric','like')), v_member) into v_n;
  if v_n <> 0 then raise exception 'FAIL client like accepted'; end if;

  -- like trigger counts
  insert into post_likes(post_id, wallet_address) values (v_post, v_member);
  select count into v_n from analytics_daily where owner_account_id = v_org and metric = 'like';
  if v_n is distinct from 1 then raise exception 'FAIL like trigger %', v_n; end if;

  -- member is refused
  v_raised := false;
  begin perform * from get_account_analytics(v_org, v_member, current_date - 6, current_date, array['impression']);
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'FAIL member read analytics'; end if;

  -- reversed range is refused
  v_raised := false;
  begin perform * from get_account_analytics(v_org, v_owner, current_date, current_date - 1, array['impression']);
  exception when others then v_raised := true; end;
  if not v_raised then raise exception 'FAIL reversed range accepted'; end if;

  -- zero-filled: 7 days x 1 metric = 7 rows, today's = 2
  select count(*) into v_rows from get_account_analytics(v_org, v_owner, current_date - 6, current_date, array['impression']);
  if v_rows <> 7 then raise exception 'FAIL zero fill rows %', v_rows; end if;
  select count into v_n from get_account_analytics(v_org, v_owner, current_date - 6, current_date, array['impression']) where day = (now() at time zone 'Europe/Berlin')::date;
  if v_n <> 2 then raise exception 'FAIL today count %', v_n; end if;

  -- totals + uniques
  select current into v_n from get_account_analytics_totals(v_org, v_owner, current_date - 6, current_date) where metric = 'impression';
  if v_n <> 2 then raise exception 'FAIL totals %', v_n; end if;
  select sum(uniques) into v_n from get_account_uniques(v_org, v_owner, current_date - 6, current_date);
  if v_n <> 1 then raise exception 'FAIL uniques %', v_n; end if;

  raise exception 'ALL_OK';
end $$;
