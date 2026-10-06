// Wallet-signed requests to the web API (apps/web/src/lib/signed-request). Same grammar as the
// org-membership edge function, with its own scope so a ticket signature can never replay as an org action.
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import { passkeySessionOf } from './passkey/active';
import { signedOrSession } from './passkey/api-session-runtime';

export const SIGNED_SCOPE = 'roebel-tickets-v1';
export type TicketAction =
  | 'connect_onboard' | 'connect_session' | 'connect_status' | 'ticket_types_upsert' | 'ticket_types_list' | 'checkout'
  | 'order_status' | 'tickets_list' | 'orders_list' | 'checkin' | 'refund_order';
/** Proposal-task actions (apps/web/src/lib/signed-request/message.ts); signed under VORHABEN_SCOPE. */
export const VORHABEN_SCOPE = 'roebel-vorhaben-v1';
export type VorhabenAction =
  | 'task_create' | 'task_apply' | 'task_withdraw' | 'task_assign' | 'task_start' | 'task_comment'
  | 'task_proof' | 'task_submit' | 'task_approve' | 'task_request_changes' | 'task_cancel' | 'payout_record_manual'
  | 'payout_record_card';
export type SignedAction = TicketAction | VorhabenAction;

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

export async function buildSignedMessage(
  action: SignedAction, wallet: string, timestampSec: number, payload: Record<string, unknown>, scope: string = SIGNED_SCOPE,
): Promise<string> {
  return `${scope}:${action}:${wallet.toLowerCase()}:${timestampSec}:${await hashPayload(payload)}`;
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

/** One queued, time-limited wallet signature over a plain message (for callers with their own message format). */
export function signQueued(account: SigningAccount, message: string): Promise<string> {
  return enqueueSignature(() => withTimeout(
    account.signMessage({ message }),
    SIGN_TIMEOUT_MS,
    'Signatur hat zu lange gedauert. Bitte versuche es erneut.',
  ));
}

export const REQUEST_TIMEOUT_MS = 20000;
/** Payout recordings verify the tx on-chain (receipt + block reads) before answering: they get longer. */
export const PAYOUT_RECORD_TIMEOUT_MS = 45000;
const LONG_ACTIONS: readonly SignedAction[] = ['payout_record_manual', 'payout_record_card'];
export const requestTimeoutFor = (action: SignedAction): number =>
  (LONG_ACTIONS.includes(action) ? PAYOUT_RECORD_TIMEOUT_MS : REQUEST_TIMEOUT_MS);

async function postJson<T>(
  path: string, body: unknown, headers: Record<string, string> = {}, timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<{ status: number; json: ApiResult<T> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, signal: controller.signal,
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as ApiResult<T>;
    if (json && typeof json === 'object' && 'ok' in json) return { status: res.status ?? 200, json };
    return { status: res.status ?? 200, json: { ok: false, code: 'BAD_RESPONSE', message: 'Unerwartete Antwort vom Server' } };
  } catch (err) {
    return { status: 0, json: { ok: false, code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Netzwerkfehler' } };
  } finally {
    clearTimeout(timer);
  }
}

async function postWithSignature<T>(
  path: string, account: SigningAccount, action: SignedAction, payload: Record<string, unknown>, scope: string,
): Promise<ApiResult<T>> {
  const wallet = account.address.toLowerCase();
  let timestampSec: number;
  let signature: string;
  try {
    ({ timestampSec, signature } = await enqueueSignature(async () => {
      // Timestamp taken inside the queue, so a request that waited for others is not stale.
      const ts = Math.floor(Date.now() / 1000);
      const sig = await withTimeout(
        account.signMessage({ message: await buildSignedMessage(action, wallet, ts, payload, scope) }),
        SIGN_TIMEOUT_MS,
        'Signatur hat zu lange gedauert. Bitte versuche es erneut.',
      );
      return { timestampSec: ts, signature: sig };
    }));
  } catch (err) {
    return { ok: false, code: 'SIGN_FAILED', message: err instanceof Error ? err.message : 'Signatur fehlgeschlagen' };
  }
  return (await postJson<T>(path, { scope, action, wallet, timestampSec, payload, signature }, {}, requestTimeoutFor(action))).json;
}

/**
 * One signed request. thirdweb session: a fresh wallet signature, as always. Passkey session:
 * the passkey API session token (one fingerprint per device session, lib/passkey/api-session.ts);
 * without a token (server off, refused) it falls back to the per-request signature.
 * `refund_order`, `task_approve` and the payout_record_* actions always sign (the server requires a fresh signature).
 */
const ALWAYS_SIGN: readonly SignedAction[] = ['refund_order', 'task_approve', 'payout_record_manual', 'payout_record_card'];

export async function postSigned<T>(
  path: string, account: SigningAccount, action: SignedAction, payload: Record<string, unknown>, scope: string = SIGNED_SCOPE,
): Promise<ApiResult<T>> {
  if (ALWAYS_SIGN.includes(action) || !passkeySessionOf(account)) return postWithSignature<T>(path, account, action, payload, scope);
  const wallet = account.address.toLowerCase();
  // The one session signature also waits its turn in the signature queue (one prompt at a time).
  // No 30 s timeout here: it is a biometric prompt (WebAuthn allows 120 s), and parallel requests
  // already share this single signature (api-session.ts single-flight).
  const queued = { ...account, signMessage: (args: { message: string }) => enqueueSignature(() => account.signMessage(args)) };
  try {
    return await signedOrSession<ApiResult<T>>(queued, {
      kind: 'web',
      endpoint: `web:${path}`,
      withToken: async (headers) => {
        const r = await postJson<T>(path, { scope, action, wallet, timestampSec: Math.floor(Date.now() / 1000), payload }, headers, requestTimeoutFor(action));
        return { status: r.status, code: r.json.ok ? undefined : r.json.code, value: r.json };
      },
      withSignature: () => postWithSignature<T>(path, account, action, payload, scope),
    });
  } catch (err) {
    // The session signature itself failed or was cancelled.
    return { ok: false, code: 'SIGN_FAILED', message: err instanceof Error ? err.message : 'Signatur fehlgeschlagen' };
  }
}

/**
 * For polling / focus reloads: true when a request can be made without a fingerprint prompt
 * (thirdweb session, or a passkey session holding a valid session token).
 */
export { canSignSilently } from './passkey/api-session-runtime';
