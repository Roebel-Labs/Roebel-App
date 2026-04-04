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
    return { success: false, error: error.message };
  }

  if (data) {
    return { success: true, data: data as RoebelCard };
  }

  // No card yet — create one via the increment function (auto-creates)
  // or insert directly
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
    return { success: false, error: error.message };
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
    return { success: false, error: error.message };
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

// --- Award Points ---

export async function awardPoints(
  walletAddress: string,
  action: PointsAction,
  amount: number,
  description: string,
  referenceType?: string,
  referenceId?: string
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  const supabase = await createClient();

  // 1. Use the atomic increment function
  const { data: newBalance, error: rpcError } = await supabase.rpc(
    "increment_roebel_points",
    { p_wallet_address: walletAddress, p_amount: amount }
  );

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }

  // 2. Insert ledger entry
  const { error: ledgerError } = await supabase
    .from("roebel_points_ledger")
    .insert({
      wallet_address: walletAddress,
      amount,
      action,
      reference_type: referenceType,
      reference_id: referenceId,
      description,
    });

  if (ledgerError) {
    return { success: false, error: ledgerError.message };
  }

  // 3. Update tier if needed
  const { data: card } = await supabase
    .from("roebel_card")
    .select("total_earned, tier")
    .eq("wallet_address", walletAddress)
    .single();

  if (card) {
    const newTier = computeTier(card.total_earned);
    if (newTier !== card.tier) {
      await supabase
        .from("roebel_card")
        .update({ tier: newTier, updated_at: new Date().toISOString() })
        .eq("wallet_address", walletAddress);
    }
  }

  return { success: true, newBalance: newBalance as number };
}

// --- Helpers ---

function computeTier(totalEarned: number): RoebelTier {
  if (totalEarned >= TIER_THRESHOLDS.supporter.minPoints) return "supporter";
  if (totalEarned >= TIER_THRESHOLDS.burger.minPoints) return "burger";
  return "besucher";
}
