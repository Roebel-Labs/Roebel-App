import type { FollowSuggestion } from './supabase-follows';

export function splitSelection(all: string[], unticked: Set<string>): { follow: string[]; unfollow: string[] } {
  return { follow: all.filter((id) => !unticked.has(id)), unfollow: all.filter((id) => unticked.has(id)) };
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Organisations first, people after; the server's ranking is kept within each group (stable sort). */
export function orgsFirst<T extends { account_type: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(b.account_type === 'organisation') - Number(a.account_type === 'organisation'));
}

export function filterSuggestions(list: FollowSuggestion[], query: string): FollowSuggestion[] {
  const q = fold(query.trim());
  return q ? list.filter((s) => fold(s.name).includes(q)) : list;
}

type FollowFn = (ids: string[], source: 'onboarding' | 'manual' | 'intro') => Promise<boolean>;
type UnfollowFn = (ids: string[]) => Promise<boolean>;

/** Submits a selection; never throws, so callers (onboarding!) can't be blocked by it. */
export async function submitFollowSelection(
  all: string[],
  unticked: Set<string>,
  source: 'onboarding' | 'intro',
  follow: FollowFn,
  unfollow: UnfollowFn,
): Promise<boolean> {
  try {
    const { follow: toFollow, unfollow: toUnfollow } = splitSelection(all, unticked);
    let ok = true;
    if (toFollow.length) ok = (await follow(toFollow, source)) && ok;
    if (toUnfollow.length) ok = (await unfollow(toUnfollow)) && ok;
    return ok;
  } catch (err) {
    console.error('follow selection failed (non-fatal):', err);
    return false;
  }
}
