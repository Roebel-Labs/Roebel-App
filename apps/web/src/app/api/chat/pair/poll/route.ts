import { NextResponse } from "next/server";
import { hashPollToken, isPollToken, pairingView } from "@/lib/chat/pairing";
import { findByPollHash, pairingsTable } from "@/lib/chat/pairing-store";
import { issueSessionToken } from "@/lib/chat/session";
import { handleError, jsonError, readJson } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat/pair/poll { pollToken } → { state: 'pending' } | { state: 'approved', token, expiresAt }.
 * The token is handed out exactly once (approved → claimed, guarded by the status filter).
 */
export async function POST(request: Request) {
  try {
    const pollToken = (await readJson(request))?.pollToken;
    if (!isPollToken(pollToken)) return jsonError(400, "bad_request", "Ungültige Anfrage.");
    const row = await findByPollHash(hashPollToken(pollToken));
    if (!row) return jsonError(404, "not_found", "Unbekannte Kopplung.");
    const view = pairingView(row, Date.now());
    if (view === "expired") return jsonError(410, "expired", "Der Code ist abgelaufen.");
    if (view === "claimed") return jsonError(409, "used", "Diese Kopplung wurde schon abgeschlossen.");
    if (view === "pending") return NextResponse.json({ state: "pending" });
    const { data, error } = await pairingsTable()
      .update({ status: "claimed", claimed_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "approved")
      .select("wallet")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data?.wallet) return jsonError(409, "used", "Diese Kopplung wurde schon abgeschlossen.");
    const { token, expiresAt } = await issueSessionToken(data.wallet);
    return NextResponse.json({ state: "approved", token, expiresAt });
  } catch (err) {
    return handleError(err, "pair/poll");
  }
}
