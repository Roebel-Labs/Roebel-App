import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { stripeConnect, isConnectLivemode, platformFeeCents, webBaseUrl } from "@/lib/stripe-connect";
import { connectedAccountRow } from "@/lib/tickets/connect-status";
import { settleOrder } from "@/lib/tickets/settle";
import { assertTicketsEnabled } from "@/lib/tickets/flags";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOLD_MINUTES = 35;

const RESERVE_ERRORS: Record<string, [number, string]> = {
  sold_out: [409, "Leider ausverkauft."],
  not_on_sale: [409, "Dieses Ticket ist gerade nicht im Verkauf."],
  per_order_max: [400, "So viele Tickets sind pro Bestellung nicht möglich."],
  too_many_pending: [429, "Du hast bereits offene Bestellungen für dieses Ticket. Bitte schließe sie zuerst ab."],
  event_not_bookable: [409, "Diese Veranstaltung ist nicht buchbar."],
};

export async function POST(request: NextRequest) {
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["checkout"] });
  if (!v.ok) return failResponse(v);

  // Server-side pilot gate. The Expo flag only hides the buy button; this one closes the route,
  // so rolling the pilot back cannot be undone by an old build or a hand-crafted signed request.
  const admin = createAdminClient();
  if (!(await assertTicketsEnabled(admin, "stripe_tickets_enabled"))) {
    return jsonFail(503, "DISABLED", "Diese Funktion ist derzeit nicht verfügbar.");
  }

  const ticketTypeId = String(v.payload.ticket_type_id ?? "");
  const quantity = Number(v.payload.quantity ?? 1);
  const email = typeof v.payload.buyer_email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.payload.buyer_email) ? v.payload.buyer_email : null;
  if (!UUID_RE.test(ticketTypeId) || !Number.isInteger(quantity) || quantity < 1) return jsonFail(400, "BAD_REQUEST", "ticket_type_id oder quantity fehlt");

  const { data: order, error } = await admin.rpc("reserve_tickets", {
    p_ticket_type_id: ticketTypeId, p_quantity: quantity, p_buyer_wallet: v.wallet, p_hold_minutes: HOLD_MINUTES,
  });
  if (error || !order) {
    const key = Object.keys(RESERVE_ERRORS).find((k) => (error?.message ?? "").includes(k));
    if (key) return jsonFail(RESERVE_ERRORS[key][0], key.toUpperCase(), RESERVE_ERRORS[key][1]);
    return jsonFail(500, "DB_ERROR", error?.message ?? "Reservierung fehlgeschlagen");
  }
  if (email) await admin.from("ticket_orders").update({ buyer_email: email }).eq("id", order.id);

  if (order.rail === "free") {
    try {
      await settleOrder(admin, order.id, {});
    } catch (err) {
      console.error("[tickets/checkout] settleOrder failed for free order", order.id, err);
      return jsonFail(500, "SETTLE_FAILED", "Reserviert, aber die Tickets konnten noch nicht erstellt werden. Bitte gleich unter „Meine Tickets“ neu laden.");
    }
    return jsonOk({ order_id: order.id, status: "paid", url: null, expires_at: null, amount_cents: 0, fee_cents: 0 });
  }

  const connected = await connectedAccountRow(admin, order.account_id);
  if (!connected?.charges_enabled) {
    await admin.from("ticket_orders").update({ status: "cancelled" }).eq("id", order.id);
    return jsonFail(409, "CONNECT_REQUIRED", "Der Veranstalter kann noch keine Zahlungen annehmen.");
  }
  const [{ data: tt }, { data: ev }] = await Promise.all([
    admin.from("ticket_types").select("name").eq("id", ticketTypeId).maybeSingle(),
    admin.from("events").select("title").eq("id", order.event_id).maybeSingle(),
  ]);
  const feeCents = platformFeeCents(order.amount_cents);
  const returnTo = encodeURIComponent(`roebel://tickets/${order.id}`);
  try {
    const session = await stripeConnect.checkout.sessions.create(
      {
        mode: "payment", locale: "de", submit_type: "book",
        // Cards only: every other method Stripe could offer is either asynchronous (the buyer
        // leaves with no ticket and the order expires before the payment confirms) or not
        // available on a direct charge with an application fee.
        payment_method_types: ["card"],
        line_items: [{ quantity: order.quantity, price_data: { currency: order.currency, unit_amount: Math.round(order.amount_cents / order.quantity),
          product_data: { name: `${tt?.name ?? "Ticket"} – ${ev?.title ?? "Veranstaltung"}` } } }],
        ...(feeCents > 0 ? { payment_intent_data: { application_fee_amount: feeCents } } : {}),
        expires_at: Math.floor(new Date(order.expires_at).getTime() / 1000),
        client_reference_id: order.id,
        customer_email: email ?? undefined,
        metadata: { kind: "event_ticket", order_id: order.id, event_id: order.event_id },
        success_url: `${webBaseUrl()}/tickets/return?order_id=${order.id}&return_to=${returnTo}`,
        cancel_url: `${webBaseUrl()}/tickets/return?cancelled=true&order_id=${order.id}&return_to=${returnTo}`,
      },
      { stripeAccount: connected.stripe_account_id },
    );
    await admin.from("ticket_orders").update({
      stripe_checkout_session_id: session.id, stripe_account_id: connected.stripe_account_id,
      application_fee_cents: feeCents, livemode: isConnectLivemode(),
    }).eq("id", order.id);
    return jsonOk({ order_id: order.id, status: "pending", url: session.url, expires_at: order.expires_at, amount_cents: order.amount_cents, fee_cents: feeCents });
  } catch (err) {
    await admin.from("ticket_orders").update({ status: "cancelled" }).eq("id", order.id);
    return jsonFail(502, "STRIPE_ERROR", err instanceof Error ? err.message : "Stripe-Fehler");
  }
}
