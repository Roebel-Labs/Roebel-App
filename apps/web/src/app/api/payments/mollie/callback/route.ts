import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { roleInAccount, canManage } from "@/lib/tickets/authz";
import { verifyState } from "@/lib/payments/secrets";
import { completeMollieOAuth } from "@/lib/payments/mollie/provider";
import { webBaseUrl } from "@/lib/payments/mollie/client";

export const dynamic = "force-dynamic";

function back(result: "ok" | "error"): NextResponse {
  const u = new URL(`${webBaseUrl()}/connect/return`);
  u.searchParams.set("return_to", "roebel://org/payments");
  u.searchParams.set("provider", "mollie");
  if (result === "error") u.searchParams.set("error", "true");
  return NextResponse.redirect(u.toString(), 303);
}

// GET: Mollie OAuth redirect (`code` + `state`, or `error`). The state is HMAC-signed by us and binds
// the org account + the wallet that started onboarding; the wallet must still be owner/admin.
// Ends on the German /connect/return page, which hands the user back to the app.
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const state = verifyState(p.get("state") ?? "");
  const code = p.get("code");
  if (p.get("error") || !state || !code) {
    if (p.get("error")) console.warn("[mollie-callback] oauth error", p.get("error"), p.get("error_description"));
    else console.warn("[mollie-callback] invalid or expired state / missing code");
    return back("error");
  }
  const admin = createAdminClient();
  if (!canManage(await roleInAccount(admin, state.accountId, state.wallet))) {
    console.warn("[mollie-callback] signer no longer owner/admin", state.accountId);
    return back("error");
  }
  try {
    await completeMollieOAuth(admin, state.accountId, state.wallet, code);
    return back("ok");
  } catch (err) {
    console.error("[mollie-callback] completion failed", state.accountId, err instanceof Error ? err.message : err);
    return back("error");
  }
}
