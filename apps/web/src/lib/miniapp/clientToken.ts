// Browser-side fetch of a mini-app user token (POST /api/mini-apps/token).
// Client-safe: no `server-only`, no `@/` alias, no node: imports.
//
// The request is a wallet-signed message under MINIAPP_SCOPE, verified by
// `verifySignedRequest` on the server. Any failure (declined signature, offline,
// non-200) resolves to `null`, so callers fall back to the legacy path.
import { buildSignedMessage, MINIAPP_SCOPE, type MiniAppAction } from "../signed-request/message";

export interface TokenSigningAccount {
  address: string;
  signMessage(a: { message: string }): Promise<string>;
}

/** Refresh this many seconds before the token's `expiresAt`. */
const REFRESH_MARGIN_SEC = 60;
/** After a failed fetch (declined signature, 4xx/5xx, offline), do not ask again for this long. */
const FAILURE_COOLDOWN_SEC = 60;

/** Injectable for tests. */
export interface ClientTokenDeps {
  nowMs?: () => number;
  fetch?: typeof fetch;
}

const cache = new Map<string, { token: string; expiresAt: number }>();
/** (wallet, app) → time (sec) until which a new attempt is suppressed. */
const failedUntil = new Map<string, number>();
const inflight = new Map<string, Promise<string | null>>();

export async function fetchUserTokenWithAccount(
  account: TokenSigningAccount,
  app: string,
  deps: ClientTokenDeps = {},
): Promise<string | null> {
  const nowMs = deps.nowMs ?? Date.now;
  const doFetch = deps.fetch ?? fetch;
  const key = `${account.address.toLowerCase()}|${app}`;
  const nowSec = Math.floor(nowMs() / 1000);
  const hit = cache.get(key);
  if (hit && hit.expiresAt - REFRESH_MARGIN_SEC > nowSec) return hit.token;
  // Back off after a failure so a declined prompt or a down token route never loops.
  if ((failedUntil.get(key) ?? 0) > nowSec) return null;

  // One signature prompt per (wallet, app) at a time.
  const pending = inflight.get(key);
  if (pending) return pending;

  const fetchToken = async (): Promise<string | null> => {
    try {
      const action: MiniAppAction = "user_token";
      const payload = { app };
      const timestampSec = Math.floor(nowMs() / 1000);
      const message = buildSignedMessage(MINIAPP_SCOPE, action, account.address, timestampSec, payload);
      const signature = await account.signMessage({ message });
      const res = await doFetch("/api/mini-apps/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: MINIAPP_SCOPE,
          action,
          wallet: account.address,
          timestampSec,
          payload,
          signature,
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json().catch(() => null)) as { token?: unknown; expiresAt?: unknown } | null;
      if (!json || typeof json.token !== "string" || typeof json.expiresAt !== "number") return null;
      cache.set(key, { token: json.token, expiresAt: json.expiresAt });
      return json.token;
    } catch {
      return null;
    }
  };
  const run = fetchToken().then((token) => {
    inflight.delete(key);
    if (token === null) failedUntil.set(key, Math.floor(nowMs() / 1000) + FAILURE_COOLDOWN_SEC);
    else failedUntil.delete(key);
    return token;
  });
  inflight.set(key, run);
  return run;
}
