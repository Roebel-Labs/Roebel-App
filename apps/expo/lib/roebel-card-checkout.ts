// Hand-off to the Röbel Card web checkout. The web checkout page itself is
// built in a later session; this helper locks in the URL contract so both
// sides can develop against the same shape.

import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

const CHECKOUT_BASE_URL = 'https://roebel.app/roebel-card/checkout';
const LEARN_MORE_URL = 'https://roebel.app/roebel-card';

export interface OpenCheckoutParams {
  walletAddress: string;
  locale?: string;
  /** Optional pre-selected denomination in cents. Reserved; unused for now. */
  amountCents?: number;
}

/**
 * Pure URL builder — unit-testable without touching expo-web-browser.
 */
export function buildCheckoutUrl({
  walletAddress,
  locale = 'de',
  amountCents,
}: OpenCheckoutParams): string {
  // createURL('/roebel-card') produces roebel://roebel-card in standalone
  // builds and exp://.../--/roebel-card in Expo Go.
  const returnTo = Linking.createURL('/roebel-card');
  const qs = new URLSearchParams({
    wallet: walletAddress,
    return_to: returnTo,
    locale,
  });
  if (amountCents !== undefined) {
    qs.set('amount_cents', String(amountCents));
  }
  return `${CHECKOUT_BASE_URL}?${qs.toString()}`;
}

/**
 * Opens the web checkout in an in-app browser sheet (form sheet on iOS,
 * Chrome Custom Tabs on Android). The user can dismiss to come back.
 */
export async function openRoebelCardCheckout(
  params: OpenCheckoutParams,
): Promise<WebBrowser.WebBrowserResult> {
  const url = buildCheckoutUrl(params);
  return WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
    dismissButtonStyle: 'close',
  });
}

/**
 * Opens the Röbel Card marketing page in the same in-app browser sheet.
 */
export async function openRoebelCardLearnMore(): Promise<WebBrowser.WebBrowserResult> {
  return WebBrowser.openBrowserAsync(LEARN_MORE_URL, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
    dismissButtonStyle: 'close',
  });
}
