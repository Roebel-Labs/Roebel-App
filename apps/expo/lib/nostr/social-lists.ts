import type { NostrEvent } from '@netizen-labs/nostr';
import {
  buildContactListEvent, buildPrivateListEvent, KIND_FOLLOW_SET, KIND_MUTE_LIST, UNFOLLOWED_SET_D,
} from '@netizen-labs/nostr';
import { supabase } from '../supabase';
import type { RelationsSnapshot } from '../relations-state';
import { loadStoredIdentity } from './identity';
import { publishSigned } from './publish';
import { nextCreatedAt, resolvePlan } from './social-list-plan';

export const SOCIAL_LIST_SOURCE_TYPES = ['contacts', 'mutes', 'unfollowed'] as const;

let lastCreatedAt: number | null = null;
let queue: Promise<void> = Promise.resolve();

const IN_CHUNK = 100;

async function selectInChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await run(ids.slice(i, i + IN_CHUNK));
    // A failed lookup must abort the whole publish: an empty map would publish an empty kind 3.
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

// HARD privacy rule: ONLY organisation accounts, and ONLY 'org_profile' rows. Persons are never
// resolved to a pubkey here — the account type is checked first, so a stray org_profile row keyed
// by a person's account id can never leak into the public contact list.
async function orgPubkeys(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const orgs = await selectInChunks<{ id: string }>(ids, (chunk) => supabase.from('accounts')
    .select('id').eq('account_type', 'organisation').in('id', chunk));
  const orgIds = orgs.map((r) => r.id);
  if (orgIds.length === 0) return new Map();
  const rows = await selectInChunks<{ source_id: string; pubkey_hex: string }>(orgIds, (chunk) => supabase.from('nostr_publications')
    .select('source_id, pubkey_hex').eq('source_type', 'org_profile').in('source_id', chunk));
  return new Map(rows.map((r) => [r.source_id, r.pubkey_hex]));
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
      // Resolve first, outside the per-list try blocks: a lookup failure aborts before ANY list is published.
      const plan = await resolvePlan(s, orgPubkeys);
      const createdAt = nextCreatedAt(Math.floor(Date.now() / 1000), lastCreatedAt);
      lastCreatedAt = createdAt;
      const self = identity.publicKey;
      const lists: Array<[string, () => NostrEvent]> = [
        ['contacts', () => buildContactListEvent(identity.secretKey, plan.contacts, { createdAt })],
        ['mutes', () => buildPrivateListEvent(identity.secretKey, KIND_MUTE_LIST, plan.muteItems, { createdAt })],
        ['unfollowed', () => buildPrivateListEvent(identity.secretKey, KIND_FOLLOW_SET, plan.unfollowedItems, { d: UNFOLLOWED_SET_D, createdAt })],
      ];
      for (const [sourceType, build] of lists) {
        try {
          await publishSigned(build(), sourceType, self);
        } catch (err) {
          console.warn(`social list ${sourceType} failed (non-fatal)`, err);
        }
      }
    } catch (err) {
      console.warn('social lists publish failed (non-fatal)', err);
    }
  });
  return queue;
}
