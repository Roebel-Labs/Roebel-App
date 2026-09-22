import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTicketCode } from "./codes";

/**
 * Flip a pending order to paid and mint its tickets exactly once. Free orders are already paid
 * when created.
 *
 * `allowLate` also accepts an `expired` or `cancelled` order. Only the Stripe webhook passes it:
 * Stripe confirming a payment is proof that money moved, and our 35-minute hold having run out in
 * the meantime must not turn that into a charge without tickets. The self-heal paths do not pass
 * it, so a cancelled order is never resurrected by a plain reload.
 */
export async function settleOrder(
  admin: SupabaseClient, orderId: string,
  opts: { paymentIntentId?: string | null; sessionId?: string | null; allowLate?: boolean },
): Promise<{ issued: number }> {
  const { data: order } = await admin.from("ticket_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return { issued: 0 };
  const isLate = opts.allowLate === true && (order.status === "expired" || order.status === "cancelled");
  if (!isLate && order.status !== "pending" && order.status !== "paid") return { issued: 0 };

  if (isLate || order.status === "pending") {
    const update = admin.from("ticket_orders")
      .update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent_id: opts.paymentIntentId ?? order.stripe_payment_intent_id,
        stripe_checkout_session_id: opts.sessionId ?? order.stripe_checkout_session_id })
      .eq("id", orderId);
    const { data: updated } = await (isLate ? update.in("status", ["expired", "cancelled"]) : update.eq("status", "pending")).select("id");
    if (!updated || updated.length === 0) return { issued: 0 }; // another caller settled first
    if (isLate) console.warn("[tickets] late payment settled after hold expiry", orderId);
  }

  // Checked after the pending→paid flip (not before): a `paid` order with zero tickets — e.g. the
  // insert below failed on a previous call — must still be recoverable by any later settleOrder call.
  const { count } = await admin.from("tickets").select("id", { count: "exact", head: true }).eq("order_id", orderId);
  if ((count ?? 0) > 0) return { issued: 0 };

  const rows = Array.from({ length: order.quantity }, () => ({
    order_id: orderId, event_id: order.event_id, ticket_type_id: order.ticket_type_id,
    code: generateTicketCode(), holder_wallet: order.buyer_wallet, status: "issued",
  }));
  const { error } = await admin.from("tickets").insert(rows);
  if (error) throw new Error(`tickets insert failed: ${error.message}`);
  await notifyBuyer(order.buyer_wallet, order.event_id, order.quantity);
  return { issued: rows.length };
}

async function notifyBuyer(wallet: string, eventId: string, quantity: number) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        type: "ticket_issued", walletAddresses: [wallet],
        title: quantity === 1 ? "Dein Ticket ist da" : `Deine ${quantity} Tickets sind da`,
        body: "Tippe, um deine Tickets in der Röbel App zu öffnen.",
        data: { type: "ticket", eventId },
      }),
    });
  } catch (err) {
    console.error("[tickets] push failed (non-fatal)", err);
  }
}
