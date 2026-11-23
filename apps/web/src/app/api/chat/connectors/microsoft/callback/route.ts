import { DEFAULT_RETURN_URL, openState } from "@/lib/chat/harness/connectors/google";
import {
  exchangeMicrosoftCode, microsoftConfig, microsoftGate, microsoftRedirectUri, withQuery,
} from "@/lib/chat/harness/connectors/microsoft";
import { deleteConnectorsOfKind, insertConnector } from "@/lib/chat/harness/connectors/store";
import { jsonError } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(url: string, result: "ok" | "error" | "cancelled" | "admin"): Response {
  return new Response(null, { status: 302, headers: { Location: withQuery(url, { microsoft: result }), "Cache-Control": "no-store" } });
}

/**
 * GET /api/chat/connectors/microsoft/callback?code&state — Microsoft redirects here.
 * Exchanges the code (PKCE), stores the refresh token encrypted (one Microsoft link per wallet)
 * and sends the browser back. `admin` = the organisation requires an admin's approval first.
 */
export async function GET(request: Request) {
  const gate = microsoftGate();
  if (gate) return jsonError(gate.status, gate.code, gate.message);
  const params = new URL(request.url).searchParams;
  const state = openState(params.get("state") ?? "");
  if (!state) return back(DEFAULT_RETURN_URL, "error");
  const error = params.get("error");
  if (error) {
    const desc = params.get("error_description") ?? "";
    // AADSTS65001 / AADSTS90094: consent needs an administrator of the organisation.
    if (/AADSTS(65001|90094|90095)/.test(desc) || error === "consent_required") return back(state.returnUrl, "admin");
    return back(state.returnUrl, error === "access_denied" ? "cancelled" : "error");
  }
  const code = params.get("code");
  if (!code) return back(state.returnUrl, "error");
  try {
    const tokens = await exchangeMicrosoftCode(microsoftConfig()!, {
      code, verifier: state.verifier, redirectUri: microsoftRedirectUri(request.url),
    });
    await deleteConnectorsOfKind(state.wallet, "microsoft");
    const name = (tokens.email ? `Microsoft (${tokens.email})` : "Microsoft").slice(0, 60);
    await insertConnector({
      wallet: state.wallet, kind: "microsoft", name, url: null,
      secret: { refreshToken: tokens.refreshToken, scope: tokens.scope },
    });
    return back(state.returnUrl, "ok");
  } catch (err) {
    console.error("[api/chat/connectors/microsoft/callback]", err instanceof Error ? err.message : err);
    return back(state.returnUrl, "error");
  }
}
