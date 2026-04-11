// Röbel Card top-up — programmatic Stripe checkout.
//
// Calls POST /api/roebel-card/create-checkout-session on the web
// backend, which inserts a pending roebel_card_purchases row and creates
// a Stripe Checkout Session with rich metadata (wallet, amount, fee,
// Verein beneficiary, purchase_id). The returned URL is opened in the
// in-app browser sheet. The webhook credits the card on success.
//
// The success_url configured server-side is:
//   roebel://roebel-card/topup-success?session_id=<session_id>
// so the buyer returns to the in-app polling screen after payment.

import * as WebBrowser from 'expo-web-browser';

const DEFAULT_API_BASE_URL = 'https://roebel.app';

function getApiBaseUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (env && env.length > 0) return env.replace(/\/$/, '');
  return DEFAULT_API_BASE_URL;
}

export interface CreateCheckoutInput {
  walletAddress: string;
  amountCents: number;
  /** UUID of a verified Verein account, or null for Röbeler Topf. */
  beneficiaryAccountId: string | null;
  locale?: 'de' | 'en';
}

export interface CreateCheckoutResponse {
  url: string;
  session_id: string;
  purchase_id: string;
  amount_cents: number;
  fee_cents: number;
  total_cents: number;
}

/**
 * Ask the web backend to create a fresh Stripe Checkout Session and
 * return its hosted URL. Throws on any 4xx/5xx.
 */
export async function createRoebelCardCheckout(
  input: CreateCheckoutInput,
): Promise<CreateCheckoutResponse> {
  const url = `${getApiBaseUrl()}/api/roebel-card/create-checkout-session`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_address: input.walletAddress,
      amount_cents: input.amountCents,
      beneficiary_account_id: input.beneficiaryAccountId,
      locale: input.locale ?? 'de',
    }),
  });

  if (!res.ok) {
    let message = `Checkout konnte nicht erstellt werden (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as {
        error?: string;
        details?: string | null;
      };
      if (body?.error) {
        message = friendlyError(body.error);
        // Append the raw server-side error so the user can see Postgres /
        // Stripe details in the Alert on preview builds where console
        // logs aren't visible.
        if (body.details) {
          message += `\n\n(${body.details})`;
        }
      }
    } catch {
      // Non-JSON error body — fall through to the default message.
    }
    throw new Error(message);
  }

  return (await res.json()) as CreateCheckoutResponse;
}

/**
 * Opens the Stripe Checkout Session URL in the in-app browser sheet.
 * The caller is responsible for navigating to /roebel-card/topup-success
 * after this resolves so the polling UI can pick up the webhook-credited
 * balance.
 */
export async function openRoebelCardCheckout(
  url: string,
): Promise<WebBrowser.WebBrowserResult> {
  return WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
    dismissButtonStyle: 'close',
  });
}

function friendlyError(code: string): string {
  switch (code) {
    case 'amount_required':
      return 'Bitte wähle einen Betrag.';
    case 'amount_too_small':
      return 'Der Mindestbetrag beträgt 5 €.';
    case 'amount_too_large':
      return 'Der Höchstbetrag beträgt 500 €.';
    case 'wallet_required':
      return 'Dein Wallet konnte nicht ermittelt werden.';
    case 'beneficiary_lookup_failed':
      return 'Der gewählte Verein konnte nicht geprüft werden.';
    case 'purchase_insert_failed':
      return 'Der Antrag konnte nicht vorbereitet werden.';
    case 'card_lookup_failed':
      return 'Deine Röbel Card konnte nicht geladen werden.';
    case 'card_provision_failed':
      return 'Deine Röbel Card konnte nicht erstellt werden.';
    case 'stripe_error':
      return 'Zahlung bei Stripe konnte nicht gestartet werden.';
    default:
      return 'Etwas ist schiefgelaufen.';
  }
}
