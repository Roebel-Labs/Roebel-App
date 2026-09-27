/**
 * Passkey API session token (client side of apps/web/src/lib/passkey/session-token-core.ts).
 *
 * Under a passkey session every `account.signMessage` is a fingerprint prompt. Instead of one
 * signature per API request, the identity signs ONE "Röbel Sitzung" message per device session;
 * the server returns a token (≤ 30 days) bound to the identity and this device's installation id,
 * revocable server-side. Signed requests then send the token:
 *   - web routes:     `Authorization: Bearer <token>` + `x-roebel-device: <deviceId>`
 *   - edge functions: `x-roebel-session: <token>` + `x-roebel-device` (their Authorization header
 *                     carries the Supabase anon key)
 *
 * Rules:
 *   - Obtained lazily, on the first signed request of a passkey session (never at app start).
 *   - Cached in SecureStore under `passkey_api_session_v1` (its own key: no thirdweb or passkey
 *     session key is touched). Refreshed (one new signature) when < 3 days are left.
 *   - `peek` never signs and never touches the network: background work uses it to stay silent.
 *   - A server without tokens (GET /api/passkey/session → enabled false, 404, network error) means
 *     "no token": callers fall back to their per-request signature, exactly as before. The probe
 *     runs BEFORE signing, so a disabled server never costs an extra prompt.
 *   - thirdweb sessions never use this module (callers check `passkeySessionOf(account)`).
 *
 * Pure: storage, fetch, clock and randomness are injected (api-session-runtime.ts wires them).
 */

export const PASSKEY_API_SESSION_KEY = 'passkey_api_session_v1';
export const PASSKEY_API_SESSION_TTL_SEC = 30 * 24 * 60 * 60;
/** Refresh (one signature) when fewer than this many seconds are left. */
export const PASSKEY_API_SESSION_REFRESH_SEC = 3 * 24 * 60 * 60;
/** After a failed start (server error), don't sign again for this long in this app run. */
export const PASSKEY_API_SESSION_RETRY_SEC = 5 * 60;
export const PASSKEY_SESSION_HEADER = 'x-roebel-session';
export const PASSKEY_DEVICE_HEADER = 'x-roebel-device';

/** The text the identity signs once per session. Byte-exact with the server (session-message-vector.json). */
export function buildPasskeySessionMessage(p: {
  identity: string;
  deviceId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}): string {
  return [
    'Röbel Sitzung',
    `Konto: ${p.identity.toLowerCase()}`,
    `Gerät: ${p.deviceId}`,
    `Nonce: ${p.nonce}`,
    `Ausgestellt: ${p.issuedAt}`,
    `Gültig bis: ${p.expiresAt}`,
    'Meldet dieses Gerät für höchstens 30 Tage an. Abmelden beendet die Sitzung.',
  ].join('\n');
}

export type ApiSessionToken = { token: string; deviceId: string };

type Stored = { deviceId: string; identity?: string; token?: string; jti?: string; expiresAt?: number };

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export type ApiSessionDeps = {
  /** Where the passkey routes live (EXPO_PUBLIC_PASSKEY_API_URL); empty = tokens off. */
  apiUrl: string;
  storage: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    deleteItem: (key: string) => Promise<void>;
  };
  /** Lowercase hex of `n` random bytes (CSPRNG). */
  randomHex: (n: number) => string;
  fetch?: FetchLike;
  nowSec?: () => number;
  timeoutMs?: number;
};

export type SessionSigner = { address: string; signMessage: (args: { message: string }) => Promise<string> };

const DEVICE_RE = /^[A-Za-z0-9_-]{16,64}$/;

function parseStored(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Stored;
    return s && typeof s.deviceId === 'string' && DEVICE_RE.test(s.deviceId) ? s : null;
  } catch {
    return null;
  }
}

