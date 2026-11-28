import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { MINUTE_MS, takeAll } from "@/lib/rate-limit";
import { activeEventTypes, availableTimes, sellerConfig } from "@/lib/booking/calendly";

export const dynamic = "force-dynamic";
const limiters = sharedLimiters([{ name: "booking-read-ip", limit: 60, windowMs: MINUTE_MS }]);

// GET /api/booking/<seller wallet>?event_type=<uri>
//   → { seller: { account_id, name, avatar_url }, event_types: [...], event_type: <uri>, slots: [ISO start times, 14 days] }
// 404 when the seller has no booking connected (the app hides "Termin buchen").
export async function GET(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await takeAll(limiters, ip))) return jsonFail(429, "RATE_LIMITED", "Zu viele Anfragen.");
  const { wallet } = await params;
  const admin = createAdminClient();
  const cfg = await sellerConfig(admin, wallet.toLowerCase());
  if (!cfg) return jsonFail(404, "NOT_FOUND", "Keine Terminbuchung verfügbar.");
  try {
    const types = await activeEventTypes(cfg);
    if (types.length === 0) return jsonFail(404, "NOT_FOUND", "Gerade keine Termine buchbar.");
    const wanted = request.nextUrl.searchParams.get("event_type");
    const et = types.find((t) => t.uri === wanted) ?? types[0];
    const slots = request.nextUrl.searchParams.get("slots") === "0" ? [] : (await availableTimes(cfg, et.uri, 14)).map((s) => s.start_time);
    const { data: acc } = await admin.from("accounts").select("id, name, avatar_url").eq("id", cfg.seller_account_id).maybeSingle();
    return jsonOk({
      seller: { account_id: cfg.seller_account_id, name: acc?.name ?? null, avatar_url: acc?.avatar_url ?? null },
      event_types: types.map((t) => ({ uri: t.uri, name: t.name, duration: t.duration, description: t.description, location_kind: t.location_kind, question: t.question })),
      event_type: et.uri,
      slots,
    });
  } catch (err) {
    console.error("[booking] read", err);
    return jsonFail(502, "CALENDLY_ERROR", "Termine konnten nicht geladen werden.");
  }
}
