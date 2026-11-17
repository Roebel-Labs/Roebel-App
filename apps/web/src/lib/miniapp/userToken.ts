// apps/web/src/lib/miniapp/userToken.ts
// Short-lived ES256 user tokens a mini app receives from the host. Pure module:
// no `server-only`, no `@/` alias, so node:test can load it.
import { SignJWT, errors, importJWK, jwtVerify, type JWK } from "jose";

export const MINIAPP_TOKEN_TTL_SEC = 600;
export const MINIAPP_TOKEN_TYP = "miniapp+jwt";

export interface MiniAppTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  app: string;
  iat: number;
  exp: number;
  jti: string;
  v: 1;
  addr?: string;
}

export function audienceFor(slug: string): string {
  return `miniapp:${slug}`;
}

export interface TokenIssuer {
  issuer: string;
  sign(claims: Omit<MiniAppTokenClaims, "iss">): Promise<string>;
}

export type TokenKeyResolver = Parameters<typeof jwtVerify>[1];

export type VerifyTokenResult =
  | { ok: true; claims: MiniAppTokenClaims }
  | { ok: false; code: "malformed" | "bad_signature" | "expired" | "wrong_audience" | "wrong_issuer" };

type PrivateJwk = JsonWebKey & { kid?: string };

export async function localTokenIssuer(p: { issuer: string; privateJwk: PrivateJwk }): Promise<TokenIssuer> {
  const key = await importJWK(p.privateJwk as JWK, "ES256");
  const kid = p.privateJwk.kid;
  return {
    issuer: p.issuer,
    async sign(claims) {
      const { aud, sub, iat, exp, jti, ...rest } = claims;
      return new SignJWT({ ...rest })
        .setProtectedHeader({ alg: "ES256", typ: MINIAPP_TOKEN_TYP, ...(kid ? { kid } : {}) })
        .setIssuer(p.issuer)
        .setAudience(aud)
        .setSubject(sub)
        .setIssuedAt(iat)
        .setExpirationTime(exp)
        .setJti(jti)
        .sign(key);
    },
  };
}

export async function verifyUserToken(
  token: string,
  p: { keys: TokenKeyResolver; issuers: readonly string[]; audience: string; nowSec?: number },
): Promise<VerifyTokenResult> {
  try {
    const { payload } = await jwtVerify(token, p.keys as never, {
      algorithms: ["ES256", "RS256"],
      typ: MINIAPP_TOKEN_TYP,
      issuer: [...p.issuers],
      audience: p.audience,
      ...(p.nowSec !== undefined ? { currentDate: new Date(p.nowSec * 1000) } : {}),
    });
    if (
      payload.v !== 1 ||
      typeof payload.app !== "string" ||
      typeof payload.sub !== "string" ||
      typeof payload.iss !== "string" ||
      typeof payload.aud !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      typeof payload.jti !== "string"
    ) {
      return { ok: false, code: "malformed" };
    }
    const claims: MiniAppTokenClaims = {
      iss: payload.iss,
      aud: payload.aud,
      sub: payload.sub,
      app: payload.app,
      iat: payload.iat,
      exp: payload.exp,
      jti: payload.jti,
      v: 1,
      ...(typeof payload.addr === "string" ? { addr: payload.addr } : {}),
    };
    return { ok: true, claims };
  } catch (e) {
    if (e instanceof errors.JWTExpired) return { ok: false, code: "expired" };
    if (e instanceof errors.JWTClaimValidationFailed) {
      if (e.claim === "aud") return { ok: false, code: "wrong_audience" };
      if (e.claim === "iss") return { ok: false, code: "wrong_issuer" };
      return { ok: false, code: "malformed" };
    }
    if (e instanceof errors.JWSSignatureVerificationFailed) return { ok: false, code: "bad_signature" };
    return { ok: false, code: "malformed" };
  }
}

type FromEnv = { issuer: TokenIssuer; keys: TokenKeyResolver; issuers: string[] };
const DEFAULT_ISSUER = "https://www.roebel.app";
const cache = new Map<string, FromEnv | null>();

export function tokenKeysFromEnv(env: Record<string, string | undefined> = process.env): FromEnv | null {
  const raw = env.MINIAPP_TOKEN_PRIVATE_JWK;
  if (!raw) return null;
  const iss = env.MINIAPP_TOKEN_ISSUER || DEFAULT_ISSUER;
  const cacheKey = `${iss}\n${raw}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  let result: FromEnv | null = null;
  try {
    const jwk = JSON.parse(raw) as PrivateJwk & { d?: string; crv?: string };
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.d !== "string") {
      throw new Error("not a P-256 private JWK");
    }
    const { d: _d, ...pub } = jwk;
    let signer: Promise<TokenIssuer> | undefined;
    let verifyKey: ReturnType<typeof importJWK> | undefined;
    result = {
      issuer: {
        issuer: iss,
        sign: async (claims) => (await (signer ??= localTokenIssuer({ issuer: iss, privateJwk: jwk }))).sign(claims),
      },
      keys: (async () => await (verifyKey ??= importJWK(pub as JWK, "ES256"))) as TokenKeyResolver,
      issuers: [iss],
    };
  } catch (e) {
    console.error("[miniapp] MINIAPP_TOKEN_PRIVATE_JWK is malformed:", (e as Error).message);
  }
  cache.set(cacheKey, result);
  return result;
}
