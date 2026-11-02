import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { SPONSORING_SCOPE, type SponsoringAction } from "@/lib/signed-request/message";
import { roleInAccount, canManage } from "@/lib/tickets/authz";
import { BOOK_ERRORS, bookErrorCode, bookingNotifyWallets, formatEuro, isAllowedMediaUrl } from "@/lib/sponsoring";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS: readonly SponsoringAction[] = ["sponsoring_book", "sponsoring_mine"];

/** Best effort push to Max (never fails the booking). */
async function notifyNewBooking(title: string, body: string, slug: string): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        type: "sponsoring",
        walletAddresses: bookingNotifyWallets(process.env.SPONSORING_NOTIFY_WALLETS),
        title: title.slice(0, 60),
        body: body.slice(0, 140),
        data: { type: "sponsoring", slug },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[sponsoring] push", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.error("[sponsoring] push failed (non-fatal)", err);
  }
}

// POST signed (scope roebel-sponsoring-v1), both behind the org owner/admin check:
//   sponsoring_book { org_account_id, package_id, media_kind?, media_url?, note? } → { booking }
//   sponsoring_mine { org_account_id, campaign_slug }                               → { bookings }
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
      .select("id, package_id, status, media_kind, media_url, note, amount_cents, review_note, created_at")
      .eq("campaign_id", campaign.id).eq("org_account_id", orgId)
      .order("created_at", { ascending: false });
    if (error) return jsonFail(500, "DB_ERROR", error.message);
    return jsonOk({ bookings: data ?? [] });
  }

  const packageId = String(v.payload.package_id ?? "");
  if (!UUID_RE.test(packageId)) return jsonFail(400, "BAD_REQUEST", "package_id fehlt");
  const mediaKind = v.payload.media_kind == null ? null : String(v.payload.media_kind);
  const mediaUrl = v.payload.media_url == null ? null : String(v.payload.media_url);
  if ((mediaKind === null) !== (mediaUrl === null)) return jsonFail(400, "BAD_REQUEST", "Datei unvollständig");
  if (mediaKind !== null && mediaKind !== "image" && mediaKind !== "video") return jsonFail(400, "BAD_REQUEST", "Dateiart ungültig");
  if (mediaUrl !== null && !isAllowedMediaUrl(mediaUrl, process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    return jsonFail(400, "BAD_MEDIA", "Die Datei muss über die App hochgeladen werden.");
  }
  const note = typeof v.payload.note === "string" ? v.payload.note.trim().slice(0, 500) : null;

  const { data: booking, error } = await admin.rpc("book_sponsoring_package", {
    p_package_id: packageId, p_org_account_id: orgId, p_wallet: v.wallet,
    p_media_kind: mediaKind, p_media_url: mediaUrl, p_note: note,
  });
  if (error) {
    const code = bookErrorCode(error.message);
    if (code) return jsonFail(BOOK_ERRORS[code][0], code.toUpperCase(), BOOK_ERRORS[code][1]);
    console.error("[sponsoring] book failed", error);
    return jsonFail(500, "DB_ERROR", "Buchung fehlgeschlagen. Bitte versuche es erneut.");
  }

  const { data: pkg } = await admin
    .from("sponsoring_packages").select("name, payment_link_url, sponsoring_campaigns(slug)")
    .eq("id", packageId).maybeSingle();
  const slug = (pkg?.sponsoring_campaigns as { slug?: string } | null)?.slug ?? "";
  await notifyNewBooking(
    "Neue Werbeplatz-Anfrage",
    `${org.name}: ${pkg?.name ?? "Paket"} (${formatEuro(booking.amount_cents)})`,
    slug,
  );
  return jsonOk({ booking, payment_link_url: pkg?.payment_link_url ?? null });
}
