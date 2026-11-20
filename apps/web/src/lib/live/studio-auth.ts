// Ortis Studio authenticates to the live-room operator API with a shared token
// (`Authorization: Studio <LIVE_STUDIO_TOKEN>`), entered once in the studio's Live-Raum panel.
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

type HeaderBag = { get(name: string): string | null };

export function isStudioRequest(headers: HeaderBag): boolean {
  const expected = process.env.LIVE_STUDIO_TOKEN;
  if (!expected || expected.length < 24) return false;
  const auth = headers.get("authorization") ?? "";
  if (!auth.startsWith("Studio ")) return false;
  // Compare digests so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(auth.slice(7).trim()).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
