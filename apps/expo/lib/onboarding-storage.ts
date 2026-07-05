import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CitizenIdentity } from '@/lib/verification-types';

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

/** Bürger onboarding: identity draft kept ONLY on-device so a failed auto-submit
 *  can prefill the manual request form. Cleared on successful submission. */
export const CITIZEN_DRAFT_KEY = '@roebel/onboarding/citizen-draft';

export async function saveCitizenDraft(draft: CitizenIdentity): Promise<void> {
  try {
    await AsyncStorage.setItem(CITIZEN_DRAFT_KEY, JSON.stringify(draft));
  } catch (err) {
    console.error('Failed to save citizen draft:', err);
  }
}

export async function loadCitizenDraft(): Promise<CitizenIdentity | null> {
  try {
    const raw = await AsyncStorage.getItem(CITIZEN_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.firstName === 'string' &&
      typeof parsed?.lastName === 'string' &&
      typeof parsed?.birthdate === 'string' &&
      typeof parsed?.address === 'string'
    ) {
      return parsed as CitizenIdentity;
    }
    return null;
  } catch (err) {
    console.error('Failed to load citizen draft:', err);
    return null;
  }
}

export async function clearCitizenDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CITIZEN_DRAFT_KEY);
  } catch (err) {
    console.error('Failed to clear citizen draft:', err);
  }
}
