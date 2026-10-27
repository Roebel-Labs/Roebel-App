import { useMemo, useState } from 'react';

// FNV-1a: cheap, well-spread 32-bit string hash.
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Random order that is fixed for the lifetime of the component: each item is
 * ranked by hash(seed + key) with a seed picked on mount. A background refetch
 * that returns the same items keeps the same order (no cards jumping under the
 * user's thumb), while the next visit to the screen gets a fresh order.
 */
export function useShuffled<T>(items: T[], keyOf: (item: T) => string): T[] {
  const [seed] = useState(() => Math.random().toString(36).slice(2));
  return useMemo(
    () =>
      items
        .map((item) => ({ item, rank: hash(seed + keyOf(item)) }))
        .sort((a, b) => a.rank - b.rank)
        .map(({ item }) => item),
    // keyOf is expected to be a stable module-level function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, seed]
  );
}
