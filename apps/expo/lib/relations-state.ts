// Pure follow/mute state: which authors the viewer hides, and how a change updates the snapshot.
// No React, no storage — RelationsContext and the tests share it.

export type RelationsSnapshot = {
  following: string[];
  unfollowed: string[];
  muted: string[];
  unfollowedWallets: string[];
  mutedWallets: string[];
};

export const EMPTY_SNAPSHOT: RelationsSnapshot = {
  following: [], unfollowed: [], muted: [], unfollowedWallets: [], mutedWallets: [],
};

export type HiddenIndex = {
  feedIds: Set<string>;
  feedWallets: Set<string>;
  mutedIds: Set<string>;
  mutedWallets: Set<string>;
};

export type RelationChange =
  | { kind: 'follow'; ids: string[] }
  | { kind: 'unfollow'; ids: string[] }
  | { kind: 'mute'; id: string; wallet?: string | null }
  | { kind: 'unmute'; id: string; wallet?: string | null };

type Author = { account_id?: string | null; wallet_address?: string | null };

const lower = (w: string) => w.toLowerCase();
const uniq = (xs: string[]) => [...new Set(xs)];
const without = (xs: string[], drop: string[]) => xs.filter((x) => !drop.includes(x));

export function buildHiddenIndex(s: RelationsSnapshot): HiddenIndex {
  return {
    feedIds: new Set([...s.unfollowed, ...s.muted]),
    feedWallets: new Set([...s.unfollowedWallets, ...s.mutedWallets].map(lower)),
    mutedIds: new Set(s.muted),
    mutedWallets: new Set(s.mutedWallets.map(lower)),
  };
}

export function hiddenAccountIds(s: RelationsSnapshot): string[] {
  return uniq([...s.unfollowed, ...s.muted]).sort();
}

// A wallet match only applies when the row has no account_id: with an account_id the row
// says exactly which identity posted (a person posting as their org is the org).
function matches(ids: Set<string>, wallets: Set<string>, a: Author): boolean {
  if (a.account_id) return ids.has(a.account_id);
  return !!a.wallet_address && wallets.has(lower(a.wallet_address));
}

export function isAuthorHiddenInFeed(i: HiddenIndex, a: Author): boolean {
  return matches(i.feedIds, i.feedWallets, a);
}

export function isAuthorMuted(i: HiddenIndex, a: Author): boolean {
  if (a.account_id && i.mutedIds.has(a.account_id)) return true;
  return !!a.wallet_address && i.mutedWallets.has(lower(a.wallet_address));
}

export function applyRelationChange(s: RelationsSnapshot, c: RelationChange): RelationsSnapshot {
  switch (c.kind) {
    case 'follow':
      return { ...s, following: uniq([...s.following, ...c.ids]), unfollowed: without(s.unfollowed, c.ids) };
    case 'unfollow':
      return { ...s, following: without(s.following, c.ids), unfollowed: uniq([...s.unfollowed, ...c.ids]) };
    case 'mute':
      return {
        ...s,
        muted: uniq([...s.muted, c.id]),
        mutedWallets: c.wallet ? uniq([...s.mutedWallets, lower(c.wallet)]) : s.mutedWallets,
      };
    case 'unmute':
      return {
        ...s,
        muted: without(s.muted, [c.id]),
        mutedWallets: c.wallet ? without(s.mutedWallets, [lower(c.wallet)]) : s.mutedWallets,
      };
  }
}
