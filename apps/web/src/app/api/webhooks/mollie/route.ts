import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMolliePayment, centsFromAmount } from "@/lib/payments/mollie/provider";
import { MOLLIE_ORDER_COLUMNS, syncMollieTicketOrder, type MollieOrderRow } from "@/lib/payments/mollie/settle";

export const dynamic = "force-dynamic";

const PAYMENT_ID_RE = /^tr_[A-Za-z0-9]{4,64}$/;

// Mollie webhook. Mollie posts only `id=tr_…` (form-encoded) and expects a quick 200; the truth is
// always fetched back from Mollie with the owning org's OAuth token (no trust in the request body).
// - Unknown / malformed ids → 200 (never let a probe or a foreign payment cause retries).
// - Idempotent per (payment, status, refunded amount) via payment_events.
// - 500 only on our own failure, after dropping the payment_events row so Mollie's retry is processed.
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const id = String(form?.get("id") ?? "");
  if (!PAYMENT_ID_RE.test(id)) return NextResponse.json({ received: true });

  const admin = createAdminClient();
  const { data: order } = await admin.from("ticket_orders").select(MOLLIE_ORDER_COLUMNS)
    .eq("provider_payment_id", id).eq("rail", "mollie").maybeSingle();
  if (!order) return NextResponse.json({ received: true });
  const o = order as MollieOrderRow;

  let fetched;
  try {
    fetched = await fetchMolliePayment(admin, o.account_id, id);
  } catch (err) {
    console.error("[mollie-webhook] fetch failed", id, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const eventId = `mollie:${id}:${fetched.payment.status}:${centsFromAmount(fetched.payment.amountRefunded)}`;
  const { error: dupErr } = await admin.from("payment_events").insert({
    id: eventId, provider: "mollie", type: `payment.${fetched.payment.status}`, provider_account: fetched.row.provider_org_id,
    livemode: fetched.payment.mode === "live",
  });
  if (dupErr) return NextResponse.json({ received: true, duplicate: true });

  try {
    const result = await syncMollieTicketOrder(admin, o, { allowLate: true, prefetched: fetched });
    if (result.outcome === "mismatch") {
      // Keep the row (flagged) so the same state is not retried into the same mismatch.
      await admin.from("payment_events").update({ error: "settlement_mismatch" }).eq("id", eventId);
      return NextResponse.json({ received: true, settled: false });
    }
    await admin.from("payment_events").update({ processed_at: new Date().toISOString() }).eq("id", eventId);
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[mollie-webhook] processing failed", eventId, message);
    const { error: delErr } = await admin.from("payment_events").delete().eq("id", eventId);
    if (delErr) console.error("[mollie-webhook] could not delete payment_events row; the retry will be skipped", eventId, delErr.message);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
