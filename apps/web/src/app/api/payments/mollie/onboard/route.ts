import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount, canManage } from "@/lib/tickets/authz";
import { assertTicketsEnabled } from "@/lib/tickets/flags";
import { isMollieConfigured } from "@/lib/payments/mollie/client";
import { buildMollieOnboardingUrl, type OwnerPrefill } from "@/lib/payments/mollie/provider";
import { isPaymentTokenKeyConfigured } from "@/lib/payments/secrets";
import { PaymentProviderError } from "@/lib/payments/types";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(v: unknown, max = 120): string | undefined {
  return typeof v === "string" && v.trim() && v.length <= max ? v.trim() : undefined;
}

// POST: signed { action: "payments_onboard", payload: { account_id, owner?: { given_name, family_name, email } } }
//   → { url, kind }. Same auth as /api/connect/onboard: owner/admin of the org, behind mollie_enabled.
// `url` is a pre-filled Mollie Client Link when the platform token + owner data allow it, else the
// plain OAuth authorize URL; both return to /api/payments/mollie/callback.
export async function POST(request: NextRequest) {
  if (!isMollieConfigured() || !isPaymentTokenKeyConfigured()) return jsonFail(503, "NOT_CONFIGURED", "Mollie ist nicht konfiguriert.");
  const v = await verifySignedRequest(await request.json().catch(() => null), { headers: request.headers, actions: ["payments_onboard"] });
  if (!v.ok) return failResponse(v);
  const accountId = String(v.payload.account_id ?? "");
  if (!UUID_RE.test(accountId)) return jsonFail(400, "BAD_REQUEST", "account_id fehlt");

  const admin = createAdminClient();
  if (!(await assertTicketsEnabled(admin, "mollie_enabled", v.wallet))) {
    return jsonFail(503, "DISABLED", "Diese Funktion ist derzeit nicht verfügbar.");
  }
  if (!canManage(await roleInAccount(admin, accountId, v.wallet))) return jsonFail(403, "FORBIDDEN", "Nur Inhaber oder Admins der Organisation.");

  const o = (v.payload.owner ?? {}) as Record<string, unknown>;
  const email = str(o.email, 254);
  const owner: OwnerPrefill = {
    givenName: str(o.given_name), familyName: str(o.family_name),
    email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : undefined,
  };
  try {
    return jsonOk(await buildMollieOnboardingUrl(admin, accountId, v.wallet, owner));
  } catch (err) {
    if (err instanceof PaymentProviderError) return jsonFail(err.status, err.code, err.message);
    return jsonFail(502, "MOLLIE_ERROR", err instanceof Error ? err.message : "Mollie-Fehler");
  }
}
