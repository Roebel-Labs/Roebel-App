/**
 * Passkey API session token: ONE signature per device session instead of one per request.
 *
 * Shared verbatim by the web app (apps/web/src/lib/passkey/session-token-core.ts) and the Supabase
 * edge functions (apps/expo/supabase/functions/_shared/verify-session-token.ts). The two files must
 * stay byte-identical (a web test enforces it). This file imports nothing: it uses only WebCrypto
 * (crypto.subtle HMAC-SHA256), TextEncoder and btoa/atob, which Node >= 18 and Deno both provide.
 * No viem here, so the edge functions' pinned viem 2.21 is never asked for newer APIs.
 *
 * Flow:
 *  1. The app signs buildPasskeySessionMessage({ identity, deviceId, nonce, issuedAt, expiresAt })
 *     ONCE with the identity (EIP-191; checked by verifyAccountSignature: Safe ERC-1271 / 6492,
 *     Safe-admin envelope, thirdweb admin).
 *  2. POST /api/passkey/session/start stores the token id (= nonce) in passkey_api_sessions and
 *     returns a token: "pst1.<base64url(JSON claims)>.<base64url(HMAC-SHA256(secret, 'pst1.' + payload))>".
 *  3. Every request that used to carry a fresh wallet signature may carry the token instead
 *     (web: `Authorization: Bearer <token>`; edge functions, whose Authorization header carries the
 *     Supabase anon key: `x-roebel-session: <token>`), plus `x-roebel-device: <deviceId>`.
 *  4. A request is accepted only when ALL hold: the MAC verifies, the token is not expired, its
 *     subject is the wallet the request acts for, the device header equals the token's device, and
 *     the token id is an active (not revoked, not expired) row in passkey_api_sessions. A store
 *     error fails closed (503).
 *
 * Revocation: set passkey_api_sessions.revoked_at (logout revokes the device's token; a new
 * sign-in on the same device revokes the older ones).
 */

export const PASSKEY_SESSION_TOKEN_VERSION = "pst1";
/** Longest lifetime of one token (30 days). */
export const PASSKEY_SESSION_MAX_TTL_SEC = 30 * 24 * 60 * 60;
/** The signed start message must be this fresh (seconds, either direction). */
export const PASSKEY_SESSION_SIGNATURE_MAX_SKEW_SEC = 600;
/** Minimum HMAC secret length; a shorter (or missing) secret means "tokens disabled". */
export const PASSKEY_SESSION_MIN_SECRET_LENGTH = 32;
/** Header for edge functions (their Authorization header is the Supabase anon key). */
export const PASSKEY_SESSION_HEADER = "x-roebel-session";
export const PASSKEY_DEVICE_HEADER = "x-roebel-device";
/** Table holding issued token ids (migration 20260927_passkey_api_sessions.sql). */
export const PASSKEY_SESSION_TABLE = "passkey_api_sessions";

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const DEVICE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const NONCE_RE = /^[0-9a-f]{32}$/;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;
const MAX_TOKEN_LENGTH = 2048;

export type PasskeySessionClaims = {
  v: 1;
  /** Token id (= the signed nonce), primary key in passkey_api_sessions. */
  jti: string;
  /** The identity (lowercase address) the token acts for. */
  sub: string;
  /** The passkey Safe that signed (from a Safe-admin envelope), or null. Informational only. */
  safe: string | null;
  /** Device installation id the token is bound to. */
  dev: string;
  iat: number;
  exp: number;
};

export const isSessionDeviceId = (v: unknown): v is string => typeof v === "string" && DEVICE_RE.test(v);
export const isSessionNonce = (v: unknown): v is string => typeof v === "string" && NONCE_RE.test(v);
export const isSessionAddress = (v: unknown): v is string => typeof v === "string" && ADDRESS_RE.test(v);

