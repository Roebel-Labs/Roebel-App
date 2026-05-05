import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOTIFICATION_PROMPT_PENDING_KEY = '@roebel/onboarding/notification-prompt-pending';

export async function setNotificationPromptPending() {
  try {
    await AsyncStorage.setItem(NOTIFICATION_PROMPT_PENDING_KEY, '1');
  } catch (err) {
    console.error('Failed to set notification-prompt flag:', err);
  }
}

export async function isNotificationPromptPending(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(NOTIFICATION_PROMPT_PENDING_KEY);
    return value === '1';
  } catch (err) {
    console.error('Failed to read notification-prompt flag:', err);
    return false;
  }
}

export async function clearNotificationPromptPending() {
  try {
    await AsyncStorage.removeItem(NOTIFICATION_PROMPT_PENDING_KEY);
  } catch (err) {
    console.error('Failed to clear notification-prompt flag:', err);
  }
}
