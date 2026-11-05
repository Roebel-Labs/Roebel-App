import { NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { UUID_RE, cfConfig, cfApi, cfHlsUrl, cfLifecycle } from "@/lib/live/server";
import { setOnStage, advance } from "@/lib/live/stage";
import { isStudioRequest } from "@/lib/live/studio-auth";
import { withCors, corsPreflight } from "@/lib/live/cors";
import { livekitConfig, livekitToken, guestRoomName } from "@/lib/live/livekit";

export const dynamic = "force-dynamic";

const OVERLAY_KEYS = ["lower_third", "next_up", "bug", "qr", "poll", "alerts", "reactions"] as const;

// POST (admin dashboard cookie, or `Authorization: Studio <LIVE_STUDIO_TOKEN>` from Ortis Studio) { action, show_id, ... } — see docs/superpowers/specs/2026-11-05-live-room-design.md
export async function POST(request: NextRequest) {
  return withCors(await handle(request));
}

export function OPTIONS() {
  return corsPreflight();
}

async function handle(request: NextRequest) {
  if (!isStudioRequest(request.headers) && !(await isAuthenticated())) return jsonFail(401, "UNAUTHORIZED", "Bitte im Admin-Bereich anmelden.");
  const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const action = String(b.action ?? "");
  const showId = String(b.show_id ?? "");
  if (!UUID_RE.test(showId)) return jsonFail(400, "BAD_REQUEST", "show_id fehlt");
  const admin = createAdminClient();
  const { data: show } = await admin.from("live_shows")
    .select("id, slug, title, status, overlay, cf_live_input_id, current_item_id").eq("id", showId).maybeSingle();
  if (!show) return jsonFail(404, "NOT_FOUND", "Übertragung nicht gefunden");
  const now = new Date().toISOString();

  try {
    switch (action) {
      case "set_status": {
        const status = String(b.status ?? "");
        if (!["scheduled", "live", "ended"].includes(status)) return jsonFail(400, "BAD_REQUEST", "status ungültig");
        const patch: Record<string, unknown> = { status, updated_at: now };
        // Ended: the Cloudflare recording becomes the replay (newest video of the input).
        const cfg = cfConfig();
        if (status === "ended" && cfg && show.cf_live_input_id) {
          try {
            const videos = await cfApi<{ uid: string; created: string }[]>(cfg, `/live_inputs/${show.cf_live_input_id}/videos`);
            const newest = [...videos].sort((a, b2) => Date.parse(b2.created) - Date.parse(a.created))[0];
            if (newest) patch.replay_url = cfHlsUrl(cfg, newest.uid);
          } catch (err) {
            console.error("[live] replay lookup", err);
          }
        }
        await admin.from("live_shows").update(patch).eq("id", showId);
        return jsonOk({ status, replay_url: patch.replay_url ?? null });
      }
      case "set_on_stage": {
        const itemId = b.item_id == null ? null : String(b.item_id);
        if (itemId !== null && !UUID_RE.test(itemId)) return jsonFail(400, "BAD_REQUEST", "item_id ungültig");
        return jsonOk(await setOnStage(admin, show, itemId));
      }
      case "next": {
        const r = await advance(admin, show);
        if (!r) return jsonFail(409, "END_OF_RUNDOWN", "Kein weiterer Programmpunkt.");
        return jsonOk(r);
      }
      case "rundown_replace": {
        const rows = Array.isArray(b.rows) ? (b.rows as Record<string, unknown>[]) : [];
        if (rows.length === 0 || rows.length > 500) return jsonFail(400, "BAD_REQUEST", "1–500 Zeilen erwartet");
        const clean = rows.map((r, i) => ({
          show_id: showId, position: i,
          title: String(r.title ?? "").trim().slice(0, 160),
          subtitle: r.subtitle ? String(r.subtitle).trim().slice(0, 200) : null,
          detail: r.detail ? String(r.detail).trim().slice(0, 400) : null,
          planned_at: r.planned_at && !Number.isNaN(Date.parse(String(r.planned_at))) ? new Date(String(r.planned_at)).toISOString() : null,
        })).filter((r) => r.title);
        if (clean.length === 0) return jsonFail(400, "BAD_REQUEST", "Keine Zeile mit Titel");
        await admin.from("live_shows").update({ current_item_id: null, updated_at: now }).eq("id", showId);
        await admin.from("live_rundown_items").delete().eq("show_id", showId);
        const { data, error } = await admin.from("live_rundown_items").insert(clean).select("*");
        if (error) throw new Error(error.message);
        return jsonOk({ items: data });
      }
      case "rundown_upsert": {
        const it = (b.item ?? {}) as Record<string, unknown>;
        const title = String(it.title ?? "").trim().slice(0, 160);
        if (!title) return jsonFail(400, "BAD_REQUEST", "Titel fehlt");
        const row: Record<string, unknown> = {
          show_id: showId, title,
          subtitle: it.subtitle ? String(it.subtitle).trim().slice(0, 200) : null,
          detail: it.detail ? String(it.detail).trim().slice(0, 400) : null,
          planned_at: it.planned_at && !Number.isNaN(Date.parse(String(it.planned_at))) ? new Date(String(it.planned_at)).toISOString() : null,
        };
        if (typeof it.image_url === "string" || it.image_url === null) row.image_url = it.image_url;
        if (Number.isInteger(it.position)) row.position = it.position;
        if (typeof it.id === "string" && UUID_RE.test(it.id)) {
          const { data, error } = await admin.from("live_rundown_items").update(row).eq("id", it.id).eq("show_id", showId).select("*").single();
          if (error) throw new Error(error.message);
          return jsonOk({ item: data });
        }
        if (row.position === undefined) {
          const { data: last } = await admin.from("live_rundown_items").select("position").eq("show_id", showId)
            .order("position", { ascending: false }).limit(1).maybeSingle();
          row.position = (last?.position ?? -1) + 1;
        }
        const { data, error } = await admin.from("live_rundown_items").insert(row).select("*").single();
        if (error) throw new Error(error.message);
        return jsonOk({ item: data });
      }
      case "rundown_delete": {
        const itemId = String(b.item_id ?? "");
        if (!UUID_RE.test(itemId)) return jsonFail(400, "BAD_REQUEST", "item_id fehlt");
        await admin.from("live_rundown_items").delete().eq("id", itemId).eq("show_id", showId);
        return jsonOk({ deleted: itemId });
      }
      case "set_overlay": {
        const patch = (b.patch ?? {}) as Record<string, unknown>;
        const overlay = { ...(show.overlay as Record<string, unknown>) };
        for (const k of OVERLAY_KEYS) if (typeof patch[k] === "boolean") overlay[k] = patch[k];
        if ("message" in patch) overlay.message = typeof patch.message === "string" && patch.message.trim() ? patch.message.trim().slice(0, 200) : null;
        if ("featured_message_id" in patch) {
          overlay.featured_message_id = typeof patch.featured_message_id === "string" && UUID_RE.test(patch.featured_message_id) ? patch.featured_message_id : null;
        }
        await admin.from("live_shows").update({ overlay, updated_at: now }).eq("id", showId);
        return jsonOk({ overlay });
      }
      case "set_flags": {
        const patch: Record<string, unknown> = { updated_at: now };
        if (typeof b.chat_enabled === "boolean") patch.chat_enabled = b.chat_enabled;
        if (typeof b.voting_open === "boolean") patch.voting_open = b.voting_open;
        if (Number.isInteger(b.slow_mode_seconds) && (b.slow_mode_seconds as number) >= 0 && (b.slow_mode_seconds as number) <= 600) {
          patch.slow_mode_seconds = b.slow_mode_seconds;
        }
        for (const k of ["title", "subtitle", "poster_url", "hls_url", "replay_url"] as const) {
          if (typeof b[k] === "string") patch[k] = (b[k] as string).trim() || null;
        }
        if (typeof b.starts_at === "string" && !Number.isNaN(Date.parse(b.starts_at))) patch.starts_at = new Date(b.starts_at).toISOString();
        const { data, error } = await admin.from("live_shows").update(patch).eq("id", showId).select("*").single();
        if (error) throw new Error(error.message);
        return jsonOk({ show: data });
      }
      case "hide_message": {
        const id = String(b.message_id ?? "");
        if (!UUID_RE.test(id)) return jsonFail(400, "BAD_REQUEST", "message_id fehlt");
        await admin.from("live_chat_messages").update({ hidden_at: now }).eq("id", id).eq("show_id", showId);
        const overlay = show.overlay as Record<string, unknown>;
        if (overlay?.featured_message_id === id) {
          await admin.from("live_shows").update({ overlay: { ...overlay, featured_message_id: null }, updated_at: now }).eq("id", showId);
        }
        return jsonOk({ hidden: id });
      }
      case "feature_message": {
        const id = b.message_id == null ? null : String(b.message_id);
        if (id !== null && !UUID_RE.test(id)) return jsonFail(400, "BAD_REQUEST", "message_id ungültig");
        if (id) await admin.from("live_chat_messages").update({ featured_at: now }).eq("id", id).eq("show_id", showId);
        const overlay = { ...(show.overlay as Record<string, unknown>), featured_message_id: id };
        await admin.from("live_shows").update({ overlay, updated_at: now }).eq("id", showId);
        return jsonOk({ overlay });
      }
      case "mute": {
        // The console only knows the message id (wallets never reach the browser).
        const id = String(b.message_id ?? "");
        if (!UUID_RE.test(id)) return jsonFail(400, "BAD_REQUEST", "message_id fehlt");
        const { data: msg } = await admin.from("live_chat_messages").select("wallet").eq("id", id).eq("show_id", showId).maybeSingle();
        if (!msg?.wallet) return jsonFail(404, "NOT_FOUND", "Nachricht nicht gefunden");
        await admin.from("live_mutes").upsert({ show_id: showId, wallet: msg.wallet }, { onConflict: "show_id,wallet", ignoreDuplicates: true });
        // Hide everything this person wrote in the show.
        await admin.from("live_chat_messages").update({ hidden_at: now }).eq("show_id", showId).eq("wallet", msg.wallet).eq("kind", "chat").is("hidden_at", null);
        // If one of their messages is on air, take it off.
        const overlay = show.overlay as Record<string, unknown>;
        if (typeof overlay?.featured_message_id === "string") {
          const { data: f } = await admin.from("live_chat_messages").select("wallet").eq("id", overlay.featured_message_id).maybeSingle();
          if (f?.wallet === msg.wallet) {
            await admin.from("live_shows").update({ overlay: { ...overlay, featured_message_id: null }, updated_at: now }).eq("id", showId);
          }
        }
        return jsonOk({ muted: true });
      }
      case "system_message": {
        const body = String(b.body ?? "").trim().slice(0, 280);
        if (!body) return jsonFail(400, "BAD_REQUEST", "Text fehlt");
        const { data, error } = await admin.from("live_chat_messages")
          .insert({ show_id: showId, display_name: "Röbel App", body, kind: "system" }).select("id").single();
        if (error) throw new Error(error.message);
        return jsonOk({ id: data.id });
      }
      case "cf_create_input": {
        const cfg = cfConfig();
        if (!cfg) return jsonFail(503, "CF_NOT_CONFIGURED", "Cloudflare Stream ist auf Vercel nicht konfiguriert (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN, CLOUDFLARE_STREAM_CUSTOMER_CODE).");
        if (show.cf_live_input_id) return jsonFail(409, "EXISTS", "Live-Input existiert schon.");
        const input = await cfApi<{ uid: string }>(cfg, "/live_inputs", {
          method: "POST",
          body: { meta: { name: `${show.title} (${show.slug})` }, recording: { mode: "automatic", timeoutSeconds: 120 } },
        });
        await admin.from("live_shows").update({ cf_live_input_id: input.uid, hls_url: cfHlsUrl(cfg, input.uid), updated_at: now }).eq("id", showId);
        return jsonOk({ cf_live_input_id: input.uid, hls_url: cfHlsUrl(cfg, input.uid) });
      }
      case "cf_input_info": {
        const cfg = cfConfig();
        if (!cfg || !show.cf_live_input_id) return jsonFail(409, "NO_INPUT", "Noch kein Live-Input.");
        const input = await cfApi<{ uid: string; rtmps?: { url: string; streamKey: string }; srt?: { url: string; streamId: string; passphrase: string }; status?: { current?: { state?: string } } | null }>(
          cfg, `/live_inputs/${show.cf_live_input_id}`,
        );
        const life = await cfLifecycle(cfg, show.cf_live_input_id);
        return jsonOk({
          rtmps_url: input.rtmps?.url ?? null, stream_key: input.rtmps?.streamKey ?? null,
          srt_url: input.srt?.url ?? null, srt_stream_id: input.srt?.streamId ?? null, srt_passphrase: input.srt?.passphrase ?? null,
          state: input.status?.current?.state ?? null, connected: life?.live ?? null,
          hls_url: cfHlsUrl(cfg, show.cf_live_input_id),
        });
      }
      case "cf_list_outputs": {
        const cfg = cfConfig();
        if (!cfg || !show.cf_live_input_id) return jsonFail(409, "NO_INPUT", "Noch kein Live-Input.");
        const outputs = await cfApi<{ uid: string; url: string; enabled: boolean; status?: { current?: { state?: string } } | null }[]>(
          cfg, `/live_inputs/${show.cf_live_input_id}/outputs`,
        );
        // Never echo stream keys back to the browser.
        return jsonOk({ outputs: outputs.map((o) => ({ uid: o.uid, url: o.url, enabled: o.enabled, state: o.status?.current?.state ?? null })) });
      }
      case "cf_add_output": {
        const cfg = cfConfig();
        if (!cfg || !show.cf_live_input_id) return jsonFail(409, "NO_INPUT", "Noch kein Live-Input.");
        const url = String(b.url ?? "").trim();
        const streamKey = String(b.stream_key ?? "").trim();
        if (!/^rtmps?:\/\//.test(url) || !streamKey) return jsonFail(400, "BAD_REQUEST", "RTMP(S)-URL und Streamschlüssel nötig");
        const out = await cfApi<{ uid: string }>(cfg, `/live_inputs/${show.cf_live_input_id}/outputs`, { method: "POST", body: { url, streamKey, enabled: true } });
        return jsonOk({ uid: out.uid });
      }
      case "cf_delete_output": {
        const cfg = cfConfig();
        if (!cfg || !show.cf_live_input_id) return jsonFail(409, "NO_INPUT", "Noch kein Live-Input.");
        const outputId = String(b.output_id ?? "");
        if (!/^[a-f0-9]{32}$/.test(outputId)) return jsonFail(400, "BAD_REQUEST", "output_id ungültig");
        await cfApi(cfg, `/live_inputs/${show.cf_live_input_id}/outputs/${outputId}`, { method: "DELETE" });
        return jsonOk({ deleted: outputId });
      }
      case "guest_list": {
        // Doorbell for the studio: open requests + the guests currently on. Never the wallet.
        const { data } = await admin.from("live_guest_requests")
          .select("id, display_name, avatar_url, note, status, room, created_at, decided_at")
          .eq("show_id", showId).in("status", ["requested", "accepted"]).order("created_at");
        return jsonOk({ requests: data ?? [], livekit: !!livekitConfig() });
      }
      case "guest_accept":
      case "guest_studio_token": {
        const lk = livekitConfig();
        if (!lk) return jsonFail(503, "LIVEKIT_NOT_CONFIGURED", "LiveKit ist auf Vercel nicht konfiguriert (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).");
        const id = String(b.request_id ?? "");
        if (!UUID_RE.test(id)) return jsonFail(400, "BAD_REQUEST", "request_id fehlt");
        const { data: req } = await admin.from("live_guest_requests").select("id, status, display_name").eq("id", id).eq("show_id", showId).maybeSingle();
        if (!req) return jsonFail(404, "NOT_FOUND", "Anfrage nicht gefunden");
        const room = guestRoomName(showId, id);
        if (action === "guest_accept") {
          if (req.status !== "requested" && req.status !== "accepted") return jsonFail(409, "BAD_STATE", "Diese Anfrage ist nicht mehr offen.");
          await admin.from("live_guest_requests").update({ status: "accepted", room, decided_at: now }).eq("id", id);
        } else if (req.status !== "accepted") {
          return jsonFail(409, "BAD_STATE", "Gast ist nicht zugeschaltet.");
        }
        const token = await livekitToken(lk, { identity: `studio-${id.slice(0, 8)}`, name: "Ortis Studio", room, canPublish: true });
        return jsonOk({ request_id: id, display_name: req.display_name, room, livekit_url: lk.url, token });
      }
      case "guest_decline":
      case "guest_end": {
        const id = String(b.request_id ?? "");
        if (!UUID_RE.test(id)) return jsonFail(400, "BAD_REQUEST", "request_id fehlt");
        const status = action === "guest_decline" ? "declined" : "ended";
        await admin.from("live_guest_requests").update(action === "guest_decline" ? { status, decided_at: now } : { status, ended_at: now })
          .eq("id", id).eq("show_id", showId).in("status", ["requested", "accepted"]);
        return jsonOk({ status });
      }
      default:
        return jsonFail(400, "BAD_REQUEST", "unknown action");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[live/admin]", action, message);
    return jsonFail(500, "FAILED", message);
  }
}
