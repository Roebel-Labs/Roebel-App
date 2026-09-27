// Wallet-signed requests to the web API (apps/web/src/lib/signed-request). Same grammar as the
// org-membership edge function, with its own scope so a ticket signature can never replay as an org action.
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';

export const SIGNED_SCOPE = 'roebel-tickets-v1';
export type TicketAction =
  | 'connect_onboard' | 'connect_session' | 'connect_status' | 'ticket_types_upsert' | 'ticket_types_list' | 'checkout'
  | 'order_status' | 'tickets_list' | 'orders_list' | 'checkin' | 'refund_order';

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

// Signatures are produced one at a time. The thirdweb smart account does not reliably handle
// concurrent signMessage calls: a screen that fired three signed requests at once saw one of them
// never resolve, which left its spinner running forever (ticket editor, 2026-09-27).
let signQueue: Promise<unknown> = Promise.resolve();
export const SIGN_TIMEOUT_MS = 30000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/** Runs `task` after every earlier signature finished; a failure or timeout never blocks the queue. */
function enqueueSignature<T>(task: () => Promise<T>): Promise<T> {
  const run = signQueue.then(task);
  signQueue = run.catch(() => undefined);
  return run;
}

export async function postSigned<T>(path: string, account: SigningAccount, action: TicketAction, payload: Record<string, unknown>): Promise<ApiResult<T>> {
  const wallet = account.address.toLowerCase();
  let timestampSec: number;
  let signature: string;
  try {
    ({ timestampSec, signature } = await enqueueSignature(async () => {
      // Timestamp taken inside the queue, so a request that waited for others is not stale.
      const ts = Math.floor(Date.now() / 1000);
      const sig = await withTimeout(
        account.signMessage({ message: await buildSignedMessage(action, wallet, ts, payload) }),
        SIGN_TIMEOUT_MS,
        'Signatur hat zu lange gedauert. Bitte versuche es erneut.',
      );
      return { timestampSec: ts, signature: sig };
    }));
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
