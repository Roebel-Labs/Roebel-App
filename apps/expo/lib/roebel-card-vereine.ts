// Fetch verified Vereine for the Röbel Card beneficiary picker.
//
// A "Verein" in the app is an `accounts` row with
//   account_type = 'organisation' AND sub_type = 'verein'
// and we additionally require is_verified = true so buyers can only
// direct their 10% local-support fee toward Vereine that have been
// admin-approved. Mirrors the webhook's validation in
// apps/web/src/app/api/roebel-card/webhook/route.ts.

import { supabase } from './supabase';

export interface VereinOption {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
}

/**
 * Returns all verified Vereine sorted alphabetically by name.
 * Silent-fails to an empty list on error — the TopUpBottomSheet will
 * still render the "Röbeler Topf" option as a fallback.
 */
export async function fetchVerifiedVereine(): Promise<VereinOption[]> {
  const { data, error } = await supabase
    .from('accounts' as any)
    .select('id, name, avatar_url, bio, account_type, sub_type, is_verified')
    .eq('account_type', 'organisation')
    .eq('sub_type', 'verein')
    .eq('is_verified', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('fetchVerifiedVereine error:', error);
    return [];
  }

  return (data as any[]).map((row) => ({
    id: row.id as string,
    name: (row.name as string) ?? '',
    avatar_url: (row.avatar_url as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
  }));
}
