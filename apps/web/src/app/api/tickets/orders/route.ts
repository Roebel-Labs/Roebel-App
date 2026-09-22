import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount, canManage } from "@/lib/tickets/authz";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ORDERS = 200;

/**
 * What the organiser sees per order. Deliberately no buyer_wallet and no buyer_email: an org
 * needs the money, the ticket count and the check-in count to run its door — not the identity
 * of the people who bought. The buyer-facing OrderView (lib/tickets/views.ts) stays separate.
 */
export type OrgOrderView = {
  id: string; status: string; quantity: number; amount_cents: number; currency: string; rail: string;
  created_at: string; paid_at: string | null; refunded_at: string | null;
  ticket_type_name: string; tickets_total: number; tickets_checked_in: number;
};

// POST signed { action: "orders_list", payload: { event_id } } → { orders: OrgOrderView[] }
export async function POST(request: NextRequest) {
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["orders_list"] });
  if (!v.ok) return failResponse(v);
  const eventId = String(v.payload.event_id ?? "");
  if (!UUID_RE.test(eventId)) return jsonFail(400, "BAD_REQUEST", "event_id fehlt");

  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("id, account_id").eq("id", eventId).maybeSingle();
  if (!event?.account_id) return jsonFail(404, "NOT_FOUND", "Veranstaltung gehört keiner Organisation");
  if (!canManage(await roleInAccount(admin, event.account_id, v.wallet))) return jsonFail(403, "FORBIDDEN", "Nur Inhaber oder Admins.");

  const { data: orders, error } = await admin.from("ticket_orders")
    .select("id, status, quantity, amount_cents, currency, rail, created_at, paid_at, refunded_at, ticket_type_id")
    .eq("event_id", eventId).order("created_at", { ascending: false }).limit(MAX_ORDERS);
  if (error) return jsonFail(500, "DB_ERROR", error.message);
  if (!orders || orders.length === 0) return jsonOk({ orders: [] });

  const [{ data: types }, { data: tickets }] = await Promise.all([
    admin.from("ticket_types").select("id, name").in("id", [...new Set(orders.map((o) => o.ticket_type_id))]),
    admin.from("tickets").select("order_id, status").in("order_id", orders.map((o) => o.id)),
  ]);
  const typeName = new Map((types ?? []).map((t) => [t.id, t.name as string]));

  const views: OrgOrderView[] = orders.map((o) => {
    const own = (tickets ?? []).filter((t) => t.order_id === o.id);
    return {
      id: o.id, status: o.status, quantity: o.quantity, amount_cents: o.amount_cents, currency: o.currency,
      rail: o.rail, created_at: o.created_at, paid_at: o.paid_at, refunded_at: o.refunded_at,
      ticket_type_name: typeName.get(o.ticket_type_id) ?? "Ticket",
      tickets_total: own.length,
      tickets_checked_in: own.filter((t) => t.status === "checked_in").length,
    };
  });
  return jsonOk({ orders: views });
}
