// apps/web/src/lib/miniapp/userTokenHandler.ts
// Pure request handler for POST /api/mini-apps/token. Dependencies are injected so
// node:test can load it (no `server-only`, no `@/` alias).
import type { VerifyFail, VerifyOk } from "../signed-request/verify";
import { MINIAPP_TOKEN_TTL_SEC, audienceFor, type TokenIssuer } from "./userToken";

type HeaderBag = { get(name: string): string | null };

export interface UserTokenDeps {
  verify: (body: unknown, headers: HeaderBag) => Promise<VerifyOk<"user_token"> | VerifyFail>;
  getApp(ref: string): Promise<{ id: string; slug: string; status: string } | null>;
  issuer: TokenIssuer | null;
  take(wallet: string): Promise<boolean>;
  nowSec(): number;
  jti(): string;
}

export interface UserTokenResult {
  status: number;
  json: Record<string, unknown>;
}

export async function handleUserTokenRequest(body: unknown, headers: HeaderBag, deps: UserTokenDeps): Promise<UserTokenResult> {
  const v = await deps.verify(body, headers);
  if (!v.ok) return { status: v.status, json: { ok: false, code: v.code, message: v.message } };

  if (!deps.issuer) return { status: 503, json: { ok: false, code: "token_unavailable" } };

  const ref = typeof v.payload.app === "string" ? v.payload.app.trim() : "";
  const app = ref ? await deps.getApp(ref) : null;
  if (!app) return { status: 404, json: { ok: false, code: "not_found" } };
  if (app.status === "suspended") return { status: 403, json: { ok: false, code: "forbidden" } };

  // The wallet is the verified one, never anything from the payload.
  if (!(await deps.take(v.wallet))) return { status: 429, json: { ok: false, code: "rate_limited" } };

  const iat = deps.nowSec();
  const exp = iat + MINIAPP_TOKEN_TTL_SEC;
  const token = await deps.issuer.sign({
    aud: audienceFor(app.slug),
    sub: v.wallet,
    addr: v.wallet,
    app: app.id,
    iat,
    exp,
    jti: deps.jti(),
    v: 1,
  });
  // `expiresIn` lets clients compute the expiry on their own clock (a phone's clock may be off).
  return { status: 200, json: { token, expiresAt: exp, expiresIn: exp - iat } };
}
