import { NextResponse } from "next/server";
import { adminConsentUrl, microsoftConfig, microsoftGate, microsoftRedirectUri } from "@/lib/chat/harness/connectors/microsoft";
import { jsonError } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/chat/connectors/microsoft/admin-consent — { url } an organisation's Microsoft 365
 * admin opens once to approve Ortis for the whole organisation (when staff may not consent
 * themselves). Public: the link contains only the app id and the requested permissions.
 */
export async function GET(request: Request) {
  const gate = microsoftGate();
  if (gate) return jsonError(gate.status, gate.code, gate.message);
  return NextResponse.json({ url: adminConsentUrl(microsoftConfig()!, microsoftRedirectUri(request.url)) });
}
