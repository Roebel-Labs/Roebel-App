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
rollback;
