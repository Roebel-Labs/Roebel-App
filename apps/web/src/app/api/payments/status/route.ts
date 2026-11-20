import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount } from "@/lib/tickets/authz";
import { assertTicketsEnabled } from "@/lib/tickets/flags";
import { isConnectConfigured } from "@/lib/stripe-connect";
import { isMollieConfigured } from "@/lib/payments/mollie/client";
import { getProvider, resolveCheckoutProvider, PROVIDER_LABELS, type PaymentAccountStatus, type PaymentProviderId } from "@/lib/payments";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProviderEntry = PaymentAccountStatus & { id: PaymentProviderId; name: string; subtitle: string; enabled: boolean; error: string | null };

// POST: signed { action: "payments_status", payload: { account_id } } (any org member may read) →
// { providers: [mollie, stripe] (Mollie first = default), active: provider used by checkout or null }.
// Labels come from the server so the app never hardcodes provider names.
export async function POST(request: NextRequest) {
  const v = await verifySignedRequest(await request.json().catch(() => null), { headers: request.headers, actions: ["payments_status"] });
  if (!v.ok) return failResponse(v);
  const accountId = String(v.payload.account_id ?? "");
  if (!UUID_RE.test(accountId)) return jsonFail(400, "BAD_REQUEST", "account_id fehlt");
  const admin = createAdminClient();
  if (!(await roleInAccount(admin, accountId, v.wallet))) return jsonFail(403, "FORBIDDEN", "Kein Mitglied dieser Organisation.");

  const [mollieOn, stripeOn] = await Promise.all([
    assertTicketsEnabled(admin, "mollie_enabled", v.wallet),
    assertTicketsEnabled(admin, "stripe_connect_enabled", v.wallet),
  ]);

  const entry = async (id: PaymentProviderId, enabled: boolean): Promise<ProviderEntry> => {
    const base = { id, ...PROVIDER_LABELS[id], enabled, error: null as string | null };
    const empty: PaymentAccountStatus = { provider: id, connected: false, canReceivePayments: false, canReceiveSettlements: false,
      onboardingStatus: "none", livemode: false, dashboardUrl: null };
    const configured = id === "mollie" ? isMollieConfigured() : isConnectConfigured();
    if (!configured) return { ...empty, ...base, enabled: false };
    try {
      return { ...(await getProvider(id).refreshStatus(accountId)), ...base };
    } catch (err) {
      return { ...empty, ...base, error: err instanceof Error ? err.message : "Anbieter nicht erreichbar" };
    }
  };
  // Stripe is listed even with its flag off when the org is already connected there (it keeps working).
  const providers = await Promise.all([entry("mollie", mollieOn), entry("stripe", stripeOn)]);
  const visible = providers.filter((p) => p.enabled || p.connected);
  return jsonOk({ providers: visible, active: await resolveCheckoutProvider(admin, accountId) });
}
