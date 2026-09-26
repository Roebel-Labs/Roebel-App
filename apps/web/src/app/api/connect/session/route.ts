import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount, canManage } from "@/lib/tickets/authz";
import { stripeConnect, isConnectConfigured, connectPublishableKey } from "@/lib/stripe-connect";
import { assertTicketsEnabled } from "@/lib/tickets/flags";
import { ensureConnectedAccount } from "@/lib/tickets/connect-account";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST: signed { action: "connect_session", payload: { account_id } } → { client_secret, publishable_key }
//
// Issues a short-lived Stripe AccountSession so the app can render Stripe's onboarding component
// natively (no external browser). Security:
// - only owner/admin of the org, behind the server-side stripe_connect_enabled gate;
// - the session is scoped to that org's connected account and to the onboarding component only;
// - the client secret is never logged or stored, and the response is marked no-store;
// - Stripe user authentication stays ON (full-dashboard accounts cannot disable it), so sensitive
//   steps such as bank details are confirmed by the account holder with Stripe itself.
export async function POST(request: NextRequest) {
  if (!isConnectConfigured()) return jsonFail(503, "NOT_CONFIGURED", "Stripe Connect ist nicht konfiguriert.");
  const publishableKey = connectPublishableKey();
  if (!publishableKey) return jsonFail(503, "NOT_CONFIGURED", "Stripe Connect ist nicht vollständig konfiguriert.");

  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["connect_session"] });
  if (!v.ok) return failResponse(v);
  const accountId = String(v.payload.account_id ?? "");
  if (!UUID_RE.test(accountId)) return jsonFail(400, "BAD_REQUEST", "account_id fehlt");

  const admin = createAdminClient();
  if (!(await assertTicketsEnabled(admin, "stripe_connect_enabled", v.wallet))) {
    return jsonFail(503, "DISABLED", "Diese Funktion ist derzeit nicht verfügbar.");
  }
  if (!canManage(await roleInAccount(admin, accountId, v.wallet))) {
    return jsonFail(403, "FORBIDDEN", "Nur Inhaber oder Admins der Organisation.");
  }

  const ensured = await ensureConnectedAccount(admin, accountId, v.wallet);
  if (!ensured.ok) return jsonFail(ensured.status, ensured.code, ensured.message);

  try {
    const session = await stripeConnect.accountSessions.create({
      account: ensured.stripeAccountId,
      components: {
        account_onboarding: { enabled: true, features: { external_account_collection: true } },
      },
    });
    return NextResponse.json(
      { ok: true, data: { client_secret: session.client_secret, publishable_key: publishableKey } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return jsonFail(502, "STRIPE_ERROR", err instanceof Error ? err.message : "Stripe-Fehler");
  }
}
