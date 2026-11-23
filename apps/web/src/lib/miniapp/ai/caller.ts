// Who is calling a builder AI route (/api/mini-apps/generate, /cms-plan, /manifest) and how much
// may they spend. Pure logic (no I/O) so it can be tested without the server.
//
// - "session": a verified chat session token (Ortis Studio pairing, Röbel App chat). Limited per
//   wallet with a generous budget.
// - "anon": everyone else, including the web editor before a wallet is connected. The
//   `x-wallet-address` header is NOT proof of anything, so these callers are limited per IP.

export type BuilderCaller =
  | { kind: "session"; wallet: string }
  | { kind: "anon"; ip: string };

export type BuilderAiRoute = "generate" | "assist";

export interface LimitRule {
  name: string;
  limit: number;
  windowMs: number;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * Budgets. "generate" = a full app document (the expensive call); "assist" = the short
 * manifest / CMS-plan calls that accompany a build.
 */
export const BUILDER_LIMITS: Record<BuilderCaller["kind"], Record<BuilderAiRoute, LimitRule[]>> = {
  session: {
    generate: [
      { name: "miniapp-gen-wallet-h", limit: 40, windowMs: HOUR },
      { name: "miniapp-gen-wallet-d", limit: 200, windowMs: DAY },
    ],
    assist: [{ name: "miniapp-assist-wallet-h", limit: 120, windowMs: HOUR }],
  },
  anon: {
    generate: [
      { name: "miniapp-gen-ip-h", limit: 15, windowMs: HOUR },
      { name: "miniapp-gen-ip-d", limit: 60, windowMs: DAY },
    ],
    assist: [{ name: "miniapp-assist-ip-h", limit: 60, windowMs: HOUR }],
  },
};

export function clientIp(headers: Headers): string {
  return (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}

/** Session token first (verified by the injected function), else the IP. */
export async function resolveBuilderCaller(
  headers: Headers,
  verifyBearer: (authorization: string | null) => Promise<string | null>,
): Promise<BuilderCaller> {
  const wallet = await verifyBearer(headers.get("authorization"));
  if (wallet) return { kind: "session", wallet };
  return { kind: "anon", ip: clientIp(headers) };
}

export function limitKey(caller: BuilderCaller): string {
  return caller.kind === "session" ? `w:${caller.wallet}` : `ip:${caller.ip}`;
}

export const BUILDER_LIMIT_MESSAGE: Record<BuilderCaller["kind"], string> = {
  session: "Du hast gerade sehr viele Apps gebaut. Bitte versuche es später noch einmal.",
  anon: "Zu viele Anfragen von deinem Anschluss. Melde dich an oder versuche es später noch einmal.",
};
