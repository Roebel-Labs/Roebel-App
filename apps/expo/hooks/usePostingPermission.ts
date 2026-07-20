import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import { loadCachedPostingStatus, saveCachedPostingStatus } from '@/lib/posting-permission-cache';

export type PostingStatus =
  | { kind: 'loading' }
  | { kind: 'unknown_user' }
  | {
      kind: 'allowed';
      tier: 'citizen' | 'tourist';
      remainingToday?: number;
      remainingWeek?: number;
    }
  | { kind: 'needs_location' }
  | { kind: 'account_too_young'; unlockAt: Date }
  | { kind: 'rate_limited'; scope: 'day' | 'week'; unlockAt: Date };

type RawStatus = {
  kind: string;
  tier?: string;
  remaining_today?: number;
  remaining_week?: number;
  unlock_at?: string;
  scope?: 'day' | 'week';
};

function mapStatus(raw: RawStatus | null): PostingStatus {
  if (!raw || typeof raw.kind !== 'string') return { kind: 'unknown_user' };
  switch (raw.kind) {
    case 'allowed':
      return {
        kind: 'allowed',
        tier: raw.tier === 'citizen' ? 'citizen' : 'tourist',
        remainingToday: raw.remaining_today,
        remainingWeek: raw.remaining_week,
      };
    case 'needs_location':
      return { kind: 'needs_location' };
    case 'account_too_young':
      return {
        kind: 'account_too_young',
        unlockAt: raw.unlock_at ? new Date(raw.unlock_at) : new Date(),
      };
    case 'rate_limited':
      return {
        kind: 'rate_limited',
        scope: raw.scope === 'week' ? 'week' : 'day',
        unlockAt: raw.unlock_at ? new Date(raw.unlock_at) : new Date(),
      };
    default:
      return { kind: 'unknown_user' };
  }
}

const CITIZEN_ALLOWED: PostingStatus = { kind: 'allowed', tier: 'citizen' };

/**
 * Reads the gate state for the current wallet from `public.get_posting_status`.
 *
 * Citizens always return `{ kind: 'allowed', tier: 'citizen' }`. Non-citizens
 * progress through `needs_location` → `account_too_young` → `rate_limited` →
 * `allowed` as they pass each gate.
 *
 * Pass `{ bypass: true }` for callers that already know the gate doesn't apply
 * — citizens (on-chain `hasCitizenNFT` may outpace the DB `is_verified_citizen`
 * column) and org accounts (always citizen-owned). Bypass skips the RPC and
 * resolves to citizen-tier immediately, avoiding a stale-DB false negative.
 */
export function usePostingPermission(options?: { bypass?: boolean }): {
  status: PostingStatus;
  refresh: () => Promise<void>;
} {
  const bypass = options?.bypass ?? false;
  const { user } = useUser();
  const wallet = user?.wallet_address || null;
  const [status, setStatus] = useState<PostingStatus>(
    bypass ? CITIZEN_ALLOWED : { kind: 'loading' },
  );

  const refresh = useCallback(async () => {
    if (bypass) {
      setStatus(CITIZEN_ALLOWED);
      return;
    }
    if (!wallet) {
      setStatus({ kind: 'unknown_user' });
      return;
    }
    const { data, error } = await supabase.rpc('get_posting_status', {
      p_wallet: wallet,
    });
    if (error) {
      console.warn('[usePostingPermission] rpc error', error.message);
      setStatus({ kind: 'unknown_user' });
      return;
    }
    const mapped = mapStatus(data as RawStatus | null);
    setStatus(mapped);
    void saveCachedPostingStatus(wallet, mapped);
  }, [wallet, bypass]);

  // Hydrate from the on-disk cache instantly on mount so the composer's
  // PostingGate doesn't show its "Lade…" gate on every open for returning
  // tourists (citizens/orgs never reach here — they're bypassed above).
  // Applied only while still `loading` (prev-guard) — if the RPC below has
  // already resolved by the time this lands, its result always wins.
  //
  // Stale-cooldown guard: `account_too_young`/`rate_limited` carry an
  // `unlockAt` timestamp. If the cached unlock time is already in the past,
  // the cooldown may well be over — never show a stale cooldown screen, just
  // skip the cache entirely and let the RPC decide.
  useEffect(() => {
    if (bypass || !wallet) return;
    let cancelled = false;
    (async () => {
      const cached = await loadCachedPostingStatus(wallet);
      if (cancelled || !cached) return;
      if (
        (cached.kind === 'account_too_young' || cached.kind === 'rate_limited') &&
        cached.unlockAt.getTime() <= Date.now()
      ) {
        return;
      }
      setStatus((prev) => (prev.kind === 'loading' ? cached : prev));
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet, bypass]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, refresh };
}
