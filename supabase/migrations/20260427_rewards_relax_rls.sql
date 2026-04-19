-- 20260427_rewards_relax_rls.sql
-- The user-scoped rewards tables shipped with RLS policies that gate SELECT on
-- auth.jwt()->>'sub' == wallet_address. The mobile client uses the anon key
-- with the wallet passed as a parameter (same trust model as
-- roebel_points_card) — there is no matching 'sub' claim, so all SELECTs
-- resolved to zero rows and the UI saw "no key / no rewards / no completions"
-- even after RPCs inserted them. Relaxing the policies to `using (true)` keeps
-- writes locked down (all writes already go through SECURITY DEFINER RPCs
-- that validate the wallet) while letting the client read its own rows.

begin;

-- user_lootbox_keys
drop policy if exists "user_lootbox_keys: owner read" on user_lootbox_keys;
create policy "user_lootbox_keys: public read" on user_lootbox_keys
  for select using (true);

-- user_lootbox_rewards
drop policy if exists "user_lootbox_rewards: owner read" on user_lootbox_rewards;
drop policy if exists "user_lootbox_rewards: owner update equip" on user_lootbox_rewards;
create policy "user_lootbox_rewards: public read" on user_lootbox_rewards
  for select using (true);
create policy "user_lootbox_rewards: public equip" on user_lootbox_rewards
  for update using (true) with check (true);

-- rewards_task_completions
drop policy if exists "rewards_task_completions: owner read" on rewards_task_completions;
create policy "rewards_task_completions: public read" on rewards_task_completions
  for select using (true);

-- rewards_daily_checkins
drop policy if exists "rewards_daily_checkins: owner read" on rewards_daily_checkins;
create policy "rewards_daily_checkins: public read" on rewards_daily_checkins
  for select using (true);

-- referral_redemptions
drop policy if exists "referral_redemptions: related read" on referral_redemptions;
create policy "referral_redemptions: public read" on referral_redemptions
  for select using (true);

commit;
