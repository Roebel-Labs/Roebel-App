import { supabase } from './supabase';

// ── Types ────────────────────────────────────────────────────

export interface RewardTask {
  id: string;
  key: string;
  title: string;
  description: string;
  image_url: string | null;
  coin_amount: number;
  cta_label: string;
  cta_route: string | null;
  is_repeatable: boolean;
  cooldown_hours: number;
  display_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface RewardTaskCompletion {
  id: string;
  wallet_address: string;
  task_id: string;
  task_key: string;
  coins_awarded: number;
  completed_at: string;
}

export interface DailyCheckin {
  wallet_address: string;
  checkin_date: string;
  coins_awarded: number;
  streak_day: number;
  is_bonus: boolean;
  created_at: string;
}

export interface Lootbox {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  coins_per_key: number;
  /**
   * When set, open_lootbox only draws rewards of this type (e.g. the
   * Rahmen-Truhe guarantees a profile_frame). NULL means mystery chest.
   */
  guaranteed_reward_type: LootboxRewardType | null;
  display_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export type LootboxRewardType =
  | 'profile_frame'
  | 'sticker'
  | 'animated_sticker'
  | 'profile_banner'
  | 'badge'
  | 'coin_bundle';

export type LootboxRewardRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface LootboxReward {
  id: string;
  type: LootboxRewardType;
  name: string;
  description: string | null;
  asset_url: string;
  rarity: LootboxRewardRarity;
  coin_value: number | null;
  created_at: string;
}

export interface UserLootboxKeyRecord {
  wallet_address: string;
  lootbox_id: string;
  key_count: number;
  total_purchased: number;
  total_used: number;
  updated_at: string;
}

export interface UserLootboxReward {
  id: string;
  wallet_address: string;
  reward_id: string;
  lootbox_id: string | null;
  obtained_at: string;
  is_equipped: boolean;
  reward?: LootboxReward;
}

export interface ReferralStats {
  code: string | null;
  total_invited: number;
  coins_earned: number;
}

export interface CheckinClaimResult {
  success: boolean;
  error?: string;
  coins_awarded?: number;
  streak_day?: number;
  is_bonus?: boolean;
  new_balance?: number;
  next_bonus_in?: number;
  next_at?: string;
}

export interface TaskCompletionResult {
  success: boolean;
  error?: string;
  coins_awarded?: number;
  new_balance?: number;
  task_key?: string;
  cooldown_until?: string;
}

export interface PurchaseKeyResult {
  success: boolean;
  error?: string;
  new_balance?: number;
  new_key_count?: number;
}

export interface OpenLootboxResult {
  success: boolean;
  error?: string;
  reward_id?: string;
  user_reward_id?: string;
  type?: LootboxRewardType;
  name?: string;
  description?: string | null;
  asset_url?: string;
  rarity?: LootboxRewardRarity;
  coin_value?: number | null;
}

export interface RedeemReferralResult {
  success: boolean;
  error?: string;
  referrer?: string;
  bonus_referrer?: number;
  bonus_referred?: number;
}

// ── Tasks ────────────────────────────────────────────────────

export async function fetchRewardTasks(): Promise<RewardTask[]> {
  const { data, error } = await supabase
    .from('rewards_tasks')
    .select('*')
    .eq('is_published', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching reward tasks:', error);
    return [];
  }
  return data || [];
}

export async function fetchUserTaskCompletions(
  walletAddress: string
): Promise<RewardTaskCompletion[]> {
  const { data, error } = await supabase
    .from('rewards_task_completions')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('completed_at', { ascending: false });

  if (error) {
    console.error('Error fetching task completions:', error);
    return [];
  }
  return data || [];
}

export async function completeRewardTask(
  walletAddress: string,
  taskKey: string
): Promise<TaskCompletionResult> {
  const { data, error } = await supabase.rpc('complete_reward_task', {
    p_wallet: walletAddress,
    p_task_key: taskKey,
  });

  if (error) {
    console.error('Error completing reward task:', error);
    return { success: false, error: error.message };
  }
  return (data || { success: false, error: 'unknown' }) as TaskCompletionResult;
}

// ── Daily Check-in ───────────────────────────────────────────

export async function fetchRecentCheckins(
  walletAddress: string,
  limit = 14
): Promise<DailyCheckin[]> {
  const { data, error } = await supabase
    .from('rewards_daily_checkins')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('checkin_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching checkins:', error);
    return [];
  }
  return data || [];
}

export async function claimDailyCheckin(
  walletAddress: string
): Promise<CheckinClaimResult> {
  const { data, error } = await supabase.rpc('claim_daily_checkin', {
    p_wallet: walletAddress,
  });

  if (error) {
    console.error('Error claiming daily checkin:', error);
    return { success: false, error: error.message };
  }
  return (data || { success: false, error: 'unknown' }) as CheckinClaimResult;
}

// ── Lootboxes ────────────────────────────────────────────────

export async function fetchLootboxes(): Promise<Lootbox[]> {
  const { data, error } = await supabase
    .from('lootboxes')
    .select('*')
    .eq('is_published', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching lootboxes:', error);
    return [];
  }
  return data || [];
}

export async function fetchUserKeys(
  walletAddress: string
): Promise<UserLootboxKeyRecord[]> {
  const { data, error } = await supabase
    .from('user_lootbox_keys')
    .select('*')
    .eq('wallet_address', walletAddress)
    .gt('key_count', 0);

  if (error) {
    console.error('Error fetching user keys:', error);
    return [];
  }
  return data || [];
}

export async function purchaseLootboxKey(
  walletAddress: string,
  lootboxId: string
): Promise<PurchaseKeyResult> {
  const { data, error } = await supabase.rpc('purchase_lootbox_key', {
    p_wallet: walletAddress,
    p_lootbox_id: lootboxId,
  });

  if (error) {
    console.error('Error purchasing key:', error);
    return { success: false, error: error.message };
  }
  return (data || { success: false, error: 'unknown' }) as PurchaseKeyResult;
}

export async function openLootbox(
  walletAddress: string,
  lootboxId: string
): Promise<OpenLootboxResult> {
  const { data, error } = await supabase.rpc('open_lootbox', {
    p_wallet: walletAddress,
    p_lootbox_id: lootboxId,
  });

  if (error) {
    console.error('Error opening lootbox:', error);
    return { success: false, error: error.message };
  }
  return (data || { success: false, error: 'unknown' }) as OpenLootboxResult;
}

export async function fetchUserRewards(
  walletAddress: string
): Promise<UserLootboxReward[]> {
  const { data, error } = await supabase
    .from('user_lootbox_rewards')
    .select('*, reward:lootbox_rewards(*)')
    .eq('wallet_address', walletAddress)
    .order('obtained_at', { ascending: false });

  if (error) {
    console.error('Error fetching user rewards:', error);
    return [];
  }
  return (data || []) as UserLootboxReward[];
}

/**
 * Fetch the equipped cosmetics for a wallet (any user, not just the viewer).
 * Used on the public profile page to render someone else's banner + frame.
 */
export async function fetchEquippedRewards(
  walletAddress: string
): Promise<UserLootboxReward[]> {
  const { data, error } = await supabase
    .from('user_lootbox_rewards')
    .select('*, reward:lootbox_rewards(*)')
    .eq('wallet_address', walletAddress)
    .eq('is_equipped', true);

  if (error) {
    console.error('Error fetching equipped rewards:', error);
    return [];
  }
  return (data ?? []) as UserLootboxReward[];
}

export async function equipUserReward(
  userRewardId: string,
  isEquipped: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from('user_lootbox_rewards')
    .update({ is_equipped: isEquipped })
    .eq('id', userRewardId);

  if (error) {
    console.error('Error equipping reward:', error);
    return false;
  }
  return true;
}

/**
 * Set the equipped cosmetic of a given type for a wallet. Unequips any other
 * items of the same type first so there's always exactly one active per slot.
 * Pass userRewardId = null to fully unequip the slot.
 */
export async function equipRewardByType(
  walletAddress: string,
  type: LootboxRewardType,
  userRewardId: string | null
): Promise<boolean> {
  const { data: owned, error: ownedError } = await supabase
    .from('user_lootbox_rewards')
    .select('id, reward:lootbox_rewards(type)')
    .eq('wallet_address', walletAddress)
    .eq('is_equipped', true);

  if (ownedError) {
    console.error('equipRewardByType fetch error:', ownedError);
    return false;
  }

  const toUnequip = (owned ?? [])
    .filter((r: any) => r.reward?.type === type)
    .map((r: any) => r.id);

  if (toUnequip.length > 0) {
    const { error: unequipError } = await supabase
      .from('user_lootbox_rewards')
      .update({ is_equipped: false })
      .in('id', toUnequip);

    if (unequipError) {
      console.error('equipRewardByType unequip error:', unequipError);
      return false;
    }
  }

  if (userRewardId) {
    const { error: equipError } = await supabase
      .from('user_lootbox_rewards')
      .update({ is_equipped: true })
      .eq('id', userRewardId);

    if (equipError) {
      console.error('equipRewardByType equip error:', equipError);
      return false;
    }
  }

  return true;
}

/**
 * Fetch every reward in the catalogue of a given type. Used on the edit
 * profile screen to show locked cosmetics alongside the user's unlocked ones.
 */
export async function fetchRewardsCatalogueByType(
  type: LootboxRewardType
): Promise<LootboxReward[]> {
  const { data, error } = await supabase
    .from('lootbox_rewards')
    .select('*')
    .eq('type', type)
    .order('rarity', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching rewards catalogue:', error);
    return [];
  }
  return (data ?? []) as LootboxReward[];
}

// ── Referrals ────────────────────────────────────────────────

export async function ensureReferralCode(
  walletAddress: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc('ensure_referral_code', {
    p_wallet: walletAddress,
  });

  if (error) {
    console.error('Error ensuring referral code:', error);
    return null;
  }
  return (data as string) || null;
}

export async function fetchReferralStats(
  walletAddress: string
): Promise<ReferralStats> {
  const [codeRes, redemptionsRes] = await Promise.all([
    supabase
      .from('referral_codes')
      .select('code')
      .eq('wallet_address', walletAddress)
      .maybeSingle(),
    supabase
      .from('referral_redemptions')
      .select('coins_awarded_referrer')
      .eq('referrer_wallet', walletAddress),
  ]);

  const code = codeRes.data?.code ?? null;
  const redemptions = redemptionsRes.data || [];
  const coinsEarned = redemptions.reduce(
    (sum, r) => sum + (r.coins_awarded_referrer || 0),
    0
  );
  return {
    code,
    total_invited: redemptions.length,
    coins_earned: coinsEarned,
  };
}

export async function redeemReferral(
  code: string,
  referredWallet: string
): Promise<RedeemReferralResult> {
  const { data, error } = await supabase.rpc('redeem_referral', {
    p_code: code,
    p_referred_wallet: referredWallet,
  });

  if (error) {
    console.error('Error redeeming referral:', error);
    return { success: false, error: error.message };
  }
  return (data || { success: false, error: 'unknown' }) as RedeemReferralResult;
}

// ── Helpers ──────────────────────────────────────────────────

const WEEKDAY_CHECKIN_BASE = 20;

/**
 * Preview the next 7 days of check-in amounts for the streak strip.
 * Day 3, 6, 9… (every 3rd consecutive day) awards 2× the base amount.
 */
export function buildCheckinStrip(currentStreak: number): Array<{
  day: number;
  amount: number;
  isBonus: boolean;
}> {
  const result = [] as Array<{ day: number; amount: number; isBonus: boolean }>;
  const start = Math.max(1, currentStreak + 1 - 3); // show a few past + future
  for (let i = 0; i < 7; i++) {
    const day = start + i;
    const isBonus = day % 3 === 0;
    result.push({
      day,
      amount: isBonus ? WEEKDAY_CHECKIN_BASE * 2 : WEEKDAY_CHECKIN_BASE,
      isBonus,
    });
  }
  return result;
}

export function buildReferralShareMessage(
  code: string,
  deepLinkBase = 'https://www.roebel.app/r'
): string {
  return `Hey! Hol dir die Röbel App und wir beide bekommen Münzen: ${deepLinkBase}/${code}`;
}
