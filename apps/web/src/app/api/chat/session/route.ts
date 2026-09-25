import { NextResponse } from "next/server";
import { issueSessionToken, verifySessionRequest } from "@/lib/chat/session";
import { handleError, jsonError, readJson } from "../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/chat/session — wallet signature → 30-day chat session token. */
export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if (!body) return jsonError(400, "bad_request", "Ungültige Anfrage.");
    const res = await verifySessionRequest(body);
    if (!res.ok) return jsonError(res.status, res.code, res.message);
    const { token, expiresAt } = await issueSessionToken(res.wallet);
    return NextResponse.json({ token, expiresAt });
  } catch (err) {
    return handleError(err, "session");
  }
}
