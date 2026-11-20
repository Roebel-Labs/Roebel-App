import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount, canManage } from "@/lib/tickets/authz";
import { stripeConnect } from "@/lib/stripe-connect";
import { getProvider } from "@/lib/payments";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["refund_order"], requireSignature: true });
  if (!v.ok) return failResponse(v);
  const admin = createAdminClient();
  const { data: order } = await admin.from("ticket_orders").select("id, status, rail, account_id, stripe_account_id, stripe_payment_intent_id, provider_payment_id").eq("id", String(v.payload.order_id ?? "")).maybeSingle();
  if (!order) return jsonFail(404, "NOT_FOUND", "Bestellung nicht gefunden");
  if (!canManage(await roleInAccount(admin, order.account_id, v.wallet))) return jsonFail(403, "FORBIDDEN", "Nur Inhaber oder Admins.");
  if (order.status !== "paid") return jsonFail(409, "NOT_REFUNDABLE", "Nur bezahlte Bestellungen können erstattet werden.");

  // A checked-in ticket means someone already walked through the door on it. Refunding that is a
  // decision the organiser has to make knowingly, so it takes a second, explicit `force`.
  const { count: checkedIn } = await admin.from("tickets")
    .select("id", { count: "exact", head: true }).eq("order_id", order.id).eq("status", "checked_in");
  if ((checkedIn ?? 0) > 0 && v.payload.force !== true) {
    return jsonFail(409, "TICKETS_CHECKED_IN", "Mindestens ein Ticket wurde bereits eingelöst. Erstattung nur mit Bestätigung.");
  }

  if (order.rail === "free") {
    await admin.from("ticket_orders").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", order.id);
    await admin.from("tickets").update({ status: "void" }).eq("order_id", order.id);
    return jsonOk({ refunded: true });
  }
  if (order.rail === "mollie") {
    if (!order.provider_payment_id) return jsonFail(409, "NOT_REFUNDABLE", "Keine Zahlung hinterlegt.");
    try {
      // Mollie refunds come out of the org's Mollie balance; the application fee is NOT refunded by
      // Mollie (see TODO(mollie-fee-refund) in lib/payments/mollie/provider.ts).
      await getProvider("mollie").refund(order.account_id, order.provider_payment_id);
      // Mark the order here; the payment webhook (amountRefunded) converges to the same state idempotently.
      await admin.from("ticket_orders").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", order.id).eq("status", "paid");
      await admin.from("tickets").update({ status: "refunded" }).eq("order_id", order.id).in("status", ["issued", "checked_in"]);
      return jsonOk({ refunded: true });
    } catch (err) {
      return jsonFail(502, "MOLLIE_ERROR", err instanceof Error ? err.message : "Mollie-Fehler");
    }
  }
  if (!order.stripe_payment_intent_id || !order.stripe_account_id) return jsonFail(409, "NOT_REFUNDABLE", "Keine Zahlung hinterlegt.");
  try {
    // refund_application_fee: the platform fee goes back too, so the org is never short after a refund.
    await stripeConnect.refunds.create({ payment_intent: order.stripe_payment_intent_id, refund_application_fee: true }, { stripeAccount: order.stripe_account_id });
    return jsonOk({ refunded: true });
  } catch (err) {
    return jsonFail(502, "STRIPE_ERROR", err instanceof Error ? err.message : "Stripe-Fehler");
  }
}
