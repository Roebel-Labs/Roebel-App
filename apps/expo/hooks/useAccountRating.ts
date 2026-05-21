import { useCallback, useEffect, useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import type { AccountRatingRecord, AccountRatingSummary } from '@/lib/types';
import {
  deleteAccountRating,
  fetchAccountRatingSummary,
  fetchUserRatingForAccount,
  upsertAccountRating,
} from '@/lib/supabase-ratings';

type UseAccountRating = {
  summary: AccountRatingSummary | null;
  userRating: AccountRatingRecord | null;
  loading: boolean;
  isSignedIn: boolean;
  setRating: (stars: number, comment?: string | null) => Promise<void>;
  removeRating: () => Promise<void>;
  refetch: () => Promise<void>;
};

export function useAccountRating(accountId: string | null | undefined): UseAccountRating {
  const account = useActiveAccount();
  const wallet = account?.address ?? null;

  const [summary, setSummary] = useState<AccountRatingSummary | null>(null);
  const [userRating, setUserRating] = useState<AccountRatingRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accountId) { setLoading(false); return; }
    setLoading(true);
    const [s, u] = await Promise.all([
      fetchAccountRatingSummary(accountId),
      wallet ? fetchUserRatingForAccount(accountId, wallet) : Promise.resolve(null),
    ]);
    setSummary(s);
    setUserRating(u);
    setLoading(false);
  }, [accountId, wallet]);

  useEffect(() => { void load(); }, [load]);

  const setRating = useCallback(async (stars: number, comment?: string | null) => {
    if (!accountId || !wallet) return;
    // Optimistic local update.
    setUserRating((prev) => ({
      id: prev?.id ?? 'pending',
      account_id: accountId,
      wallet_address: wallet.toLowerCase(),
      stars,
      comment: comment ?? null,
      created_at: prev?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    const saved = await upsertAccountRating({ account_id: accountId, wallet_address: wallet, stars, comment: comment ?? null });
    if (saved) setUserRating(saved);
    const s = await fetchAccountRatingSummary(accountId);
    setSummary(s);
  }, [accountId, wallet]);

  const removeRating = useCallback(async () => {
    if (!accountId || !wallet) return;
    setUserRating(null);
    await deleteAccountRating(accountId, wallet);
    const s = await fetchAccountRatingSummary(accountId);
    setSummary(s);
  }, [accountId, wallet]);

  return {
    summary,
    userRating,
    loading,
    isSignedIn: !!wallet,
    setRating,
    removeRating,
    refetch: load,
  };
}
