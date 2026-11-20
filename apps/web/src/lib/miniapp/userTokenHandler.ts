// apps/web/src/lib/miniapp/userTokenHandler.ts
// Pure request handler for POST /api/mini-apps/token. Dependencies are injected so
// node:test can load it (no `server-only`, no `@/` alias).
import { credentialMatches } from "@netizen-labs/miniapp-sdk/host";
import type { MiniAppIdentityRequest } from "@netizen-labs/miniapp-sdk";
import type { VerifyFail, VerifyOk } from "../signed-request/verify";
import type { CredentialAnswer, CredentialSource } from "./credentialSource";
import { EMPTY_GRANT, clampGrant, type GrantStore } from "./grants";
import {
  MINIAPP_TOKEN_TTL_SEC,
  audienceFor,
  type MiniAppTokenClaims,
  type MiniAppTokenCredential,
  type TokenIssuer,
} from "./userToken";

type HeaderBag = { get(name: string): string | null };

export interface UserTokenDeps {
  verify: (body: unknown, headers: HeaderBag) => Promise<VerifyOk<"user_token"> | VerifyFail>;
  getApp(ref: string): Promise<{
    id: string;
    slug: string;
    status: string;
    /** Absent until the identity migration is applied (= "1"). */
    manifest_version?: "1" | "2";
    identity?: MiniAppIdentityRequest | null;
  } | null>;
  issuer: TokenIssuer | null;
  /** Version-2 grants and pseudonyms; null when MINIAPP_SUBJECT_SECRET is missing. */
  grants: GrantStore | null;
  credentials: CredentialSource;
  /** The `users` row's display name (else username) and picture. */
  profile(wallet: string): Promise<{ name?: string; picture?: string } | null>;
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
  const base = { aud: audienceFor(app.slug), app: app.id, iat, jti: deps.jti(), v: 1 as const };

  let claims: Omit<MiniAppTokenClaims, "iss">;
  if (app.manifest_version === "2") {
    const store = deps.grants;
    if (!store) return { status: 503, json: { ok: false, code: "token_unavailable" } };
    const identity = app.identity ?? undefined;
    const stored = await store.get(app.id, v.wallet);
    // Re-clamp: the manifest may have dropped an item since the grant was stored.
    const grant = stored ? clampGrant(identity, stored) : EMPTY_GRANT;
    const sub = await store.subject(app.id, v.wallet);

    let answers: CredentialAnswer[] = [];
    if (grant.credentials.length > 0) {
      try {
        answers = await deps.credentials.held(v.wallet, grant.credentials);
      } catch {
        return { status: 503, json: { ok: false, code: "credentials_unavailable" } };
      }
    }
    // Only what is held, granted and still valid; the `private` flag never leaves the node.
    const creds: MiniAppTokenCredential[] = answers
      .filter((a) => grant.credentials.some((g) => credentialMatches(g, a)))
      .filter((a) => a.validUntil === null || a.validUntil > iat)
      .map((a) => ({
        type: a.type,
        ...(a.org ? { org: a.org } : {}),
        ...(a.validUntil !== null ? { exp: a.validUntil } : {}),
        ...(a.recognised ? { recognised: true as const } : {}),
      }));

    const profile = grant.profile ? await deps.profile(v.wallet) : null;
    const exp = Math.min(iat + MINIAPP_TOKEN_TTL_SEC, ...creds.map((c) => c.exp ?? Infinity));
    claims = {
      ...base,
      sub,
      exp,
      ...(grant.address ? { addr: v.wallet.toLowerCase() } : {}),
      ...(profile?.name ? { name: profile.name } : {}),
      ...(profile?.picture ? { picture: profile.picture } : {}),
      creds,
    };
  } else {
    // Version 1: plan 1's claims, unchanged.
    claims = { ...base, sub: v.wallet, addr: v.wallet, exp: iat + MINIAPP_TOKEN_TTL_SEC };
  }

  const token = await deps.issuer.sign(claims);
  // `expiresIn` lets clients compute the expiry on their own clock (a phone's clock may be off).
  return { status: 200, json: { token, expiresAt: claims.exp, expiresIn: claims.exp - iat } };
}
