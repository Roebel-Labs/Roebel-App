import { NextResponse } from "next/server";
import {
  buildAuthUrl, googleConfig, googleGate, googleRedirectUri, pkcePair, safeReturnUrl, sealState,
} from "@/lib/chat/harness/connectors/google";
import { handleError, jsonError, requireWallet, unauthorized } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/chat/connectors/google/start?return=<app deep link> — { url } of the
 * Google consent screen (PKCE S256; state = sealed wallet + verifier, 10 min).
 * 503 until GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are set.
 */
export async function GET(request: Request) {
  const gate = googleGate();
  if (gate) return jsonError(gate.status, gate.code, gate.message);
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    const cfg = googleConfig()!;
    const { verifier, challenge } = pkcePair();
    const returnUrl = safeReturnUrl(new URL(request.url).searchParams.get("return"));
    const state = sealState({ wallet, verifier, returnUrl });
    const url = buildAuthUrl(cfg, { redirectUri: googleRedirectUri(request.url), state, challenge });
    return NextResponse.json({ url, returnUrl });
  } catch (err) {
    return handleError(err, "connectors/google/start");
  }
}
