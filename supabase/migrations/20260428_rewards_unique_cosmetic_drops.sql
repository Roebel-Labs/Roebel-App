-- 20260428_rewards_unique_cosmetic_drops.sql
-- Each cosmetic reward (frame / sticker / animated_sticker / banner / badge)
-- can drop at most once per wallet. coin_bundle stays eligible every time —
-- it's a consumable (credits coins on open). When all non-consumable drops
-- for a lootbox are exhausted and the pool has no coin_bundle entries, the
-- RPC returns 'pool_exhausted' and the key is NOT consumed so the user can
-- try another chest.

begin;

create or replace function open_lootbox(p_wallet text, p_lootbox_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key_count integer;
  v_reward_id uuid;
  v_reward lootbox_rewards%rowtype;
  v_user_reward_id uuid;
  v_roll integer;
  v_total_weight integer;
  v_new_balance integer;
begin
  if not rewards_user_exists(p_wallet) then
    return jsonb_build_object('success', false, 'error', 'user_not_ready');
  end if;

  select key_count into v_key_count from user_lootbox_keys
    where wallet_address = p_wallet and lootbox_id = p_lootbox_id;
  if coalesce(v_key_count, 0) < 1 then
    return jsonb_build_object('success', false, 'error', 'no_key');
  end if;

  -- Eligible pool: coin bundles always eligible, cosmetics only when the
  -- user does NOT already own that specific reward.
  select coalesce(sum(p.weight), 0) into v_total_weight
    from lootbox_reward_pool p
    join lootbox_rewards r on r.id = p.reward_id
    where p.lootbox_id = p_lootbox_id
      and (
        r.type = 'coin_bundle'
        or not exists (
          select 1 from user_lootbox_rewards ur
          where ur.wallet_address = p_wallet
            and ur.reward_id = p.reward_id
        )
      );

  if v_total_weight = 0 then
    return jsonb_build_object('success', false, 'error', 'pool_exhausted');
  end if;

  v_roll := floor(random() * v_total_weight)::integer;

  select reward_id into v_reward_id from (
    select p.reward_id,
           sum(p.weight) over (order by p.reward_id) as running_total
      from lootbox_reward_pool p
      join lootbox_rewards r on r.id = p.reward_id
      where p.lootbox_id = p_lootbox_id
        and (
          r.type = 'coin_bundle'
          or not exists (
            select 1 from user_lootbox_rewards ur
            where ur.wallet_address = p_wallet
              and ur.reward_id = p.reward_id
          )
        )
  ) t
  where running_total > v_roll
  order by running_total asc
  limit 1;

  select * into v_reward from lootbox_rewards where id = v_reward_id;

  update user_lootbox_keys
    set key_count = key_count - 1,
        total_used = total_used + 1,
        updated_at = now()
    where wallet_address = p_wallet and lootbox_id = p_lootbox_id;

  insert into user_lootbox_rewards (wallet_address, reward_id, lootbox_id)
  values (p_wallet, v_reward.id, p_lootbox_id)
  returning id into v_user_reward_id;

  if v_reward.type = 'coin_bundle' and v_reward.coin_value is not null then
    v_new_balance := increment_roebel_points(p_wallet, v_reward.coin_value);
    insert into roebel_points_ledger (wallet_address, amount, action, reference_type, reference_id, description)
    values (p_wallet, v_reward.coin_value, 'lootbox_open_bonus', 'lootbox_reward', v_reward.id::text,
            'Münzen aus Truhe: ' || v_reward.name);
  end if;

  return jsonb_build_object(
    'success', true,
    'reward_id', v_reward.id,
    'user_reward_id', v_user_reward_id,
    'type', v_reward.type,
    'name', v_reward.name,
    'description', v_reward.description,
    'asset_url', v_reward.asset_url,
    'rarity', v_reward.rarity,
    'coin_value', v_reward.coin_value
  );
end;
$$;

commit;
