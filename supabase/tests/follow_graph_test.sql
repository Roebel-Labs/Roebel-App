begin;
do $$
declare
  v_w1 text := '0x00000000000000000000000000000000000000f1';
  v_w2 text := '0x00000000000000000000000000000000000000f2';
  v_a1 uuid; v_a2 uuid; v_stats jsonb;
begin
  -- fixture: user/owner rows carry the wallet upper-cased (checksum-style) to prove case-insensitive matching
  insert into users (wallet_address, username, display_name, tier) values ('0x'||upper(substr(v_w1,3)), 'fgtest1', 'FG Eins', 'guest'), (v_w2, 'fgtest2', 'FG Zwei', 'guest');
  insert into accounts (account_type, name) values ('personal', 'FG Eins') returning id into v_a1;
  insert into accounts (account_type, name) values ('personal', 'FG Zwei') returning id into v_a2;
  insert into account_owners (account_id, wallet_address, role) values (v_a1, '0x'||upper(substr(v_w1,3)), 'owner'), (v_a2, v_w2, 'owner');

  assert public.personal_account_id(v_w1) = v_a1, 'personal_account_id must match case-insensitively';

  insert into account_follows (follower_wallet, target_account_id, source) values (v_w1, v_a2, 'onboarding');
  v_stats := public.get_follow_stats(v_a2);
  assert (v_stats->>'followers')::int = 1, 'followers count';
  v_stats := public.get_follow_stats(v_a1);
  assert (v_stats->>'following')::int = 1, 'following count for the personal account owner';

  assert exists (select 1 from public.get_follow_suggestions() s where s.account_id = v_a2), 'suggestions include account';
  update accounts set suggest_to_new_users = false where id = v_a2;
  assert not exists (select 1 from public.get_follow_suggestions() s where s.account_id = v_a2), 'opt-out respected';

  begin
    insert into account_follows (follower_wallet, target_account_id, source) values (v_w1, v_a2, 'bogus');
    assert false, 'source check must reject';
  exception when check_violation then null;
  end;
end $$;

do $$
declare
  v_w text := '0x00000000000000000000000000000000000000f3';
  v_a uuid; v_org uuid; v_res jsonb; v_ids text[];
begin
  insert into users (wallet_address, username, tier) values (v_w, 'fgtest3', 'citizen');  -- citizen tier bypasses enforce_posting_rules (location / rate limits)
  insert into accounts (account_type, name) values ('personal', 'FG Drei') returning id into v_a;
  insert into accounts (account_type, name, sub_type) values ('organisation', 'FG Verein', 'verein') returning id into v_org;
  insert into account_owners (account_id, wallet_address, role) values (v_a, v_w, 'owner'), (v_org, v_w, 'owner');
  -- legacy post (no account_id), personal post, org post by the same person
  insert into posts (wallet_address, content, feed_type, status, account_id, created_at) values
    (v_w, 'fg legacy', 'main', 'published', null, now() + interval '3 day'),
    (v_w, 'fg personal', 'main', 'published', v_a, now() + interval '2 day'),
    (v_w, 'fg org', 'main', 'published', v_org, now() + interval '1 day');

  v_res := public.get_feed_page('main', 0, 50, null, array[v_a]);
  select array_agg(p->>'content') into v_ids from jsonb_array_elements(v_res->'posts') p where p->>'content' like 'fg %';
  assert v_ids = array['fg org'], format('muting the person hides legacy + personal posts only, got %s', v_ids);

  v_res := public.get_feed_page('main', 0, 50, null, null);
  select array_agg(p->>'content') into v_ids from jsonb_array_elements(v_res->'posts') p where p->>'content' like 'fg %';
  assert cardinality(v_ids) = 3, 'no exclusion = unchanged feed';

  -- the old 4-argument call shape still resolves
  v_res := public.get_feed_page(p_feed_type => 'main', p_page => 0, p_page_size => 5, p_wallet => null);
  assert v_res ? 'posts', 'named 4-arg call works';
end $$;

-- RLS: anon may read neither table and write neither
set local role anon;
do $$
begin
  begin
    perform 1 from account_follows limit 1;
    assert false, 'anon must not read account_follows (wallet↔npub correlation, spec §3)';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from account_hides limit 1;
    assert false, 'anon must not read account_hides';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.list_account_followers('00000000-0000-0000-0000-000000000001', 1, 0);
    assert false, 'anon must not list followers';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into account_follows (follower_wallet, target_account_id, source)
      values ('0xdead', '00000000-0000-0000-0000-000000000001', 'manual');
    assert false, 'anon must not insert follows';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$
begin
  assert exists (select 1 from information_schema.columns
    where table_name = 'notification_preferences' and column_name = 'follower_digest_enabled'), 'pref column';
  assert exists (select 1 from cron.job where jobname = 'follower-digest-weekly'), 'cron job';
  assert position('account_hides' in pg_get_functiondef('public.notify_user_notification_push()'::regprocedure)) > 0,
    'push trigger checks mutes';
end $$;
rollback;
