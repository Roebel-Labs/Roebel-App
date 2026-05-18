import { supabase } from './supabase';

export type InterestedUser = {
  wallet_address: string;
  username: string | null;
  profile_picture_url: string | null;
};

/** Toggle interest for an event. Returns whether interest was added or removed. */
export async function toggleInterest(
  eventId: string,
  walletAddress: string
): Promise<'added' | 'removed'> {
  const { data: existing } = await supabase
    .from('event_interests')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_wallet', walletAddress)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('event_interests')
      .delete()
      .eq('event_id', eventId)
      .eq('user_wallet', walletAddress);
    return 'removed';
  } else {
    await supabase.from('event_interests').insert({
      event_id: eventId,
      user_wallet: walletAddress,
    });
    return 'added';
  }
}

/** Get total interest count for an event. */
export async function getInterestCount(eventId: string): Promise<number> {
  const { count } = await supabase
    .from('event_interests')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);

  return count ?? 0;
}

/** Check if a specific user is interested in an event. */
export async function isInterested(
  eventId: string,
  walletAddress: string
): Promise<boolean> {
  const { data } = await supabase
    .from('event_interests')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_wallet', walletAddress)
    .maybeSingle();

  return !!data;
}

/** Fetch all event IDs the user is interested in (for context init). */
export async function fetchAllUserInterests(
  walletAddress: string
): Promise<string[]> {
  const { data } = await supabase
    .from('event_interests')
    .select('event_id')
    .eq('user_wallet', walletAddress);

  return data?.map((row) => row.event_id) ?? [];
}

/** Get users interested in an event (for avatar stack). Two-step query. */
export async function getInterestedUsers(
  eventId: string,
  limit: number = 5
): Promise<InterestedUser[]> {
  return fetchInterestedUsers(eventId, limit);
}

/** Fetch all users interested in an event (for the dedicated list screen). */
export async function listInterestedUsers(eventId: string): Promise<InterestedUser[]> {
  return fetchInterestedUsers(eventId, 500);
}

async function fetchInterestedUsers(
  eventId: string,
  limit: number
): Promise<InterestedUser[]> {
  const { data: interests } = await supabase
    .from('event_interests')
    .select('user_wallet')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!interests || interests.length === 0) return [];

  const wallets = interests.map((i) => i.user_wallet.toLowerCase());

  const { data: users } = await supabase
    .from('users')
    .select('wallet_address, username, profile_picture_url')
    .in('wallet_address', wallets);

  const userMap = new Map(
    (users ?? []).map((u) => [u.wallet_address.toLowerCase(), u])
  );

  return interests.map((i) => {
    const user = userMap.get(i.user_wallet.toLowerCase());
    return {
      wallet_address: i.user_wallet,
      username: user?.username ?? null,
      profile_picture_url: user?.profile_picture_url ?? null,
    };
  });
}
