import type { InterestedUser } from './supabase-interests';

/** How many interested people a preview keeps — enough for the card's
 *  avatar stack (3), the flyer orbs on the detail page (4) and the social
 *  row there (4) without a second query. */
export const INTEREST_PREVIEW_USER_LIMIT = 8;

export type InterestPreview = {
  count: number;
  /** Newest interest first, at most INTEREST_PREVIEW_USER_LIMIT entries. */
  users: InterestedUser[];
};

type InterestRow = { event_id: string; user_wallet: string };
type UserRow = { wallet_address: string; username: string | null; profile_picture_url: string | null };

/**
 * Pure aggregation behind fetchInterestPreviews: buckets interest rows
 * (already newest-first) per event, resolves profiles case-insensitively
 * (event_interests stores checksummed wallets, users stores lowercase) and
 * guarantees an entry for every requested id so callers can tell "loaded,
 * nobody yet" from "not loaded".
 */
export function buildInterestPreviews(
  eventIds: string[],
  rows: InterestRow[],
  users: UserRow[]
): Map<string, InterestPreview> {
  const profiles = new Map(users.map((u) => [u.wallet_address.toLowerCase(), u]));
  const previews = new Map<string, InterestPreview>();
  for (const id of eventIds) previews.set(id, { count: 0, users: [] });

  for (const row of rows) {
    const preview = previews.get(row.event_id);
    if (!preview) continue;
    preview.count += 1;
    if (preview.users.length >= INTEREST_PREVIEW_USER_LIMIT) continue;
    const profile = profiles.get(row.user_wallet.toLowerCase());
    preview.users.push({
      wallet_address: row.user_wallet,
      username: profile?.username ?? null,
      profile_picture_url: profile?.profile_picture_url ?? null,
    });
  }
  return previews;
}
