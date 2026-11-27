import { NextRequest } from "next/server";
import { jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { confirmAppSupport } from "@/lib/app-support";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { MINUTE_MS, takeAll } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const limiters = sharedLimiters([{ name: "app-support-confirm-ip", limit: 30, windowMs: MINUTE_MS }]);

// POST { support_id } → { status }  (public, idempotent). Asks Stripe directly so the supporter shows in
// the list right after Checkout, without waiting for the Connect webhook.
export async function POST(request: NextRequest) {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await takeAll(limiters, ip))) return jsonFail(429, "RATE_LIMITED", "Zu viele Anfragen.");
  const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const status = await confirmAppSupport(String(b.support_id ?? ""));
  if (status === "not_found") return jsonFail(404, "NOT_FOUND", "Unbekannt");
  if (status === "mismatch") return jsonFail(409, "MISMATCH", "Zahlung passt nicht.");
  if (status === "error") return jsonFail(502, "STRIPE_ERROR", "Stripe nicht erreichbar.");
  return jsonOk({ status });
}
