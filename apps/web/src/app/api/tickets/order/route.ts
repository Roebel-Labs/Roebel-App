import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { orderViews } from "@/lib/tickets/views";
import { settleOrder } from "@/lib/tickets/settle";
import { MOLLIE_ORDER_COLUMNS, syncMollieTicketOrder, type MollieOrderRow } from "@/lib/payments/mollie/settle";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const v = await verifySignedRequest(await request.json().catch(() => null), { headers: request.headers, actions: ["order_status"] });
  if (!v.ok) return failResponse(v);
  const orderId = String(v.payload.order_id ?? "");
  const admin = createAdminClient();

  // Self-heal: a `paid` order with zero tickets means a previous settleOrder call minted nothing
  // (e.g. the tickets insert failed). Retry it here so a buyer who just reloads always converges.
  const { data: order } = await admin.from("ticket_orders").select("id, status, buyer_wallet").eq("id", orderId).maybeSingle();
  if (order && order.buyer_wallet === v.wallet && order.status === "paid") {
    const { count } = await admin.from("tickets").select("id", { count: "exact", head: true }).eq("order_id", orderId);
    if ((count ?? 0) === 0) {
      try {
        await settleOrder(admin, orderId, {});
      } catch (err) {
        console.error("[tickets/order] self-heal settleOrder failed", orderId, err);
      }
    }
  }

  // Mollie self-heal: a pending Mollie order whose webhook has not landed yet is checked against
  // Mollie directly (same binding rules as the webhook, but without allowLate).
  if (order && order.buyer_wallet === v.wallet && order.status === "pending") {
    const { data: m } = await admin.from("ticket_orders").select(MOLLIE_ORDER_COLUMNS).eq("id", orderId).eq("rail", "mollie").maybeSingle();
    if (m && (m as MollieOrderRow).provider_payment_id) {
      try {
        await syncMollieTicketOrder(admin, m as MollieOrderRow, { allowLate: false });
      } catch (err) {
        console.error("[tickets/order] mollie self-heal failed", orderId, err);
      }
    }
  }

  const [view] = await orderViews(admin, { orderId, buyerWallet: v.wallet });
  if (!view) return jsonFail(404, "NOT_FOUND", "Bestellung nicht gefunden");
  return jsonOk(view);
}
