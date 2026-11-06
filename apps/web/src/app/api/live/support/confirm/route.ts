import { NextRequest } from "next/server";
import { jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { confirmLiveSupport } from "@/lib/live/confirm";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { MINUTE_MS, takeAll } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const limiters = sharedLimiters([{ name: "live-support-confirm-ip", limit: 30, windowMs: MINUTE_MS }]);

// POST { support_id } → { status }  (public, idempotent)
// Settles an Unterstützung right after Checkout without waiting for the Connect webhook: the server asks
// Stripe for the session it created and settles only if account, session id, amount match and it is paid.
export async function POST(request: NextRequest) {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await takeAll(limiters, ip))) return jsonFail(429, "RATE_LIMITED", "Zu viele Anfragen.");
  const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const status = await confirmLiveSupport(String(b.support_id ?? ""));
  if (status === "not_found") return jsonFail(404, "NOT_FOUND", "Unbekannt");
  if (status === "mismatch") return jsonFail(409, "MISMATCH", "Zahlung passt nicht zur Unterstützung.");
  if (status === "error") return jsonFail(502, "STRIPE_ERROR", "Stripe nicht erreichbar.");
  return jsonOk({ status });
}
