import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ConversationWithLastMessage } from '@/lib/supabase-messages';

const key = (accountId: string) => `@cached_inbox_${accountId}`;

/**
 * Last successfully-loaded inbox for an account, persisted so the chat list
 * renders instantly on cold start instead of spinning through the
 * wallet-reconnect → accounts → conversations chain. Reconciled with fresh
 * data as soon as the real load lands; see MessagingContext.
 */
export async function loadCachedInbox(
  accountId: string
): Promise<ConversationWithLastMessage[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ConversationWithLastMessage[]) : null;
  } catch {
    return null;
  }
}

export async function saveCachedInbox(
  accountId: string,
  rows: ConversationWithLastMessage[]
): Promise<void> {
  try {
    await AsyncStorage.setItem(key(accountId), JSON.stringify(rows));
  } catch {
    // Non-fatal: cold-start hydration just won't be available next launch.
  }
}
