import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserRecord } from '@/lib/types';

const CACHED_USER_KEY = '@cached_user';

/**
 * Last successfully-synced user record, persisted locally so the app can render
 * the personalized feed (tier / citizen tabs / likes) immediately on cold start —
 * before thirdweb finishes reconnecting the wallet. The cache is reconciled with
 * fresh data once `useActiveAccount()` resolves; see UserContext.
 */
export async function loadCachedUser(): Promise<UserRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.wallet_address === 'string') {
      return parsed as UserRecord;
    }
    return null;
  } catch {
    // Missing or malformed value — treat as no cache.
    return null;
  }
}

export async function saveCachedUser(user: UserRecord | null): Promise<void> {
  try {
    if (user?.wallet_address) {
      await AsyncStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    } else {
      await AsyncStorage.removeItem(CACHED_USER_KEY);
    }
  } catch {
    // Non-fatal: optimistic hydration just won't be available next launch.
  }
}
