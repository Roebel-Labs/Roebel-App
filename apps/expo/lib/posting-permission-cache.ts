import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PostingStatus } from '@/hooks/usePostingPermission';

const CACHED_POSTING_STATUS_KEY_PREFIX = '@cached_posting_status_';

// AsyncStorage/JSON can't carry `Date` — the time-carrying states
// (`account_too_young`, `rate_limited`) are stored with `unlockAt` as an ISO
// string and rehydrated back into a `Date` on load.
type SerializedPostingStatus =
  | { kind: 'loading' }
  | { kind: 'unknown_user' }
  | {
      kind: 'allowed';
      tier: 'citizen' | 'tourist';
      remainingToday?: number;
      remainingWeek?: number;
    }
  | { kind: 'needs_location' }
  | { kind: 'account_too_young'; unlockAt: string }
  | { kind: 'rate_limited'; scope: 'day' | 'week'; unlockAt: string };

type CachedPostingStatus = {
  status: SerializedPostingStatus;
  savedAt: number;
};

function cacheKey(wallet: string): string {
  return `${CACHED_POSTING_STATUS_KEY_PREFIX}${wallet.toLowerCase()}`;
}

function serializeStatus(status: PostingStatus): SerializedPostingStatus {
  switch (status.kind) {
    case 'account_too_young':
      return { kind: 'account_too_young', unlockAt: status.unlockAt.toISOString() };
    case 'rate_limited':
      return {
        kind: 'rate_limited',
        scope: status.scope,
        unlockAt: status.unlockAt.toISOString(),
      };
    default:
      return status;
  }
}

// Loose shape validation (mirrors lib/role-cache.ts) — just enough to keep a
// malformed/old-shape entry from crashing the hook; doesn't re-verify every
// field's exact type.
function isValidSerializedStatus(value: unknown): value is SerializedPostingStatus {
  if (!value || typeof value !== 'object') return false;
  const kind = (value as Record<string, unknown>).kind;
  switch (kind) {
    case 'loading':
    case 'unknown_user':
    case 'needs_location':
      return true;
    case 'allowed':
      return typeof (value as Record<string, unknown>).tier === 'string';
    case 'account_too_young':
      return typeof (value as Record<string, unknown>).unlockAt === 'string';
    case 'rate_limited':
      return (
        typeof (value as Record<string, unknown>).unlockAt === 'string' &&
        ((value as Record<string, unknown>).scope === 'day' ||
          (value as Record<string, unknown>).scope === 'week')
      );
    default:
      return false;
  }
}

function deserializeStatus(raw: SerializedPostingStatus): PostingStatus {
  switch (raw.kind) {
    case 'account_too_young':
      return { kind: 'account_too_young', unlockAt: new Date(raw.unlockAt) };
    case 'rate_limited':
      return { kind: 'rate_limited', scope: raw.scope, unlockAt: new Date(raw.unlockAt) };
    default:
      return raw;
  }
}

/**
 * Last successfully-resolved posting-permission status for a wallet,
 * persisted so the composer's `PostingGate` (components/feed/PostingGate.tsx)
 * can render instantly on mount instead of showing the "Lade…" gate behind
 * every `get_posting_status` RPC round-trip. Reconciled with a fresh RPC
 * result once it lands — the RPC result always wins.
 *
 * Callers MUST apply the stale-cooldown guard themselves: `account_too_young`
 * / `rate_limited` carry an `unlockAt` timestamp, and a cached entry whose
 * `unlockAt` is already in the past is stale (the cooldown may well be over)
 * — never show it, let the RPC decide instead. This module only restores the
 * shape; it doesn't know "now" at read time in a way that should gate the
 * cache entry's existence.
 */
export async function loadCachedPostingStatus(wallet: string): Promise<PostingStatus | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      isValidSerializedStatus((parsed as Record<string, unknown>).status)
    ) {
      return deserializeStatus((parsed as CachedPostingStatus).status);
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveCachedPostingStatus(
  wallet: string,
  status: PostingStatus
): Promise<void> {
  try {
    // Nothing useful to persist for the transient loading state.
    if (status.kind === 'loading') return;
    const bundle: CachedPostingStatus = { status: serializeStatus(status), savedAt: Date.now() };
    await AsyncStorage.setItem(cacheKey(wallet), JSON.stringify(bundle));
  } catch {
    // Non-fatal.
  }
}
