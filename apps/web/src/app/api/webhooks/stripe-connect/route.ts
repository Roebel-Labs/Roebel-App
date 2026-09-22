import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripeConnect } from "@/lib/stripe-connect";
import { createAdminClient } from "@/lib/supabase/admin";
import { settleOrder } from "@/lib/tickets/settle";
import { syncConnectedAccount } from "@/lib/tickets/connect-status";

export const dynamic = "force-dynamic";

// Connect webhook ("events on connected accounts"). Idempotent via stripe_events(id).
// 400 = bad signature (Stripe must not retry), 500 = our failure (Stripe retries).
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "not_configured" }, { status: signature ? 500 : 400 });

  let event: Stripe.Event;
  try {
    event = stripeConnect.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    return NextResponse.json({ error: "invalid_signature", details: err instanceof Error ? err.message : "" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: dupErr } = await admin.from("stripe_events").insert({ id: event.id, type: event.type, account: event.account ?? null, livemode: event.livemode });
  if (dupErr) return NextResponse.json({ received: true, duplicate: true }); // 23505 or any prior insert → already handled

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.kind === "event_ticket" && s.metadata.order_id && s.payment_status === "paid") {
          await settleOrder(admin, s.metadata.order_id, { paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null, sessionId: s.id });
        }
        break;
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.kind === "event_ticket" && s.metadata.order_id) {
          await admin.from("ticket_orders").update({ status: event.type === "checkout.session.expired" ? "expired" : "cancelled" })
            .eq("id", s.metadata.order_id).eq("status", "pending");
        }
        break;
      }
      case "charge.refunded": {
        const c = event.data.object as Stripe.Charge;
        const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
        if (pi && c.refunded) {
          const { data: order } = await admin.from("ticket_orders").select("id").eq("stripe_payment_intent_id", pi).maybeSingle();
          if (order) {
            await admin.from("ticket_orders").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", order.id);
            await admin.from("tickets").update({ status: "refunded" }).eq("order_id", order.id).in("status", ["issued", "checked_in"]);
          }
        }
        break;
      }
      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        const { data: row } = await admin.from("stripe_connected_accounts").select("account_id").eq("stripe_account_id", acct.id).maybeSingle();
        if (row) await syncConnectedAccount(admin, row.account_id);
        break;
      }
      default:
        break;
    }
    await admin.from("stripe_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("stripe_events").update({ error: message }).eq("id", event.id);
    await admin.from("stripe_events").delete().eq("id", event.id); // let Stripe retry
    return NextResponse.json({ error: "processing_failed", details: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ has_secret: !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET });
}
