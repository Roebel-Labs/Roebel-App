"use server";

import { createClient } from "@/lib/supabase/server";
import type { PointsLedgerEntry, RoebelCard, StampCard, RoebelTier, PointsAction } from "@/types/roebel-card";
import { TIER_THRESHOLDS } from "@/types/roebel-card";

// --- Röbel Card ---

export async function getRoebelCard(walletAddress: string): Promise<{
  success: boolean;
  data?: RoebelCard;
  error?: string;
}> {
  const supabase = await createClient();

  // Try to fetch existing card
  const { data, error } = await supabase
    .from("roebel_card")
    .select("*")
    .eq("wallet_address", walletAddress)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found, which is OK
    return { success: false, error: error.message };
  }

  if (data) {
    return { success: true, data: data as RoebelCard };
  }

  // No card yet — create one
  const { data: newCard, error: insertError } = await supabase
    .from("roebel_card")
    .insert({
      wallet_address: walletAddress,
      points_balance: 0,
      total_earned: 0,
      total_spent: 0,
      tier: "besucher" as RoebelTier,
      streak_days: 0,
    })
    .select()
    .single();

  if (insertError) {
    // Table might not exist yet — fallback to gamification_points from users table
    const { data: user } = await supabase
      .from("users")
      .select("wallet_address, gamification_points, created_at, updated_at")
      .eq("wallet_address", walletAddress)
      .single();

    if (user) {
      const points = Number(user.gamification_points || 0);
      const tier = computeTier(points);
      return {
        success: true,
        data: {
          wallet_address: walletAddress,
          points_balance: points,
          total_earned: points,
          total_spent: 0,
          tier,
          streak_days: 0,
          last_activity_at: null,
          created_at: user.created_at,
          updated_at: user.updated_at || user.created_at,
        },
      };
    }

    return { success: false, error: insertError.message };
  }

  return { success: true, data: newCard as RoebelCard };
}

// --- Points Ledger ---

export async function getPointsHistory(
  walletAddress: string,
  limit = 20,
  offset = 0
): Promise<{
  success: boolean;
  data?: PointsLedgerEntry[];
  error?: string;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("roebel_points_ledger")
    .select("*")
    .eq("wallet_address", walletAddress)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    // Table might not exist yet — return empty
    return { success: true, data: [] };
  }

  return { success: true, data: (data || []) as PointsLedgerEntry[] };
}

// --- Stamp Cards ---

export async function getStampCards(walletAddress: string): Promise<{
  success: boolean;
  data?: StampCard[];
  error?: string;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stamp_cards")
    .select(`
      *,
      roebel_card_partners!inner (
        businesses!inner (name, logo_url)
      )
    `)
    .eq("wallet_address", walletAddress)
    .order("created_at", { ascending: false });

  if (error) {
    // Table might not exist yet
    return { success: true, data: [] };
  }

  const mapped = (data || []).map((row: Record<string, unknown>) => {
    const partner = row.roebel_card_partners as Record<string, unknown> | null;
    const biz = partner?.businesses as Record<string, unknown> | null;
    return {
      id: String(row.id),
      wallet_address: String(row.wallet_address),
      partner_id: String(row.partner_id),
      stamps_collected: Number(row.stamps_collected || 0),
      stamps_required: Number(row.stamps_required || 0),
      reward_description: String(row.reward_description || ""),
      is_completed: Boolean(row.is_completed),
      completed_at: row.completed_at ? String(row.completed_at) : null,
      created_at: String(row.created_at),
      business_name: biz?.name ? String(biz.name) : undefined,
      business_logo_url: biz?.logo_url ? String(biz.logo_url) : null,
    } as StampCard;
  });

  return { success: true, data: mapped };
}

// --- Helpers ---

function computeTier(totalEarned: number): RoebelTier {
  if (totalEarned >= TIER_THRESHOLDS.supporter.minPoints) return "supporter";
  if (totalEarned >= TIER_THRESHOLDS.burger.minPoints) return "burger";
  return "besucher";
}
