// apps/web/src/lib/miniapp/runtimeAuth.ts
// Who is the user behind a mini-app runtime call (rewards, data scope=user,
// notifications runtime send, muenzen-balance)?
//
// A request that carries `Authorization: Bearer <token>` is decided by the
// token alone: a valid token yields its wallet (the caller-supplied wallet is
// ignored), an invalid one is 401 — never a fall-through to the wallet. A
// request without a token is refused when MINIAPP_REQUIRE_USER_TOKEN=1, and
// otherwise still trusts the host-supplied wallet (legacy, logged).
//
// Pure module: relative imports only, no `server-only`, no `@/` alias, so
// node:test can load it. The event logger is imported lazily.
import { MiniAppError } from "./types";
import {
  audienceFor,
  tokenKeysFromEnv,
  verifyUserToken,
  type MiniAppTokenClaims,
  type VerifyTokenResult,
} from "./userToken";

export type RuntimeRoute = "rewards" | "data" | "notifications" | "muenzen-balance";

export type RuntimeUser = { wallet: string; via: "token" | "legacy" };

export interface RuntimeAuthDeps {
  verify(token: string, audience: string): Promise<VerifyTokenResult>;
  requireToken: boolean;
  onLegacy?(info: LegacyCallInfo): void;
}

/** A legacy (wallet-only) call; `host` is the caller's `x-roebel-host` header when well-formed. */
export type LegacyCallInfo = { appId: string; route: string; host?: string };

/** Header the Röbel hosts send on user-scoped calls ("expo", "web"). */
export const HOST_HEADER = "x-roebel-host";
const HOST_RE = /^[a-z0-9-]{1,20}$/;

/** The calling host's name from the `x-roebel-host` header, or undefined if absent/malformed. */
export function hostLabel(value: string | null | undefined): string | undefined {
  return typeof value === "string" && HOST_RE.test(value) ? value : undefined;
}

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

export const MISSING_TOKEN_MESSAGE =
  "Nutzer-Token fehlt. Hole es mit sdk.auth.getToken() und sende es als Authorization: Bearer.";
const INVALID_TOKEN_MESSAGE = "Nutzer-Token ungültig oder abgelaufen.";

/**
 * The token of a `Bearer` Authorization header. `null` when there is no header
 * or another scheme (counts as no token); `""` for a Bearer header without a
 * value (counts as a present, invalid token).
 */
export function bearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const m = /^\s*Bearer(?:\s+(.*))?$/i.exec(authorization);
  if (!m) return null;
  return (m[1] ?? "").trim();
}

/** The wallet a verified token stands for. Plan 2 adds the pseudonym lookup. */
export async function resolveTokenWallet(claims: MiniAppTokenClaims): Promise<string> {
  if (!claims.addr || !WALLET_RE.test(claims.addr)) {
    throw new MiniAppError("unauthorized", INVALID_TOKEN_MESSAGE);
  }
  return claims.addr.toLowerCase();
}

export async function resolveRuntimeUser(
  p: {
    authorization: string | null;
    app: { id: string; slug: string };
    claimedWallet: string | null | undefined;
    route: RuntimeRoute;
    /** Raw `x-roebel-host` header; only recorded on the legacy path. */
    host?: string | null;
  },
  deps: RuntimeAuthDeps,
): Promise<RuntimeUser> {
  const token = bearerToken(p.authorization);

  if (token !== null) {
    if (!token) throw new MiniAppError("unauthorized", INVALID_TOKEN_MESSAGE);
    const v = await deps.verify(token, audienceFor(p.app.slug));
    if (!v.ok || v.claims.app !== p.app.id) {
      throw new MiniAppError("unauthorized", INVALID_TOKEN_MESSAGE);
    }
    return { wallet: await resolveTokenWallet(v.claims), via: "token" };
  }

  if (deps.requireToken) throw new MiniAppError("unauthorized", MISSING_TOKEN_MESSAGE);

  const claimed = (p.claimedWallet ?? "").trim();
  if (!WALLET_RE.test(claimed)) {
    throw new MiniAppError("unauthorized", "Keine gültige Wallet — bitte anmelden.");
  }
  try {
    const host = hostLabel(p.host);
    deps.onLegacy?.({ appId: p.app.id, route: p.route, ...(host ? { host } : {}) });
  } catch {
    // Logging must never fail the request.
  }
  return { wallet: claimed.toLowerCase(), via: "legacy" };
}

/** Production deps: env-driven switch, keys from MINIAPP_TOKEN_PRIVATE_JWK. */
export function runtimeAuthDeps(): RuntimeAuthDeps {
  return {
    requireToken: process.env.MINIAPP_REQUIRE_USER_TOKEN === "1",
    async verify(token, audience) {
      const k = tokenKeysFromEnv();
      // No keys configured: a token cannot be verified, so it is refused.
      if (!k) return { ok: false, code: "bad_signature" };
      return verifyUserToken(token, { keys: k.keys, issuers: k.issuers, audience });
    },
    onLegacy({ appId, route, host }) {
      const props = { route, ...(host ? { host } : {}) };
      console.warn("[mini-apps] bare wallet call", { appId, ...props });
      void import("./data")
        .then(({ ingestEvent }) =>
          ingestEvent({ miniAppId: appId, sessionId: "server", event: "legacy_wallet_call", props }),
        )
        .catch((e) => console.error("[mini-apps] legacy_wallet_call log failed:", (e as Error)?.message ?? e));
    },
  };
}
