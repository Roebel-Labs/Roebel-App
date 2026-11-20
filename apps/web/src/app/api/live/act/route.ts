import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { verifyLiveToken } from "@/lib/live/token";
import { viewerProfile, UUID_RE, CHAT_MAX } from "@/lib/live/server";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { MINUTE_MS, takeAll } from "@/lib/rate-limit";
import { livekitConfig, livekitToken } from "@/lib/live/livekit";
import { advance } from "@/lib/live/stage";
import { insertChat } from "@/lib/live/chat";
import { normaliseChat, spamCheck, isDuplicate, SPAM_MESSAGES } from "@/lib/live/spam";

export const dynamic = "force-dynamic";
const chatLimiters = sharedLimiters([{ name: "live-chat-wallet", limit: 20, windowMs: MINUTE_MS }]);
const burstLimiters = sharedLimiters([{ name: "live-chat-burst", limit: 4, windowMs: 10_000 }]);
const strikeLimiters = sharedLimiters([{ name: "live-chat-strikes", limit: 4, windowMs: 10 * MINUTE_MS }]);

// POST with `Authorization: Live <token>` (from POST /api/live live_session):
//   chat     { show_id, body }          → { message }
//   vote     { show_id, item_id }       → { item_id }
//   remind   { item_id, on }            → { on }
//   my_state { show_id }                → { vote_item_id, reminder_item_ids }
//   guest_request { show_id, note? }   → { request }            (join the stream from the phone)
//   guest_status  { show_id, request_id } → { status, livekit_url?, token?, room? } (token once accepted)
//   guest_cancel  { show_id, request_id } → { status }
//   test_support  { show_id, amount_cents, body? } → { message }   (test shows only, no money)
//   test_next     { show_id }           → { current }            (test shows only)
//   report        { show_id, message_id, reason } → { reported } (3 reporters hide the message)
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const session = verifyLiveToken(auth.startsWith("Live ") ? auth.slice(5).trim() : null);
  if (!session) return jsonFail(401, "SESSION_INVALID", "Bitte melde dich erneut an.");
  const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const action = String(b.action ?? "");
  const admin = createAdminClient();
  const { wallet } = session;

  if (action === "remind") {
    const itemId = String(b.item_id ?? "");
    if (!UUID_RE.test(itemId)) return jsonFail(400, "BAD_REQUEST", "item_id fehlt");
    const { data: item } = await admin.from("live_rundown_items").select("id, show_id, status").eq("id", itemId).maybeSingle();
    if (!item || item.show_id !== session.showId) return jsonFail(404, "NOT_FOUND", "Programmpunkt nicht gefunden");
    if (b.on === false) {
      await admin.from("live_reminders").delete().eq("item_id", itemId).eq("wallet", wallet);
      return jsonOk({ on: false });
    }
    const { error } = await admin.from("live_reminders").upsert({ item_id: itemId, wallet }, { onConflict: "item_id,wallet", ignoreDuplicates: true });
    if (error) return jsonFail(500, "DB_ERROR", error.message);
    return jsonOk({ on: true });
  }

  const showId = String(b.show_id ?? "");
  if (showId !== session.showId) return jsonFail(403, "WRONG_SHOW", "Diese Sitzung gehört zu einer anderen Übertragung.");
  const { data: show } = await admin.from("live_shows")
    .select("*").eq("id", showId).maybeSingle();
  if (!show) return jsonFail(404, "NOT_FOUND", "Übertragung nicht gefunden");

  if (action === "my_state") {
    const [{ data: vote }, { data: reminders }] = await Promise.all([
      admin.from("live_votes").select("item_id").eq("show_id", showId).eq("wallet", wallet).maybeSingle(),
      admin.from("live_reminders").select("item_id, live_rundown_items!inner(show_id)").eq("wallet", wallet).eq("live_rundown_items.show_id", showId),
    ]);
    return jsonOk({ vote_item_id: vote?.item_id ?? null, reminder_item_ids: (reminders ?? []).map((r) => r.item_id) });
  }

  if (action === "vote") {
    if (!show.voting_open) return jsonFail(409, "VOTING_CLOSED", "Die Abstimmung ist gerade geschlossen.");
    const itemId = String(b.item_id ?? "");
    if (!UUID_RE.test(itemId)) return jsonFail(400, "BAD_REQUEST", "item_id fehlt");
    const { data: item } = await admin.from("live_rundown_items").select("id, show_id").eq("id", itemId).maybeSingle();
    if (!item || item.show_id !== showId) return jsonFail(404, "NOT_FOUND", "Programmpunkt nicht gefunden");
    const { error } = await admin.from("live_votes")
      .upsert({ show_id: showId, item_id: itemId, wallet, created_at: new Date().toISOString() }, { onConflict: "show_id,wallet" });
    if (error) return jsonFail(500, "DB_ERROR", error.message);
    return jsonOk({ item_id: itemId });
  }

  if (action === "guest_request") {
    if (show.guests_enabled === false || show.status === "ended") return jsonFail(403, "GUESTS_CLOSED", "Dazuschalten ist gerade nicht möglich.");
    if (!livekitConfig()) return jsonFail(503, "GUESTS_UNAVAILABLE", "Dazuschalten ist noch nicht eingerichtet.");
    const { data: open } = await admin.from("live_guest_requests").select("id, status, room, created_at")
      .eq("show_id", showId).eq("wallet", wallet).in("status", ["requested", "accepted"]).maybeSingle();
    if (open) return jsonOk({ request: open });
    const profile = await viewerProfile(admin, wallet);
    const note = typeof b.note === "string" ? b.note.replace(/\s+/g, " ").trim().slice(0, 140) || null : null;
    const { data: request, error } = await admin.from("live_guest_requests")
      .insert({ show_id: showId, wallet, ...profile, note }).select("id, status, room, created_at").single();
    if (error) return jsonFail(500, "DB_ERROR", error.message);
    return jsonOk({ request });
  }

  if (action === "guest_status" || action === "guest_cancel") {
    const id = String(b.request_id ?? "");
    if (!UUID_RE.test(id)) return jsonFail(400, "BAD_REQUEST", "request_id fehlt");
    const { data: req } = await admin.from("live_guest_requests").select("id, status, room, display_name")
      .eq("id", id).eq("show_id", showId).eq("wallet", wallet).maybeSingle();
    if (!req) return jsonFail(404, "NOT_FOUND", "Anfrage nicht gefunden");
    if (action === "guest_cancel") {
      const status = req.status === "accepted" ? "ended" : "cancelled";
      if (req.status === "requested" || req.status === "accepted") {
        await admin.from("live_guest_requests").update({ status, ended_at: new Date().toISOString() }).eq("id", id);
        return jsonOk({ status });
      }
      return jsonOk({ status: req.status });
    }
    const lk = livekitConfig();
    if (req.status !== "accepted" || !req.room || !lk) return jsonOk({ status: req.status });
    const token = await livekitToken(lk, { identity: `guest-${id.slice(0, 8)}`, name: req.display_name, room: req.room, canPublish: true });
    return jsonOk({ status: req.status, room: req.room, livekit_url: lk.url, token });
  }

  if (action === "test_support" || action === "test_next") {
    if (!show.is_test) return jsonFail(403, "NOT_A_TEST", "Nur im Testlauf möglich.");
    if (action === "test_next") return jsonOk(await advance(admin, show, true));
    const amount = Math.min(50000, Math.max(100, Math.round(Number(b.amount_cents) || 500)));
    const profile = await viewerProfile(admin, wallet);
    const body = typeof b.body === "string" ? b.body.replace(/\s+/g, " ").trim().slice(0, 140) : "";
    const { data: message, error } = await insertChat(admin, {
      show_id: showId, wallet, display_name: profile.display_name, avatar_url: profile.avatar_url, body, kind: "support", amount_cents: amount,
    });
    if (error) return jsonFail(500, "DB_ERROR", error.message);
    return jsonOk({ message });
  }

  if (action === "chat") {
    if (!show.chat_enabled || show.status === "ended") return jsonFail(403, "CHAT_CLOSED", "Der Chat ist gerade geschlossen.");
    const raw = typeof b.body === "string" ? b.body : "";
    const body = normaliseChat(raw);
    if (!body) return jsonFail(400, "EMPTY", "Nachricht ist leer.");
    if (body.length > CHAT_MAX) return jsonFail(400, "TOO_LONG", `Höchstens ${CHAT_MAX} Zeichen.`);
    const { data: muted } = await admin.from("live_mutes").select("wallet").eq("show_id", showId).eq("wallet", wallet).maybeSingle();
    if (muted) return jsonFail(403, "MUTED", SPAM_MESSAGES.MUTED);

    // Spam: every refusal is a strike; the 5th strike within 10 minutes mutes the person for this show.
    const refuse = async (status: number, code: string, message: string) => {
      if (!(await takeAll(strikeLimiters, `${showId}:${wallet}`))) {
        await admin.from("live_mutes").upsert({ show_id: showId, wallet }, { onConflict: "show_id,wallet", ignoreDuplicates: true });
        return jsonFail(403, "MUTED", "Zu viele blockierte Nachrichten – du bist in diesem Chat stummgeschaltet.");
      }
      return jsonFail(status, code, message);
    };
    const content = spamCheck(body);
    if (content) return refuse(400, content, SPAM_MESSAGES[content]);
    if (!(await takeAll(burstLimiters, wallet))) return refuse(429, "SPAM_FLOOD", SPAM_MESSAGES.SPAM_FLOOD);
    if (!(await takeAll(chatLimiters, wallet))) return refuse(429, "SPAM_FLOOD", SPAM_MESSAGES.SPAM_FLOOD);
    const { data: recent } = await admin.from("live_chat_messages").select("body, created_at")
      .eq("show_id", showId).eq("wallet", wallet).eq("kind", "chat")
      .gte("created_at", new Date(Date.now() - 2 * 60_000).toISOString())
      .order("created_at", { ascending: false }).limit(5);
    if (isDuplicate(body, (recent ?? []).map((r) => r.body as string))) return refuse(429, "SPAM_DUPLICATE", SPAM_MESSAGES.SPAM_DUPLICATE);
    if (show.slow_mode_seconds > 0 && recent?.[0]) {
      const waitMs = Date.parse(recent[0].created_at) + show.slow_mode_seconds * 1000 - Date.now();
      if (waitMs > 0) return jsonFail(429, "SLOW_MODE", `Langsamer Modus: noch ${Math.ceil(waitMs / 1000)} s warten.`);
    }
    const profile = await viewerProfile(admin, wallet);
    const { data: message, error } = await insertChat(admin, { show_id: showId, wallet, ...profile, body, kind: "chat" });
    if (error) return jsonFail(500, "DB_ERROR", error.message);
    return jsonOk({ message });
  }

  if (action === "report") {
    const messageId = String(b.message_id ?? "");
    if (!UUID_RE.test(messageId)) return jsonFail(400, "BAD_REQUEST", "message_id fehlt");
    const reason = ["spam", "abuse", "other"].includes(String(b.reason)) ? String(b.reason) : "other";
    const { data: msg } = await admin.from("live_chat_messages").select("id, wallet, kind").eq("id", messageId).eq("show_id", showId).maybeSingle();
    if (!msg) return jsonFail(404, "NOT_FOUND", "Nachricht nicht gefunden");
    if (msg.wallet === wallet) return jsonOk({ reported: true });
    const { error } = await admin.from("live_reports")
      .upsert({ show_id: showId, message_id: messageId, reporter_wallet: wallet, reason }, { onConflict: "message_id,reporter_wallet", ignoreDuplicates: true });
    if (error) return jsonFail(500, "DB_ERROR", error.message);
    // Three different people reporting the same message hide it until the operator looks at it.
    const { count } = await admin.from("live_reports").select("id", { count: "exact", head: true }).eq("message_id", messageId);
    if ((count ?? 0) >= 3 && msg.kind === "chat") {
      await admin.from("live_chat_messages").update({ hidden_at: new Date().toISOString() }).eq("id", messageId).is("hidden_at", null);
    }
    return jsonOk({ reported: true });
  }

  return jsonFail(400, "BAD_REQUEST", "unknown action");
}
