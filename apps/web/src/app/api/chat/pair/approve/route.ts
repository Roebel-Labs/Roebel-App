import { NextResponse } from "next/server";
import { HOUR_MS, takeAll } from "@/lib/rate-limit";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { normalizeCode, pairingView } from "@/lib/chat/pairing";
import { findByCode, pairingsTable, resolveApprover } from "@/lib/chat/pairing-store";
import { handleError, jsonError, readJson } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const limiters = sharedLimiters([{ name: "chat-pair-approve-wallet", limit: 20, windowMs: HOUR_MS }]);

/**
 * POST /api/chat/pair/approve { code } — the signed-in owner confirms a device.
 * Auth: Bearer chat session (Röbel app) or the Ortis ID workspace cookie (browser).
 * Never auto-approve after a login: the page and the app always ask first (device-code phishing).
 */
export async function POST(request: Request) {
  try {
    const approver = await resolveApprover(request);
    if (!approver) {
      console.info("[pair/approve] 401 no session", { bearer: !!request.headers.get("authorization") });
      return jsonError(401, "unauthorized", "Bitte zuerst anmelden.");
    }
    if (!(await takeAll(limiters, approver.wallet))) {
      return jsonError(429, "rate_limited", "Zu viele Versuche. Bitte später erneut.");
    }
    const code = normalizeCode((await readJson(request))?.code);
    if (!code) return jsonError(400, "bad_code", "Der Code ist ungültig.");
    const row = await findByCode(code);
    if (!row) return jsonError(404, "not_found", "Diesen Code gibt es nicht.");
    const view = pairingView(row, Date.now());
    if (view !== "pending") console.info("[pair/approve] rejected", { view, pairing: row.id });
    if (view === "expired") return jsonError(410, "expired", "Der Code ist abgelaufen. Bitte in Ortis Studio einen neuen anzeigen.");
    if (view !== "pending") return jsonError(409, "used", "Dieser Code wurde schon verwendet.");
    const { data, error } = await pairingsTable()
      .update({ status: "approved", wallet: approver.wallet, approved_via: approver.via, approved_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return jsonError(409, "used", "Dieser Code wurde schon verwendet.");
    console.info("[pair/approve] ok", { via: approver.via, pairing: row.id });
    return NextResponse.json({ ok: true, deviceName: row.device_name });
  } catch (err) {
    return handleError(err, "pair/approve");
  }
}