/** The text the identity signs once per session (EIP-191). Byte-exact with apps/expo/lib/passkey/api-session.ts. */
export function buildPasskeySessionMessage(p: {
  identity: string;
  deviceId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}): string {
  return [
    "Röbel Sitzung",
    `Konto: ${p.identity.toLowerCase()}`,
    `Gerät: ${p.deviceId}`,
    `Nonce: ${p.nonce}`,
    `Ausgestellt: ${p.issuedAt}`,
    `Gültig bis: ${p.expiresAt}`,
    "Meldet dieses Gerät für höchstens 30 Tage an. Abmelden beendet die Sitzung.",
  ].join("\n");
}

/** Checks the start request's times: fresh, expiry after issue, at most 30 days. */
export function isSessionWindowValid(issuedAt: unknown, expiresAt: unknown, nowSec: number): boolean {
  if (typeof issuedAt !== "number" || !Number.isSafeInteger(issuedAt)) return false;
  if (typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt)) return false;
  if (Math.abs(nowSec - issuedAt) > PASSKEY_SESSION_SIGNATURE_MAX_SKEW_SEC) return false;
  return expiresAt > issuedAt && expiresAt - issuedAt <= PASSKEY_SESSION_MAX_TTL_SEC && expiresAt > nowSec;
}

export function isUsableSecret(secret: string | undefined | null): secret is string {
  return typeof secret === "string" && secret.length >= PASSKEY_SESSION_MIN_SECRET_LENGTH;
}

// ---------------------------------------------------------------------------
// encoding + HMAC
// ---------------------------------------------------------------------------

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Issues a token for `claims` (the caller has verified the signature and stored the row). */
export async function signPasskeySessionToken(claims: PasskeySessionClaims, secret: string): Promise<string> {
  if (!isUsableSecret(secret)) throw new Error("PASSKEY_SESSION_SECRET missing or too short");
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  const signed = `${PASSKEY_SESSION_TOKEN_VERSION}.${payload}`;
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(signed)));
  return `${signed}.${b64urlEncode(mac)}`;
}

function parseClaims(raw: unknown): PasskeySessionClaims | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (c.v !== 1 || !isSessionNonce(c.jti) || !isSessionAddress(c.sub) || !isSessionDeviceId(c.dev)) return null;
  if (c.safe !== null && !isSessionAddress(c.safe)) return null;
  if (typeof c.iat !== "number" || !Number.isSafeInteger(c.iat)) return null;
  if (typeof c.exp !== "number" || !Number.isSafeInteger(c.exp)) return null;
  if (c.exp <= c.iat || c.exp - c.iat > PASSKEY_SESSION_MAX_TTL_SEC) return null;
  return { v: 1, jti: c.jti, sub: c.sub, safe: (c.safe as string | null) ?? null, dev: c.dev, iat: c.iat, exp: c.exp };
}

/**
 * The claims of a genuine, unexpired token, or null. Checks the MAC (constant time, WebCrypto)
 * BEFORE parsing the payload. Does NOT check revocation (see authenticatePasskeySession).
 */
export async function readPasskeySessionToken(
  token: string | null | undefined,
  secret: string,
  nowSec: number,
): Promise<PasskeySessionClaims | null> {
  if (!isUsableSecret(secret) || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PASSKEY_SESSION_TOKEN_VERSION) return null;
  if (!B64URL_RE.test(parts[1]) || !B64URL_RE.test(parts[2])) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      b64urlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;
    const claims = parseClaims(JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))));
    if (!claims || claims.exp <= nowSec) return null;
    return claims;
  } catch {
    return null;
  }
}

/** `Authorization: Bearer pst1.…` → the token; anything else (e.g. a Supabase anon JWT) → null. */
export function passkeyTokenFromAuthorization(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return m && m[1].startsWith(`${PASSKEY_SESSION_TOKEN_VERSION}.`) ? m[1] : null;
}

type HeaderBag = { get(name: string): string | null };

/** The token from `x-roebel-session` or `Authorization: Bearer pst1.…`, plus the device header. */
export function passkeySessionFromHeaders(headers: HeaderBag | null | undefined): { token: string; deviceId: string | null } | null {
  if (!headers) return null;
  const direct = headers.get(PASSKEY_SESSION_HEADER);
  const token =
    direct && direct.startsWith(`${PASSKEY_SESSION_TOKEN_VERSION}.`) ? direct.trim() : passkeyTokenFromAuthorization(headers.get("authorization"));
  if (!token) return null;
  return { token, deviceId: headers.get(PASSKEY_DEVICE_HEADER) };
}

