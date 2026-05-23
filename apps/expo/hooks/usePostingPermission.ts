import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';

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

/**
 * Reads the gate state for the current wallet from `public.get_posting_status`.
 *
 * Citizens always return `{ kind: 'allowed', tier: 'citizen' }`. Non-citizens
 * progress through `needs_location` → `account_too_young` → `rate_limited` →
 * `allowed` as they pass each gate.
 */
export function usePostingPermission(): {
  status: PostingStatus;
  refresh: () => Promise<void>;
} {
  const { user } = useUser();
  const wallet = user?.wallet_address || null;
  const [status, setStatus] = useState<PostingStatus>({ kind: 'loading' });

  const refresh = useCallback(async () => {
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
    setStatus(mapStatus(data as RawStatus | null));
  }, [wallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, refresh };
}
