import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';

const PENDING_KEY = '@rewards/pending_referral_code';
const CLIPBOARD_CHECKED_KEY = '@rewards/clipboard_referral_checked';

/**
 * Parse a URL (custom scheme or universal link) and return the referral code
 * if it matches `/r/<code>`. Returns null otherwise.
 */
export function extractReferralCode(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    // Match `/r/<code>` anywhere in the path (tolerant of scheme and host).
    const match = url.match(/\/r\/([A-Za-z0-9-]+)/);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

export async function storePendingReferralCode(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, code);
  } catch {
    // non-fatal
  }
}

export async function consumePendingReferralCode(): Promise<string | null> {
  try {
    const code = await AsyncStorage.getItem(PENDING_KEY);
    if (code) await AsyncStorage.removeItem(PENDING_KEY);
    return code;
  } catch {
    return null;
  }
}

export async function peekPendingReferralCode(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

/**
 * Deferred deep linking: when a new user installs the app from the store after
 * tapping a `https://www.roebel.app/r/<code>` link, the OS does not carry the
 * link through the install, so the deep-link handler never fires. The web
 * landing page copies the invite URL to the clipboard before redirecting to the
 * store, so on the very first launch we read the clipboard once and store any
 * referral code we find as the pending code for the normal redemption flow.
 *
 * Runs at most once per install (guarded by a flag) to respect privacy and
 * avoid grabbing unrelated clipboard content on later launches. Only a value
 * matching the `/r/<code>` URL shape is accepted, never arbitrary text.
 */
export async function checkClipboardForReferral(): Promise<void> {
  try {
    // Already captured a code via a real deep link — nothing to do.
    if (await peekPendingReferralCode()) return;
    // Only ever read the clipboard once.
    if (await AsyncStorage.getItem(CLIPBOARD_CHECKED_KEY)) return;
    await AsyncStorage.setItem(CLIPBOARD_CHECKED_KEY, '1');

    const contents = await Clipboard.getStringAsync();
    const code = extractReferralCode(contents);
    if (code) {
      await storePendingReferralCode(code);
    }
  } catch {
    // non-fatal — manual code entry on the referral screen is the fallback
  }
}