export function createApiSessionManager(d: ApiSessionDeps) {
  const now = () => (d.nowSec ?? (() => Math.floor(Date.now() / 1000)))();
  const fetchImpl = () => d.fetch ?? (fetch as unknown as FetchLike);
  let enabled: boolean | undefined;
  let failedAt: number | undefined;
  const inFlight = new Map<string, Promise<ApiSessionToken | null>>();

  async function call(path: string, init: { method: string; headers?: Record<string, string>; body?: unknown }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), d.timeoutMs ?? 15_000);
    try {
      const res = await fetchImpl()(`${d.apiUrl}${path}`, {
        method: init.method,
        headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        signal: controller.signal,
      });
      return { status: res.status, ok: res.ok, json: await res.json().catch(() => null) };
    } finally {
      clearTimeout(timer);
    }
  }

  const load = async () => parseStored(await d.storage.getItem(PASSKEY_API_SESSION_KEY).catch(() => null));
  const save = (s: Stored) => d.storage.setItem(PASSKEY_API_SESSION_KEY, JSON.stringify(s)).catch(() => undefined);

  const usable = (s: Stored | null, identity: string, minLeft: number): s is Required<Stored> =>
    !!s && !!s.token && s.identity === identity && typeof s.expiresAt === 'number' && s.expiresAt - now() > minLeft;

  async function isEnabled(): Promise<boolean> {
    if (!d.apiUrl) return false;
    if (enabled !== undefined) return enabled;
    try {
      const r = await call('/api/passkey/session', { method: 'GET' });
      // Only a definite answer is cached; a network error is asked again next time.
      enabled = r.ok && r.json?.enabled === true;
      return enabled;
    } catch {
      return false;
    }
  }

  async function startSession(account: SessionSigner, identity: string, prev: Stored | null): Promise<ApiSessionToken | null> {
    if (!(await isEnabled())) return null;
    if (failedAt !== undefined && now() - failedAt < PASSKEY_API_SESSION_RETRY_SEC) return null;
    const deviceId = prev?.deviceId ?? d.randomHex(16);
    const nonce = d.randomHex(16);
    const issuedAt = now();
    const expiresAt = issuedAt + PASSKEY_API_SESSION_TTL_SEC;
    // The ONE fingerprint of this session. A cancelled prompt throws to the caller (never retried here).
    const signature = await account.signMessage({
      message: buildPasskeySessionMessage({ identity, deviceId, nonce, issuedAt, expiresAt }),
    });
    let r;
    try {
      r = await call('/api/passkey/session/start', {
        method: 'POST',
        body: { identity, deviceId, nonce, issuedAt, expiresAt, signature },
      });
    } catch {
      failedAt = now();
      return null;
    }
    if (!r.ok || typeof r.json?.token !== 'string') {
      failedAt = now();
      if (r.status === 503 && r.json?.error === 'disabled') enabled = false;
      await save({ deviceId });
      return null;
    }
    const exp = typeof r.json.expiresAt === 'number' ? r.json.expiresAt : expiresAt;
    await save({ deviceId, identity, token: r.json.token, jti: r.json.jti, expiresAt: exp });
    return { token: r.json.token, deviceId };
  }

  return {
    /** A cached, still valid token for `identity`, or null. Never signs, never uses the network. */
    async peek(identity: string): Promise<ApiSessionToken | null> {
      const s = await load();
      return usable(s, identity.toLowerCase(), 60) ? { token: s.token, deviceId: s.deviceId } : null;
    },

    /**
     * A token for the account's identity: the cached one, or ONE new signature (lazy, and on
     * refresh). null = tokens unavailable; the caller signs per request as before.
     */
    async get(account: SessionSigner): Promise<ApiSessionToken | null> {
      const identity = account.address.toLowerCase();
      const s = await load();
      if (usable(s, identity, PASSKEY_API_SESSION_REFRESH_SEC)) return { token: s.token, deviceId: s.deviceId };
      let pending = inFlight.get(identity);
      if (!pending) {
        pending = startSession(account, identity, s).finally(() => inFlight.delete(identity));
        inFlight.set(identity, pending);
      }
      const fresh = await pending;
      if (fresh) return fresh;
      // Refresh failed: keep using the old token while it is still valid.
      return usable(s, identity, 60) ? { token: s.token, deviceId: s.deviceId } : null;
    },

    /** The server refused the token (revoked/expired): forget it (the device id stays). */
    async invalidate(token: string): Promise<void> {
      const s = await load();
      if (s && s.token === token) await save({ deviceId: s.deviceId });
    },

    /** Sign-out: revoke the token server-side (best effort) and forget it. Never prompts. */
    async revoke(): Promise<void> {
      const s = await load();
      if (!s?.token) return;
      await save({ deviceId: s.deviceId });
      if (!d.apiUrl) return;
      await call('/api/passkey/session/revoke', {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.token}`, [PASSKEY_DEVICE_HEADER]: s.deviceId },
        body: {},
      }).catch(() => undefined);
    },
  };
}

export type ApiSessionManager = ReturnType<typeof createApiSessionManager>;

/** Headers for a web route (Authorization is free there). */
export const webSessionHeaders = (t: ApiSessionToken): Record<string, string> => ({
  Authorization: `Bearer ${t.token}`,
  [PASSKEY_DEVICE_HEADER]: t.deviceId,
});

/** Headers for a Supabase edge function (Authorization = the anon key, so a custom header). */
export const edgeSessionHeaders = (t: ApiSessionToken): Record<string, string> => ({
  [PASSKEY_SESSION_HEADER]: t.token,
  [PASSKEY_DEVICE_HEADER]: t.deviceId,
});

/** Did the server refuse the TOKEN (as opposed to the request)? Then the caller retries with a signature. */
export function isSessionRejection(status: number, code: unknown): boolean {
  return (status === 401 || status === 503) && (code === 'SESSION_INVALID' || code === 'session_invalid' || code === 'SESSION_UNAVAILABLE');
}

/** Codes a server answers when it does not take tokens (old deploy / tokens off): no signature seen. */
const UNSUPPORTED_CODES = new Set(['BAD_SIGNATURE', 'bad_signature', 'BAD_REQUEST', 'bad_request']);

export type TokenAttempt<R> = { status: number; code?: unknown; value: R };

/**
 * Runs one request of a PASSKEY session with the session token, falling back to the
 * per-request signature (`withSignature`) when there is no token, the server does not take
 * tokens, or it refused this token (401 → the token is forgotten; the next request signs a new
 * session). `unsupported` remembers endpoints that ignore tokens for this app run.
 */
export async function runWithApiSession<R>(p: {
  manager: Pick<ApiSessionManager, 'get' | 'invalidate'>;
  account: SessionSigner;
  kind: 'web' | 'edge';
  endpoint: string;
  unsupported: Set<string>;
  withToken: (headers: Record<string, string>) => Promise<TokenAttempt<R>>;
  withSignature: () => Promise<R>;
}): Promise<R> {
  if (p.unsupported.has(p.endpoint)) return p.withSignature();
  const t = await p.manager.get(p.account);
  if (!t) return p.withSignature();
  const r = await p.withToken(p.kind === 'web' ? webSessionHeaders(t) : edgeSessionHeaders(t));
  if (isSessionRejection(r.status, r.code)) {
    if (r.status === 401) await p.manager.invalidate(t.token);
    return p.withSignature();
  }
  if ((r.status === 400 || r.status === 401) && UNSUPPORTED_CODES.has(String(r.code))) {
    p.unsupported.add(p.endpoint);
    return p.withSignature();
  }
  return r.value;
}
