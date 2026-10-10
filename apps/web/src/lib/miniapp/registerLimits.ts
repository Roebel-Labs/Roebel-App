// Shared rate limits for self-hosted manifest registration (HTTP + MCP).
import { sharedLimiters } from "@/lib/rate-limit/server";
import { HOUR_MS, MINUTE_MS, takeAll } from "@/lib/rate-limit";

const ipLimiters = sharedLimiters([{ name: "miniapp-register-ip", limit: 10, windowMs: HOUR_MS }]);
const originLimiters = sharedLimiters([{ name: "miniapp-register-origin", limit: 1, windowMs: MINUTE_MS }]);

export type RegisterLimit = "ip" | "origin";

/** Returns which limit refused, or null when allowed. IP is checked first. */
export async function checkRegisterLimits(ip: string, origin: string): Promise<RegisterLimit | null> {
  if (!(await takeAll(ipLimiters, ip))) return "ip";
  if (!(await takeAll(originLimiters, origin))) return "origin";
  return null;
}

export async function takeRegisterLimits(ip: string, origin: string): Promise<boolean> {
  return (await checkRegisterLimits(ip, origin)) === null;
}

export const REGISTER_LIMIT_MESSAGES: Record<RegisterLimit, string> = {
  ip: "Zu viele Registrierungen von deinem Anschluss — bitte in einer Stunde erneut versuchen.",
  origin: "Dieses Manifest wurde gerade erst geladen — bitte in einer Minute erneut versuchen.",
};
