import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Account } from '@/lib/types';

const CACHED_ACCOUNTS_KEY = '@cached_accounts';

export type CachedAccounts = {
  walletAddress: string;
  activeAccount: Account | null;
  ownedAccounts: Account[];
  savedAt: number;
};

/**
 * Last successfully-loaded accounts for a wallet, persisted so AccountContext
 * (and everything gated on activeAccount — chat, org UI) hydrates instantly on
 * cold start instead of waiting for the fetchOwnedAccounts round-trip behind
 * the thirdweb reconnect. Reconciled with fresh data once refreshAccounts
 * lands; cleared on logout.
 */
export async function loadCachedAccounts(): Promise<CachedAccounts | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_ACCOUNTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.walletAddress === 'string' &&
      Array.isArray(parsed.ownedAccounts)
    ) {
      return parsed as CachedAccounts;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveCachedAccounts(bundle: CachedAccounts): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHED_ACCOUNTS_KEY, JSON.stringify(bundle));
  } catch {
    // Non-fatal.
  }
}

export async function clearCachedAccounts(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHED_ACCOUNTS_KEY);
  } catch {
    // Non-fatal.
  }
}
