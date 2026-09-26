import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount, canManage } from "@/lib/tickets/authz";
import { stripeConnect, isConnectConfigured, webBaseUrl } from "@/lib/stripe-connect";
import { ensureConnectedAccount } from "@/lib/tickets/connect-account";
import { assertTicketsEnabled } from "@/lib/tickets/flags";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST: signed { action: "connect_onboard", payload: { account_id } } → { url, status }
// Creates the org's connected account on first call (full dashboard, Stripe collects fees, losses and
// requirements — the shape from the assessment §8.0), then mints a single-use hosted-onboarding link.
// Fallback path for app binaries without the native Stripe SDK; newer binaries use /api/connect/session.
export async function POST(request: NextRequest) {
  if (!isConnectConfigured()) return jsonFail(503, "NOT_CONFIGURED", "Stripe Connect ist nicht konfiguriert.");
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["connect_onboard"] });
  if (!v.ok) return failResponse(v);
  const accountId = String(v.payload.account_id ?? "");
  if (!UUID_RE.test(accountId)) return jsonFail(400, "BAD_REQUEST", "account_id fehlt");

  const admin = createAdminClient();
  // Server-side pilot gate (allowlist-capable), so the org rollout is not governed by which
  // app build the organiser happens to have installed.
  if (!(await assertTicketsEnabled(admin, "stripe_connect_enabled", v.wallet))) {
    return jsonFail(503, "DISABLED", "Diese Funktion ist derzeit nicht verfügbar.");
  }
  if (!canManage(await roleInAccount(admin, accountId, v.wallet))) return jsonFail(403, "FORBIDDEN", "Nur Inhaber oder Admins der Organisation.");

  const ensured = await ensureConnectedAccount(admin, accountId, v.wallet);
  if (!ensured.ok) return jsonFail(ensured.status, ensured.code, ensured.message);
  const stripeAccountId = ensured.stripeAccountId;

  let link;
  try {
    const returnTo = encodeURIComponent("roebel://org/payments");
    link = await stripeConnect.accountLinks.create({
      account: stripeAccountId,
      type: "account_onboarding",
      collection_options: { fields: "eventually_due" },
      return_url: `${webBaseUrl()}/connect/return?return_to=${returnTo}`,
      refresh_url: `${webBaseUrl()}/connect/return?refresh=true&return_to=${returnTo}`,
    });
  } catch (err) {
    return jsonFail(502, "STRIPE_ERROR", err instanceof Error ? err.message : "Stripe-Fehler");
  }
  return jsonOk({ url: link.url, stripe_account_id: stripeAccountId });
}
