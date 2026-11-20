// Settlement of live-room support payments from the Stripe Connect webhook (server only).
import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertChat } from "./chat";

/**
 * checkout.session.completed for kind=live_support. The metadata only NAMES the support row; the
 * connected account, the session id and the amount must match what we created. On success the
 * support becomes a kind='support' chat row (app + OBS overlay see it via Realtime).
 * Returns false on a mismatch (caller flags the event and answers 200).
 */
export async function settleLiveSupport(admin: SupabaseClient, s: Stripe.Checkout.Session, eventAccount: string | null | undefined): Promise<boolean> {
  const supportId = s.metadata?.support_id;
  if (!supportId || s.payment_status !== "paid") return true;
  const { data: row } = await admin.from("live_supports")
    .select("id, show_id, status, stripe_account_id, stripe_checkout_session_id, amount_cents, display_name, message, show_name, wallet")
    .eq("id", supportId).maybeSingle();
  const matches = !!row && !!row.stripe_account_id && row.stripe_account_id === eventAccount
    && row.stripe_checkout_session_id === s.id && (s.amount_total ?? 0) >= row.amount_cents;
  if (!matches) {
    console.error("[live] support settlement mismatch", { support_id: supportId, session_id: s.id, account: eventAccount ?? null });
    return false;
  }
  if (row.status === "paid") return true;
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
  // Claim the row first so a webhook retry never posts the alert twice.
  const { data: claimed } = await admin.from("live_supports")
    .update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent_id: pi })
    .eq("id", row.id).neq("status", "paid").select("id").maybeSingle();
  if (!claimed) return true;
  const name = row.show_name && row.display_name ? row.display_name : "Jemand";
  const { data: msg, error } = await insertChat(admin, {
    show_id: row.show_id, wallet: row.wallet, display_name: name, body: row.message ?? "", kind: "support", amount_cents: row.amount_cents,
  });
  if (error) throw new Error(`live support chat insert: ${error.message}`);
  await admin.from("live_supports").update({ chat_message_id: msg.id }).eq("id", row.id);
  return true;
}

export async function expireLiveSupport(admin: SupabaseClient, s: Stripe.Checkout.Session): Promise<void> {
  const supportId = s.metadata?.support_id;
  if (!supportId) return;
  await admin.from("live_supports").update({ status: "expired" }).eq("id", supportId).eq("status", "pending");
}

/** A refunded support disappears from the chat and the overlay. */
export async function refundLiveSupport(admin: SupabaseClient, paymentIntentId: string): Promise<void> {
  const { data: row } = await admin.from("live_supports").select("id, chat_message_id").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
  if (!row) return;
  await admin.from("live_supports").update({ status: "refunded" }).eq("id", row.id);
  if (row.chat_message_id) await admin.from("live_chat_messages").update({ hidden_at: new Date().toISOString() }).eq("id", row.chat_message_id);
}
