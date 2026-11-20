// Newsletter sign-up from the app. The web backend runs the double opt-in:
// the address only receives mail after the link in the confirmation mail was tapped.

const DEFAULT_API_BASE_URL = 'https://roebel.app';
const REQUEST_TIMEOUT_MS = 15_000;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** `news_articles.category` of the "Was ist neu" posts. */
export const APP_UPDATE_CATEGORY = 'App-Update';

function getApiBaseUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (env && env.length > 0) return env.replace(/\/$/, '');
  return DEFAULT_API_BASE_URL;
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export type NewsletterSignupResult = { success: boolean; message: string };

export async function subscribeToNewsletter(email: string): Promise<NewsletterSignupResult> {
  // fetch in React Native never times out on its own.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/newsletter/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as Partial<NewsletterSignupResult> | null;
    if (json && typeof json.message === 'string') {
      return { success: json.success === true, message: json.message };
    }
    return { success: false, message: 'Die Anmeldung hat nicht geklappt. Bitte versuche es später noch einmal.' };
  } catch {
    return { success: false, message: 'Keine Verbindung. Bitte versuche es später noch einmal.' };
  } finally {
    clearTimeout(timer);
  }
}
