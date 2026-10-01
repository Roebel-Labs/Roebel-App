import { NextResponse } from "next/server";
import { buildSignedMessage, MAX_SIGNED_AGE_SECONDS, SIGNED_SCOPE, type TicketAction } from "./message";
import { verifyWalletSignature } from "./signature";
import { authenticatePasskeyRequest } from "../passkey/session-runtime";
import type { PasskeySessionAuth } from "../passkey/session-token-core";

type HeaderBag = { get(name: string): string | null };
/** Session-token auth (null = no token on the request / tokens off). Injected in tests. */
export type BearerAuth = (headers: HeaderBag | null | undefined, wallet: string) => Promise<PasskeySessionAuth | null>;

export type VerifyOk<A extends string = TicketAction> = { ok: true; wallet: string; action: A; payload: Record<string, unknown> };
export type VerifyFail = { ok: false; status: number; code: string; message: string };

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
const SIG_RE = /^0x[a-fA-F0-9]{130,}$/;

/**
 * A request is authenticated by EITHER a fresh wallet signature over the canonical message (as
 * before) OR, when PASSKEY_SESSION_TOKENS_ENABLED=1, a passkey API session token for the same
 * wallet (`Authorization: Bearer pst1.…` + `x-roebel-device`, lib/passkey/session-token-core.ts).
 * A request that carries a token is decided by the token alone (a bad token is 401, never a
 * silent fall-through to the signature).
 */
export async function verifySignedRequest<A extends string = TicketAction>(
  body: unknown,
  opts: { actions: readonly NoInfer<A>[]; scope?: string; headers?: HeaderBag | null; bearerAuth?: BearerAuth; requireSignature?: boolean },
): Promise<VerifyOk<A> | VerifyFail> {
  const expectedScope = opts.scope ?? SIGNED_SCOPE;
  const b = (body ?? {}) as Record<string, unknown>;
  const { scope, action, wallet, timestampSec, payload, signature } = b;
  if (scope !== expectedScope || typeof action !== "string" || !opts.actions.includes(action as A)) {
    return { ok: false, status: 400, code: "BAD_REQUEST", message: "unknown scope or action" };
  }
  if (typeof wallet !== "string" || !WALLET_RE.test(wallet)) return { ok: false, status: 400, code: "BAD_REQUEST", message: "wallet malformed" };
  const payloadObjEarly = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  // requireSignature: money-moving / irreversible actions (refunds) always need a fresh signature.
  const session = opts.requireSignature ? null : await (opts.bearerAuth ?? authenticatePasskeyRequest)(opts.headers, wallet);
  if (session) {
    if (!session.ok) {
      return session.status === 503
        ? { ok: false, status: 503, code: "SESSION_UNAVAILABLE", message: "could not check the session" }
        : { ok: false, status: 401, code: "SESSION_INVALID", message: "session invalid or expired" };
    }
    return { ok: true, wallet: wallet.toLowerCase(), action: action as A, payload: payloadObjEarly };
  }
  if (typeof signature !== "string" || !SIG_RE.test(signature)) return { ok: false, status: 401, code: "BAD_SIGNATURE", message: "signature malformed" };
  const ts = Number(timestampSec);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_SIGNED_AGE_SECONDS) {
    return { ok: false, status: 400, code: "STALE", message: "message expired" };
  }
  const payloadObj = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  const message = buildSignedMessage(expectedScope, action, wallet, ts, payloadObj);
  const claimed = wallet.toLowerCase();

  let verified = false;
  try {
    verified = await verifyWalletSignature(claimed, message, signature);
  } catch (err) {
    console.error("[signed-request] verifier unreachable", err);
    return { ok: false, status: 503, code: "VERIFY_UNAVAILABLE", message: "could not reach verification RPC" };
  }
  if (!verified) return { ok: false, status: 401, code: "BAD_SIGNATURE", message: "signer does not match wallet" };
  return { ok: true, wallet: claimed, action: action as A, payload: payloadObj };
}

export function jsonOk(data: unknown = null) {
  return NextResponse.json({ ok: true, data });
}
export function jsonFail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}
export function failResponse(f: VerifyFail) {
  return jsonFail(f.status, f.code, f.message);
}
