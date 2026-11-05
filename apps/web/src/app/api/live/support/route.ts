import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { connectedAccountRow } from "@/lib/tickets/connect-status";
import { stripeConnect, isConnectLivemode, webBaseUrl } from "@/lib/stripe-connect";
import { UUID_RE } from "@/lib/live/server";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { HOUR_MS, takeAll } from "@/lib/rate-limit";
import { KLEINUNTERNEHMER_FOOTER } from "@/lib/sponsoring";

export const dynamic = "force-dynamic";
const limiters = sharedLimiters([{ name: "live-support-ip", limit: 20, windowMs: HOUR_MS }]);
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

function clientIp(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

// POST (public, no login needed) { show_id, amount_cents 100–50000, display_name?, message? ≤140, show_name, wallet?, return_to? }
//   → { support_id, url } Stripe Checkout (direct charge on the show's beneficiary, card only).
// Settled by the Connect webhook (metadata.kind = live_support) → a kind='support' chat row the
// app and the OBS overlay pick up via Realtime. Never called "Spende": it is support for the stream.
export async function POST(request: NextRequest) {
  if (!(await takeAll(limiters, clientIp(request)))) return jsonFail(429, "RATE_LIMITED", "Zu viele Versuche. Bitte später erneut.");
  const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const showId = String(b.show_id ?? "");
  if (!UUID_RE.test(showId)) return jsonFail(400, "BAD_REQUEST", "show_id fehlt");
  const amount = Math.round(Number(b.amount_cents));
  if (!Number.isFinite(amount) || amount < 100 || amount > 50000) return jsonFail(400, "BAD_AMOUNT", "Bitte einen Betrag zwischen 1 € und 500 € wählen.");
  const showName = b.show_name !== false;
  const displayName = typeof b.display_name === "string" ? b.display_name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const message = typeof b.message === "string" ? b.message.replace(/\s+/g, " ").trim().slice(0, 140) : "";
  const wallet = typeof b.wallet === "string" && WALLET_RE.test(b.wallet) ? b.wallet.toLowerCase() : null;
  const returnTo = typeof b.return_to === "string" && /^roebel:\/\//.test(b.return_to) ? b.return_to : null;

  const admin = createAdminClient();
  const { data: show } = await admin.from("live_shows").select("id, slug, title, beneficiary_account_id, status").eq("id", showId).maybeSingle();
  if (!show?.beneficiary_account_id) return jsonFail(409, "NOT_AVAILABLE", "Unterstützen ist für diese Übertragung nicht möglich.");
  const connected = await connectedAccountRow(admin, show.beneficiary_account_id);
  if (!connected?.charges_enabled) return jsonFail(503, "PAYMENTS_UNAVAILABLE", "Zahlungen sind gerade nicht möglich. Bitte versuche es später erneut.");

  const { data: support, error } = await admin.from("live_supports").insert({
    show_id: showId, amount_cents: amount, show_name: showName,
    display_name: displayName || null, message: message || null, wallet,
  }).select("id").single();
  if (error || !support) return jsonFail(500, "DB_ERROR", "Konnte nicht gestartet werden. Bitte erneut versuchen.");

  const back = returnTo ?? `${webBaseUrl()}/live/${show.slug}`;
  const ret = (cancelled: boolean) =>
    `${webBaseUrl()}/live/support/return?support_id=${support.id}${cancelled ? "&cancelled=true" : ""}&return_to=${encodeURIComponent(back)}`;
  try {
    const session = await stripeConnect.checkout.sessions.create(
      {
        mode: "payment", locale: "de", submit_type: "pay",
        payment_method_types: ["card"],
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "eur", unit_amount: amount,
            product_data: { name: `Unterstützung – ${show.title}`, description: "Für die Liveübertragung in der Röbel App" },
          },
        }],
        invoice_creation: { enabled: true, invoice_data: { description: `Unterstützung – ${show.title}`, footer: KLEINUNTERNEHMER_FOOTER, metadata: { support_id: support.id } } },
        client_reference_id: support.id,
        metadata: { kind: "live_support", support_id: support.id, show_id: showId },
        success_url: ret(false),
        cancel_url: ret(true),
      },
      { stripeAccount: connected.stripe_account_id },
    );
    await admin.from("live_supports").update({
      stripe_checkout_session_id: session.id, stripe_account_id: connected.stripe_account_id, livemode: isConnectLivemode(),
    }).eq("id", support.id);
    return jsonOk({ support_id: support.id, url: session.url });
  } catch (err) {
    await admin.from("live_supports").update({ status: "expired" }).eq("id", support.id);
    console.error("[live] stripe", err);
    return jsonFail(502, "STRIPE_ERROR", "Die Zahlung konnte nicht gestartet werden. Bitte versuche es erneut.");
  }
}
