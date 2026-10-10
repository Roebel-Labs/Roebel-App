import { supabase } from './supabase';

export type FollowSuggestion = {
  account_id: string; name: string; avatar_url: string | null;
  account_type: 'personal' | 'organisation'; sub_type: string | null; followers: number;
};

export async function fetchFollowSuggestions(): Promise<FollowSuggestion[]> {
  const { data, error } = await supabase.rpc('get_follow_suggestions');
  if (error) { console.error('get_follow_suggestions failed', error); return []; }
  return (data ?? []) as FollowSuggestion[];
}

export async function fetchFollowStats(accountId: string): Promise<{ followers: number; following: number }> {
  const { data, error } = await supabase.rpc('get_follow_stats', { p_account_id: accountId });
  if (error || !data) return { followers: 0, following: 0 };
  return { followers: Number((data as any).followers ?? 0), following: Number((data as any).following ?? 0) };
}

export async function fetchPersonalAccountId(wallet: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('personal_account_id', { p_wallet: wallet });
  return error ? null : ((data as string | null) ?? null);
}
