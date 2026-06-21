// Tiny module-level TTL cache shared across requests in the Node server runtime.
// On-chain / Circles-RPC reads are cached ~60s; Supabase aggregates ~30s. A
// `?fresh=1` query param on any /api/muenzen route bypasses the cache.
type Entry = { value: unknown; expires: number };

const store = new Map<string, Entry>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  fresh = false,
): Promise<T> {
  const now = Date.now();
  if (!fresh) {
    const hit = store.get(key);
    if (hit && hit.expires > now) return hit.value as T;
  }
  const value = await fn();
  store.set(key, { value, expires: now + ttlMs });
  return value;
}

/** Drop everything (used after a write so the next read reflects the change). */
export function bustCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export const TTL = {
  chain: 60_000,
  supabase: 30_000,
} as const;
