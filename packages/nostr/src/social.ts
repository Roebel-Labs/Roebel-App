import { buildEvent, type NostrEvent } from "./events";
import { getPublicKeyHex } from "./keys";
import { getConversationKey, nip44Decrypt, nip44Encrypt } from "./nip44";

/**
 * NSP-15 Social lists. Follows of ORGS are a public NIP-02 contact list; mutes (NIP-51 kind
 * 10000) and the "unfollowed" follow set (kind 30000, d=netizen-unfollowed) live ONLY in the
 * NIP-44 private part, encrypted to the author. Persons are referenced by account uuid
 * (`netizen_account`), never by npub, so no list publishes the wallet-npub link.
 */
export const KIND_CONTACTS = 3;
export const KIND_MUTE_LIST = 10000;
export const KIND_FOLLOW_SET = 30000;
export const NETIZEN_ACCOUNT_TAG = "netizen_account";
export const UNFOLLOWED_SET_D = "netizen-unfollowed";

export function buildContactListEvent(secretKey: Uint8Array, pubkeys: string[], opts: { createdAt?: number } = {}): NostrEvent {
  const tags = [...new Set(pubkeys.map((p) => p.toLowerCase()))].map((p) => ["p", p]);
  return buildEvent(secretKey, KIND_CONTACTS, "", { tags, createdAt: opts.createdAt });
}

export function buildPrivateListEvent(
  secretKey: Uint8Array,
  kind: typeof KIND_MUTE_LIST | typeof KIND_FOLLOW_SET,
  items: string[][],
  opts: { d?: string; createdAt?: number } = {},
): NostrEvent {
  const self = getPublicKeyHex(secretKey);
  const content = nip44Encrypt(JSON.stringify(items), getConversationKey(secretKey, self));
  return buildEvent(secretKey, kind, content, { tags: opts.d ? [["d", opts.d]] : [], createdAt: opts.createdAt });
}

export function readPrivateItems(secretKey: Uint8Array, event: NostrEvent): string[][] {
  if (!event.content) return [];
  const items = JSON.parse(nip44Decrypt(event.content, getConversationKey(secretKey, getPublicKeyHex(secretKey))));
  return Array.isArray(items) ? items.filter((t): t is string[] => Array.isArray(t)) : [];
}
