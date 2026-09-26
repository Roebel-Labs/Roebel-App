import {
  DEFAULT_RETURN_URL, exchangeCode, googleConfig, googleGate, googleRedirectUri, openState, withQuery,
} from "@/lib/chat/harness/connectors/google";
import { deleteGoogleConnectors, insertConnector } from "@/lib/chat/harness/connectors/store";
import { jsonError } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(url: string, result: "ok" | "error" | "cancelled"): Response {
  return new Response(null, { status: 302, headers: { Location: withQuery(url, { google: result }), "Cache-Control": "no-store" } });
}

/**
 * GET /api/chat/connectors/google/callback?code&state — Google redirects here.
 * Exchanges the code (PKCE), stores the refresh token encrypted (one Google
 * link per wallet) and sends the browser back to the app deep link.
 */
export async function GET(request: Request) {
  const gate = googleGate();
  if (gate) return jsonError(gate.status, gate.code, gate.message);
  const params = new URL(request.url).searchParams;
  const state = openState(params.get("state") ?? "");
  if (!state) return back(DEFAULT_RETURN_URL, "error");
  if (params.get("error")) return back(state.returnUrl, params.get("error") === "access_denied" ? "cancelled" : "error");
  const code = params.get("code");
  if (!code) return back(state.returnUrl, "error");
  try {
    const tokens = await exchangeCode(googleConfig()!, {
      code, verifier: state.verifier, redirectUri: googleRedirectUri(request.url),
    });
    await deleteGoogleConnectors(state.wallet);
    const name = (tokens.email ? `Google (${tokens.email})` : "Google").slice(0, 60);
    await insertConnector({
      wallet: state.wallet, kind: "google", name, url: null,
      secret: { refreshToken: tokens.refreshToken, scope: tokens.scope },
    });
    return back(state.returnUrl, "ok");
  } catch (err) {
    console.error("[api/chat/connectors/google/callback]", err instanceof Error ? err.message : err);
    return back(state.returnUrl, "error");
  }
}
