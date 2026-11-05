import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { verifyLiveToken } from "@/lib/live/token";
import { viewerProfile, UUID_RE, CHAT_MAX } from "@/lib/live/server";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { MINUTE_MS, takeAll } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const chatLimiters = sharedLimiters([{ name: "live-chat-wallet", limit: 20, windowMs: MINUTE_MS }]);

// POST with `Authorization: Live <token>` (from POST /api/live live_session):
//   chat     { show_id, body }          → { message }
//   vote     { show_id, item_id }       → { item_id }
//   remind   { item_id, on }            → { on }
//   my_state { show_id }                → { vote_item_id, reminder_item_ids }
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
    .select("id, status, chat_enabled, slow_mode_seconds, voting_open").eq("id", showId).maybeSingle();
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

  if (action === "chat") {
    if (!show.chat_enabled || show.status === "ended") return jsonFail(403, "CHAT_CLOSED", "Der Chat ist gerade geschlossen.");
    const body = typeof b.body === "string" ? b.body.replace(/\s+/g, " ").trim() : "";
    if (!body) return jsonFail(400, "EMPTY", "Nachricht ist leer.");
    if (body.length > CHAT_MAX) return jsonFail(400, "TOO_LONG", `Höchstens ${CHAT_MAX} Zeichen.`);
    const { data: muted } = await admin.from("live_mutes").select("wallet").eq("show_id", showId).eq("wallet", wallet).maybeSingle();
    if (muted) return jsonFail(403, "MUTED", "Du kannst in diesem Chat gerade nicht schreiben.");
    if (!(await takeAll(chatLimiters, wallet))) return jsonFail(429, "SLOW_MODE", "Nicht so schnell – kurz warten.");
    if (show.slow_mode_seconds > 0) {
      const { data: last } = await admin.from("live_chat_messages").select("created_at")
        .eq("show_id", showId).eq("wallet", wallet).eq("kind", "chat")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const waitMs = last ? Date.parse(last.created_at) + show.slow_mode_seconds * 1000 - Date.now() : 0;
      if (waitMs > 0) return jsonFail(429, "SLOW_MODE", `Langsamer Modus: noch ${Math.ceil(waitMs / 1000)} s warten.`);
    }
    const profile = await viewerProfile(admin, wallet);
    const { data: message, error } = await admin.from("live_chat_messages")
      .insert({ show_id: showId, wallet, ...profile, body, kind: "chat" })
      .select("id, show_id, display_name, avatar_url, body, kind, amount_cents, created_at, hidden_at, featured_at").single();
    if (error) return jsonFail(500, "DB_ERROR", error.message);
    return jsonOk({ message });
  }

  return jsonFail(400, "BAD_REQUEST", "unknown action");
}
