import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount, canManage } from "@/lib/tickets/authz";
import { orgOrderViews } from "@/lib/tickets/org-orders";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type { OrgOrderView } from "@/lib/tickets/org-orders";

// POST signed { action: "orders_list", payload: { event_id } } → { orders: OrgOrderView[] }
export async function POST(request: NextRequest) {
  const v = await verifySignedRequest(await request.json().catch(() => null), { headers: request.headers, actions: ["orders_list"] });
  if (!v.ok) return failResponse(v);
  const eventId = String(v.payload.event_id ?? "");
  if (!UUID_RE.test(eventId)) return jsonFail(400, "BAD_REQUEST", "event_id fehlt");

  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("id, account_id").eq("id", eventId).maybeSingle();
  if (!event?.account_id) return jsonFail(404, "NOT_FOUND", "Veranstaltung gehört keiner Organisation");
  if (!canManage(await roleInAccount(admin, event.account_id, v.wallet))) return jsonFail(403, "FORBIDDEN", "Nur Inhaber oder Admins.");

  try {
    return jsonOk({ orders: await orgOrderViews(admin, eventId) });
  } catch (err) {
    return jsonFail(500, "DB_ERROR", err instanceof Error ? err.message : "DB-Fehler");
  }
}
