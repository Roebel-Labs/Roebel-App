// Gemeinschaftskasse contributions ("Unterstützen") — API client.
//
// Three rails, all landing in the transparent treasury Safe on Gnosis:
//   1. Stripe Checkout (cards / Apple Pay / Google Pay) via the web backend,
//      opened in the in-app browser sheet (mirrors roebel-card-topup.ts).
//   2. SEPA transfer to the Monerium IBAN — the app shows the bank details
//      plus a personal reference code (RBL-XXXXXX) for attribution.
//   3. Direct on-chain transfer to the Safe.
//
// Config comes from GET /api/donate/config (app_settings-backed kill switch:
// donations_enabled + donation_iban/bic/recipient).

import * as WebBrowser from 'expo-web-browser';

const DEFAULT_API_BASE_URL = 'https://roebel.app';

function getApiBaseUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (env && env.length > 0) return env.replace(/\/$/, '');
  return DEFAULT_API_BASE_URL;
}

export interface DonationConfig {
  enabled: boolean;
  iban: string | null;
  bic: string | null;
  recipient: string | null;
  presets_cents: number[];
  min_cents: number;
  max_cents: number;
  treasury_safe: string;
}

export async function fetchDonationConfig(): Promise<DonationConfig | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/donate/config`);
    if (!res.ok) return null;
    return (await res.json()) as DonationConfig;
  } catch (err) {
    console.error('fetchDonationConfig error:', err);
    return null;
  }
}

/**
 * Personal SEPA reference code for the Verwendungszweck. One persistent
 * code per wallet; the display name refreshes on each call so attribution
 * uses the latest profile name.
 */
export async function fetchDonationReference(input: {
  walletAddress?: string | null;
  displayName?: string | null;
}): Promise<string | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/donate/reference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(input.walletAddress ? { wallet_address: input.walletAddress } : {}),
        ...(input.displayName ? { display_name: input.displayName } : {}),
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { code?: string };
    return body.code ?? null;
  } catch (err) {
    console.error('fetchDonationReference error:', err);
    return null;
  }
}

export interface CreateDonationCheckoutInput {
  amountCents: number;
  donorName?: string | null;
  walletAddress?: string | null;
}

export interface CreateDonationCheckoutResponse {
  url: string;
  session_id: string;
  donation_id: string;
  amount_cents: number;
}

export async function createDonationCheckout(
  input: CreateDonationCheckoutInput,
): Promise<CreateDonationCheckoutResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/donate/create-checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount_cents: input.amountCents,
      ...(input.donorName ? { donor_name: input.donorName } : {}),
      ...(input.walletAddress ? { wallet_address: input.walletAddress } : {}),
      locale: 'de',
    }),
  });

  if (!res.ok) {
    let message = `Zahlung konnte nicht gestartet werden (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { error?: string; details?: string | null };
      if (body?.error) message = friendlyError(body.error);
    } catch {
      // Non-JSON error body — keep the default message.
    }
    throw new Error(message);
  }

  return (await res.json()) as CreateDonationCheckoutResponse;
}

/** Opens the Stripe Checkout URL in the in-app browser sheet. */
export async function openDonationCheckout(
  url: string,
): Promise<WebBrowser.WebBrowserResult> {
  return WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
    dismissButtonStyle: 'close',
  });
}

function friendlyError(code: string): string {
  switch (code) {
    case 'donations_disabled':
      return 'Beiträge sind aktuell nicht möglich.';
    case 'amount_required':
      return 'Bitte wähle einen Betrag.';
    case 'amount_too_small':
      return 'Der Mindestbetrag beträgt 1 €.';
    case 'amount_too_large':
      return 'Der Höchstbetrag beträgt 5.000 €.';
    case 'stripe_error':
      return 'Zahlung bei Stripe konnte nicht gestartet werden.';
    default:
      return 'Etwas ist schiefgelaufen.';
  }
}
