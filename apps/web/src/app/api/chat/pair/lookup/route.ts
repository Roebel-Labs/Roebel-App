import { NextResponse } from "next/server";
import { formatCode, normalizeCode, pairingView } from "@/lib/chat/pairing";
import { findByCode } from "@/lib/chat/pairing-store";
import { handleError, jsonError } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/chat/pair/lookup?code= → { deviceName, state } so the approver sees WHAT they connect. */
export async function GET(request: Request) {
  try {
    const code = normalizeCode(new URL(request.url).searchParams.get("code"));
    if (!code) return jsonError(400, "bad_code", "Der Code ist ungültig.");
    const row = await findByCode(code);
    if (!row) return jsonError(404, "not_found", "Diesen Code gibt es nicht.");
    return NextResponse.json({ code: formatCode(code), deviceName: row.device_name, state: pairingView(row, Date.now()) });
  } catch (err) {
    return handleError(err, "pair/lookup");
  }
}
