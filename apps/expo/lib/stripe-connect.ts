import * as WebBrowser from 'expo-web-browser';
import { postSigned, type ApiResult, type SigningAccount } from './signed-request';

export interface ConnectStatus {
  connected: boolean; stripe_account_id: string | null; details_submitted: boolean; charges_enabled: boolean;
  payouts_enabled: boolean; currently_due: string[]; disabled_reason: string | null; livemode: boolean;
}
export function connectOnboard(account: SigningAccount, accountId: string): Promise<ApiResult<{ url: string }>> {
  return postSigned('/api/connect/onboard', account, 'connect_onboard', { account_id: accountId });
}
export function connectStatus(account: SigningAccount, accountId: string): Promise<ApiResult<ConnectStatus>> {
  return postSigned('/api/connect/status', account, 'connect_status', { account_id: accountId });
}
/** Stripe forbids WebViews for hosted onboarding; the auth session opens the system browser sheet and returns on roebel://org/payments. */
export async function openConnectOnboarding(url: string): Promise<void> {
  await WebBrowser.openAuthSessionAsync(url, 'roebel://org/payments', { showInRecents: true });
}
