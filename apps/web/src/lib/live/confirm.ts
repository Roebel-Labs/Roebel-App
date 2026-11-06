// Settle an Unterstützung by asking Stripe directly (no webhook needed). Shared by POST
// /api/live/support/confirm (app, after Checkout) and the /live/support/return page (server render).
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeConnect } from "@/lib/stripe-connect";
import { settleLiveSupport } from "./settle";
import { UUID_RE } from "./server";

export type ConfirmResult = "paid" | "pending" | "expired" | "refunded" | "not_found" | "mismatch" | "error";

export async function confirmLiveSupport(supportId: string): Promise<ConfirmResult> {
  if (!UUID_RE.test(supportId)) return "not_found";
  const admin = createAdminClient();
  const { data: row } = await admin.from("live_supports")
    .select("id, status, stripe_checkout_session_id, stripe_account_id").eq("id", supportId).maybeSingle();
  if (!row) return "not_found";
  if (row.status !== "pending") return row.status as ConfirmResult;
  if (!row.stripe_checkout_session_id || !row.stripe_account_id) return "pending";
  try {
    const session = await stripeConnect.checkout.sessions.retrieve(row.stripe_checkout_session_id, { stripeAccount: row.stripe_account_id });
    if (session.payment_status !== "paid") return "pending";
    return (await settleLiveSupport(admin, session, row.stripe_account_id)) ? "paid" : "mismatch";
  } catch (err) {
    console.error("[live/confirm]", err);
    return "error";
  }
}
