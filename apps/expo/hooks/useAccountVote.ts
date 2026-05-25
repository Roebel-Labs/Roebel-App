import { useCallback, useEffect, useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import type { AccountVoteRecord, AccountVoteSummary } from '@/lib/types';
import {
  clearAccountVote,
  fetchAccountVoteSummary,
  fetchUserAccountVote,
  voteAccount,
} from '@/lib/supabase-ratings';

type UseAccountVote = {
  summary: AccountVoteSummary | null;
  userVote: 1 | -1 | null;
  loading: boolean;
  isSignedIn: boolean;
  setVote: (vote: 1 | -1) => Promise<void>;
  clearVote: () => Promise<void>;
  refetch: () => Promise<void>;
};

/**
 * Thumbs up/down voting for an org account. Mirrors useAccountRating but for
 * the account_votes table.
 */
export function useAccountVote(accountId: string | null | undefined): UseAccountVote {
  const account = useActiveAccount();
  const wallet = account?.address ?? null;

  const [summary, setSummary] = useState<AccountVoteSummary | null>(null);
  const [userVote, setUserVote] = useState<1 | -1 | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accountId) { setLoading(false); return; }
    setLoading(true);
    const [s, u] = await Promise.all([
      fetchAccountVoteSummary(accountId),
      wallet ? fetchUserAccountVote(accountId, wallet) : Promise.resolve(null),
    ]);
    setSummary(s);
    setUserVote((u?.vote as 1 | -1 | undefined) ?? null);
    setLoading(false);
  }, [accountId, wallet]);

  useEffect(() => { void load(); }, [load]);

  const setVote = useCallback(async (vote: 1 | -1) => {
    if (!accountId || !wallet) return;
    setUserVote(vote); // optimistic
    const saved: AccountVoteRecord | null = await voteAccount({ account_id: accountId, wallet_address: wallet, vote });
    if (saved) setUserVote(saved.vote);
    setSummary(await fetchAccountVoteSummary(accountId));
  }, [accountId, wallet]);

  const clearVote = useCallback(async () => {
    if (!accountId || !wallet) return;
    setUserVote(null); // optimistic
    await clearAccountVote(accountId, wallet);
    setSummary(await fetchAccountVoteSummary(accountId));
  }, [accountId, wallet]);

  return {
    summary,
    userVote,
    loading,
    isSignedIn: !!wallet,
    setVote,
    clearVote,
    refetch: load,
  };
}
