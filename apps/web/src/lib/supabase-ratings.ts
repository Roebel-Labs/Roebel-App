/**
 * Account ratings + thumbs votes + menu-item votes.
 * Ported from apps/expo/lib/supabase-ratings.ts for the web app.
 * Uses the shared anon `supabase` singleton (writes are keyed by
 * wallet_address, not auth.uid, so the anon client is sufficient — same
 * model the Expo app uses).
 */

import { supabase } from "./supabase";

// ── Types ────────────────────────────────────────────────────

export interface AccountRatingSummary {
  account_id: string;
  rating_count: number;
  avg_stars: number;
}

export interface AccountRatingRecord {
  id: string;
  account_id: string;
  wallet_address: string;
  stars: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountVoteSummary {
  account_id: string;
  up_count: number;
  down_count: number;
  vote_count: number;
  percent_liked: number;
}

export interface MenuItemVoteSummary {
  menu_item_id: string;
  vote_count: number;
  percent_liked: number;
}

export type VoteValue = 1 | -1;

// ── Account ratings ──────────────────────────────────────────

export async function fetchAccountRatingSummary(
  accountId: string
): Promise<AccountRatingSummary | null> {
  const { data, error } = await supabase
    .from("account_rating_summary")
    .select("account_id, rating_count, avg_stars")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) {
    console.error("fetchAccountRatingSummary error:", error);
    return null;
  }
  return (data as AccountRatingSummary) ?? null;
}

export async function fetchUserRatingForAccount(
  accountId: string,
  wallet: string
): Promise<AccountRatingRecord | null> {
  const { data, error } = await supabase
    .from("account_ratings")
    .select("*")
    .eq("account_id", accountId)
    .eq("wallet_address", wallet.toLowerCase())
    .maybeSingle();
  if (error) {
    console.error("fetchUserRatingForAccount error:", error);
    return null;
  }
  return (data as AccountRatingRecord) ?? null;
}

export async function upsertAccountRating(input: {
  account_id: string;
  wallet_address: string;
  stars: number;
  comment?: string | null;
}): Promise<AccountRatingRecord | null> {
  const { data, error } = await supabase
    .from("account_ratings")
    .upsert(
      {
        account_id: input.account_id,
        wallet_address: input.wallet_address.toLowerCase(),
        stars: input.stars,
        comment: input.comment ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,wallet_address" }
    )
    .select()
    .single();
  if (error) {
    console.error("upsertAccountRating error:", error);
    return null;
  }
  return data as AccountRatingRecord;
}

export async function deleteAccountRating(
  accountId: string,
  wallet: string
): Promise<void> {
  const { error } = await supabase
    .from("account_ratings")
    .delete()
    .eq("account_id", accountId)
    .eq("wallet_address", wallet.toLowerCase());
  if (error) console.error("deleteAccountRating error:", error);
}

// ── Account votes (thumbs) ───────────────────────────────────

export async function fetchAccountVoteSummary(
  accountId: string
): Promise<AccountVoteSummary | null> {
  const { data, error } = await supabase
    .from("account_vote_summary")
    .select("account_id, up_count, down_count, vote_count, percent_liked")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) {
    console.error("fetchAccountVoteSummary error:", error);
    return null;
  }
  return (data as AccountVoteSummary) ?? null;
}

export async function fetchUserAccountVote(
  accountId: string,
  wallet: string
): Promise<VoteValue | null> {
  const { data, error } = await supabase
    .from("account_votes")
    .select("vote")
    .eq("account_id", accountId)
    .eq("wallet_address", wallet.toLowerCase())
    .maybeSingle();
  if (error) {
    console.error("fetchUserAccountVote error:", error);
    return null;
  }
  return (data?.vote as VoteValue) ?? null;
}

export async function voteAccount(input: {
  account_id: string;
  wallet_address: string;
  vote: VoteValue;
}): Promise<void> {
  const { error } = await supabase.from("account_votes").upsert(
    {
      account_id: input.account_id,
      wallet_address: input.wallet_address.toLowerCase(),
      vote: input.vote,
    },
    { onConflict: "account_id,wallet_address" }
  );
  if (error) console.error("voteAccount error:", error);
}

export async function clearAccountVote(
  accountId: string,
  wallet: string
): Promise<void> {
  const { error } = await supabase
    .from("account_votes")
    .delete()
    .eq("account_id", accountId)
    .eq("wallet_address", wallet.toLowerCase());
  if (error) console.error("clearAccountVote error:", error);
}

// ── Menu-item votes ──────────────────────────────────────────

export async function fetchMenuItemVoteSummaries(
  menuItemIds: string[]
): Promise<Record<string, MenuItemVoteSummary>> {
  if (menuItemIds.length === 0) return {};
  const { data, error } = await supabase
    .from("menu_item_vote_summary")
    .select("menu_item_id, vote_count, percent_liked")
    .in("menu_item_id", menuItemIds);
  if (error) {
    console.error("fetchMenuItemVoteSummaries error:", error);
    return {};
  }
  const map: Record<string, MenuItemVoteSummary> = {};
  for (const row of (data as MenuItemVoteSummary[]) ?? []) {
    map[row.menu_item_id] = row;
  }
  return map;
}

export async function fetchUserMenuItemVote(
  menuItemId: string,
  wallet: string
): Promise<VoteValue | null> {
  const { data, error } = await supabase
    .from("menu_item_votes")
    .select("vote")
    .eq("menu_item_id", menuItemId)
    .eq("wallet_address", wallet.toLowerCase())
    .maybeSingle();
  if (error) {
    console.error("fetchUserMenuItemVote error:", error);
    return null;
  }
  return (data?.vote as VoteValue) ?? null;
}

export async function voteMenuItem(input: {
  menu_item_id: string;
  wallet_address: string;
  vote: VoteValue;
}): Promise<void> {
  const { error } = await supabase.from("menu_item_votes").upsert(
    {
      menu_item_id: input.menu_item_id,
      wallet_address: input.wallet_address.toLowerCase(),
      vote: input.vote,
    },
    { onConflict: "menu_item_id,wallet_address" }
  );
  if (error) console.error("voteMenuItem error:", error);
}

export async function clearMenuItemVote(
  menuItemId: string,
  wallet: string
): Promise<void> {
  const { error } = await supabase
    .from("menu_item_votes")
    .delete()
    .eq("menu_item_id", menuItemId)
    .eq("wallet_address", wallet.toLowerCase());
  if (error) console.error("clearMenuItemVote error:", error);
}
