import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { HOUR_MS, takeAll } from "@/lib/rate-limit";
import { CalendlyError, WALLET_RE, activeEventTypes, calendly, sellerConfig } from "@/lib/booking/calendly";

export const dynamic = "force-dynamic";
const limiters = sharedLimiters([{ name: "booking-book-ip", limit: 15, windowMs: HOUR_MS }]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// POST /api/booking/<seller wallet>/book
//   { event_type, start_time, name, email, phone?, answer?, booker_wallet? }
//   → { status: "booked", booking_id }                     booked natively (Calendly Scheduling API)
//   → { status: "needs_confirmation", booking_id, url }    token cannot write yet: the app opens Calendly's
//                                                          page for exactly this slot, prefilled, then calls /confirm
export async function POST(request: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await takeAll(limiters, ip))) return jsonFail(429, "RATE_LIMITED", "Zu viele Versuche. Bitte später erneut.");
  const { wallet } = await params;
  const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const str = (k: string, max: number) => (typeof b[k] === "string" ? (b[k] as string).replace(/\s+/g, " ").trim().slice(0, max) : "");
  const name = str("name", 80);
  const email = str("email", 160).toLowerCase();
  const phone = str("phone", 40);
  const answer = typeof b.answer === "string" ? b.answer.trim().slice(0, 1000) : "";
  const eventTypeUri = str("event_type", 300);
  const start = new Date(String(b.start_time ?? ""));
  const booker = typeof b.booker_wallet === "string" && WALLET_RE.test(b.booker_wallet.toLowerCase()) ? b.booker_wallet.toLowerCase() : null;
  if (!name) return jsonFail(400, "BAD_NAME", "Bitte gib deinen Namen an.");
  if (!EMAIL_RE.test(email)) return jsonFail(400, "BAD_EMAIL", "Bitte gib eine gültige E-Mail-Adresse an.");
  if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) return jsonFail(400, "BAD_TIME", "Bitte wähle einen freien Termin.");

  const admin = createAdminClient();
  const cfg = await sellerConfig(admin, wallet.toLowerCase());
  if (!cfg) return jsonFail(404, "NOT_FOUND", "Keine Terminbuchung verfügbar.");

  let et;
  try {
    et = (await activeEventTypes(cfg)).find((t) => t.uri === eventTypeUri);
  } catch {
    return jsonFail(502, "CALENDLY_ERROR", "Calendly ist gerade nicht erreichbar.");
  }
  if (!et) return jsonFail(400, "BAD_EVENT_TYPE", "Dieser Termin ist nicht mehr buchbar.");
  if (et.location_kind === "outbound_call" && !phone) return jsonFail(400, "BAD_PHONE", "Bitte gib deine Telefonnummer an.");

  const { data: row, error } = await admin.from("bookings").insert({
    seller_wallet: cfg.seller_wallet, booker_wallet: booker, event_type_uri: et.uri, event_name: et.name,
    start_time: start.toISOString(), end_time: new Date(start.getTime() + et.duration * 60_000).toISOString(),
    name, email, phone: phone || null, answer: answer || null,
  }).select("id").single();
  if (error || !row) return jsonFail(500, "DB_ERROR", "Konnte nicht gebucht werden. Bitte erneut versuchen.");

  // 1) Native: Calendly Scheduling API (needs scheduled_events:write on the seller's token).
  try {
    const location = et.location_kind === "outbound_call" ? { kind: "outbound_call", location: phone } : undefined;
    const r = await calendly<{ resource: { uri: string; event: string } }>(cfg.calendly_token, "/invitees", {
      method: "POST",
      body: {
        event_type: et.uri,
        start_time: start.toISOString(),
        invitee: { name, email, timezone: "Europe/Berlin", ...(phone ? { text_reminder_number: phone } : {}) },
        ...(location ? { location } : {}),
        ...(et.question && answer ? { questions_and_answers: [{ question: et.question, answer, position: 0 }] } : {}),
      },
    });
    await admin.from("bookings").update({
      status: "booked", via: "api", calendly_invitee_uri: r.resource.uri, calendly_event_uri: r.resource.event,
    }).eq("id", row.id);
    return jsonOk({ status: "booked", booking_id: row.id });
  } catch (err) {
    const scope = err instanceof CalendlyError && (err.status === 401 || err.status === 403 || err.status === 404);
    if (!scope) {
      await admin.from("bookings").update({ status: "failed" }).eq("id", row.id);
      console.error("[booking] calendly book", err instanceof CalendlyError ? err.body : err);
      const taken = err instanceof CalendlyError && (err.status === 400 || err.status === 409);
      return jsonFail(taken ? 409 : 502, taken ? "SLOT_TAKEN" : "CALENDLY_ERROR",
        taken ? "Dieser Termin ist leider gerade vergeben. Bitte wähle eine andere Zeit." : "Die Buchung hat nicht geklappt. Bitte versuche es erneut.");
    }
  }

  // 2) Fallback until the seller's token can write: Calendly's page for exactly this slot, prefilled.
  const slot = `${et.scheduling_url}/${start.toISOString().replace(/\.\d{3}Z$/, "Z")}`;
  const qs = new URLSearchParams({ name, email, ...(answer ? { a1: answer } : {}), hide_gdpr_banner: "1" });
  await admin.from("bookings").update({ via: "calendly_page" }).eq("id", row.id);
  return jsonOk({ status: "needs_confirmation", booking_id: row.id, url: `${slot}?${qs.toString()}` });
}
