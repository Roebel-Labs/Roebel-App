// Wallet-signed requests to the web API (apps/web/src/lib/signed-request). Same grammar as the
// org-membership edge function, with its own scope so a ticket signature can never replay as an org action.
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';

export const SIGNED_SCOPE = 'roebel-tickets-v1';
export type TicketAction =
  | 'connect_onboard' | 'connect_status' | 'ticket_types_upsert' | 'checkout'
  | 'order_status' | 'tickets_list' | 'checkin' | 'refund_order';

export interface SigningAccount {
  address: string;
  signMessage: (args: { message: string }) => Promise<string>;
}
export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const DEFAULT_API_BASE_URL = 'https://www.roebel.app';
export function getApiBaseUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_BASE_URL;
  return env && env.length > 0 ? env.replace(/\/$/, '') : DEFAULT_API_BASE_URL;
}

async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(sorted));
}

export async function buildSignedMessage(action: TicketAction, wallet: string, timestampSec: number, payload: Record<string, unknown>): Promise<string> {
  return `${SIGNED_SCOPE}:${action}:${wallet.toLowerCase()}:${timestampSec}:${await hashPayload(payload)}`;
}

export async function postSigned<T>(path: string, account: SigningAccount, action: TicketAction, payload: Record<string, unknown>): Promise<ApiResult<T>> {
  const wallet = account.address.toLowerCase();
  const timestampSec = Math.floor(Date.now() / 1000);
  let signature: string;
  try {
    signature = await account.signMessage({ message: await buildSignedMessage(action, wallet, timestampSec, payload) });
  } catch (err) {
    return { ok: false, code: 'SIGN_FAILED', message: err instanceof Error ? err.message : 'Signatur fehlgeschlagen' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ scope: SIGNED_SCOPE, action, wallet, timestampSec, payload, signature }),
    });
    const json = (await res.json()) as ApiResult<T>;
    if (json && typeof json === 'object' && 'ok' in json) return json;
    return { ok: false, code: 'BAD_RESPONSE', message: 'Unerwartete Antwort vom Server' };
  } catch (err) {
    return { ok: false, code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Netzwerkfehler' };
  } finally {
    clearTimeout(timer);
  }
}
