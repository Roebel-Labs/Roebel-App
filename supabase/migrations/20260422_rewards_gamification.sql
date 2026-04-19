-- 20260422_rewards_gamification.sql
-- Röbel gamification: remote-configured onboarding tasks, daily check-in streaks,
-- Schatzkammer lootboxes (coins → keys → chests), and referrals. Reuses the
-- existing roebel_points_card + roebel_points_ledger as the "Münzen" economy;
-- RPCs below move balances through the existing increment_roebel_points function.

begin;

-- =============================================================================
-- 1. Remote task catalogue (rewards_tasks) — configured in the web admin.
-- =============================================================================

create table rewards_tasks (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique,
  title           text not null,
  description     text not null,
  image_url       text,
  coin_amount     integer not null check (coin_amount >= 0),
  cta_label       text not null default 'Mitmachen',
  cta_route       text,
  is_repeatable   boolean not null default false,
  cooldown_hours  integer not null default 0 check (cooldown_hours >= 0),
  display_order   integer not null default 0,
  is_published    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_rewards_tasks_published on rewards_tasks(is_published, display_order);
create index idx_rewards_tasks_key on rewards_tasks(key);

-- =============================================================================
-- 2. Per-user task completion log.
-- =============================================================================

create table rewards_task_completions (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text not null,
  task_id         uuid not null references rewards_tasks(id) on delete cascade,
  task_key        text not null,
  coins_awarded   integer not null,
  completed_at    timestamptz not null default now()
);

create index idx_rewards_completions_wallet on rewards_task_completions(wallet_address);
create index idx_rewards_completions_task on rewards_task_completions(task_id);

-- =============================================================================
-- 3. Daily check-in ledger (streak source of truth).
-- =============================================================================

create table rewards_daily_checkins (
  wallet_address  text not null,
  checkin_date    date not null,
  coins_awarded   integer not null,
  streak_day      integer not null check (streak_day >= 1),
  is_bonus        boolean not null default false,
  created_at      timestamptz not null default now(),
  primary key (wallet_address, checkin_date)
);

create index idx_rewards_checkins_wallet_date on rewards_daily_checkins(wallet_address, checkin_date desc);

-- =============================================================================
-- 4. Lootbox catalogue (chests the user can open).
-- =============================================================================

create table lootboxes (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text,
  image_url      text,
  coins_per_key  integer not null default 200 check (coins_per_key > 0),
  display_order  integer not null default 0,
  is_published   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_lootboxes_published on lootboxes(is_published, display_order);

-- =============================================================================
-- 5. Reward catalogue (cosmetics that can drop from lootboxes).
-- =============================================================================

create table lootbox_rewards (
  id           uuid primary key default gen_random_uuid(),
  type         text not null check (type in (
                 'profile_frame','sticker','animated_sticker',
                 'profile_banner','badge','coin_bundle'
               )),
  name         text not null,
  description  text,
  asset_url    text not null,
  rarity       text not null default 'common'
                 check (rarity in ('common','rare','epic','legendary')),
  coin_value   integer, -- only used for type = 'coin_bundle'
  created_at   timestamptz not null default now()
);

create index idx_lootbox_rewards_type on lootbox_rewards(type);

-- =============================================================================
-- 6. Weighted pool linking chests to rewards.
-- =============================================================================

create table lootbox_reward_pool (
  lootbox_id  uuid not null references lootboxes(id) on delete cascade,
  reward_id   uuid not null references lootbox_rewards(id) on delete cascade,
  weight      integer not null default 1 check (weight > 0),
  primary key (lootbox_id, reward_id)
);

-- =============================================================================
-- 7. Per-user key inventory (one row per wallet).
-- =============================================================================

create table user_lootbox_keys (
  wallet_address   text primary key,
  key_count        integer not null default 0 check (key_count >= 0),
  total_purchased  integer not null default 0,
  total_used       integer not null default 0,
  updated_at       timestamptz not null default now()
);

-- =============================================================================
-- 8. Per-user owned cosmetics (inventory of won rewards).
-- =============================================================================

create table user_lootbox_rewards (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text not null,
  reward_id       uuid not null references lootbox_rewards(id),
  lootbox_id      uuid references lootboxes(id),
  obtained_at     timestamptz not null default now(),
  is_equipped     boolean not null default false
);

create index idx_user_lootbox_rewards_wallet on user_lootbox_rewards(wallet_address);
create index idx_user_lootbox_rewards_equipped on user_lootbox_rewards(wallet_address, is_equipped) where is_equipped;

-- =============================================================================
-- 9. Referrals.
-- =============================================================================

create table referral_codes (
  wallet_address  text primary key,
  code            text not null unique,
  created_at      timestamptz not null default now()
);

create table referral_redemptions (
  id                      uuid primary key default gen_random_uuid(),
  code                    text not null references referral_codes(code),
  referrer_wallet         text not null,
  referred_wallet         text not null unique, -- one-time per invited user
  redeemed_at             timestamptz not null default now(),
  coins_awarded_referrer  integer not null,
  coins_awarded_referred  integer not null
);

create index idx_referral_redemptions_referrer on referral_redemptions(referrer_wallet);

-- =============================================================================
-- 10. updated_at triggers.
-- =============================================================================

create or replace function rewards_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_rewards_tasks_updated
  before update on rewards_tasks
  for each row execute function rewards_set_updated_at();

create trigger trg_lootboxes_updated
  before update on lootboxes
  for each row execute function rewards_set_updated_at();

-- =============================================================================
-- 11. RPCs — all security definer; trust p_wallet parameter (matches existing
--     increment_roebel_points convention). Each RPC writes a ledger entry and
--     updates the unified points balance in roebel_points_card.
-- =============================================================================

-- Claim the daily check-in. Awards 20 coins by default, doubled every 3rd day.
-- Rejects if the user already checked in today (unique PK enforces this).
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
  -- Already checked in today?
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

  -- Compute streak: if yesterday has a row, continue; otherwise reset to 1.
  select streak_day into v_prev_streak
    from rewards_daily_checkins
    where wallet_address = p_wallet and checkin_date = v_yesterday;

  v_streak_day := coalesce(v_prev_streak, 0) + 1;
  v_is_bonus := (v_streak_day % 3 = 0);
  v_amount := case when v_is_bonus then v_base_amount * 2 else v_base_amount end;

  insert into rewards_daily_checkins (wallet_address, checkin_date, coins_awarded, streak_day, is_bonus)
  values (p_wallet, v_today, v_amount, v_streak_day, v_is_bonus);

  -- Credit coins via existing increment RPC.
  v_new_balance := increment_roebel_points(p_wallet, v_amount);

  -- Ledger entry.
  insert into roebel_points_ledger (wallet_address, amount, action, reference_type, description)
  values (p_wallet, v_amount, 'daily_checkin_bonus', 'daily_checkin',
          'Daily check-in day ' || v_streak_day || case when v_is_bonus then ' (bonus 2x)' else '' end);

  -- Keep streak_days on roebel_points_card in sync.
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

-- Complete a task by key. Validates is_published, repeatability and cooldown.
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
  select * into v_task from rewards_tasks where key = p_task_key and is_published = true;
  if not found then
    return jsonb_build_object('success', false, 'error', 'task_not_found');
  end if;

  if v_task.is_repeatable then
    -- Cooldown: reject if a completion within cooldown_hours exists.
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
    -- One-time task: reject if already completed.
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

-- Purchase a lootbox key (debits coins by lootboxes.coins_per_key, adds 1 key).
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

-- Open a lootbox: consume 1 key, weighted-random roll, credit reward.
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
  select key_count into v_key_count from user_lootbox_keys where wallet_address = p_wallet;
  if coalesce(v_key_count, 0) < 1 then
    return jsonb_build_object('success', false, 'error', 'no_key');
  end if;

  select coalesce(sum(weight), 0) into v_total_weight
    from lootbox_reward_pool where lootbox_id = p_lootbox_id;
  if v_total_weight = 0 then
    return jsonb_build_object('success', false, 'error', 'empty_pool');
  end if;

  v_roll := floor(random() * v_total_weight)::integer;

  -- Walk weights until cumulative exceeds roll.
  select reward_id into v_reward_id from (
    select reward_id,
           sum(weight) over (order by reward_id) as running_total
      from lootbox_reward_pool where lootbox_id = p_lootbox_id
  ) t
  where running_total > v_roll
  order by running_total asc
  limit 1;

  select * into v_reward from lootbox_rewards where id = v_reward_id;

  -- Consume key.
  update user_lootbox_keys
    set key_count = key_count - 1,
        total_used = total_used + 1,
        updated_at = now()
    where wallet_address = p_wallet;

  -- Grant reward.
  insert into user_lootbox_rewards (wallet_address, reward_id, lootbox_id)
  values (p_wallet, v_reward.id, p_lootbox_id)
  returning id into v_user_reward_id;

  -- Coin-bundle reward: credit coins immediately.
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

-- Idempotent referral code creator.
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
    v_code := 'MECKY-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 4));
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

-- Redeem a referral code. Awards both referrer and referred user.
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
  -- Resolve code.
  select wallet_address into v_referrer from referral_codes where code = p_code;
  if v_referrer is null then
    return jsonb_build_object('success', false, 'error', 'code_invalid');
  end if;

  if v_referrer = p_referred_wallet then
    return jsonb_build_object('success', false, 'error', 'self_referral');
  end if;

  -- Guard: referred user may only redeem once (ever).
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

-- =============================================================================
-- 12. Row Level Security. Public catalogue tables allow anon read; user-scoped
--     tables allow read only when auth.jwt()->>'sub' matches wallet_address.
--     All writes go through the SECURITY DEFINER RPCs above.
-- =============================================================================

alter table rewards_tasks             enable row level security;
alter table rewards_task_completions  enable row level security;
alter table rewards_daily_checkins    enable row level security;
alter table lootboxes                 enable row level security;
alter table lootbox_rewards           enable row level security;
alter table lootbox_reward_pool       enable row level security;
alter table user_lootbox_keys         enable row level security;
alter table user_lootbox_rewards      enable row level security;
alter table referral_codes            enable row level security;
alter table referral_redemptions      enable row level security;

-- Public catalogue reads (only published rows).
create policy "rewards_tasks: public read published" on rewards_tasks
  for select using (is_published = true);

create policy "lootboxes: public read published" on lootboxes
  for select using (is_published = true);

create policy "lootbox_rewards: public read" on lootbox_rewards
  for select using (true);

create policy "lootbox_reward_pool: public read" on lootbox_reward_pool
  for select using (true);

-- Referral codes are resolvable by anyone (the code itself is the capability).
create policy "referral_codes: public read" on referral_codes
  for select using (true);

-- User-scoped reads.
create policy "rewards_task_completions: owner read" on rewards_task_completions
  for select using (wallet_address = (auth.jwt()->>'sub'));

create policy "rewards_daily_checkins: owner read" on rewards_daily_checkins
  for select using (wallet_address = (auth.jwt()->>'sub'));

create policy "user_lootbox_keys: owner read" on user_lootbox_keys
  for select using (wallet_address = (auth.jwt()->>'sub'));

create policy "user_lootbox_rewards: owner read" on user_lootbox_rewards
  for select using (wallet_address = (auth.jwt()->>'sub'));

-- Users can equip/unequip their own cosmetics directly (no RPC needed).
create policy "user_lootbox_rewards: owner update equip" on user_lootbox_rewards
  for update using (wallet_address = (auth.jwt()->>'sub'))
            with check (wallet_address = (auth.jwt()->>'sub'));

create policy "referral_redemptions: related read" on referral_redemptions
  for select using (
    referrer_wallet = (auth.jwt()->>'sub')
    or referred_wallet = (auth.jwt()->>'sub')
  );

-- =============================================================================
-- 13. Seed data — onboarding tasks (non-repeatable) + habit tasks (repeatable)
--     + 9 lootboxes (all "Truhe" for v1) + 15 reward catalogue entries + pools.
-- =============================================================================

insert into rewards_tasks (key, title, description, image_url, coin_amount,
                           cta_label, cta_route, is_repeatable, cooldown_hours,
                           display_order, is_published) values
  ('first_login',         'Willkommen bei Röbel',       'Melde dich zum ersten Mal an und schalte Mecky frei',
   'https://placehold.co/128x128/194383/white?text=LOGIN',
   50,  'Starten',    '/profile', false, 0, 0, true),
  ('complete_profile',    'Profil vervollständigen',     'Name, Handle und Profilbild hinzufügen',
   'https://placehold.co/128x128/1a5c3a/white?text=PROFIL',
   100, 'Bearbeiten', '/profile/edit', false, 0, 1, true),
  ('add_profile_picture', 'Profilbild hinzufügen',       'Zeig dich Mecky und der Community',
   'https://placehold.co/128x128/6b3fa0/white?text=FOTO',
   50,  'Hinzufügen', '/profile/edit', false, 0, 2, true),
  ('activate_push',       'Benachrichtigungen aktivieren','Verpasse keine Events und Nachrichten',
   'https://placehold.co/128x128/ff6b35/white?text=PUSH',
   50,  'Aktivieren', '/settings', false, 0, 3, true),
  ('read_help_hub',       'Hilfe & Tipps lesen',         'Lerne die App in wenigen Minuten kennen',
   'https://placehold.co/128x128/ffd23f/black?text=HILFE',
   30,  'Lesen',      '/help', false, 0, 4, true),
  ('join_first_event',    'Erstes Event entdecken',      'Finde ein Event und tritt bei',
   'https://placehold.co/128x128/0ead69/white?text=EVENT',
   100, 'Entdecken',  '/(tabs)/explore', false, 0, 5, true),
  ('verify_citizen',      'Bürger:in werden',            'Verifiziere dich als Röbel Bürger:in',
   'https://placehold.co/128x128/194383/white?text=BURGER',
   200, 'Verifizieren','/verification/request-citizen', false, 0, 6, true),
  ('refer_friend',        'Freunde einladen',            'Lade einen Freund ein und ihr bekommt beide Münzen',
   'https://placehold.co/128x128/ff3366/white?text=FREUND',
   200, 'Einladen',   '/rewards/referral', true, 0, 7, true),
  ('vote_on_proposal',    'Abstimmen',                   'Nimm an einer Bürgerabstimmung teil',
   'https://placehold.co/128x128/6b3fa0/white?text=VOTE',
   50,  'Abstimmen',  '/governance', true, 24, 8, true),
  ('attend_event',        'Event besuchen',              'Nimm an einem Event teil und checke ein',
   'https://placehold.co/128x128/1a5c3a/white?text=CHECKIN',
   30,  'Los',        '/(tabs)/explore', true, 12, 9, true);

-- Lootbox catalogue (9 chests, matching mockup grid).
insert into lootboxes (name, description, image_url, coins_per_key, display_order, is_published)
select 'Truhe',
       'Öffne eine Truhe für eine zufällige Belohnung',
       'https://placehold.co/512x512/b45309/white?text=TRUHE',
       200,
       n - 1,
       true
from generate_series(1, 9) n;

-- Reward catalogue.
insert into lootbox_rewards (type, name, description, asset_url, rarity, coin_value) values
  ('profile_frame',   'Goldener Rahmen',       'Glänzender goldener Rahmen für dein Profilbild',
   'https://placehold.co/256x256/ffd23f/194383?text=FRAME1', 'rare', null),
  ('profile_frame',   'Röbel Navy Rahmen',     'Klassischer Navy-Rahmen',
   'https://placehold.co/256x256/194383/ffd23f?text=FRAME2', 'common', null),
  ('profile_frame',   'Müritz Grün',           'Grüner See-Rahmen',
   'https://placehold.co/256x256/1a5c3a/white?text=FRAME3', 'common', null),
  ('profile_frame',   'Mecky Special',         'Seltener Mecky-Rahmen mit Hörnern',
   'https://placehold.co/256x256/6b3fa0/ffd23f?text=FRAME4', 'epic', null),
  ('profile_frame',   'Legendär',              'Der legendäre Goldrahmen',
   'https://placehold.co/256x256/ff3366/ffd23f?text=FRAME5', 'legendary', null),
  ('sticker',         'Mecky Winkt',           'Mecky-Sticker für Posts',
   'https://placehold.co/256x256/ffd23f/194383?text=STK1', 'common', null),
  ('sticker',         'Mecky Feiert',          'Party-Mecky-Sticker',
   'https://placehold.co/256x256/ff6b35/white?text=STK2', 'common', null),
  ('sticker',         'Mecky Daumen hoch',     'Lob-Sticker',
   'https://placehold.co/256x256/0ead69/white?text=STK3', 'common', null),
  ('sticker',         'Mecky Überrascht',      'Überrascht-Sticker',
   'https://placehold.co/256x256/6b3fa0/white?text=STK4', 'rare', null),
  ('sticker',         'Mecky Herz',            'Herz-Sticker für Events',
   'https://placehold.co/256x256/ff3366/white?text=STK5', 'rare', null),
  ('animated_sticker','Mecky Tanzt',           'Animierter tanzender Mecky',
   'https://placehold.co/256x256/ffd23f/ff3366?text=ANI1', 'epic', null),
  ('animated_sticker','Mecky Münzen-Regen',    'Animierter Münzregen',
   'https://placehold.co/256x256/ffd23f/194383?text=ANI2', 'epic', null),
  ('profile_banner',  'Müritz-See Banner',     'Wasser-Banner für dein Profil',
   'https://placehold.co/1024x256/1a5c3a/white?text=BANNER1', 'rare', null),
  ('profile_banner',  'Röbel Skyline',         'Röbel-Skyline als Banner',
   'https://placehold.co/1024x256/194383/ffd23f?text=BANNER2', 'rare', null),
  ('coin_bundle',     'Münzen-Bonus (+100)',   'Zusätzliche 100 Münzen',
   'https://placehold.co/256x256/ffd23f/194383?text=+100', 'legendary', 100);

-- Fill the pool: every chest draws from every reward with rarity-based weights.
-- Weights: common=50, rare=20, epic=8, legendary=2.
insert into lootbox_reward_pool (lootbox_id, reward_id, weight)
select lb.id,
       r.id,
       case r.rarity
         when 'common'    then 50
         when 'rare'      then 20
         when 'epic'      then 8
         when 'legendary' then 2
       end
from lootboxes lb
cross join lootbox_rewards r;

commit;
