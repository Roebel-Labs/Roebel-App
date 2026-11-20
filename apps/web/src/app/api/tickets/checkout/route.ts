import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { webBaseUrl } from "@/lib/stripe-connect";
import { clampMollieApplicationFee, getProvider, platformFeeCents, resolveCheckoutProvider } from "@/lib/payments";
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
  const v = await verifySignedRequest(await request.json().catch(() => null), { headers: request.headers, actions: ["checkout"] });
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

  // Rail choice (lib/payments resolveCheckoutProvider): Mollie when the org has an active Mollie
  // account, else its Stripe account, else no paid sales.
  const providerId = await resolveCheckoutProvider(admin, order.account_id);
  if (!providerId) {
    await admin.from("ticket_orders").update({ status: "cancelled" }).eq("id", order.id);
    return jsonFail(409, "CONNECT_REQUIRED", "Der Veranstalter kann noch keine Zahlungen annehmen.");
  }
  const [{ data: tt }, { data: ev }] = await Promise.all([
    admin.from("ticket_types").select("name").eq("id", ticketTypeId).maybeSingle(),
    admin.from("events").select("title").eq("id", order.event_id).maybeSingle(),
  ]);
  const baseFee = platformFeeCents(order.amount_cents);
  // Mollie caps application fees (amount − €0.35 − 6 %); clamp rather than fail the checkout.
  const feeCents = providerId === "mollie" ? clampMollieApplicationFee(baseFee, order.amount_cents) : baseFee;
  const returnTo = encodeURIComponent(`roebel://tickets/${order.id}`);
  try {
    const result = await getProvider(providerId).createCheckout({
      accountId: order.account_id, amountCents: order.amount_cents, feeCents, currency: order.currency, quantity: order.quantity,
      description: `${tt?.name ?? "Ticket"} – ${ev?.title ?? "Veranstaltung"}`, reference: order.id, kind: "event_ticket",
      expiresAt: order.expires_at, customerEmail: email, extraMetadata: { event_id: order.event_id },
      returnUrl: `${webBaseUrl()}/tickets/return?order_id=${order.id}&return_to=${returnTo}`,
      cancelUrl: `${webBaseUrl()}/tickets/return?cancelled=true&order_id=${order.id}&return_to=${returnTo}`,
    });
    await admin.from("ticket_orders").update(
      providerId === "stripe"
        ? { stripe_checkout_session_id: result.providerPaymentId, stripe_account_id: result.providerAccountId,
            application_fee_cents: feeCents, livemode: result.livemode }
        : { rail: "mollie", provider_payment_id: result.providerPaymentId, provider_account_id: result.providerAccountId,
            application_fee_cents: feeCents, livemode: result.livemode },
    ).eq("id", order.id);
    return jsonOk({ order_id: order.id, status: "pending", url: result.url, expires_at: order.expires_at, amount_cents: order.amount_cents, fee_cents: feeCents, provider: providerId });
  } catch (err) {
    await admin.from("ticket_orders").update({ status: "cancelled" }).eq("id", order.id);
    const code = providerId === "mollie" ? "MOLLIE_ERROR" : "STRIPE_ERROR";
    return jsonFail(502, code, err instanceof Error ? err.message : "Zahlungsanbieter-Fehler");
  }
}
