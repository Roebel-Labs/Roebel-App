// Röbel Card top-up — opens a Stripe payment link sized by denomination.
//
// The Stripe payment links are created and managed by the admin outside
// the app; each URL is injected via an EXPO_PUBLIC env var. The app
// appends ?client_reference_id=<wallet_address> so the webhook on the
// web side can associate the Stripe session with the correct card.
//
// Links must be configured in Stripe with a return URL of
//   roebel://roebel-card/topup-success
// so the buyer comes back to the in-app success screen after payment.

import * as WebBrowser from 'expo-web-browser';

export type TopUpDenomination = 10 | 25 | 50 | 100 | 'custom';

/**
 * Resolve the Stripe payment link URL for a given denomination.
 * Reads from process.env at call time (expo-constants injects
 * EXPO_PUBLIC_* vars at build time).
 */
function resolveStripeLink(denomination: TopUpDenomination): string | null {
  switch (denomination) {
    case 10:
      return process.env.EXPO_PUBLIC_STRIPE_LINK_10 ?? null;
    case 25:
      return process.env.EXPO_PUBLIC_STRIPE_LINK_25 ?? null;
    case 50:
      return process.env.EXPO_PUBLIC_STRIPE_LINK_50 ?? null;
    case 100:
      return process.env.EXPO_PUBLIC_STRIPE_LINK_100 ?? null;
    case 'custom':
      return process.env.EXPO_PUBLIC_STRIPE_LINK_CUSTOM ?? null;
  }
}

/**
 * Append ?client_reference_id=<wallet> so the Stripe webhook can credit
 * the buyer's card after payment. If the link already has query params,
 * the correct separator is used.
 */
function withClientReference(url: string, walletAddress: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}client_reference_id=${encodeURIComponent(walletAddress)}`;
}

export interface OpenTopUpParams {
  walletAddress: string;
  denomination: TopUpDenomination;
}

/**
 * Opens the Stripe payment link for the given denomination in the
 * in-app browser sheet. Returns the WebBrowser result so the caller can
 * react to cancel/dismiss.
 *
 * Throws if the EXPO_PUBLIC_STRIPE_LINK_* env var for the chosen
 * denomination is not configured — surface this as a user-facing Alert
 * at the call site.
 */
export async function openRoebelCardTopUp(
  params: OpenTopUpParams,
): Promise<WebBrowser.WebBrowserResult> {
  const baseUrl = resolveStripeLink(params.denomination);
  if (!baseUrl) {
    throw new Error(
      `Stripe Payment Link für ${params.denomination === 'custom' ? 'Freibetrag' : `${params.denomination} €`} ist nicht konfiguriert.`,
    );
  }
  const url = withClientReference(baseUrl, params.walletAddress);
  return WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
    dismissButtonStyle: 'close',
  });
}

/**
 * Pure helper used by the bottom sheet for env-availability checks —
 * lets the UI grey-out denominations whose Stripe link has not been
 * configured yet instead of waiting for the user to tap them.
 */
export function isTopUpConfigured(denomination: TopUpDenomination): boolean {
  return resolveStripeLink(denomination) !== null;
}