// ---------------------------------------------------------------------------
// request authentication
// ---------------------------------------------------------------------------

/** true when the token id is an issued, unrevoked, unexpired row. THROWS on a store error. */
export type PasskeySessionLookup = (jti: string, identity: string, nowSec: number) => Promise<boolean>;

export type PasskeySessionAuth =
  | { ok: true; claims: PasskeySessionClaims }
  | { ok: false; status: 401 | 503; code: "SESSION_INVALID" | "SESSION_UNAVAILABLE" };

/**
 * Authenticates a request made with a session token for `wallet`. 401 SESSION_INVALID for a bad,
 * expired, revoked or foreign token or a device mismatch; 503 SESSION_UNAVAILABLE when the
 * revocation store could not be read (fail closed).
 */
export async function authenticatePasskeySession(p: {
  token: string;
  deviceId: string | null | undefined;
  wallet: string;
  secret: string;
  nowSec: number;
  isActive: PasskeySessionLookup;
}): Promise<PasskeySessionAuth> {
  const claims = await readPasskeySessionToken(p.token, p.secret, p.nowSec);
  if (!claims) return { ok: false, status: 401, code: "SESSION_INVALID" };
  if (claims.sub !== p.wallet.toLowerCase()) return { ok: false, status: 401, code: "SESSION_INVALID" };
  if (!isSessionDeviceId(p.deviceId) || p.deviceId !== claims.dev) return { ok: false, status: 401, code: "SESSION_INVALID" };
  let active: boolean;
  try {
    active = await p.isActive(claims.jti, claims.sub, p.nowSec);
  } catch {
    return { ok: false, status: 503, code: "SESSION_UNAVAILABLE" };
  }
  return active ? { ok: true, claims } : { ok: false, status: 401, code: "SESSION_INVALID" };
}

/** Structural subset of a supabase-js client (service role) that the lookup needs. */
export type SessionLookupClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          maybeSingle(): PromiseLike<{ data: { revoked_at: string | null; expires_at: string } | null; error: unknown }>;
        };
      };
    };
  };
};

/** Revocation lookup against passkey_api_sessions with a service-role supabase-js client. */
export function supabasePasskeySessionLookup(client: SessionLookupClient): PasskeySessionLookup {
  return async (jti, identity, nowSec) => {
    const { data, error } = await client
      .from(PASSKEY_SESSION_TABLE)
      .select("revoked_at, expires_at")
      .eq("jti", jti)
      .eq("identity_address", identity.toLowerCase())
      .maybeSingle();
    if (error) throw new Error("passkey session store unavailable");
    if (!data || data.revoked_at) return false;
    return Date.parse(data.expires_at) > nowSec * 1000;
  };
}

/**
 * Edge functions: the session-token path of a signed request. null = the request must be decided
 * by its signature exactly as before (it carries a signature, or no session header, or tokens are
 * off because PASSKEY_SESSION_SECRET is unset/short, or no revocation lookup is configured).
 * A request WITH a signature is never decided by a token.
 */
export async function authenticateEdgeSession(p: {
  headers: HeaderBag | null | undefined;
  wallet: string;
  signature: unknown;
  secret: string | undefined | null;
  nowSec: number;
  isActive: PasskeySessionLookup | null;
}): Promise<PasskeySessionAuth | null> {
  if (typeof p.signature === "string" && p.signature.length > 0) return null;
  if (!isUsableSecret(p.secret) || !p.isActive) return null;
  const found = passkeySessionFromHeaders(p.headers);
  if (!found) return null;
  return authenticatePasskeySession({
    token: found.token,
    deviceId: found.deviceId,
    wallet: p.wallet,
    secret: p.secret,
    nowSec: p.nowSec,
    isActive: p.isActive,
  });
}
