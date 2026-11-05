import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { SPONSORING_SCOPE, type SponsoringAction } from "@/lib/signed-request/message";
import { roleInAccount, canManage } from "@/lib/tickets/authz";
import { connectedAccountRow } from "@/lib/tickets/connect-status";
import { stripeConnect, isConnectLivemode, webBaseUrl } from "@/lib/stripe-connect";
import { BOOK_ERRORS, bookErrorCode, isAllowedMediaUrl, sponsoringReturnUrl, KLEINUNTERNEHMER_FOOTER, dishNote, MAX_SPOT_DISHES } from "@/lib/sponsoring";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS: readonly SponsoringAction[] = ["sponsoring_checkout", "sponsoring_mine", "sponsoring_set_creative", "sponsoring_set_dishes"];
const HOLD_MINUTES = 35; // Stripe Checkout needs ≥ 30 min until expires_at.
/** Above this amount the invoice needs the buyer's address (§ 33 UStDV small-amount limit is 250 €). */
const ADDRESS_FROM_CENTS = 25000;

// POST signed (scope roebel-sponsoring-v1), all behind the org owner/admin check:
//   sponsoring_checkout     { org_account_id, package_id, creative_id? | media_kind+media_url?, note?, upgrade_booking_id? } → { booking_id, url }
//   sponsoring_mine         { org_account_id, campaign_slug }                                         → { bookings }
//   sponsoring_set_creative { org_account_id, booking_id, creative_id? | media_kind+media_url? }       → { booking }
//   sponsoring_set_dishes   { org_account_id, booking_id, dish_ids: uuid[] (1–4, own menu or listings) } → { note }
export async function POST(request: NextRequest) {
  const v = await verifySignedRequest<SponsoringAction>(await request.json().catch(() => null), {
    scope: SPONSORING_SCOPE, actions: ACTIONS, headers: request.headers,
  });
  if (!v.ok) return failResponse(v);

  const orgId = String(v.payload.org_account_id ?? "");
  if (!UUID_RE.test(orgId)) return jsonFail(400, "BAD_REQUEST", "org_account_id fehlt");

  const admin = createAdminClient();
  const { data: org } = await admin.from("accounts").select("id, name, account_type").eq("id", orgId).maybeSingle();
  if (!org || org.account_type !== "organisation") return jsonFail(404, "NOT_FOUND", "Organisation nicht gefunden");
  if (!canManage(await roleInAccount(admin, orgId, v.wallet))) {
    return jsonFail(403, "FORBIDDEN", "Nur Inhaber oder Admins können Werbeplätze buchen.");
  }

  if (v.action === "sponsoring_mine") {
    const slug = String(v.payload.campaign_slug ?? "");
    const { data: campaign } = await admin.from("sponsoring_campaigns").select("id").eq("slug", slug).maybeSingle();
    if (!campaign) return jsonOk({ bookings: [] });
    const { data, error } = await admin
      .from("sponsoring_bookings")
      .select("id, package_id, status, media_kind, media_url, creative_id, amount_cents, review_note, note, created_at, paid_at")
      .eq("campaign_id", campaign.id).eq("org_account_id", orgId)
      .in("status", ["requested", "pending_payment", "paid", "approved", "rejected", "refunded"])
      .order("created_at", { ascending: false });
    if (error) return jsonFail(500, "DB_ERROR", error.message);
    return jsonOk({ bookings: data ?? [] });
  }

  if (v.action === "sponsoring_set_dishes") {
    // Dishes for the produced spot ("Werbespot nach Maß"): picked from the org's own menu photos,
    // changeable until the event starts (production uses whatever is stored then).
    const bookingId = String(v.payload.booking_id ?? "");
    if (!UUID_RE.test(bookingId)) return jsonFail(400, "BAD_REQUEST", "booking_id fehlt");
    const ids = Array.isArray(v.payload.dish_ids) ? [...new Set(v.payload.dish_ids.map(String))] : [];
    if (ids.length < 1 || ids.length > MAX_SPOT_DISHES || !ids.every((id) => UUID_RE.test(id))) {
      return jsonFail(400, "BAD_REQUEST", `Bitte 1 bis ${MAX_SPOT_DISHES} Gerichte wählen.`);
    }
    const { data: b } = await admin.from("sponsoring_bookings")
      .select("id, org_account_id, status, sponsoring_campaigns(event_starts_at, booking_deadline)").eq("id", bookingId).maybeSingle();
    if (!b || b.org_account_id !== orgId) return jsonFail(404, "NOT_FOUND", "Buchung nicht gefunden");
    if (!["paid", "approved"].includes(b.status)) return jsonFail(409, "BAD_STATE", "Diese Buchung ist nicht aktiv.");
    const c = b.sponsoring_campaigns as { event_starts_at?: string | null; booking_deadline?: string } | null;
    const lockAt = c?.event_starts_at ?? c?.booking_deadline;
    if (lockAt && Date.now() > Date.parse(lockAt)) return jsonFail(409, "DEADLINE_PASSED", "Die Übertragung läuft schon – die Auswahl ist jetzt fest.");
    // Restaurants pick menu dishes; other orgs pick their own active marketplace listings.
    const { data: restaurants } = await admin.from("restaurants").select("id").eq("account_id", orgId);
    const { data: dishes } = await admin.from("menu_items").select("id, name")
      .in("restaurant_id", (restaurants ?? []).map((r) => r.id)).in("id", ids);
    const { data: listings } = await admin.from("marketplace_listings").select("id, title")
      .eq("account_id", orgId).eq("status", "active").in("id", ids);
    const byId = new Map<string, string>([
      ...(dishes ?? []).map((i) => [i.id as string, i.name as string] as [string, string]),
      ...(listings ?? []).map((l) => [l.id as string, l.title as string] as [string, string]),
    ]);
    if (!ids.every((id) => byId.has(id))) return jsonFail(400, "BAD_DISH", "Diese Auswahl gehört nicht zu eurer Speisekarte oder euren Angeboten.");
    const note = dishNote(ids.map((id) => ({ id, name: byId.get(id) ?? "" })));
    const { error } = await admin.from("sponsoring_bookings").update({ note, updated_at: new Date().toISOString() }).eq("id", bookingId);
    if (error) return jsonFail(500, "DB_ERROR", error.message);
    return jsonOk({ note });
  }

  // Ad material: one of the org's own creatives, or an upload from our storage.
  const creativeId = typeof v.payload.creative_id === "string" && UUID_RE.test(v.payload.creative_id) ? v.payload.creative_id : null;
  const mediaKind = creativeId || v.payload.media_kind == null ? null : String(v.payload.media_kind);
  const mediaUrl = creativeId || v.payload.media_url == null ? null : String(v.payload.media_url);
  if ((mediaKind === null) !== (mediaUrl === null)) return jsonFail(400, "BAD_REQUEST", "Datei unvollständig");
  if (mediaKind !== null && mediaKind !== "image" && mediaKind !== "video") return jsonFail(400, "BAD_REQUEST", "Dateiart ungültig");
  if (mediaUrl !== null && !isAllowedMediaUrl(mediaUrl, process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    return jsonFail(400, "BAD_MEDIA", "Die Datei muss über die App hochgeladen werden.");
  }
  if (creativeId) {
    const { data: c } = await admin.from("sponsoring_creatives").select("id").eq("id", creativeId).eq("org_account_id", orgId).maybeSingle();
    if (!c) return jsonFail(400, "BAD_CREATIVE", "Dieses Werbebild gehört nicht zu eurer Organisation.");
  }

  if (v.action === "sponsoring_set_creative") {
    const bookingId = String(v.payload.booking_id ?? "");
    if (!UUID_RE.test(bookingId)) return jsonFail(400, "BAD_REQUEST", "booking_id fehlt");
    if (!creativeId && !mediaUrl) return jsonFail(400, "BAD_REQUEST", "Kein Werbebild gewählt");
    const { data: b } = await admin.from("sponsoring_bookings")
      .select("id, org_account_id, status, sponsoring_campaigns(booking_deadline)").eq("id", bookingId).maybeSingle();
    if (!b || b.org_account_id !== orgId) return jsonFail(404, "NOT_FOUND", "Buchung nicht gefunden");
    const deadline = (b.sponsoring_campaigns as { booking_deadline?: string } | null)?.booking_deadline;
    if (deadline && Date.now() > Date.parse(deadline)) return jsonFail(409, "DEADLINE_PASSED", "Nach der Buchungsfrist kann das Werbebild nicht mehr geändert werden.");
    if (!["pending_payment", "paid", "approved"].includes(b.status)) return jsonFail(409, "BAD_STATE", "Diese Buchung ist nicht mehr aktiv.");
    const { data: updated, error } = await admin.from("sponsoring_bookings")
      .update({ creative_id: creativeId, media_kind: mediaKind, media_url: mediaUrl, updated_at: new Date().toISOString() })
      .eq("id", bookingId).select("id, package_id, status, media_kind, media_url, creative_id, amount_cents, created_at, paid_at").single();
    if (error) return jsonFail(500, "DB_ERROR", error.message);
    return jsonOk({ booking: updated });
  }

  // sponsoring_checkout
  const packageId = String(v.payload.package_id ?? "");
  if (!UUID_RE.test(packageId)) return jsonFail(400, "BAD_REQUEST", "package_id fehlt");
  const note = typeof v.payload.note === "string" ? v.payload.note.trim().slice(0, 500) : null;

  const { data: pkg } = await admin.from("sponsoring_packages")
    .select("id, name, sponsoring_campaigns(id, slug, title, beneficiary_account_id)").eq("id", packageId).maybeSingle();
  const campaign = pkg?.sponsoring_campaigns as unknown as { id: string; slug: string; title: string; beneficiary_account_id: string | null } | null;
  if (!pkg || !campaign?.beneficiary_account_id) return jsonFail(409, "NOT_ON_SALE", BOOK_ERRORS.not_on_sale[1]);
  const connected = await connectedAccountRow(admin, campaign.beneficiary_account_id);
  if (!connected?.charges_enabled) return jsonFail(503, "PAYMENTS_UNAVAILABLE", "Zahlungen sind gerade nicht möglich. Bitte versucht es später erneut.");

  const { data: booking, error } = await admin.rpc("book_sponsoring_package", {
    p_package_id: packageId, p_org_account_id: orgId, p_wallet: v.wallet,
    p_media_kind: mediaKind, p_media_url: mediaUrl, p_note: note,
    p_creative_id: creativeId, p_hold_minutes: HOLD_MINUTES,
  });
  if (error || !booking) {
    const code = bookErrorCode(error?.message);
    if (code) return jsonFail(BOOK_ERRORS[code][0], code.toUpperCase(), BOOK_ERRORS[code][1]);
    console.error("[sponsoring] reserve failed", error);
    return jsonFail(500, "DB_ERROR", "Reservierung fehlgeschlagen. Bitte versuche es erneut.");
  }

  // Upgrade: the org already paid for a cheaper package of this campaign → pay only the difference.
  // The earlier booking is closed only when this payment settles (lib/sponsoring-settle.ts).
  const upgradeId = typeof v.payload.upgrade_booking_id === "string" && UUID_RE.test(v.payload.upgrade_booking_id) ? v.payload.upgrade_booking_id : null;
  if (upgradeId) {
    const { data: prev } = await admin.from("sponsoring_bookings")
      .select("id, org_account_id, campaign_id, status, amount_cents").eq("id", upgradeId).maybeSingle();
    const ok = !!prev && prev.org_account_id === orgId && prev.campaign_id === campaign.id
      && ["paid", "approved"].includes(prev.status) && prev.amount_cents < booking.amount_cents;
    if (!ok) {
      await admin.from("sponsoring_bookings").update({ status: "cancelled" }).eq("id", booking.id);
      return jsonFail(400, "BAD_UPGRADE", "Dieses Upgrade ist nicht möglich.");
    }
    booking.amount_cents -= prev.amount_cents;
    await admin.from("sponsoring_bookings").update({ amount_cents: booking.amount_cents, upgraded_from_booking_id: prev.id }).eq("id", booking.id);
  }

  const returnTo = sponsoringReturnUrl(campaign.slug);
  try {
    const session = await stripeConnect.checkout.sessions.create(
      {
        mode: "payment", locale: "de", submit_type: "pay",
        // Card covers Apple Pay / Google Pay in Checkout; async methods would outlive the hold.
        payment_method_types: ["card"],
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "eur", unit_amount: booking.amount_cents,
            product_data: {
              name: `${pkg.name} – ${campaign.title}${upgradeId ? " (Upgrade)" : ""}`,
              description: `Werbeplatz für ${org.name}`,
            },
          },
        }],
        billing_address_collection: booking.amount_cents >= ADDRESS_FROM_CENTS ? "required" : "auto",
        invoice_creation: {
          enabled: true,
          invoice_data: {
            description: `${pkg.name} – ${campaign.title} (${org.name})`,
            footer: KLEINUNTERNEHMER_FOOTER,
            metadata: { booking_id: booking.id },
          },
        },
        expires_at: Math.floor(new Date(booking.expires_at).getTime() / 1000),
        client_reference_id: booking.id,
        metadata: { kind: "sponsoring", booking_id: booking.id, org_account_id: orgId },
        success_url: `${webBaseUrl()}/sponsoring/return?booking_id=${booking.id}&return_to=${encodeURIComponent(returnTo)}`,
        cancel_url: `${webBaseUrl()}/sponsoring/return?cancelled=true&booking_id=${booking.id}&return_to=${encodeURIComponent(returnTo)}`,
      },
      { stripeAccount: connected.stripe_account_id },
    );
    await admin.from("sponsoring_bookings").update({
      stripe_checkout_session_id: session.id, stripe_account_id: connected.stripe_account_id, livemode: isConnectLivemode(),
    }).eq("id", booking.id);
    return jsonOk({ booking_id: booking.id, url: session.url, amount_cents: booking.amount_cents, expires_at: booking.expires_at });
  } catch (err) {
    await admin.from("sponsoring_bookings").update({ status: "cancelled" }).eq("id", booking.id);
    console.error("[sponsoring] stripe", err);
    return jsonFail(502, "STRIPE_ERROR", "Die Zahlung konnte nicht gestartet werden. Bitte versucht es erneut.");
  }
}
