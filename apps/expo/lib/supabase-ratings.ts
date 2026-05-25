import { supabase } from './supabase';
import type {
  AccountRatingRecord,
  AccountRatingSummary,
  AccountVoteRecord,
  AccountVoteSummary,
  MenuItemVoteRecord,
} from './types';

export async function fetchAccountRatingSummary(accountId: string): Promise<AccountRatingSummary | null> {
  const { data, error } = await supabase
    .from('account_rating_summary')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) { console.error('Error fetching rating summary:', error); return null; }
  return (data as AccountRatingSummary | null) ?? null;
}

export async function fetchAccountRatingSummaries(accountIds: string[]): Promise<Record<string, AccountRatingSummary>> {
  if (!accountIds.length) return {};
  const { data, error } = await supabase
    .from('account_rating_summary')
    .select('*')
    .in('account_id', accountIds);
  if (error) { console.error('Error fetching rating summaries:', error); return {}; }
  const map: Record<string, AccountRatingSummary> = {};
  for (const row of (data ?? []) as AccountRatingSummary[]) map[row.account_id] = row;
  return map;
}

export async function fetchUserRatingForAccount(accountId: string, wallet: string): Promise<AccountRatingRecord | null> {
  const { data, error } = await supabase
    .from('account_ratings')
    .select('*')
    .eq('account_id', accountId)
    .eq('wallet_address', wallet.toLowerCase())
    .maybeSingle();
  if (error) { console.error('Error fetching user rating:', error); return null; }
  return (data as AccountRatingRecord | null) ?? null;
}

export async function upsertAccountRating(input: {
  account_id: string;
  wallet_address: string;
  stars: number;
  comment?: string | null;
}): Promise<AccountRatingRecord | null> {
  const payload = {
    ...input,
    wallet_address: input.wallet_address.toLowerCase(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('account_ratings')
    .upsert(payload, { onConflict: 'account_id,wallet_address' })
    .select()
    .single();
  if (error) { console.error('Error upserting rating:', error); return null; }
  return data as AccountRatingRecord;
}

export async function deleteAccountRating(accountId: string, wallet: string): Promise<void> {
  const { error } = await supabase
    .from('account_ratings')
    .delete()
    .eq('account_id', accountId)
    .eq('wallet_address', wallet.toLowerCase());
  if (error) console.error('Error deleting rating:', error);
}

export async function fetchUserMenuItemVote(menuItemId: string, wallet: string): Promise<MenuItemVoteRecord | null> {
  const { data, error } = await supabase
    .from('menu_item_votes')
    .select('*')
    .eq('menu_item_id', menuItemId)
    .eq('wallet_address', wallet.toLowerCase())
    .maybeSingle();
  if (error) { console.error('Error fetching user vote:', error); return null; }
  return (data as MenuItemVoteRecord | null) ?? null;
}

export async function voteMenuItem(input: {
  menu_item_id: string;
  wallet_address: string;
  vote: 1 | -1;
}): Promise<MenuItemVoteRecord | null> {
  const payload = { ...input, wallet_address: input.wallet_address.toLowerCase() };
  const { data, error } = await supabase
    .from('menu_item_votes')
    .upsert(payload, { onConflict: 'menu_item_id,wallet_address' })
    .select()
    .single();
  if (error) { console.error('Error voting:', error); return null; }
  return data as MenuItemVoteRecord;
}

export async function clearMenuItemVote(menuItemId: string, wallet: string): Promise<void> {
  const { error } = await supabase
    .from('menu_item_votes')
    .delete()
    .eq('menu_item_id', menuItemId)
    .eq('wallet_address', wallet.toLowerCase());
  if (error) console.error('Error clearing vote:', error);
}

// --- Org account thumbs-up/down votes ---

export async function fetchAccountVoteSummary(accountId: string): Promise<AccountVoteSummary | null> {
  const { data, error } = await supabase
    .from('account_vote_summary' as any)
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error) { console.error('Error fetching account vote summary:', error); return null; }
  return (data as AccountVoteSummary | null) ?? null;
}

export async function fetchAccountVoteSummaries(accountIds: string[]): Promise<Record<string, AccountVoteSummary>> {
  if (!accountIds.length) return {};
  const { data, error } = await supabase
    .from('account_vote_summary' as any)
    .select('*')
    .in('account_id', accountIds);
  if (error) { console.error('Error fetching account vote summaries:', error); return {}; }
  const map: Record<string, AccountVoteSummary> = {};
  for (const row of (data ?? []) as AccountVoteSummary[]) map[row.account_id] = row;
  return map;
}

export async function fetchUserAccountVote(accountId: string, wallet: string): Promise<AccountVoteRecord | null> {
  const { data, error } = await supabase
    .from('account_votes' as any)
    .select('*')
    .eq('account_id', accountId)
    .eq('wallet_address', wallet.toLowerCase())
    .maybeSingle();
  if (error) { console.error('Error fetching user account vote:', error); return null; }
  return (data as AccountVoteRecord | null) ?? null;
}

export async function voteAccount(input: {
  account_id: string;
  wallet_address: string;
  vote: 1 | -1;
}): Promise<AccountVoteRecord | null> {
  const payload = { ...input, wallet_address: input.wallet_address.toLowerCase() };
  const { data, error } = await supabase
    .from('account_votes' as any)
    .upsert(payload, { onConflict: 'account_id,wallet_address' })
    .select()
    .single();
  if (error) { console.error('Error voting on account:', error); return null; }
  return data as AccountVoteRecord;
}

export async function clearAccountVote(accountId: string, wallet: string): Promise<void> {
  const { error } = await supabase
    .from('account_votes' as any)
    .delete()
    .eq('account_id', accountId)
    .eq('wallet_address', wallet.toLowerCase());
  if (error) console.error('Error clearing account vote:', error);
}
