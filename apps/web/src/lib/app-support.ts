// "Röbel App unterstützen": settle app_supporters rows. Shared by the Connect webhook
// (metadata.kind = app_support), POST /api/app-support/confirm (app, after Checkout) and the
// /unterstuetzen/danke page. Settlement is bound to the row's account, session id and amount —
// the metadata is attacker-shaped input, the row is ours.
import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeConnect } from "@/lib/stripe-connect";
import { pushToWallets } from "@/lib/live/server";
import { bookingNotifyWallets, formatEuro } from "@/lib/sponsoring";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AppSupportStatus = "paid" | "pending" | "expired" | "not_found" | "mismatch" | "error";

export async function settleAppSupport(admin: SupabaseClient, s: Stripe.Checkout.Session, account: string | null | undefined): Promise<boolean> {
  const id = s.metadata?.support_id ?? s.client_reference_id ?? "";
  if (!UUID_RE.test(id)) return false;
  const { data: row } = await admin.from("app_supporters")
    .select("id, status, amount_cents, stripe_checkout_session_id, stripe_account_id").eq("id", id).maybeSingle();
  if (!row) return false;
  if (row.status === "paid") return true;
  if (row.stripe_checkout_session_id !== s.id || row.stripe_account_id !== account || s.amount_total !== row.amount_cents) return false;
  if (s.payment_status !== "paid") return false;
  const { data: flipped, error } = await admin.from("app_supporters")
    .update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id).eq("status", "pending")
    .select("amount_cents, interval, show_name, display_name, message");
  if (error) return false;
  // Push to Max once per supporter (only the call that flipped the row; webhook + confirm race safely).
  const r = flipped?.[0];
  if (r) {
    const who = r.display_name ? `${r.display_name}${r.show_name ? "" : " (nicht öffentlich)"}` : "Jemand";
    const what = `${formatEuro(r.amount_cents)} ${r.interval === "month" ? "monatlich" : "einmalig"}`;
    await pushToWallets(
      bookingNotifyWallets(process.env.APP_SUPPORT_NOTIFY_WALLETS ?? process.env.SPONSORING_NOTIFY_WALLETS),
      "Neue Unterstützung für die Röbel App 🎄",
      `${who}: ${what}${r.message ? ` – „${r.message}“` : ""}`,
      { type: "app_support" },
    ).catch((err) => console.error("[app-support] push", err));
  }
  return true;
}

export async function expireAppSupport(admin: SupabaseClient, s: Stripe.Checkout.Session): Promise<void> {
  const id = s.metadata?.support_id ?? "";
  if (!UUID_RE.test(id)) return;
  await admin.from("app_supporters").update({ status: "expired" })
    .eq("id", id).eq("stripe_checkout_session_id", s.id).eq("status", "pending");
}

export async function confirmAppSupport(supportId: string): Promise<AppSupportStatus> {
  if (!UUID_RE.test(supportId)) return "not_found";
  const admin = createAdminClient();
  const { data: row } = await admin.from("app_supporters")
    .select("id, status, stripe_checkout_session_id, stripe_account_id").eq("id", supportId).maybeSingle();
  if (!row) return "not_found";
  if (row.status !== "pending") return row.status as AppSupportStatus;
  if (!row.stripe_checkout_session_id || !row.stripe_account_id) return "pending";
  try {
    const session = await stripeConnect.checkout.sessions.retrieve(row.stripe_checkout_session_id, { stripeAccount: row.stripe_account_id });
    if (session.payment_status !== "paid") return "pending";
    return (await settleAppSupport(admin, session, row.stripe_account_id)) ? "paid" : "mismatch";
  } catch (err) {
    console.error("[app-support/confirm]", err);
    return "error";
  }
}
