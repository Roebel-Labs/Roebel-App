import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from '@/lib/storage/secureStorage';
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
 *  can prefill the manual request form. Name, birthdate and address are personal
 *  data, so the draft lives in SecureStore (Keychain / EncryptedSharedPreferences),
 *  like the citizen preimage, and expires after CITIZEN_DRAFT_MAX_AGE_MS.
 *  Cleared on successful submission and on account deletion. */
export const CITIZEN_DRAFT_KEY = 'citizen_draft_v1';
/** Where older builds kept the draft as plain JSON in AsyncStorage. */
export const LEGACY_CITIZEN_DRAFT_KEY = '@roebel/onboarding/citizen-draft';
export const CITIZEN_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type StoredDraft = { draft: CitizenIdentity; savedAt: number };

function isCitizenIdentity(value: unknown): value is CitizenIdentity {
  const v = value as Partial<CitizenIdentity> | null;
  return (
    typeof v?.firstName === 'string' &&
    typeof v?.lastName === 'string' &&
    typeof v?.birthdate === 'string' &&
    typeof v?.address === 'string'
  );
}

export async function saveCitizenDraft(draft: CitizenIdentity): Promise<void> {
  try {
    const stored: StoredDraft = { draft, savedAt: Date.now() };
    await SecureStore.setItemAsync(CITIZEN_DRAFT_KEY, JSON.stringify(stored));
  } catch (err) {
    console.error('Failed to save citizen draft:', err);
  }
}

/** Move a plain-text draft from an older build into SecureStore, once. */
async function migrateLegacyDraft(): Promise<void> {
  const raw = await AsyncStorage.getItem(LEGACY_CITIZEN_DRAFT_KEY);
  if (raw === null) return;
  await AsyncStorage.removeItem(LEGACY_CITIZEN_DRAFT_KEY);
  try {
    const parsed = JSON.parse(raw);
    if (isCitizenIdentity(parsed)) await saveCitizenDraft(parsed);
  } catch {
    // Corrupt legacy entry: it is gone now, nothing to move.
  }
}

export async function loadCitizenDraft(): Promise<CitizenIdentity | null> {
  try {
    await migrateLegacyDraft();
    const raw = await SecureStore.getItemAsync(CITIZEN_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (!isCitizenIdentity(parsed?.draft) || typeof parsed?.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > CITIZEN_DRAFT_MAX_AGE_MS) {
      await clearCitizenDraft();
      return null;
    }
    return parsed.draft;
  } catch (err) {
    console.error('Failed to load citizen draft:', err);
    return null;
  }
}

export async function clearCitizenDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CITIZEN_DRAFT_KEY);
    await AsyncStorage.removeItem(LEGACY_CITIZEN_DRAFT_KEY);
  } catch (err) {
    console.error('Failed to clear citizen draft:', err);
  }
}
