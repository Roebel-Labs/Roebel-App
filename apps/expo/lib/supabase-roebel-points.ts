import { supabase } from './supabase';

// ── Types ────────────────────────────────────────────────────

export interface RoebelPointsCardRecord {
  wallet_address: string;
  points_balance: number;
  total_earned: number;
  total_spent: number;
  tier: 'besucher' | 'burger' | 'supporter';
  streak_days: number;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PointsLedgerEntry {
  id: string;
  wallet_address: string;
  amount: number;
  action: string;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

export interface StampCardRecord {
  id: string;
  wallet_address: string;
  partner_id: string;
  stamps_collected: number;
  stamps_required: number;
  reward_description: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  business_name?: string;
}

// ── Points Actions ───────────────────────────────────────────

export type PointsAction =
  | 'vote'
  | 'event_attend'
  | 'post'
  | 'checkpoint'
  | 'volunteer'
  | 'referral'
  | 'daily_login'
  | 'first_purchase'
  | 'verify_citizen'
  | 'stamp'
  | 'redeem'
  // Rewards-gamification actions — values owned by Supabase RPCs, these entries
  // exist so the ledger is fully typed on the client.
  | 'daily_checkin_bonus'
  | 'task_complete'
  | 'lootbox_key_purchase'
  | 'lootbox_open_bonus'
  | 'referral_received';

const POINTS_TABLE: Record<Exclude<PointsAction, 'redeem'>, number> = {
  vote: 50,
  event_attend: 30,
  post: 10,
  checkpoint: 25,
  volunteer: 100,
  referral: 200,
  daily_login: 5,
  first_purchase: 50,
  verify_citizen: 75,
  stamp: 10,
};

// ── Fetch ────────────────────────────────────────────────────

export async function fetchRoebelPointsCard(walletAddress: string): Promise<RoebelPointsCardRecord | null> {
  const { data, error } = await supabase
    .from('roebel_points_card')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('Error fetching Röbel Points Card:', error);
    return null;
  }
  return data;
}

export async function ensureRoebelPointsCard(walletAddress: string): Promise<RoebelPointsCardRecord> {
  const existing = await fetchRoebelPointsCard(walletAddress);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('roebel_points_card')
    .upsert({
      wallet_address: walletAddress,
      points_balance: 0,
      total_earned: 0,
      total_spent: 0,
      tier: 'besucher',
      streak_days: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchPointsHistory(
  walletAddress: string,
  limit = 20
): Promise<PointsLedgerEntry[]> {
  const { data, error } = await supabase
    .from('roebel_points_ledger')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching points history:', error);
    return [];
  }
  return data || [];
}

// ── Award Points ─────────────────────────────────────────────

export async function awardPoints(
  walletAddress: string,
  action: Exclude<PointsAction, 'redeem'>,
  referenceType?: string,
  referenceId?: string,
  description?: string
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  const amount = POINTS_TABLE[action];

  // Insert ledger entry
  const { error: ledgerError } = await supabase
    .from('roebel_points_ledger')
    .insert({
      wallet_address: walletAddress,
      amount,
      action,
      reference_type: referenceType || null,
      reference_id: referenceId || null,
      description: description || `${action} +${amount}`,
    });

  if (ledgerError) {
    console.error('Error awarding points:', ledgerError);
    return { success: false, error: ledgerError.message };
  }

  // Update balance
  const { data, error: updateError } = await supabase.rpc('increment_roebel_points', {
    p_wallet_address: walletAddress,
    p_amount: amount,
  });

  if (updateError) {
    // Fallback: manually update
    const card = await fetchRoebelPointsCard(walletAddress);
    if (card) {
      const { error } = await supabase
        .from('roebel_points_card')
        .update({
          points_balance: card.points_balance + amount,
          total_earned: card.total_earned + amount,
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('wallet_address', walletAddress);

      if (error) return { success: false, error: error.message };
      return { success: true, newBalance: card.points_balance + amount };
    }
  }

  return { success: true, newBalance: data };
}

// ── Stamp Cards ──────────────────────────────────────────────

export async function fetchStampCards(walletAddress: string): Promise<StampCardRecord[]> {
  const { data, error } = await supabase
    .from('stamp_cards')
    .select('*, roebel_stamp_partners(business_id, businesses(name))')
    .eq('wallet_address', walletAddress)
    .eq('is_completed', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching stamp cards:', error);
    return [];
  }
  return data || [];
}

export async function addStamp(
  walletAddress: string,
  stampCardId: string
): Promise<{ success: boolean; completed?: boolean }> {
  // Get current stamp card
  const { data: card, error } = await supabase
    .from('stamp_cards')
    .select('*')
    .eq('id', stampCardId)
    .eq('wallet_address', walletAddress)
    .single();

  if (error || !card) return { success: false };

  const newCount = card.stamps_collected + 1;
  const completed = newCount >= card.stamps_required;

  const { error: updateError } = await supabase
    .from('stamp_cards')
    .update({
      stamps_collected: newCount,
      is_completed: completed,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq('id', stampCardId);

  if (updateError) return { success: false };

  // Award points for stamp
  await awardPoints(walletAddress, 'stamp', 'stamp_card', stampCardId);

  return { success: true, completed };
}
