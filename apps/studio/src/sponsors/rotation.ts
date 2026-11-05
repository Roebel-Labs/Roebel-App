import type { SponsorItem } from '../state/types';

/**
 * Index of the next partner to show after `lastIndex` (wraps; the current one is the last candidate).
 * Partners without a logo and ids in `failedIds` (logo could not be loaded) are skipped; −1 if none is usable.
 */
export function nextSpot(items: SponsorItem[], failedIds: Set<string>, lastIndex: number): number {
  const n = items.length;
  const start = lastIndex >= 0 && lastIndex < n ? lastIndex + 1 : 0;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (items[i].logoUrl && !failedIds.has(items[i].id)) return i;
  }
  return -1;
}
