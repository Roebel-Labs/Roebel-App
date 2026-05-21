import { useCallback, useEffect, useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import type { MenuItemVoteRecord, MenuItemWithDetails } from '@/lib/types';
import { fetchMenuItemDetail } from '@/lib/supabase-menu';
import {
  clearMenuItemVote,
  fetchUserMenuItemVote,
  voteMenuItem,
} from '@/lib/supabase-ratings';

type UseMenuItemDetail = {
  item: MenuItemWithDetails | null;
  loading: boolean;
  error: Error | null;
  userVote: MenuItemVoteRecord | null;
  isSignedIn: boolean;
  setVote: (vote: 1 | -1) => Promise<void>;
  clearVote: () => Promise<void>;
  refetch: () => Promise<void>;
};

export function useMenuItemDetail(itemId: string | null | undefined): UseMenuItemDetail {
  const account = useActiveAccount();
  const wallet = account?.address ?? null;

  const [item, setItem] = useState<MenuItemWithDetails | null>(null);
  const [userVote, setUserVote] = useState<MenuItemVoteRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!itemId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [detail, vote] = await Promise.all([
        fetchMenuItemDetail(itemId),
        wallet ? fetchUserMenuItemVote(itemId, wallet) : Promise.resolve(null),
      ]);
      setItem(detail);
      setUserVote(vote);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to load menu item'));
    } finally {
      setLoading(false);
    }
  }, [itemId, wallet]);

  useEffect(() => { void load(); }, [load]);

  const setVote = useCallback(async (vote: 1 | -1) => {
    if (!itemId || !wallet) return;
    setUserVote((prev) => ({
      id: prev?.id ?? 'pending',
      menu_item_id: itemId,
      wallet_address: wallet.toLowerCase(),
      vote,
      created_at: prev?.created_at ?? new Date().toISOString(),
    }));
    const saved = await voteMenuItem({ menu_item_id: itemId, wallet_address: wallet, vote });
    if (saved) setUserVote(saved);
    await load();
  }, [itemId, wallet, load]);

  const clearVote = useCallback(async () => {
    if (!itemId || !wallet) return;
    setUserVote(null);
    await clearMenuItemVote(itemId, wallet);
    await load();
  }, [itemId, wallet, load]);

  return {
    item,
    loading,
    error,
    userVote,
    isSignedIn: !!wallet,
    setVote,
    clearVote,
    refetch: load,
  };
}
