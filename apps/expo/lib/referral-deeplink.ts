import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_KEY = '@rewards/pending_referral_code';

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
