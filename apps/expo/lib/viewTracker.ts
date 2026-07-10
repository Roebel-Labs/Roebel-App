import { supabase } from './supabase';

/**
 * X-style impression tracking: every viewport appearance of a post counts,
 * batched into one RPC call. No session dedup (counts grow fast by design) —
 * only a small per-post throttle so scroll jitter doesn't multi-count within
 * seconds. Best-effort: failures are swallowed, nothing retries.
 */
const FLUSH_DELAY_MS = 3000;
const FLUSH_THRESHOLD = 10;
const PER_POST_THROTTLE_MS = 10_000;

let wallet: string | null = null;
const lastCounted = new Map<string, number>();
const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function setViewTrackerWallet(w?: string | null): void {
  wallet = w ? w.toLowerCase() : null;
}

/** Clear all tracker state (throttle map, queue, timer). Used by tests. */
export function resetViewTracker(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  lastCounted.clear();
  pending.clear();
}

export function trackPostViews(ids: string[]): void {
  if (!wallet || ids.length === 0) return;
  const now = Date.now();
  for (const id of ids) {
    if (!id || pending.has(id)) continue;
    const last = lastCounted.get(id);
    if (last !== undefined && now - last < PER_POST_THROTTLE_MS) continue;
    lastCounted.set(id, now);
    pending.add(id);
  }
  if (pending.size >= FLUSH_THRESHOLD) {
    flushPostViews();
    return;
  }
  if (!timer && pending.size > 0) {
    timer = setTimeout(flushPostViews, FLUSH_DELAY_MS);
  }
}

export function flushPostViews(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!wallet || pending.size === 0) return;
  const ids = Array.from(pending);
  pending.clear();
  supabase
    .rpc('increment_post_views', { p_post_ids: ids, p_wallet: wallet })
    .then(({ error }: { error: unknown }) => {
      if (error && __DEV__) console.warn('[viewTracker] flush failed', error);
    });
}
