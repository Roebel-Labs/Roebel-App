/**
 * Offline queue for event QR scans (spec 5.6b): a scan at the door with no network is stored on
 * the device and sent once when the connection returns or the app comes to the foreground.
 * The Münzen claim (claim-reward, server-paid, idempotent) also records the attendance the badge
 * is issued from, so sending the queued claim is all a scan needs.
 *
 * A scan leaves the queue on any definitive answer (paid, already claimed, rejected) and stays on
 * a network failure; entries older than 7 days are dropped unsent. Never logs: keys hold an address.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ClaimResult, RewardAction } from '@/lib/rewards-claim';

export const COLLECT_QUEUE_MAX_AGE_MS = 7 * 24 * 3600_000;

export type QueuedScan = { eventId: string; at: number };

export const collectQueueKey = (address: string) => `credreg:collect-queue:v1:${address.toLowerCase()}`;

/** A failure that means "no connection" (send again later), as opposed to a server answer. */
export function isNetworkFailure(r: ClaimResult): boolean {
  if (r.status !== 'failed') return false;
  return /network request failed|failed to send a request|failed to fetch|network|timed? ?out|abort/i.test(r.reason ?? '');
}

export async function readCollectQueue(address: string): Promise<QueuedScan[]> {
  try {
    const raw = await AsyncStorage.getItem(collectQueueKey(address));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is QueuedScan => !!e && typeof e.eventId === 'string' && e.eventId.length > 0 && typeof e.at === 'number' && Number.isFinite(e.at),
    );
  } catch {
    return [];
  }
}

async function writeQueue(address: string, q: QueuedScan[]): Promise<void> {
  try {
    if (q.length === 0) await AsyncStorage.removeItem(collectQueueKey(address));
    else await AsyncStorage.setItem(collectQueueKey(address), JSON.stringify(q));
  } catch {
    // best effort: a lost entry only means the person scans again
  }
}

/** One mutex per address, so enqueue and flush never interleave (foreground + back online at once). */
const locks = new Map<string, Promise<unknown>>();
function serial<T>(address: string, f: () => Promise<T>): Promise<T> {
  const key = address.toLowerCase();
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(f);
  locks.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

/** Stores a scan once (the same event twice stays one entry). */
export function enqueueCollect(address: string, eventId: string, now: number = Date.now()): Promise<void> {
  return serial(address, async () => {
    const q = await readCollectQueue(address);
    if (q.some((e) => e.eventId === eventId)) return;
    await writeQueue(address, [...q, { eventId, at: now }]);
  });
}

export type FlushDeps = {
  claim: (wallet: string, action: RewardAction, referenceId?: string) => Promise<ClaimResult>;
  now?: () => number;
  /** Called after each definitive answer (the screen nudges the badge then). */
  onAnswer?: (eventId: string, r: ClaimResult) => void;
};

/** A flush already running for an address: a second call joins it instead of sending again. */
const running = new Map<string, Promise<{ sent: number; kept: number }>>();

export function flushCollectQueue(address: string, deps: FlushDeps): Promise<{ sent: number; kept: number }> {
  const key = address.toLowerCase();
  const cur = running.get(key);
  if (cur) return cur;
  const p = runFlush(address, deps).finally(() => running.delete(key));
  running.set(key, p);
  return p;
}

function runFlush(address: string, deps: FlushDeps): Promise<{ sent: number; kept: number }> {
  return serial(address, async () => {
    const now = (deps.now ?? Date.now)();
    const q = (await readCollectQueue(address)).filter((e) => now - e.at <= COLLECT_QUEUE_MAX_AGE_MS);
    const kept: QueuedScan[] = [];
    let sent = 0;
    for (const e of q) {
      let r: ClaimResult;
      try {
        r = await deps.claim(address, 'event_attend', e.eventId);
      } catch (err) {
        r = { status: 'failed', reason: err instanceof Error ? err.message : 'network' };
      }
      if (r.status === 'failed') {
        kept.push(e);
        continue;
      }
      sent++;
      try {
        deps.onAnswer?.(e.eventId, r);
      } catch {
        // a listener never blocks the queue
      }
    }
    await writeQueue(address, kept);
    return { sent, kept: kept.length };
  });
}
