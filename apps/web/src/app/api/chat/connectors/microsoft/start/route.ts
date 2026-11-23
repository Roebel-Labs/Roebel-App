import { NextResponse } from "next/server";
import { pkcePair, safeReturnUrl, sealState } from "@/lib/chat/harness/connectors/google";
import {
  buildMicrosoftAuthUrl, microsoftConfig, microsoftGate, microsoftRedirectUri,
} from "@/lib/chat/harness/connectors/microsoft";
import { handleError, jsonError, requireWallet, unauthorized } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/chat/connectors/microsoft/start?return=<app deep link | studio page> — { url } of the
 * Microsoft sign-in (PKCE S256; state = sealed wallet + verifier, 10 min).
 * 503 until MICROSOFT_OAUTH_CLIENT_ID / MICROSOFT_OAUTH_CLIENT_SECRET are set.
 */
export async function GET(request: Request) {
  const gate = microsoftGate();
  if (gate) return jsonError(gate.status, gate.code, gate.message);
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    const cfg = microsoftConfig()!;
    const { verifier, challenge } = pkcePair();
    const returnUrl = safeReturnUrl(new URL(request.url).searchParams.get("return"));
    const state = sealState({ wallet, verifier, returnUrl });
    const url = buildMicrosoftAuthUrl(cfg, { redirectUri: microsoftRedirectUri(request.url), state, challenge });
    return NextResponse.json({ url, returnUrl });
  } catch (err) {
    return handleError(err, "connectors/microsoft/start");
  }
}
