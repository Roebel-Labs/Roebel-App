import { NextResponse } from "next/server";
import { buildSignedMessage, MAX_SIGNED_AGE_SECONDS, SIGNED_SCOPE, type TicketAction } from "./message";
import { verifyWalletSignature } from "./signature";

export type VerifyOk = { ok: true; wallet: string; action: TicketAction; payload: Record<string, unknown> };
export type VerifyFail = { ok: false; status: number; code: string; message: string };

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
const SIG_RE = /^0x[a-fA-F0-9]{130,}$/;

export async function verifySignedRequest(
  body: unknown, opts: { actions: readonly TicketAction[] },
): Promise<VerifyOk | VerifyFail> {
  const b = (body ?? {}) as Record<string, unknown>;
  const { scope, action, wallet, timestampSec, payload, signature } = b;
  if (scope !== SIGNED_SCOPE || typeof action !== "string" || !opts.actions.includes(action as TicketAction)) {
    return { ok: false, status: 400, code: "BAD_REQUEST", message: "unknown scope or action" };
  }
  if (typeof wallet !== "string" || !WALLET_RE.test(wallet)) return { ok: false, status: 400, code: "BAD_REQUEST", message: "wallet malformed" };
  if (typeof signature !== "string" || !SIG_RE.test(signature)) return { ok: false, status: 401, code: "BAD_SIGNATURE", message: "signature malformed" };
  const ts = Number(timestampSec);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_SIGNED_AGE_SECONDS) {
    return { ok: false, status: 400, code: "STALE", message: "message expired" };
  }
  const payloadObj = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  const message = buildSignedMessage(SIGNED_SCOPE, action, wallet, ts, payloadObj);
  const claimed = wallet.toLowerCase();

  let verified = false;
  try {
    verified = await verifyWalletSignature(claimed, message, signature);
  } catch (err) {
    console.error("[signed-request] verifier unreachable", err);
    return { ok: false, status: 503, code: "VERIFY_UNAVAILABLE", message: "could not reach verification RPC" };
  }
  if (!verified) return { ok: false, status: 401, code: "BAD_SIGNATURE", message: "signer does not match wallet" };
  return { ok: true, wallet: claimed, action: action as TicketAction, payload: payloadObj };
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
