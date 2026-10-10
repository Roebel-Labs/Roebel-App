import type { RelationsSnapshot } from '../relations-state';

// NSP-15 (packages/protocol/src/social.ts). Pure: no keys, no network.
const ACCOUNT_TAG = 'netizen_account';

export type SocialListPlan = { contacts: string[]; muteItems: string[][]; unfollowedItems: string[][] };

/**
 * `orgPubkeyById` must only ever contain ORG accounts (nostr_publications rows with
 * source_type 'org_profile'). A person's pubkey must never reach a public tag.
 */
export function planSocialLists(s: RelationsSnapshot, orgPubkeyById: Map<string, string>): SocialListPlan {
  const contacts = s.following.map((id) => orgPubkeyById.get(id)).filter((p): p is string => !!p);
  const muteItems: string[][] = [];
  for (const id of s.muted) {
    const pk = orgPubkeyById.get(id);
    if (pk) muteItems.push(['p', pk]);
    muteItems.push([ACCOUNT_TAG, id]);
  }
  return { contacts, muteItems, unfollowedItems: s.unfollowed.map((id) => [ACCOUNT_TAG, id]) };
}

export function nextCreatedAt(nowSec: number, lastSec: number | null): number {
  return lastSec !== null && lastSec >= nowSec ? lastSec + 1 : nowSec;
}

/**
 * Resolve org pubkeys first, then plan. If the lookup rejects, nothing is planned and the caller
 * publishes nothing (an empty replaceable kind 3 would wipe the user's contact list on the relay).
 */
export async function resolvePlan(
  s: RelationsSnapshot,
  lookup: (ids: string[]) => Promise<Map<string, string>>,
): Promise<SocialListPlan> {
  const map = await lookup([...new Set([...s.following, ...s.muted])]);
  return planSocialLists(s, map);
}
