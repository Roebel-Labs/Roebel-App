// Live-room session token: one wallet signature (live_session) buys 12 h of chat / vote / remind
// without a signature per message. HMAC over wallet + show + expiry; stateless.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const LIVE_TOKEN_TTL_SECONDS = 12 * 60 * 60;

function secret(): string {
  const s = process.env.LIVE_TOKEN_SECRET || process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("no secret for live tokens (LIVE_TOKEN_SECRET / SESSION_SECRET)");
  return s;
}

function mac(body: string): string {
  return createHmac("sha256", secret()).update(`live-token:${body}`).digest("base64url");
}

export function issueLiveToken(wallet: string, showId: string, nowSec = Math.floor(Date.now() / 1000)): { token: string; expiresAt: string } {
  const exp = nowSec + LIVE_TOKEN_TTL_SECONDS;
  const body = `v1.${wallet.toLowerCase()}.${showId}.${exp}`;
  return { token: `${body}.${mac(body)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Returns the wallet + show the token was issued for, or null when forged / expired. */
export function verifyLiveToken(token: string | null | undefined, nowSec = Math.floor(Date.now() / 1000)): { wallet: string; showId: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return null;
  const [, wallet, showId, expRaw, sig] = parts;
  const body = `v1.${wallet}.${showId}.${expRaw}`;
  const expected = Buffer.from(mac(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < nowSec) return null;
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) return null;
  return { wallet, showId };
}
