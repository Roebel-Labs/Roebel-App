import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyMoneriumSignature,
  moneriumAmountToCents,
  type MoneriumOrderEvent,
} from "@/lib/donations/monerium";
import { DONATION_CODE_REGEX, TREASURY_SAFE } from "@/lib/donations/config";

export const dynamic = "force-dynamic";

// Monerium webhook — incoming SEPA transfers to the treasury IBAN.
//
// Every EUR payment to the Monerium IBAN auto-mints EURe into the linked
// treasury Safe on Gnosis; Monerium notifies us with order.created /
// order.updated events (kind 'issue'). We verify the Svix-style signature,
// log the raw event (idempotency via the retried webhook-id), and maintain
// the donations ledger:
//
//   state placed/pending → donations row status 'pending'
//   state processed      → 'settled' (+ tx hash)
//   state rejected       → 'failed'
//
// Attribution: donors put their RBL-XXXXXX code in the Verwendungszweck;
// we regex-match it in the order memo against donation_references.
//
// IMPORTANT dedupe: Stripe payouts arrive on this IBAN as ONE aggregated
// SEPA credit. Those card contributions are already ledgered one-by-one by
// /api/donate/webhook — recording the payout too would double-count. We
// detect Stripe payouts by memo and skip them (event still logged).

const STRIPE_PAYOUT_MEMO = /stripe/i;

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const secret = process.env.MONERIUM_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[monerium.webhook] MONERIUM_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const webhookId = request.headers.get("webhook-id");
  const verified = verifyMoneriumSignature({
    rawBody,
    webhookId,
    webhookTimestamp: request.headers.get("webhook-timestamp"),
    signatureHeader: request.headers.get("webhook-signature"),
    secret,
  });
  if (!verified) {
    console.error("[monerium.webhook] signature verification failed");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event: MoneriumOrderEvent;
  try {
    event = JSON.parse(rawBody) as MoneriumOrderEvent;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Subscription validation handshake — just ack.
  if (event.type === "subscription.created") {
    return NextResponse.json({ received: true });
  }

  const supabase = createAdminClient();

  // Idempotency: retried deliveries reuse the same webhook-id. PK conflict
  // (23505) → we already handled this event.
  const eventId = webhookId ?? `no-id:${event.type}:${event.data?.id ?? "?"}`;
  const { error: insertEventErr } = await supabase.from("monerium_events").insert({
    event_id: eventId,
    event_type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });
  if (insertEventErr) {
    if ((insertEventErr as { code?: string }).code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[monerium.webhook] event insert failed", insertEventErr);
    // Continue anyway — losing audit rows must not lose donations.
  }

  if (event.type !== "order.created" && event.type !== "order.updated") {
    await markProcessed(supabase, eventId, null);
    return NextResponse.json({ received: true });
  }

  const order = event.data;
  if (!order?.id) {
    await markProcessed(supabase, eventId, "missing order id");
    return NextResponse.json({ received: true });
  }

  // Only incoming mints TO the treasury Safe are contributions. Redeems
  // (payouts) and other linked addresses are logged but not ledgered.
  const isTreasuryIssue =
    order.kind === "issue" &&
    (order.address ?? "").toLowerCase() === TREASURY_SAFE.toLowerCase();
  if (!isTreasuryIssue) {
    await markProcessed(supabase, eventId, `skipped kind=${order.kind}`);
    return NextResponse.json({ received: true });
  }

  const memo = order.memo ?? "";
  if (STRIPE_PAYOUT_MEMO.test(memo)) {
    // Aggregated Stripe payout — constituent card contributions are already
    // in the ledger via the Stripe webhook. Skip to avoid double counting.
    await markProcessed(supabase, eventId, "stripe_payout_skip");
    return NextResponse.json({ received: true, stripe_payout: true });
  }

  const amountCents = moneriumAmountToCents(order.amount);
  if (!amountCents) {
    await markProcessed(supabase, eventId, `bad amount: ${order.amount}`);
    return NextResponse.json({ received: true });
  }

  const status =
    order.state === "processed"
      ? "settled"
      : order.state === "rejected"
        ? "failed"
        : "pending";
  const txHash = order.meta?.txHashes?.[0] ?? null;

  // Attribute the donor via a reference code in the Verwendungszweck.
  let referenceCode: string | null = null;
  let donorName: string | null = null;
  let donorWallet: string | null = null;
  const codeMatch = memo.match(DONATION_CODE_REGEX);
  if (codeMatch) {
    referenceCode = codeMatch[0].toUpperCase();
    const { data: ref } = await supabase
      .from("donation_references")
      .select("code, wallet_address, display_name")
      .eq("code", referenceCode)
      .maybeSingle();
    if (ref) {
      donorName = (ref.display_name as string | null) ?? null;
      donorWallet = (ref.wallet_address as string | null) ?? null;
    }
  }

  // Upsert by monerium_order_id: order.created inserts, order.updated
  // transitions the same row (placed → pending → processed/rejected).
  const { data: existing, error: lookupErr } = await supabase
    .from("donations")
    .select("id, status")
    .eq("monerium_order_id", order.id)
    .maybeSingle();
  if (lookupErr) {
    console.error("[monerium.webhook] donation lookup failed", lookupErr);
    await markProcessed(supabase, eventId, "donation lookup failed");
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  if (existing) {
    if (existing.status === "settled") {
      await markProcessed(supabase, eventId, null);
      return NextResponse.json({ received: true, duplicate: true });
    }
    const { error: updateErr } = await supabase
      .from("donations")
      .update({
        status,
        tx_hash: txHash,
        ...(status === "settled" && { settled_at: new Date().toISOString() }),
      })
      .eq("id", existing.id);
    if (updateErr) {
      console.error("[monerium.webhook] donation update failed", updateErr);
      await markProcessed(supabase, eventId, "donation update failed");
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }
  } else {
    const { error: insertErr } = await supabase.from("donations").insert({
      rail: "sepa",
      status,
      amount_cents: amountCents,
      // Monerium charges no fees — net equals gross.
      net_amount_cents: amountCents,
      currency: order.currency ?? "eur",
      donor_name: donorName,
      donor_wallet_address: donorWallet,
      reference_code: referenceCode,
      monerium_order_id: order.id,
      tx_hash: txHash,
      ...(status === "settled" && { settled_at: new Date().toISOString() }),
    });
    if (insertErr) {
      if ((insertErr as { code?: string }).code === "23505") {
        // Concurrent replay beat us — fine.
        await markProcessed(supabase, eventId, null);
        return NextResponse.json({ received: true, duplicate: true });
      }
      console.error("[monerium.webhook] donation insert failed", insertErr);
      await markProcessed(supabase, eventId, "donation insert failed");
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }
  }

  await markProcessed(supabase, eventId, null);
  console.log(
    "✅ [monerium.webhook] order",
    order.id,
    "→",
    status,
    amountCents,
    "cents",
    referenceCode ? `ref ${referenceCode}` : "(unattributed)",
  );
  return NextResponse.json({ received: true });
}

async function markProcessed(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string,
  error: string | null,
) {
  await supabase
    .from("monerium_events")
    .update({ processed: true, error })
    .eq("event_id", eventId);
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "monerium/webhook",
    has_secret: !!process.env.MONERIUM_WEBHOOK_SECRET,
  });
}
