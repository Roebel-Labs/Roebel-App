// Chat session auth (spec §3.1).
//
// 1. The app signs `roebel-chat-v1:session:<wallet lower>:<ts>:<sha256(sorted payload)>`
//    (same grammar as lib/signed-request, own scope so it cannot be replayed
//    against the ticket or org-membership endpoints). The session payload is {}.
// 2. We verify EOA → ERC-1271 on Gnosis and issue an HS256 JWT
//    (sub = lowercased wallet, 30 days, secret CHAT_SESSION_SECRET).
//
// Relative imports (not the @/ alias) so `npx tsx --test` resolves them.
import { SignJWT, jwtVerify } from "jose";
import { hashPayload } from "../org-membership/message";
import { verifyWalletSignature, VerifierUnavailableError } from "../signed-request/signature";

export const CHAT_SCOPE = "roebel-chat-v1" as const;
export const CHAT_SESSION_ACTION = "session" as const;
export const MAX_SESSION_SIGNATURE_AGE_SECONDS = 300;
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const JWT_ISSUER = "roebel-chat";
const JWT_AUDIENCE = "roebel-chat-app";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
const SIG_RE = /^0x[a-fA-F0-9]{130,}$/;

export function buildChatMessage(
  action: string, wallet: string, timestamp: number | string, payload: Record<string, unknown> = {},
): string {
  return `${CHAT_SCOPE}:${action}:${wallet.toLowerCase()}:${timestamp}:${hashPayload(payload)}`;
}

/** Normalises a client timestamp to seconds (accepts seconds or milliseconds). */
export function timestampToSeconds(ts: number): number {
  return ts > 1e12 ? Math.floor(ts / 1000) : ts;
}

export type SessionVerifyResult =
  | { ok: true; wallet: string }
  | { ok: false; status: number; code: string; message: string };

/** Validates the `POST /api/chat/session` body and the wallet signature. */
export async function verifySessionRequest(body: unknown, nowMs = Date.now()): Promise<SessionVerifyResult> {
  const b = (body ?? {}) as Record<string, unknown>;
  const { wallet, timestamp, signature } = b;
  if (typeof wallet !== "string" || !WALLET_RE.test(wallet)) {
    return { ok: false, status: 400, code: "bad_request", message: "Ungültige Wallet-Adresse." };
  }
  if (typeof signature !== "string" || !SIG_RE.test(signature)) {
    return { ok: false, status: 401, code: "bad_signature", message: "Ungültige Signatur." };
  }
  const tsRaw = typeof timestamp === "string" ? Number(timestamp) : timestamp;
  if (typeof tsRaw !== "number" || !Number.isFinite(tsRaw) || !Number.isInteger(tsRaw)) {
    return { ok: false, status: 400, code: "bad_request", message: "Ungültiger Zeitstempel." };
  }
  if (Math.abs(nowMs / 1000 - timestampToSeconds(tsRaw)) > MAX_SESSION_SIGNATURE_AGE_SECONDS) {
    return { ok: false, status: 400, code: "stale", message: "Die Signatur ist abgelaufen. Bitte erneut anmelden." };
  }
  const message = buildChatMessage(CHAT_SESSION_ACTION, wallet, tsRaw, {});
  let verified = false;
  try {
    verified = await verifyWalletSignature(wallet, message, signature);
  } catch (err) {
    if (err instanceof VerifierUnavailableError) {
      console.error("[chat/session] verifier unreachable", err.cause);
      return { ok: false, status: 503, code: "verify_unavailable", message: "Die Signatur konnte gerade nicht geprüft werden. Bitte später erneut versuchen." };
    }
    throw err;
  }
  if (!verified) return { ok: false, status: 401, code: "bad_signature", message: "Die Signatur passt nicht zur Wallet." };
  return { ok: true, wallet: wallet.toLowerCase() };
}

function secretKey(secret = process.env.CHAT_SESSION_SECRET): Uint8Array {
  if (!secret || secret.length < 16) throw new Error("CHAT_SESSION_SECRET missing or too short");
  return new TextEncoder().encode(secret);
}

export async function issueSessionToken(
  wallet: string, opts: { secret?: string; nowMs?: number } = {},
): Promise<{ token: string; expiresAt: string }> {
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const exp = nowSec + SESSION_TTL_SECONDS;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(wallet.toLowerCase())
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt(nowSec)
    .setExpirationTime(exp)
    .sign(secretKey(opts.secret));
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Returns the lowercased wallet, or null when the token is missing/invalid/expired. */
export async function verifySessionToken(
  token: string | null | undefined, opts: { secret?: string; nowMs?: number } = {},
): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(opts.secret), {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      currentDate: opts.nowMs !== undefined ? new Date(opts.nowMs) : undefined,
    });
    const sub = typeof payload.sub === "string" ? payload.sub.toLowerCase() : "";
    return WALLET_RE.test(sub) ? sub : null;
  } catch {
    return null;
  }
}

export function bearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return m ? m[1].trim() : null;
}
