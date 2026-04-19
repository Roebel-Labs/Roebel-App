-- 20260426_rewards_per_lootbox_keys.sql
-- Each lootbox must carry its own purchased-key state so the Schatzkammer
-- can show which specific chests are "ready to open" vs "needs buying".
-- The previous user_lootbox_keys had a single generic key_count per wallet;
-- we rebuild it with a composite PK on (wallet_address, lootbox_id) and
-- update the purchase/open RPCs to scope to a specific chest.
--
-- Existing rows are dropped: the generic-count model never made it past
-- playtesting, and there is no meaningful way to split a generic counter
-- across multiple lootbox ids post-hoc.

begin;

-- Drop RPCs that reference the old shape first, so the table drop won't
-- leave orphaned function definitions with stale plans.
drop function if exists purchase_lootbox_key(text, uuid) cascade;
drop function if exists open_lootbox(text, uuid) cascade;

drop table if exists user_lootbox_keys cascade;

create table user_lootbox_keys (
  wallet_address   text not null,
  lootbox_id       uuid not null references lootboxes(id) on delete cascade,
  key_count        integer not null default 0 check (key_count >= 0),
  total_purchased  integer not null default 0,
  total_used       integer not null default 0,
  updated_at       timestamptz not null default now(),
  primary key (wallet_address, lootbox_id)
);

create index idx_user_lootbox_keys_wallet on user_lootbox_keys(wallet_address);

alter table user_lootbox_keys enable row level security;
create policy "user_lootbox_keys: owner read" on user_lootbox_keys
  for select using (wallet_address = (auth.jwt()->>'sub'));

-- ─ purchase_lootbox_key(wallet, lootbox_id) ─ scoped per chest.
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

  insert into user_lootbox_keys (wallet_address, lootbox_id, key_count, total_purchased)
  values (p_wallet, p_lootbox_id, 1, 1)
  on conflict (wallet_address, lootbox_id) do update
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

-- ─ open_lootbox(wallet, lootbox_id) ─ consumes a key for THIS chest only.
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

  select coalesce(sum(weight), 0) into v_total_weight
    from lootbox_reward_pool where lootbox_id = p_lootbox_id;
  if v_total_weight = 0 then
    return jsonb_build_object('success', false, 'error', 'empty_pool');
  end if;

  v_roll := floor(random() * v_total_weight)::integer;
  select reward_id into v_reward_id from (
    select reward_id,
           sum(weight) over (order by reward_id) as running_total
      from lootbox_reward_pool where lootbox_id = p_lootbox_id
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
