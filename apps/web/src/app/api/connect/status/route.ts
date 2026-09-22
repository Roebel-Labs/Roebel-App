import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount } from "@/lib/tickets/authz";
import { syncConnectedAccount } from "@/lib/tickets/connect-status";
import { isConnectConfigured } from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";

// POST: signed { action: "connect_status", payload: { account_id } } → ConnectStatus (any org member may read).
export async function POST(request: NextRequest) {
  if (!isConnectConfigured()) return jsonFail(503, "NOT_CONFIGURED", "Stripe Connect ist nicht konfiguriert.");
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["connect_status"] });
  if (!v.ok) return failResponse(v);
  const accountId = String(v.payload.account_id ?? "");
  const admin = createAdminClient();
  if (!(await roleInAccount(admin, accountId, v.wallet))) return jsonFail(403, "FORBIDDEN", "Kein Mitglied dieser Organisation.");
  try {
    return jsonOk(await syncConnectedAccount(admin, accountId));
  } catch (err) {
    return jsonFail(502, "STRIPE_ERROR", err instanceof Error ? err.message : "Stripe nicht erreichbar");
  }
}
