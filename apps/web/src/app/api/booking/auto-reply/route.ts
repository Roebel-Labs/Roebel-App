import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { MINUTE_MS, takeAll } from "@/lib/rate-limit";
import { UUID_RE, autoReplyText, sellerConfig } from "@/lib/booking/calendly";

export const dynamic = "force-dynamic";
const limiters = sharedLimiters([{ name: "booking-autoreply-ip", limit: 20, windowMs: MINUTE_MS }]);

// POST { booking_id, conversation_id } → { sent: boolean }
// The seller's automatic answer in the booker's DM thread (Supabase rail; XMTP would need the seller's key).
// Only for a booking Calendly confirmed, only into a conversation that includes the seller, at most once.
export async function POST(request: NextRequest) {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await takeAll(limiters, ip))) return jsonFail(429, "RATE_LIMITED", "Zu viele Anfragen.");
  const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const id = String(b.booking_id ?? "");
  const convId = String(b.conversation_id ?? "");
  if (!UUID_RE.test(id) || !UUID_RE.test(convId)) return jsonFail(400, "BAD_REQUEST", "Ungültig");

  const admin = createAdminClient();
  const { data: bk } = await admin.from("bookings")
    .select("id, seller_wallet, status, start_time, name, auto_replied_at").eq("id", id).maybeSingle();
  if (!bk || bk.status !== "booked") return jsonFail(409, "NOT_BOOKED", "Buchung nicht bestätigt.");
  if (bk.auto_replied_at) return jsonOk({ sent: false });
  const cfg = await sellerConfig(admin, bk.seller_wallet);
  if (!cfg) return jsonFail(404, "NOT_FOUND", "Unbekannt");

  const { data: convo } = await admin.from("conversations")
    .select("id, participant_one_account_id, participant_two_account_id").eq("id", convId).maybeSingle();
  if (!convo || (convo.participant_one_account_id !== cfg.seller_account_id && convo.participant_two_account_id !== cfg.seller_account_id)) {
    return jsonFail(409, "BAD_CONVERSATION", "Falscher Chat.");
  }

  // Claim first so a double tap / retry never sends twice.
  const { data: claimed } = await admin.from("bookings")
    .update({ auto_replied_at: new Date().toISOString(), conversation_id: convId })
    .eq("id", id).is("auto_replied_at", null).select("id");
  if (!claimed?.length) return jsonOk({ sent: false });

  const text = autoReplyText(cfg.auto_reply, bk.name, new Date(bk.start_time));
  const { error } = await admin.from("direct_messages").insert({
    conversation_id: convId,
    sender_address: cfg.seller_account_id,
    sender_account_id: cfg.seller_account_id,
    content: JSON.stringify({ type: "auto_reply", text }),
  });
  if (error) {
    await admin.from("bookings").update({ auto_replied_at: null }).eq("id", id);
    console.error("[booking] auto-reply insert", error);
    return jsonFail(500, "DB_ERROR", "Antwort konnte nicht gesendet werden.");
  }
  return jsonOk({ sent: true });
}
