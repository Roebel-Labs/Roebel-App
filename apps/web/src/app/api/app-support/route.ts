import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { connectedAccountRow } from "@/lib/tickets/connect-status";
import { stripeConnect, isConnectLivemode, webBaseUrl } from "@/lib/stripe-connect";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { HOUR_MS, takeAll } from "@/lib/rate-limit";
import { KLEINUNTERNEHMER_FOOTER } from "@/lib/sponsoring";
import { viewerProfile } from "@/lib/live/server";

export const dynamic = "force-dynamic";
const limiters = sharedLimiters([{ name: "app-support-ip", limit: 20, windowMs: HOUR_MS }]);
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

// The account that receives "Röbel App unterstützen": the same connected account as the DanceCup live
// support (MüritzPhone). Override with app_settings.app_support_account_id without a deploy.
const DEFAULT_ACCOUNT_ID = "0d50edc5-8db4-4831-8364-9c88026fc8f0";

async function setting(admin: ReturnType<typeof createAdminClient>, key: string): Promise<string | null> {
  const { data } = await admin.from("app_settings").select("value").eq("key", key).maybeSingle();
  return ((data as { value: string | null } | null)?.value ?? null) || null;
}

function clientIp(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

// POST (public, no login needed) { amount_cents 100–50000, interval: "once" | "month", display_name?, show_name, message? ≤140, wallet? }
//   → { url, support_id } Stripe Checkout (direct charge on the support account, card incl. Apple/Google Pay).
// "once" = payment with invoice, "month" = subscription. Never called "Spende": the receiver is not a
// charity, it is support for running and building the app. Settled into app_supporters by the webhook / confirm (lib/app-support.ts); the public list shows the
// name only when show_name.
export async function POST(request: NextRequest) {
  if (!(await takeAll(limiters, clientIp(request)))) return jsonFail(429, "RATE_LIMITED", "Zu viele Versuche. Bitte später erneut.");
  const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const amount = Math.round(Number(b.amount_cents));
  if (!Number.isFinite(amount) || amount < 100 || amount > 50000) return jsonFail(400, "BAD_AMOUNT", "Bitte einen Betrag zwischen 1 € und 500 € wählen.");
  const monthly = b.interval === "month";
  const wallet = typeof b.wallet === "string" && WALLET_RE.test(b.wallet) ? b.wallet.toLowerCase() : "";
  const showName = b.show_name === true;
  const displayName = typeof b.display_name === "string" ? b.display_name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const message = showName && typeof b.message === "string" ? b.message.replace(/\s+/g, " ").trim().slice(0, 140) : "";

  const admin = createAdminClient();
  if ((await setting(admin, "app_support_enabled")) === "false") return jsonFail(409, "NOT_AVAILABLE", "Unterstützen ist gerade nicht möglich.");
  const accountId = (await setting(admin, "app_support_account_id")) ?? DEFAULT_ACCOUNT_ID;
  const connected = await connectedAccountRow(admin, accountId);
  if (!connected?.charges_enabled) return jsonFail(503, "PAYMENTS_UNAVAILABLE", "Zahlungen sind gerade nicht möglich. Bitte versuche es später erneut.");

  const { data: row, error: insErr } = await admin.from("app_supporters").insert({
    amount_cents: amount, interval: monthly ? "month" : "once", show_name: showName && !!displayName,
    display_name: displayName || null, message: message || null, wallet: wallet || null,
  }).select("id").single();
  if (insErr || !row) return jsonFail(500, "DB_ERROR", "Konnte nicht gestartet werden. Bitte erneut versuchen.");
  // Profile picture for the public list, resolved from the wallet (never a client-sent URL). Separate,
  // best-effort update: a missing avatar_url column must never block a payment.
  if (wallet && showName) {
    const prof = await viewerProfile(admin, wallet).catch(() => null);
    if (prof?.avatar_url) await admin.from("app_supporters").update({ avatar_url: prof.avatar_url }).eq("id", row.id).then(() => null, () => null);
  }

  const ret = (cancelled: boolean) => `${webBaseUrl()}/unterstuetzen/danke?support_id=${row.id}${cancelled ? "&cancelled=true" : ""}`;
  const name = monthly ? "Monatliche Unterstützung – Röbel App" : "Unterstützung – Röbel App";
  const description = "Für Betrieb und Weiterentwicklung der Röbel App";
  const metadata = { kind: "app_support", support_id: row.id, interval: monthly ? "month" : "once" };
  try {
    const session = await stripeConnect.checkout.sessions.create(
      monthly
        ? {
            mode: "subscription", locale: "de",
            payment_method_types: ["card"],
            line_items: [{
              quantity: 1,
              price_data: { currency: "eur", unit_amount: amount, recurring: { interval: "month" }, product_data: { name, description } },
            }],
            subscription_data: { description, metadata },
            metadata,
            client_reference_id: row.id,
            success_url: ret(false),
            cancel_url: ret(true),
          }
        : {
            mode: "payment", locale: "de", submit_type: "pay",
            payment_method_types: ["card"],
            line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: amount, product_data: { name, description } } }],
            invoice_creation: { enabled: true, invoice_data: { description: name, footer: KLEINUNTERNEHMER_FOOTER } },
            metadata,
            client_reference_id: row.id,
            success_url: ret(false),
            cancel_url: ret(true),
          },
      { stripeAccount: connected.stripe_account_id },
    );
    await admin.from("app_supporters").update({
      stripe_checkout_session_id: session.id, stripe_account_id: connected.stripe_account_id, livemode: isConnectLivemode(),
    }).eq("id", row.id);
    return jsonOk({ url: session.url, support_id: row.id });
  } catch (err) {
    await admin.from("app_supporters").update({ status: "expired" }).eq("id", row.id);
    console.error("[app-support] stripe", err);
    return jsonFail(502, "STRIPE_ERROR", "Die Zahlung konnte nicht gestartet werden. Bitte versuche es erneut.");
  }
}
