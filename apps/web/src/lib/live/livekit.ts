// LiveKit access tokens for phone guests (server only). A LiveKit token is an HS256 JWT signed with
// the API secret: iss = API key, sub = identity, `video` = room grant. No SDK needed.
import "server-only";
import { SignJWT } from "jose";

export type LivekitConfig = { url: string; apiKey: string; apiSecret: string };

export function livekitConfig(): LivekitConfig | null {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

/** One room per accepted guest request, so a guest only ever sees the studio. */
export function guestRoomName(showId: string, requestId: string): string {
  return `live-${showId.slice(0, 8)}-${requestId.slice(0, 8)}`;
}

export async function livekitToken(
  cfg: LivekitConfig,
  opts: { identity: string; name: string; room: string; canPublish: boolean; ttlSeconds?: number },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    name: opts.name,
    video: {
      room: opts.room, roomJoin: true,
      canPublish: opts.canPublish, canSubscribe: true, canPublishData: true,
    },
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(cfg.apiKey)
    .setSubject(opts.identity)
    .setNotBefore(now - 10)
    .setExpirationTime(now + (opts.ttlSeconds ?? 2 * 60 * 60))
    .setJti(`${opts.identity}-${now}`)
    .sign(new TextEncoder().encode(cfg.apiSecret));
}
