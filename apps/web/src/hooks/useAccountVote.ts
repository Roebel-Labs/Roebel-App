"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import {
  fetchAccountVoteSummary,
  fetchUserAccountVote,
  voteAccount,
  clearAccountVote,
  type AccountVoteSummary,
  type VoteValue,
} from "@/lib/supabase-ratings";

export function useAccountVote(accountId: string | null) {
  const account = useActiveAccount();
  const wallet = account?.address ?? null;

  const [summary, setSummary] = useState<AccountVoteSummary | null>(null);
  const [userVote, setUserVote] = useState<VoteValue | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const [s, u] = await Promise.all([
        fetchAccountVoteSummary(accountId),
        wallet ? fetchUserAccountVote(accountId, wallet) : Promise.resolve(null),
      ]);
      setSummary(s);
      setUserVote(u);
    } finally {
      setLoading(false);
    }
  }, [accountId, wallet]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const setVote = useCallback(
    async (vote: VoteValue) => {
      if (!accountId || !wallet) return;
      setUserVote(vote); // optimistic
      await voteAccount({ account_id: accountId, wallet_address: wallet, vote });
      await refetch();
    },
    [accountId, wallet, refetch]
  );

  const clearVote = useCallback(async () => {
    if (!accountId || !wallet) return;
    setUserVote(null); // optimistic
    await clearAccountVote(accountId, wallet);
    await refetch();
  }, [accountId, wallet, refetch]);

  return {
    summary,
    userVote,
    loading,
    isSignedIn: !!wallet,
    setVote,
    clearVote,
    refetch,
  };
}
