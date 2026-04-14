// Fetch eligible Vereine for the Röbel Card beneficiary picker.
//
// A "Verein" in the app is an `accounts` row with
//   account_type = 'organisation' AND sub_type = 'verein'
// We don't require is_verified = true — any registered Verein account
// can receive the 10 % local-support fee. (If admin moderation is added
// later, reintroduce the is_verified filter here + in the webhook.)

import { supabase } from './supabase';

export interface VereinOption {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
}

/**
 * Returns all Vereine sorted alphabetically by name.
 * Silent-fails to an empty list on error — the TopUpBottomSheet will
 * still render the "Röbeler Topf" option as a fallback.
 */
export async function fetchVerifiedVereine(): Promise<VereinOption[]> {
  const { data, error } = await supabase
    .from('accounts' as any)
    .select('id, name, avatar_url, bio, account_type, sub_type')
    .eq('account_type', 'organisation')
    .eq('sub_type', 'verein')
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
