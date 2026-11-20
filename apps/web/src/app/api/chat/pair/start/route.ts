import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { HOUR_MS, takeAll } from "@/lib/rate-limit";
import { sharedLimiters } from "@/lib/rate-limit/server";
import {
  PAIRING_TTL_MS, approveUrl, cleanDeviceName, formatCode, generateCode, hashPollToken, newPollToken,
} from "@/lib/chat/pairing";
import { pairingsTable } from "@/lib/chat/pairing-store";
import { handleError, jsonError, readJson } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const limiters = sharedLimiters([{ name: "chat-pair-start-ip", limit: 30, windowMs: HOUR_MS }]);

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

/** POST /api/chat/pair/start { deviceName? } → { code, codeDisplay, pollToken, expiresAt, approveUrl, qrSvg } */
export async function POST(request: Request) {
  try {
    if (!(await takeAll(limiters, clientIp(request)))) {
      return jsonError(429, "rate_limited", "Zu viele Versuche. Bitte in einer Stunde erneut.");
    }
    const body = (await readJson(request)) ?? {};
    const pollToken = newPollToken();
    const code = generateCode();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
    const { error } = await pairingsTable().insert({
      code,
      poll_hash: hashPollToken(pollToken),
      device_name: cleanDeviceName(body.deviceName),
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);
    const url = approveUrl(new URL(request.url).origin, code);
    const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return NextResponse.json({ code, codeDisplay: formatCode(code), pollToken, expiresAt, approveUrl: url, qrSvg });
  } catch (err) {
    return handleError(err, "pair/start");
  }
}
