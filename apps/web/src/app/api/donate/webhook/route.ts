import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTreasuryDonationMetadata } from "@/lib/donations/config";

export const dynamic = "force-dynamic";

// Stripe webhook for treasury contributions (Unterstützungsbeiträge).
//
// Runs on the MAIN Stripe account (same as event tickets). Configure a
// dedicated webhook endpoint in the Stripe dashboard pointing here with
// its own signing secret (STRIPE_WEBHOOK_SECRET_DONATIONS); falls back to
// STRIPE_WEBHOOK_SECRET for single-endpoint setups.
//
// Handled events:
//   checkout.session.completed             → settled (cards/wallets settle sync)
//   checkout.session.async_payment_succeeded → settled (SEPA-Lastschrift etc.)
//   checkout.session.async_payment_failed  → failed
//
// Sessions whose metadata.kind !== 'treasury_donation' (tickets, other
// flows on this account) are ignored silently.
//
// We also fetch the charge's balance transaction to store net_amount_cents
// (amount after Stripe fees) so the public ledger can show what actually
// reaches the treasury.

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const webhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET_DONATIONS ??
    process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[donate.webhook] webhook secret not configured");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[donate.webhook] signature verification failed:", message);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const isCompleted = event.type === "checkout.session.completed";
  const isAsyncSuccess = event.type === "checkout.session.async_payment_succeeded";
  const isAsyncFailed = event.type === "checkout.session.async_payment_failed";
  if (!isCompleted && !isAsyncSuccess && !isAsyncFailed) {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.kind !== "treasury_donation") {
    // Not ours (e.g. event tickets) — ignore silently.
    return NextResponse.json({ received: true });
  }

  let meta;
  try {
    meta = parseTreasuryDonationMetadata(session.metadata);
  } catch (err) {
    console.error("[donate.webhook] metadata parse failed", err);
    return NextResponse.json(
      { error: "invalid_metadata", details: (err as Error).message ?? "" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: donation, error: lookupErr } = await supabase
    .from("donations")
    .select("id, status")
    .eq("id", meta.donation_id)
    .maybeSingle();
  if (lookupErr) {
    console.error("[donate.webhook] donation lookup failed", lookupErr);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!donation) {
    console.error("[donate.webhook] donation not found", meta.donation_id);
    return NextResponse.json({ error: "donation_not_found" }, { status: 404 });
  }

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  if (isAsyncFailed) {
    const { error: failErr } = await supabase
      .from("donations")
      .update({
        status: "failed",
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq("id", donation.id);
    if (failErr) {
      console.error("[donate.webhook] fail update failed", failErr);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }

  // completed / async success. For async payment methods the 'completed'
  // event fires while payment_status is still 'unpaid' — keep those pending
  // until async_payment_succeeded arrives.
  if (isCompleted && session.payment_status === "unpaid") {
    return NextResponse.json({ received: true, awaiting_async: true });
  }

  if (donation.status === "settled") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Net amount after Stripe fees, from the charge's balance transaction.
  // Best-effort — the contribution settles regardless.
  let netAmountCents: number | null = null;
  if (paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge.balance_transaction"],
      });
      const charge = paymentIntent.latest_charge;
      if (charge && typeof charge !== "string") {
        const balanceTx = charge.balance_transaction;
        if (balanceTx && typeof balanceTx !== "string") {
          netAmountCents = balanceTx.net;
        }
      }
    } catch (err) {
      console.warn("[donate.webhook] balance transaction fetch failed", err);
    }
  }

  const { error: updateErr } = await supabase
    .from("donations")
    .update({
      status: "settled",
      settled_at: new Date().toISOString(),
      net_amount_cents: netAmountCents,
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq("id", donation.id);

  if (updateErr) {
    // 23505 = unique violation on stripe_session_id → concurrent replay.
    if ((updateErr as { code?: string }).code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[donate.webhook] settle update failed", updateErr);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  console.log(
    "✅ [donate.webhook] settled contribution",
    donation.id,
    meta.amount_cents,
    "cents (net",
    netAmountCents,
    ")",
  );
  return NextResponse.json({ received: true });
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "donate/webhook",
    has_secret: !!(
      process.env.STRIPE_WEBHOOK_SECRET_DONATIONS ?? process.env.STRIPE_WEBHOOK_SECRET
    ),
    using_dedicated_secret: !!process.env.STRIPE_WEBHOOK_SECRET_DONATIONS,
  });
}
