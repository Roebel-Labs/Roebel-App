-- 20260429_themed_lootboxes.sql
-- Some lootboxes should guarantee a specific reward TYPE (e.g. "Rahmen-Truhe"
-- always drops a profile_frame, "Sticker-Truhe" always drops a sticker). The
-- rest stay as mystery chests that draw from the full pool.
--
-- Implementation: add a nullable `guaranteed_reward_type` column to
-- `lootboxes`. `open_lootbox` adds the filter
--   (v_guaranteed_type is null or r.type = v_guaranteed_type)
-- on top of the already-owned-cosmetic filter. Existing 9 seeded chests are
-- renamed/retyped in place so user_lootbox_keys + user_lootbox_rewards FKs
-- stay intact.

begin;

-- 1. Column + constraint
alter table lootboxes
  add column if not exists guaranteed_reward_type text
    check (
      guaranteed_reward_type is null
      or guaranteed_reward_type in (
        'profile_frame',
        'sticker',
        'animated_sticker',
        'profile_banner',
        'badge',
        'coin_bundle'
      )
    );

comment on column lootboxes.guaranteed_reward_type is
  'Optional. When set, open_lootbox only draws rewards of this type. NULL means a mystery chest that draws from the full pool.';

-- 2. Rewrite open_lootbox to respect the new filter.
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
  v_guaranteed_type text;
begin
  if not rewards_user_exists(p_wallet) then
    return jsonb_build_object('success', false, 'error', 'user_not_ready');
  end if;

  select key_count into v_key_count from user_lootbox_keys
    where wallet_address = p_wallet and lootbox_id = p_lootbox_id;
  if coalesce(v_key_count, 0) < 1 then
    return jsonb_build_object('success', false, 'error', 'no_key');
  end if;

  select guaranteed_reward_type into v_guaranteed_type
    from lootboxes where id = p_lootbox_id;

  -- Eligible = matches guaranteed type (if any) AND either a coin_bundle
  -- (always repeatable) OR a cosmetic the user doesn't already own.
  select coalesce(sum(p.weight), 0) into v_total_weight
    from lootbox_reward_pool p
    join lootbox_rewards r on r.id = p.reward_id
    where p.lootbox_id = p_lootbox_id
      and (v_guaranteed_type is null or r.type = v_guaranteed_type)
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
        and (v_guaranteed_type is null or r.type = v_guaranteed_type)
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

-- 3. Rename / retype the 9 seeded chests in place. Row 1..6 become themed,
--    row 7..9 stay mystery. FKs in user_lootbox_keys / user_lootbox_rewards
--    follow the id (unchanged), so anyone mid-flow keeps their state.
with ordered as (
  select id,
         row_number() over (order by display_order, created_at) as rn
    from lootboxes
)
update lootboxes l
set
  name = case ordered.rn
    when 1 then 'Rahmen-Truhe'
    when 2 then 'Sticker-Truhe'
    when 3 then 'Mecky-Truhe'
    when 4 then 'Banner-Truhe'
    when 5 then 'Abzeichen-Truhe'
    when 6 then 'Münz-Truhe'
    when 7 then 'Mystery-Truhe I'
    when 8 then 'Mystery-Truhe II'
    when 9 then 'Mystery-Truhe III'
    else l.name
  end,
  description = case ordered.rn
    when 1 then 'Enthält garantiert einen Profilrahmen, den du noch nicht hast.'
    when 2 then 'Enthält garantiert einen Mecky-Sticker für Posts und Kommentare.'
    when 3 then 'Enthält garantiert einen animierten Mecky für Event-Experiences.'
    when 4 then 'Enthält garantiert einen Profilbanner für dein öffentliches Profil.'
    when 5 then 'Enthält garantiert ein Abzeichen für deine Identity Card.'
    when 6 then 'Enthält garantiert einen Münzbonus — perfekt zum Nachladen.'
    when 7 then 'Zufällige Belohnung. Überraschung garantiert.'
    when 8 then 'Zufällige Belohnung. Was Mecky dir wohl gibt?'
    when 9 then 'Zufällige Belohnung. Die letzte Chance auf das Seltene.'
    else l.description
  end,
  guaranteed_reward_type = case ordered.rn
    when 1 then 'profile_frame'
    when 2 then 'sticker'
    when 3 then 'animated_sticker'
    when 4 then 'profile_banner'
    when 5 then 'badge'
    when 6 then 'coin_bundle'
    else null
  end,
  display_order = ordered.rn - 1
from ordered
where l.id = ordered.id;

commit;
