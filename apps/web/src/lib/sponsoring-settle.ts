// Settlement of sponsoring bookings from the Stripe Connect webhook (server only).
import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingNotifyWallets, formatEuro } from "./sponsoring";

/** Best effort push (never fails the webhook). */
async function pushToWallets(wallets: string[], title: string, body: string, data: Record<string, string>): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || wallets.length === 0) return;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ type: "sponsoring", walletAddresses: wallets, title: title.slice(0, 60), body: body.slice(0, 140), data }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[sponsoring] push", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.error("[sponsoring] push failed (non-fatal)", err);
  }
}

/**
 * checkout.session.completed for kind=sponsoring. The metadata only NAMES the booking; the
 * connected account, the session id and the amount must match what the booking was created
 * with. A payment after the hold expired is still a real payment → paid + late_payment.
 * Returns false on a mismatch (caller flags the event and answers 200).
 */
export async function settleSponsoringSession(
  admin: SupabaseClient, s: Stripe.Checkout.Session, eventAccount: string | null | undefined,
): Promise<boolean> {
  const bookingId = s.metadata?.booking_id;
  if (!bookingId || s.payment_status !== "paid") return true;
  const { data: b } = await admin.from("sponsoring_bookings")
    .select("id, status, stripe_account_id, stripe_checkout_session_id, amount_cents, org_account_id, package_id, upgraded_from_booking_id")
    .eq("id", bookingId).maybeSingle();
  const matches = !!b
    && !!b.stripe_account_id && b.stripe_account_id === eventAccount
    && !!b.stripe_checkout_session_id && b.stripe_checkout_session_id === s.id
    && (s.amount_total ?? 0) >= b.amount_cents;
  if (!matches) {
    console.error("[sponsoring] settlement mismatch", { booking_id: bookingId, session_id: s.id, event_account: eventAccount ?? null });
    return false;
  }
  if (b.status === "paid" || b.status === "approved") return true; // already settled
  const late = b.status !== "pending_payment";
  const { error } = await admin.from("sponsoring_bookings").update({
    status: "paid", paid_at: new Date().toISOString(), late_payment: late,
    stripe_payment_intent_id: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", b.id);
  if (error) throw new Error(`sponsoring settle: ${error.message}`);
  if (b.upgraded_from_booking_id) {
    await admin.from("sponsoring_bookings").update({ status: "cancelled", review_note: "Upgrade auf ein größeres Paket", updated_at: new Date().toISOString() })
      .eq("id", b.upgraded_from_booking_id).in("status", ["paid", "approved"]);
  }

  const [{ data: org }, { data: pkg }] = await Promise.all([
    admin.from("accounts").select("name").eq("id", b.org_account_id).maybeSingle(),
    admin.from("sponsoring_packages").select("name, sponsoring_campaigns(slug)").eq("id", b.package_id).maybeSingle(),
  ]);
  const slug = (pkg?.sponsoring_campaigns as { slug?: string } | null)?.slug ?? "";
  await pushToWallets(
    bookingNotifyWallets(process.env.SPONSORING_NOTIFY_WALLETS),
    late ? "Werbeplatz bezahlt (nach Ablauf!)" : "Neuer Werbeplatz verkauft 🎉",
    `${org?.name ?? "Organisation"}: ${pkg?.name ?? "Paket"} (${formatEuro(b.amount_cents)})`,
    { type: "sponsoring", slug },
  );
  return true;
}

export async function expireSponsoringSession(admin: SupabaseClient, s: Stripe.Checkout.Session, failed: boolean): Promise<void> {
  const bookingId = s.metadata?.booking_id;
  if (!bookingId) return;
  await admin.from("sponsoring_bookings").update({ status: failed ? "cancelled" : "expired", updated_at: new Date().toISOString() })
    .eq("id", bookingId).eq("stripe_checkout_session_id", s.id).eq("status", "pending_payment");
}

export async function refundSponsoringPayment(admin: SupabaseClient, paymentIntentId: string): Promise<void> {
  await admin.from("sponsoring_bookings").update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", paymentIntentId).in("status", ["paid", "approved"]);
}
