import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AccountRole } from '@/lib/supabase-account-roles';

const CACHED_ROLE_KEY_PREFIX = '@cached_role_';

type CachedRole = {
  role: AccountRole | null;
  savedAt: number;
};

function cacheKey(accountId: string, wallet: string): string {
  return `${CACHED_ROLE_KEY_PREFIX}${accountId}_${wallet.toLowerCase()}`;
}

function isValidRole(value: unknown): value is AccountRole | null {
  return value === 'owner' || value === 'admin' || value === 'member' || value === null;
}

/**
 * Last successfully-resolved role for a (account, wallet) pair, persisted so
 * AccountContext's roleInActiveAccount hydrates instantly on cold start
 * instead of starting at null (which org screens treat as "not allowed")
 * behind the getAccountRole round-trip. Reconciled with a fresh read once it
 * lands; wallet-scoped key means stale entries for other wallets are inert.
 */
export async function loadCachedRole(
  accountId: string,
  wallet: string
): Promise<AccountRole | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(accountId, wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && isValidRole(parsed.role)) {
      return (parsed as CachedRole).role;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveCachedRole(
  accountId: string,
  wallet: string,
  role: AccountRole | null
): Promise<void> {
  try {
    const bundle: CachedRole = { role, savedAt: Date.now() };
    await AsyncStorage.setItem(cacheKey(accountId, wallet), JSON.stringify(bundle));
  } catch {
    // Non-fatal.
  }
}
