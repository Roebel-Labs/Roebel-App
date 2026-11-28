import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { MINUTE_MS, takeAll } from "@/lib/rate-limit";
import { UUID_RE, findBookedInvitee, sellerConfig } from "@/lib/booking/calendly";

export const dynamic = "force-dynamic";
const limiters = sharedLimiters([{ name: "booking-confirm-ip", limit: 40, windowMs: MINUTE_MS }]);

// POST { booking_id } → { status, start_time, end_time, event_name }  (idempotent)
// After the Calendly-page fallback: asks Calendly (read scope) whether this email booked this slot.
export async function POST(request: NextRequest) {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await takeAll(limiters, ip))) return jsonFail(429, "RATE_LIMITED", "Zu viele Anfragen.");
  const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const id = String(b.booking_id ?? "");
  if (!UUID_RE.test(id)) return jsonFail(404, "NOT_FOUND", "Unbekannt");
  const admin = createAdminClient();
  const { data: bk } = await admin.from("bookings")
    .select("id, seller_wallet, status, start_time, end_time, email, event_name").eq("id", id).maybeSingle();
  if (!bk) return jsonFail(404, "NOT_FOUND", "Unbekannt");
  const out = (status: string, end?: string) => jsonOk({ status, start_time: bk.start_time, end_time: end ?? bk.end_time, event_name: bk.event_name });
  if (bk.status !== "pending") return out(bk.status);
  const cfg = await sellerConfig(admin, bk.seller_wallet);
  if (!cfg) return out("pending");
  try {
    const hit = await findBookedInvitee(cfg, bk.start_time, bk.email);
    if (!hit) return out("pending");
    await admin.from("bookings").update({
      status: "booked", calendly_event_uri: hit.event, calendly_invitee_uri: hit.invitee, end_time: hit.end_time,
    }).eq("id", id).eq("status", "pending");
    return out("booked", hit.end_time);
  } catch (err) {
    console.error("[booking] confirm", err);
    return jsonFail(502, "CALENDLY_ERROR", "Calendly nicht erreichbar.");
  }
}
