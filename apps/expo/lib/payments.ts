import * as WebBrowser from 'expo-web-browser';
import { postSigned, type ApiResult, type SigningAccount } from './signed-request';

// Provider-neutral org payments (apps/web /api/payments/*). Mollie is the default rail; Stripe stays
// selectable and keeps its own flow in lib/stripe-connect.ts.

export type PaymentProviderId = 'mollie' | 'stripe';
export type OnboardingStatus = 'none' | 'needs-data' | 'in-review' | 'completed';

export interface PaymentProviderEntry {
  id: PaymentProviderId;
  /** Display name + subtitle come from the server (e.g. "Mollie" / "EU-Anbieter (Niederlande)"). */
  name: string;
  subtitle: string;
  enabled: boolean;
  connected: boolean;
  canReceivePayments: boolean;
  canReceiveSettlements: boolean;
  onboardingStatus: OnboardingStatus;
  livemode: boolean;
  dashboardUrl: string | null;
  error: string | null;
}

export interface PaymentsStatus {
  /** Mollie first (default), then Stripe. Only providers the org may use or already uses. */
  providers: PaymentProviderEntry[];
  /** The provider ticket checkout uses right now, or null. */
  active: PaymentProviderId | null;
}

export function paymentsStatus(account: SigningAccount, accountId: string): Promise<ApiResult<PaymentsStatus>> {
  return postSigned('/api/payments/status', account, 'payments_status', { account_id: accountId });
}

export function mollieOnboard(account: SigningAccount, accountId: string): Promise<ApiResult<{ url: string; kind: string }>> {
  return postSigned('/api/payments/mollie/onboard', account, 'payments_onboard', { account_id: accountId });
}

/** Mollie sign-up + OAuth run in the system browser sheet; our callback page hands back to roebel://org/payments. */
export async function openPaymentsOnboarding(url: string): Promise<void> {
  await WebBrowser.openAuthSessionAsync(url, 'roebel://org/payments', { showInRecents: true });
}
