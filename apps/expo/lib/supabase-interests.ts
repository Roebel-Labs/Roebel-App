import { supabase } from './supabase';
import { buildInterestPreviews, type InterestPreview } from './interest-previews';

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
  // Case-insensitive match: event_interests.user_wallet is stored checksummed
  // (from thirdweb account.address), while users.wallet_address is lowercase.
  // ilike avoids the mismatch (wallet addresses contain no SQL wildcard chars).
  const { data } = await supabase
    .from('event_interests')
    .select('event_id')
    .ilike('user_wallet', walletAddress);

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

/**
 * Count + a few interested people for MANY events in two round trips
 * (one on event_interests, one on users) — the explore rails call this
 * once per rail instead of two queries per card. Every requested id gets
 * an entry, so an absent key means "not loaded yet".
 */
export async function fetchInterestPreviews(
  eventIds: string[]
): Promise<Map<string, InterestPreview>> {
  const ids = Array.from(new Set(eventIds));
  if (ids.length === 0) return new Map();

  const { data: rows } = await supabase
    .from('event_interests')
    .select('event_id, user_wallet')
    .in('event_id', ids)
    .order('created_at', { ascending: false })
    .limit(2000);

  const interestRows = (rows ?? []) as { event_id: string; user_wallet: string }[];
  const wallets = Array.from(new Set(interestRows.map((r) => r.user_wallet.toLowerCase())));

  // PostgREST puts the `in` list in the URL — keep each request short.
  type ProfileRow = { wallet_address: string; username: string | null; profile_picture_url: string | null };
  const users: ProfileRow[] = [];
  for (let i = 0; i < wallets.length; i += 100) {
    const { data } = await supabase
      .from('users')
      .select('wallet_address, username, profile_picture_url')
      .in('wallet_address', wallets.slice(i, i + 100));
    if (data) users.push(...(data as ProfileRow[]));
  }

  return buildInterestPreviews(ids, interestRows, users);
}
