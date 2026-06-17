import { supabase } from '@/lib/supabase';

export type CirclesStatus = 'none' | 'invited' | 'registered';

export interface MemberPatch {
  wallet_address: string;
  gnosis_address?: string;
  circles_status?: CirclesStatus;
  group_member?: boolean;
  pilot_cohort?: boolean;
  updated_at: string;
}

/**
 * Builds an upsert patch for a `roebeltaler_members` row. Pure (no network) so
 * the gating/merge logic is unit-testable. Always stamps `updated_at`.
 */
export function upsertMemberPatch(
  walletAddress: string,
  fields: Partial<Omit<MemberPatch, 'wallet_address' | 'updated_at'>>,
): MemberPatch {
  return { wallet_address: walletAddress, ...fields, updated_at: new Date().toISOString() };
}

export async function saveMember(patch: MemberPatch) {
  return supabase
    .from('roebeltaler_members')
    .upsert(patch, { onConflict: 'wallet_address' });
}

export async function getMember(walletAddress: string) {
  return supabase
    .from('roebeltaler_members')
    .select('*')
    .eq('wallet_address', walletAddress)
    .maybeSingle();
}
