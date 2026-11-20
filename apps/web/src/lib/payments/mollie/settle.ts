import type { SupabaseClient } from "@supabase/supabase-js";
import { settleOrder } from "@/lib/tickets/settle";
import { centsFromAmount, fetchMolliePayment, mapMollieStatus, type MolliePayment } from "./provider";

export type MollieOrderRow = {
  id: string; status: string; rail: string; account_id: string; amount_cents: number; currency: string;
  livemode: boolean; provider_payment_id: string | null; provider_account_id: string | null;
};

export const MOLLIE_ORDER_COLUMNS = "id, status, rail, account_id, amount_cents, currency, livemode, provider_payment_id, provider_account_id";

export type SyncResult = { outcome: "paid" | "closed" | "refunded" | "open" | "mismatch"; payment: MolliePayment };

/**
 * Bring one Mollie ticket order in line with the payment at Mollie. Binding rules mirror
 * webhooks/stripe-connect: the payment is fetched with THIS order's org token (so it belongs to
 * that org's Mollie account), and the payment id, Mollie organization, metadata.orderId, mode and
 * amount must all match what the order was created with before a single ticket is minted.
 *
 * `allowLate` (webhook only): a payment Mollie reports as paid after our 35-minute hold ran out
 * still mints tickets — money moved. The order-status self-heal does not pass it.
 */
export async function syncMollieTicketOrder(
  admin: SupabaseClient, order: MollieOrderRow,
  opts: { allowLate: boolean; prefetched?: Awaited<ReturnType<typeof fetchMolliePayment>> },
): Promise<SyncResult> {
  if (!order.provider_payment_id) throw new Error(`order ${order.id} has no provider_payment_id`);
  const { row, payment } = opts.prefetched ?? (await fetchMolliePayment(admin, order.account_id, order.provider_payment_id));
  const matches = payment.id === order.provider_payment_id
    && String(payment.metadata?.orderId ?? "") === order.id
    && (!order.provider_account_id || order.provider_account_id === (row.provider_org_id ?? row.id))
    && (payment.mode === undefined || (payment.mode === "live") === order.livemode)
    && (payment.amount?.currency ?? "").toLowerCase() === order.currency.toLowerCase()
    && centsFromAmount(payment.amount) >= order.amount_cents;
  if (!matches) {
    console.error("[mollie] settlement mismatch — no tickets minted", {
      order_id: order.id, payment_id: payment.id, metadata_order: payment.metadata?.orderId ?? null,
      order_provider_account: order.provider_account_id, account_org: row.provider_org_id,
      mode: payment.mode ?? null, amount: payment.amount ?? null, order_amount_cents: order.amount_cents,
    });
    return { outcome: "mismatch", payment };
  }

  const refundedCents = centsFromAmount(payment.amountRefunded);
  if (refundedCents > 0 && refundedCents >= order.amount_cents && (order.status === "paid" || order.status === "refunded")) {
    if (order.status === "paid") {
      await admin.from("ticket_orders").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", order.id).eq("status", "paid");
      await admin.from("tickets").update({ status: "refunded" }).eq("order_id", order.id).in("status", ["issued", "checked_in"]);
    }
    return { outcome: "refunded", payment };
  }

  const status = mapMollieStatus(payment.status);
  if (status === "paid") {
    await settleOrder(admin, order.id, { allowLate: opts.allowLate });
    return { outcome: "paid", payment };
  }
  if (status === "expired" || status === "canceled" || status === "failed") {
    await admin.from("ticket_orders").update({ status: status === "expired" ? "expired" : "cancelled" })
      .eq("id", order.id).eq("status", "pending");
    return { outcome: "closed", payment };
  }
  return { outcome: "open", payment };
}
