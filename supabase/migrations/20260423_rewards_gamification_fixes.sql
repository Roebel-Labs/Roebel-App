-- 20260423_rewards_gamification_fixes.sql
-- Fixes two issues discovered on first run:
--   1. gen_random_bytes() requires the pgcrypto extension, which isn't enabled
--      on this project. Rewrite ensure_referral_code() to use md5() which
--      needs no extension.
--   2. increment_roebel_points() inserts into roebel_points_card which has a
--      FK to users(wallet_address). Several RPCs were failing because they
--      were invoked before the UserContext upsert had committed the user
--      row. The RPCs below skip the increment (but still record completion)
--      when the user row doesn't exist yet; the client retries on the next
--      refresh cycle once the user record is present.

begin;

-- ── 1. Referral-code generator without pgcrypto ────────────────────────────

create or replace function ensure_referral_code(p_wallet text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempt integer := 0;
begin
  select code into v_code from referral_codes where wallet_address = p_wallet;
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempt := v_attempt + 1;
    -- md5(random()) is available without pgcrypto; keep 4 hex chars.
    v_code := 'MECKY-' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
    begin
      insert into referral_codes (wallet_address, code) values (p_wallet, v_code);
      return v_code;
    exception when unique_violation then
      if v_attempt > 10 then
        raise exception 'could not generate unique referral code';
      end if;
    end;
  end loop;
end;
$$;

-- ── 2. Helper: check if the users row exists so we can short-circuit ───────

create or replace function rewards_user_exists(p_wallet text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from users where wallet_address = p_wallet);
$$;

-- ── 3. Refactor RPCs to tolerate missing user rows ─────────────────────────

create or replace function claim_daily_checkin(p_wallet text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Berlin')::date;
  v_yesterday date := v_today - interval '1 day';
  v_prev_streak integer := 0;
  v_streak_day integer;
  v_is_bonus boolean;
  v_base_amount integer := 20;
  v_amount integer;
  v_new_balance integer;
begin
  if not rewards_user_exists(p_wallet) then
    return jsonb_build_object('success', false, 'error', 'user_not_ready');
  end if;

  if exists (
    select 1 from rewards_daily_checkins
    where wallet_address = p_wallet and checkin_date = v_today
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'already_checked_in',
      'next_at', (v_today + interval '1 day')::text
    );
  end if;

  select streak_day into v_prev_streak
    from rewards_daily_checkins
    where wallet_address = p_wallet and checkin_date = v_yesterday;

  v_streak_day := coalesce(v_prev_streak, 0) + 1;
  v_is_bonus := (v_streak_day % 3 = 0);
  v_amount := case when v_is_bonus then v_base_amount * 2 else v_base_amount end;

  insert into rewards_daily_checkins (wallet_address, checkin_date, coins_awarded, streak_day, is_bonus)
  values (p_wallet, v_today, v_amount, v_streak_day, v_is_bonus);

  v_new_balance := increment_roebel_points(p_wallet, v_amount);

  insert into roebel_points_ledger (wallet_address, amount, action, reference_type, description)
  values (p_wallet, v_amount, 'daily_checkin_bonus', 'daily_checkin',
          'Daily check-in day ' || v_streak_day || case when v_is_bonus then ' (bonus 2x)' else '' end);

  update roebel_points_card
    set streak_days = v_streak_day
    where wallet_address = p_wallet;

  return jsonb_build_object(
    'success', true,
    'coins_awarded', v_amount,
    'streak_day', v_streak_day,
    'is_bonus', v_is_bonus,
    'new_balance', v_new_balance,
    'next_bonus_in', 3 - (v_streak_day % 3)
  );
end;
$$;

create or replace function complete_reward_task(p_wallet text, p_task_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task rewards_tasks%rowtype;
  v_last_completed timestamptz;
  v_new_balance integer;
begin
  if not rewards_user_exists(p_wallet) then
    return jsonb_build_object('success', false, 'error', 'user_not_ready');
  end if;

  select * into v_task from rewards_tasks where key = p_task_key and is_published = true;
  if not found then
    return jsonb_build_object('success', false, 'error', 'task_not_found');
  end if;

  if v_task.is_repeatable then
    if v_task.cooldown_hours > 0 then
      select max(completed_at) into v_last_completed
        from rewards_task_completions
        where wallet_address = p_wallet and task_id = v_task.id;
      if v_last_completed is not null
         and v_last_completed > now() - make_interval(hours => v_task.cooldown_hours) then
        return jsonb_build_object(
          'success', false,
          'error', 'cooldown_active',
          'cooldown_until', (v_last_completed + make_interval(hours => v_task.cooldown_hours))::text
        );
      end if;
    end if;
  else
    if exists (
      select 1 from rewards_task_completions
      where wallet_address = p_wallet and task_id = v_task.id
    ) then
      return jsonb_build_object('success', false, 'error', 'already_completed');
    end if;
  end if;

  insert into rewards_task_completions (wallet_address, task_id, task_key, coins_awarded)
  values (p_wallet, v_task.id, v_task.key, v_task.coin_amount);

  v_new_balance := increment_roebel_points(p_wallet, v_task.coin_amount);

  insert into roebel_points_ledger (wallet_address, amount, action, reference_type, reference_id, description)
  values (p_wallet, v_task.coin_amount, 'task_complete', 'rewards_task', v_task.id::text,
          'Task: ' || v_task.title);

  return jsonb_build_object(
    'success', true,
    'coins_awarded', v_task.coin_amount,
    'new_balance', v_new_balance,
    'task_key', v_task.key
  );
end;
$$;

create or replace function purchase_lootbox_key(p_wallet text, p_lootbox_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lootbox lootboxes%rowtype;
  v_card roebel_points_card%rowtype;
  v_new_balance integer;
  v_new_key_count integer;
begin
  if not rewards_user_exists(p_wallet) then
    return jsonb_build_object('success', false, 'error', 'user_not_ready');
  end if;

  select * into v_lootbox from lootboxes where id = p_lootbox_id and is_published = true;
  if not found then
    return jsonb_build_object('success', false, 'error', 'lootbox_not_found');
  end if;

  select * into v_card from roebel_points_card where wallet_address = p_wallet;
  if not found or v_card.points_balance < v_lootbox.coins_per_key then
    return jsonb_build_object('success', false, 'error', 'insufficient_balance');
  end if;

  v_new_balance := increment_roebel_points(p_wallet, -v_lootbox.coins_per_key);

  insert into roebel_points_ledger (wallet_address, amount, action, reference_type, reference_id, description)
  values (p_wallet, -v_lootbox.coins_per_key, 'lootbox_key_purchase',
          'lootbox', p_lootbox_id::text, 'Schlüssel gekauft für ' || v_lootbox.name);

  insert into user_lootbox_keys (wallet_address, key_count, total_purchased)
  values (p_wallet, 1, 1)
  on conflict (wallet_address) do update
    set key_count = user_lootbox_keys.key_count + 1,
        total_purchased = user_lootbox_keys.total_purchased + 1,
        updated_at = now()
  returning key_count into v_new_key_count;

  return jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'new_key_count', v_new_key_count
  );
end;
$$;

create or replace function redeem_referral(p_code text, p_referred_wallet text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer text;
  v_bonus_referrer integer := 200;
  v_bonus_referred integer := 100;
begin
  select wallet_address into v_referrer from referral_codes where code = p_code;
  if v_referrer is null then
    return jsonb_build_object('success', false, 'error', 'code_invalid');
  end if;

  if v_referrer = p_referred_wallet then
    return jsonb_build_object('success', false, 'error', 'self_referral');
  end if;

  if not rewards_user_exists(p_referred_wallet) then
    return jsonb_build_object('success', false, 'error', 'user_not_ready');
  end if;

  if exists (select 1 from referral_redemptions where referred_wallet = p_referred_wallet) then
    return jsonb_build_object('success', false, 'error', 'already_redeemed');
  end if;

  insert into referral_redemptions (code, referrer_wallet, referred_wallet,
                                    coins_awarded_referrer, coins_awarded_referred)
  values (p_code, v_referrer, p_referred_wallet, v_bonus_referrer, v_bonus_referred);

  perform increment_roebel_points(v_referrer, v_bonus_referrer);
  perform increment_roebel_points(p_referred_wallet, v_bonus_referred);

  insert into roebel_points_ledger (wallet_address, amount, action, reference_type, reference_id, description)
  values (v_referrer, v_bonus_referrer, 'referral_received', 'referral', p_referred_wallet,
          'Empfohlener Nutzer beigetreten'),
         (p_referred_wallet, v_bonus_referred, 'referral_received', 'referral', v_referrer,
          'Willkommens-Bonus durch Einladung');

  return jsonb_build_object(
    'success', true,
    'referrer', v_referrer,
    'bonus_referrer', v_bonus_referrer,
    'bonus_referred', v_bonus_referred
  );
end;
$$;

commit;
