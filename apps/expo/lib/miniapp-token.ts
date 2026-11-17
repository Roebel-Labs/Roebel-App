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
import { existingSessionOnly, signedOrSession } from './passkey/api-session-runtime';
import { passkeySessionOf } from './passkey/active';
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

export type TokenRequestOptions = {
  /** Never prompt: a passkey account only uses an existing session token (thirdweb signs silently anyway). */
  silent?: boolean;
  /** The wallet the token is for; a signer with another address (account-switch race) gives null. */
  wallet?: string;
};

/** One token request for `appRef` (mini-app id or slug). Never throws; `null` on any failure. */
export async function requestMiniAppUserToken(
  account: SessionSigner,
  appRef: string,
  opts: TokenRequestOptions = {},
): Promise<UserToken | null> {
  const wallet = account.address.toLowerCase();
  if (opts.wallet && opts.wallet.toLowerCase() !== wallet) return null;
  const payload = { app: appRef };
  const withToken = (headers: Record<string, string>) =>
    postToken({ scope: MINIAPP_SCOPE, action: ACTION, wallet, timestampSec: Math.floor(Date.now() / 1000), payload }, headers);
  try {
    if (opts.silent && passkeySessionOf(account)) {
      // Silent on a passkey session: the existing session token or nothing. Never a fingerprint.
      return await existingSessionOnly<UserToken | null>(account, {
        kind: 'web',
        endpoint: `web:${PATH}`,
        withToken,
        withoutToken: async () => null,
      });
    }
    const withSignature = async (): Promise<UserToken | null> => {
      // Timestamp taken right before the queued signature, like postWithSignature.
      const timestampSec = Math.floor(Date.now() / 1000);
      const message = await buildSignedMessage(ACTION, wallet, timestampSec, payload, MINIAPP_SCOPE);
      const signature = await signQueued(account, message);
      return (await postToken({ scope: MINIAPP_SCOPE, action: ACTION, wallet, timestampSec, payload, signature }, {})).value;
    };
    // The one passkey session signature waits its turn in the shared signature queue (one prompt at a time).
    const queued: SessionSigner = { ...account, signMessage: (args) => enqueueSignature(() => account.signMessage(args)) };
    return await signedOrSession<UserToken | null>(queued, { kind: 'web', endpoint: `web:${PATH}`, withToken, withSignature });
  } catch {
    // Declined or timed-out signature.
    return null;
  }
}

type GetOptions = { silent?: boolean };

export type MiniAppTokenCache = {
  /** A valid cached token (not within 60 s of expiry), or null. Never requests. */
  peek(appRef: string, wallet: string): string | null;
  get(appRef: string, wallet: string, opts?: GetOptions): Promise<string | null>;
  clear(): void;
};

/**
 * Per-host token cache: one token per (appRef, wallet), reused until 60 s before expiry;
 * concurrent `get`s share one request; after a `null` result no new request for 60 s.
 * A failed silent request only holds back silent requests (a later write may still ask once);
 * a failed prompting request holds back both.
 */
export function createMiniAppTokenCache(deps: {
  request(appRef: string, ctx: { wallet: string; silent: boolean }): Promise<UserToken | null>;
  nowSec?: () => number;
}): MiniAppTokenCache {
  const nowSec = deps.nowSec ?? (() => Math.floor(Date.now() / 1000));
  let tokens = new Map<string, UserToken>();
  let failedUntil = new Map<string, number>();
  let inflight = new Map<string, Promise<string | null>>();
  const keyOf = (appRef: string, wallet: string) => `${wallet.toLowerCase()}|${appRef}`;
  const valid = (key: string) => {
    const hit = tokens.get(key);
    return hit && hit.expiresAt - REFRESH_MARGIN_SEC > nowSec() ? hit.token : null;
  };

  return {
    peek(appRef, wallet) {
      return valid(keyOf(appRef, wallet));
    },
    get(appRef, wallet, opts = {}) {
      const silent = !!opts.silent;
      const key = keyOf(appRef, wallet);
      const hit = valid(key);
      if (hit) return Promise.resolve(hit);
      const now = nowSec();
      const loud = `${key}|loud`;
      const quiet = `${key}|silent`;
      if ((failedUntil.get(loud) ?? 0) > now) return Promise.resolve(null);
      if (silent && (failedUntil.get(quiet) ?? 0) > now) return Promise.resolve(null);
      // A silent get may join a prompting request; a prompting get never waits on a silent one.
      const pending = inflight.get(loud) ?? (silent ? inflight.get(quiet) : undefined);
      if (pending) return pending;

      // Maps captured here, so a clear() during the request does not let it write into the new maps.
      const t = tokens;
      const f = failedUntil;
      const i = inflight;
      const mode = silent ? quiet : loud;
      const run = deps
        .request(appRef, { wallet: wallet.toLowerCase(), silent })
        .catch(() => null)
        .then((res) => {
          i.delete(mode);
          if (res) {
            t.set(key, res);
            f.delete(loud);
            f.delete(quiet);
            return res.token;
          }
          f.set(mode, nowSec() + FAILURE_COOLDOWN_SEC);
          return null;
        });
      i.set(mode, run);
      return run;
    },
    clear() {
      tokens = new Map();
      failedUntil = new Map();
      inflight = new Map();
    },
  };
}

/**
 * The host's token decision: no token for the dev preview, without a wallet or without the API;
 * a valid cached token first; a silent read without a silent signing path gets null without a
 * request; otherwise the cache (which requests at most once, then backs off).
 */
export async function resolveMiniAppUserToken(p: {
  appId: string;
  wallet: string | null;
  hasApi: boolean;
  silent: boolean;
  cache: MiniAppTokenCache;
  canSignSilently: () => Promise<boolean>;
}): Promise<string | null> {
  if (p.appId === 'dev-preview' || !p.wallet || !p.hasApi) return null;
  const cached = p.cache.peek(p.appId, p.wallet);
  if (cached) return cached;
  if (p.silent && !(await p.canSignSilently())) return null;
  return p.cache.get(p.appId, p.wallet, { silent: p.silent });
}
