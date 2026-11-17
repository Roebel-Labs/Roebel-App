/**
 * Short-lived mini-app user token (POST {base}/api/mini-apps/token).
 *
 * The host asks the web node for a token bound to (wallet, mini app) and attaches it as
 * `Authorization: Bearer` to the user-scoped mini-app routes (lib/miniapp-api.ts); the
 * bridge's `auth.getToken` returns it too. The request is a signed request under
 * MINIAPP_SCOPE, built exactly like the other `kind: 'web'` callers (lib/signed-request.ts):
 * a passkey session uses its API session token (one fingerprint per device session), a
 * thirdweb session signs silently.
 *
 * Every failure (declined prompt, offline, 4xx/5xx, malformed body) resolves to `null`, so
 * the host falls back to the legacy wallet-only path. The cache backs off for 60 s after a
 * failure, so a declined prompt is never asked again in a loop.
 */
import { miniAppApiBase } from './miniapp-api';
import { buildSignedMessage, enqueueSignature, signQueued, REQUEST_TIMEOUT_MS, type MiniAppAction } from './signed-request';
import { signedOrSession } from './passkey/api-session-runtime';
import type { SessionSigner } from './passkey/api-session';

export const MINIAPP_SCOPE = 'roebel-miniapp-v1';
const ACTION: MiniAppAction = 'user_token';
const PATH = '/api/mini-apps/token';

export type UserToken = { token: string; expiresAt: number };

/** Refresh this many seconds before the token's `expiresAt`. */
const REFRESH_MARGIN_SEC = 60;
/** After a failed fetch, do not ask again for this long. */
const FAILURE_COOLDOWN_SEC = 60;

type Attempt = { status: number; code?: string; value: UserToken | null };

async function postToken(body: unknown, headers: Record<string, string>): Promise<Attempt> {
  const base = miniAppApiBase();
  if (!base) return { status: 0, value: null };
  // RN fetch has no timeout of its own: without one a dead node would hang the handler.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as { token?: unknown; expiresAt?: unknown; code?: unknown } | null;
    const status = res.status ?? 0;
    if (!res.ok) return { status, code: typeof json?.code === 'string' ? json.code : undefined, value: null };
    if (!json || typeof json.token !== 'string' || typeof json.expiresAt !== 'number') return { status, value: null };
    return { status, value: { token: json.token, expiresAt: json.expiresAt } };
  } catch {
    return { status: 0, value: null };
  } finally {
    clearTimeout(timer);
  }
}

/** One token request for `appRef` (mini-app id or slug). Never throws; `null` on any failure. */
export async function requestMiniAppUserToken(account: SessionSigner, appRef: string): Promise<UserToken | null> {
  const wallet = account.address.toLowerCase();
  const payload = { app: appRef };
  const withSignature = async (): Promise<UserToken | null> => {
    // Timestamp taken right before the queued signature, like postWithSignature.
    const timestampSec = Math.floor(Date.now() / 1000);
    const message = await buildSignedMessage(ACTION, wallet, timestampSec, payload, MINIAPP_SCOPE);
    const signature = await signQueued(account, message);
    return (await postToken({ scope: MINIAPP_SCOPE, action: ACTION, wallet, timestampSec, payload, signature }, {})).value;
  };
  // The one passkey session signature waits its turn in the shared signature queue (one prompt at a time).
  const queued: SessionSigner = { ...account, signMessage: (args) => enqueueSignature(() => account.signMessage(args)) };
  try {
    return await signedOrSession<UserToken | null>(queued, {
      kind: 'web',
      endpoint: `web:${PATH}`,
      withToken: (headers) =>
        postToken({ scope: MINIAPP_SCOPE, action: ACTION, wallet, timestampSec: Math.floor(Date.now() / 1000), payload }, headers),
      withSignature,
    });
  } catch {
    // Declined or timed-out signature.
    return null;
  }
}

/**
 * Per-host token cache: one token per (appRef, wallet), reused until 60 s before expiry;
 * concurrent `get`s share one request; after a `null` result no new request for 60 s.
 */
export function createMiniAppTokenCache(deps: {
  request(appRef: string): Promise<UserToken | null>;
  nowSec?: () => number;
}): { get(appRef: string, wallet: string): Promise<string | null>; clear(): void } {
  const nowSec = deps.nowSec ?? (() => Math.floor(Date.now() / 1000));
  let tokens = new Map<string, UserToken>();
  let failedUntil = new Map<string, number>();
  let inflight = new Map<string, Promise<string | null>>();

  return {
    get(appRef, wallet) {
      const key = `${wallet.toLowerCase()}|${appRef}`;
      const now = nowSec();
      const hit = tokens.get(key);
      if (hit && hit.expiresAt - REFRESH_MARGIN_SEC > now) return Promise.resolve(hit.token);
      if ((failedUntil.get(key) ?? 0) > now) return Promise.resolve(null);
      const pending = inflight.get(key);
      if (pending) return pending;

      // Maps captured here, so a clear() during the request does not let it write into the new maps.
      const t = tokens;
      const f = failedUntil;
      const i = inflight;
      const run = deps
        .request(appRef)
        .catch(() => null)
        .then((res) => {
          i.delete(key);
          if (res) {
            t.set(key, res);
            f.delete(key);
            return res.token;
          }
          f.set(key, nowSec() + FAILURE_COOLDOWN_SEC);
          return null;
        });
      i.set(key, run);
      return run;
    },
    clear() {
      tokens = new Map();
      failedUntil = new Map();
      inflight = new Map();
    },
  };
}
