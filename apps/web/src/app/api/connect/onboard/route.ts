import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount, canManage } from "@/lib/tickets/authz";
import { stripeConnect, isConnectLivemode, isConnectConfigured, webBaseUrl } from "@/lib/stripe-connect";
import { connectedAccountRow, statusFromAccount } from "@/lib/tickets/connect-status";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST: signed { action: "connect_onboard", payload: { account_id } } → { url, status }
// Creates the org's connected account on first call (full dashboard, Stripe collects fees, losses and
// requirements — the shape from the assessment §8.0), then mints a single-use hosted-onboarding link.
export async function POST(request: NextRequest) {
  if (!isConnectConfigured()) return jsonFail(503, "NOT_CONFIGURED", "Stripe Connect ist nicht konfiguriert.");
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["connect_onboard"] });
  if (!v.ok) return failResponse(v);
  const accountId = String(v.payload.account_id ?? "");
  if (!UUID_RE.test(accountId)) return jsonFail(400, "BAD_REQUEST", "account_id fehlt");

  const admin = createAdminClient();
  if (!canManage(await roleInAccount(admin, accountId, v.wallet))) return jsonFail(403, "FORBIDDEN", "Nur Inhaber oder Admins der Organisation.");

  const { data: org } = await admin.from("accounts").select("id, name, contact_email, slug, sub_type").eq("id", accountId).maybeSingle();
  if (!org) return jsonFail(404, "NOT_FOUND", "Organisation nicht gefunden");

  let stripeAccountId = (await connectedAccountRow(admin, accountId))?.stripe_account_id ?? null;
  if (!stripeAccountId) {
    const acct = await stripeConnect.accounts.create({
      country: "DE",
      email: org.contact_email ?? undefined,
      business_type: org.sub_type === "verein" ? "non_profit" : undefined,
      controller: {
        fees: { payer: "account" },
        losses: { payments: "stripe" },
        stripe_dashboard: { type: "full" },
        requirement_collection: "stripe",
      },
      capabilities: { card_payments: { requested: true } },
      business_profile: {
        name: org.name,
        url: org.slug ? `${webBaseUrl()}/org/${org.slug}` : undefined,
        product_description: "Eintrittskarten und Gebühren für Veranstaltungen in Röbel/Müritz",
      },
      metadata: { roebel_account_id: accountId },
    });
    stripeAccountId = acct.id;
    const status = statusFromAccount(acct);
    const { error } = await admin.from("stripe_connected_accounts").insert({
      account_id: accountId,
      stripe_account_id: acct.id,
      livemode: isConnectLivemode(),
      dashboard_type: "full",
      created_by_wallet: v.wallet,
      details_submitted: status.details_submitted,
      charges_enabled: status.charges_enabled,
      payouts_enabled: status.payouts_enabled,
      disabled_reason: status.disabled_reason,
      requirements_currently_due: acct.requirements?.currently_due ?? [],
    });
    if (error) return jsonFail(500, "DB_ERROR", error.message);
  }

  const returnTo = encodeURIComponent("roebel://org/payments");
  const link = await stripeConnect.accountLinks.create({
    account: stripeAccountId,
    type: "account_onboarding",
    collection_options: { fields: "eventually_due" },
    return_url: `${webBaseUrl()}/connect/return?return_to=${returnTo}`,
    refresh_url: `${webBaseUrl()}/connect/return?refresh=true&return_to=${returnTo}`,
  });
  return jsonOk({ url: link.url, stripe_account_id: stripeAccountId });
}
