/**
 * Re-engagement cadence for the push-notification opt-in bottom sheet.
 *
 * The sheet is shown to every user whose push is not active (OS permission
 * granted AND push consent on). To avoid nagging, a dismissal starts a
 * cooldown before the sheet may appear again.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_DISMISSED_KEY = '@roebel/notification-prompt/last-dismissed-at';

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function isNotificationPromptDue(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(LAST_DISMISSED_KEY);
    if (!raw) return true;
    const lastDismissedAt = Number(raw);
    if (!Number.isFinite(lastDismissedAt)) return true;
    return Date.now() - lastDismissedAt >= COOLDOWN_MS;
  } catch (err) {
    console.error('Failed to read notification-prompt cooldown:', err);
    return false;
  }
}

export async function markNotificationPromptDismissed(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_DISMISSED_KEY, String(Date.now()));
  } catch (err) {
    console.error('Failed to save notification-prompt cooldown:', err);
  }
}
