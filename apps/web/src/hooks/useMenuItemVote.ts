"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import {
  fetchMenuItemVoteSummaries,
  fetchUserMenuItemVote,
  voteMenuItem,
  clearMenuItemVote,
  type MenuItemVoteSummary,
  type VoteValue,
} from "@/lib/supabase-ratings";

export function useMenuItemVote(menuItemId: string | null) {
  const account = useActiveAccount();
  const wallet = account?.address ?? null;

  const [summary, setSummary] = useState<MenuItemVoteSummary | null>(null);
  const [userVote, setUserVote] = useState<VoteValue | null>(null);

  const refetch = useCallback(async () => {
    if (!menuItemId) return;
    const [summaries, u] = await Promise.all([
      fetchMenuItemVoteSummaries([menuItemId]),
      wallet ? fetchUserMenuItemVote(menuItemId, wallet) : Promise.resolve(null),
    ]);
    setSummary(summaries[menuItemId] ?? null);
    setUserVote(u);
  }, [menuItemId, wallet]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const setVote = useCallback(
    async (vote: VoteValue) => {
      if (!menuItemId || !wallet) return;
      setUserVote(vote);
      await voteMenuItem({ menu_item_id: menuItemId, wallet_address: wallet, vote });
      await refetch();
    },
    [menuItemId, wallet, refetch]
  );

  const clearVote = useCallback(async () => {
    if (!menuItemId || !wallet) return;
    setUserVote(null);
    await clearMenuItemVote(menuItemId, wallet);
    await refetch();
  }, [menuItemId, wallet, refetch]);

  return { summary, userVote, isSignedIn: !!wallet, setVote, clearVote, refetch };
}
