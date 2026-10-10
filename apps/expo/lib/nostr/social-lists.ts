import {
  buildContactListEvent, buildPrivateListEvent, KIND_FOLLOW_SET, KIND_MUTE_LIST, UNFOLLOWED_SET_D,
} from '@netizen-labs/nostr';
import { supabase } from '../supabase';
import type { RelationsSnapshot } from '../relations-state';
import { loadStoredIdentity } from './identity';
import { publishSigned } from './publish';
import { nextCreatedAt, planSocialLists } from './social-list-plan';

export const SOCIAL_LIST_SOURCE_TYPES = ['contacts', 'mutes', 'unfollowed'] as const;

let lastCreatedAt: number | null = null;
let queue: Promise<void> = Promise.resolve();

// HARD privacy rule: ONLY 'org_profile' rows. Persons are never resolved to a pubkey here.
async function orgPubkeys(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from('nostr_publications')
    .select('source_id, pubkey_hex').eq('source_type', 'org_profile').in('source_id', ids);
  return new Map((data ?? []).map((r: { source_id: string; pubkey_hex: string }) => [r.source_id, r.pubkey_hex]));
}

/** True when one of the viewer's own social-list publications is still pending (relay was unreachable). */
export async function hasPendingSocialLists(): Promise<boolean> {
  try {
    const identity = await loadStoredIdentity();
    if (!identity) return false;
    const { data } = await supabase.from('nostr_publications')
      .select('source_type').eq('pubkey_hex', identity.publicKey).eq('status', 'pending')
      .in('source_type', [...SOCIAL_LIST_SOURCE_TYPES]).limit(1);
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Mirror the viewer's follows/mutes to the relay as NSP-15 lists. Best-effort and serialised:
 * Supabase stays the source of truth; a user without a Nostr identity (non-citizen, no consent) is skipped.
 * Never throws.
 */
export function publishSocialLists(s: RelationsSnapshot): Promise<void> {
  queue = queue.then(async () => {
    try {
      const identity = await loadStoredIdentity();
      if (!identity) return;
      const plan = planSocialLists(s, await orgPubkeys([...new Set([...s.following, ...s.muted])]));
      const createdAt = nextCreatedAt(Math.floor(Date.now() / 1000), lastCreatedAt);
      lastCreatedAt = createdAt;
      const self = identity.publicKey;
      await publishSigned(buildContactListEvent(identity.secretKey, plan.contacts, { createdAt }), 'contacts', self);
      await publishSigned(buildPrivateListEvent(identity.secretKey, KIND_MUTE_LIST, plan.muteItems, { createdAt }), 'mutes', self);
      await publishSigned(
        buildPrivateListEvent(identity.secretKey, KIND_FOLLOW_SET, plan.unfollowedItems, { d: UNFOLLOWED_SET_D, createdAt }),
        'unfollowed', self,
      );
    } catch (err) {
      console.warn('social lists publish failed (non-fatal)', err);
    }
  });
  return queue;
}
