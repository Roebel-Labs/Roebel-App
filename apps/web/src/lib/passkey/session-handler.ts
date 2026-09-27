/**
 * Passkey API session routes (PREVIEW-ONLY; off unless PASSKEY_SESSION_TOKENS_ENABLED=1 and
 * PASSKEY_SESSION_SECRET is at least 32 characters). Store, verifier and clock are injected; the
 * Next routes only wire the real ones (session-runtime.ts).
 *
 *   GET  /api/passkey/session          -> 200 { enabled }   (no auth; lets the app skip signing
 *                                          a session message the server would not accept)
 *   POST /api/passkey/session/start    { identity, deviceId, nonce, issuedAt, expiresAt, signature }
 *        signature = the identity's EIP-191 signature over buildPasskeySessionMessage(...)
 *        -> 200 { token, jti, expiresAt }   (expiresAt in unix seconds)
 *   POST /api/passkey/session/revoke   headers: Authorization: Bearer <token>, x-roebel-device
 *        body { all?: true }  -> 200 { ok: true }   (all = every token of this identity)
 *
 * Errors: 400 bad_request | stale, 401 bad_signature | session_invalid, 409 nonce_used,
 * 503 disabled | chain_unavailable | store_unavailable.
 *
 * A replayed start message cannot mint a second token: the nonce is the token id (primary key).
 * A new sign-in on a device revokes that identity's older tokens on the same device.
 * Logging: fixed strings + error names only (never tokens, signatures or addresses).
 */
import { NextResponse } from "next/server";
import { decodeSafeAdminSignature } from "../auth/account-signature-core";
import {
  authenticatePasskeySession,
  buildPasskeySessionMessage,
  isSessionAddress,
  isSessionDeviceId,
  isSessionNonce,
  isSessionWindowValid,
  isUsableSecret,
  passkeySessionFromHeaders,
  readPasskeySessionToken,
  signPasskeySessionToken,
  type PasskeySessionAuth,
  type PasskeySessionClaims,
} from "./session-token-core";
import type { PasskeySessionStore } from "./session-token-store";

const MAX_SIGNATURE_HEX = 2 + 2 * 8192;

export type PasskeySessionDeps = {
  enabled: boolean;
  secret: string;
  store: PasskeySessionStore | null;
  verify: (input: { address: string; message: string; signature: string }) => Promise<boolean>;
  nowSec: () => number;
};

type HeaderBag = { get(name: string): string | null };

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const err = (error: string, status: number) => json({ error }, status);
const errName = (e: unknown) => (e instanceof Error ? e.name : typeof e);

export const sessionTokensUsable = (d: PasskeySessionDeps): boolean => d.enabled && isUsableSecret(d.secret) && !!d.store;

export function handleSessionInfo(deps: PasskeySessionDeps): NextResponse {
  return json({ enabled: sessionTokensUsable(deps) });
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function handleSessionStart(req: Request, deps: PasskeySessionDeps): Promise<NextResponse> {
  if (!sessionTokensUsable(deps)) return err("disabled", 503);
  const b = await readBody(req);
  if (!b) return err("bad_request", 400);
  const identity = typeof b.identity === "string" ? b.identity.toLowerCase() : null;
  const { deviceId, nonce, issuedAt, expiresAt, signature } = b;
  if (!identity || !isSessionAddress(identity) || !isSessionDeviceId(deviceId) || !isSessionNonce(nonce)) {
    return err("bad_request", 400);
  }
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature) || signature.length % 2 !== 0) {
    return err("bad_request", 400);
  }
  if (signature.length < 132 || signature.length > MAX_SIGNATURE_HEX) return err("bad_request", 400);
  const now = deps.nowSec();
  if (!isSessionWindowValid(issuedAt, expiresAt, now)) return err("stale", 400);

  const message = buildPasskeySessionMessage({
    identity,
    deviceId,
    nonce,
    issuedAt: issuedAt as number,
    expiresAt: expiresAt as number,
  });
  try {
    if (!(await deps.verify({ address: identity, message, signature }))) return err("bad_signature", 401);
  } catch (e) {
    console.error("[passkey-session] signature check failed:", errName(e));
    return err("chain_unavailable", 503);
  }

  const claims: PasskeySessionClaims = {
    v: 1,
    jti: nonce,
    sub: identity,
    safe: decodeSafeAdminSignature(signature)?.safe.toLowerCase() ?? null,
    dev: deviceId,
    iat: now,
    exp: expiresAt as number,
  };
  const store = deps.store as PasskeySessionStore;
  try {
    if ((await store.insert(claims)) === "duplicate") return err("nonce_used", 409);
    await store.revokeDeviceExcept(identity, deviceId, nonce);
  } catch (e) {
    console.error("[passkey-session] store failed:", errName(e));
    return err("store_unavailable", 503);
  }
  const token = await signPasskeySessionToken(claims, deps.secret);
  return json({ token, jti: claims.jti, expiresAt: claims.exp });
}

/**
 * Authenticates a request for `wallet` by its session token. null = the request carries no
 * session token or tokens are off (the caller then requires its usual signature).
 */
export async function authenticateSessionHeaders(
  headers: HeaderBag | null | undefined,
  wallet: string,
  deps: PasskeySessionDeps,
): Promise<PasskeySessionAuth | null> {
  const found = passkeySessionFromHeaders(headers);
  if (!found || !sessionTokensUsable(deps)) return null;
  const store = deps.store as PasskeySessionStore;
  return authenticatePasskeySession({
    token: found.token,
    deviceId: found.deviceId,
    wallet,
    secret: deps.secret,
    nowSec: deps.nowSec(),
    isActive: (jti, identity, now) => store.isActive(jti, identity, now),
  });
}

export async function handleSessionRevoke(req: Request, deps: PasskeySessionDeps): Promise<NextResponse> {
  if (!sessionTokensUsable(deps)) return err("disabled", 503);
  const found = passkeySessionFromHeaders(req.headers);
  if (!found) return err("session_invalid", 401);
  const b = (await readBody(req)) ?? {};
  // Revoking the token itself needs a genuine token (revoking it twice is a no-op); revoking ALL
  // of the identity's tokens needs an active one.
  const now = deps.nowSec();
  const claims = await readPasskeySessionToken(found.token, deps.secret, now);
  if (!claims || found.deviceId !== claims.dev) return err("session_invalid", 401);
  const store = deps.store as PasskeySessionStore;
  try {
    if (b.all === true) {
      if (!(await store.isActive(claims.jti, claims.sub, now))) return err("session_invalid", 401);
      await store.revokeAll(claims.sub);
    } else await store.revoke(claims.jti, claims.sub);
  } catch (e) {
    console.error("[passkey-session] revoke failed:", errName(e));
    return err("store_unavailable", 503);
  }
  return json({ ok: true });
}
