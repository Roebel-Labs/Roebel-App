// apps/web/src/lib/miniapp/userToken.ts
// Short-lived ES256 user tokens a mini app receives from the host. Pure module:
// no `server-only`, no `@/` alias, so node:test can load it.
import { SignJWT, createRemoteJWKSet, errors, importJWK, jwtVerify, type JWK } from "jose";

export const MINIAPP_TOKEN_TTL_SEC = 600;
export const MINIAPP_TOKEN_TYP = "miniapp+jwt";
/** Seconds of clock skew between issuer and verifier tolerated on exp/iat/nbf. */
export const MINIAPP_TOKEN_CLOCK_TOLERANCE_SEC = 30;

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
  /** Version 2, profile granted: display name. */
  name?: string;
  /** Version 2, profile granted: profile picture URL. */
  picture?: string;
  /** Version 2: held and granted credentials (always present, possibly empty). Absent for version 1. */
  creds?: MiniAppTokenCredential[];
}

export interface MiniAppTokenCredential {
  type: string;
  org?: string;
  /** Unix seconds; absent = no expiry. */
  exp?: number;
  recognised?: true;
}

function parseCreds(v: unknown): MiniAppTokenCredential[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: MiniAppTokenCredential[] = [];
  for (const c of v) {
    if (!c || typeof c !== "object" || typeof (c as { type?: unknown }).type !== "string") continue;
    const x = c as { type: string; org?: unknown; exp?: unknown; recognised?: unknown };
    out.push({
      type: x.type,
      ...(typeof x.org === "string" ? { org: x.org } : {}),
      ...(typeof x.exp === "number" ? { exp: x.exp } : {}),
      ...(x.recognised === true ? { recognised: true as const } : {}),
    });
  }
  return out;
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

/**
 * Every accepted issuer with and without a trailing slash: the node's MINIAPP_ISSUER_URL and the
 * identity service's ISSUER_URL (apps/roebel-id config.issuer, the `iss` it signs with) must name
 * the same URL; a trailing slash on either side is the one difference tolerated.
 */
function issuerVariants(issuers: readonly string[]): string[] {
  const out = new Set<string>();
  for (const i of issuers) {
    const bare = i.replace(/\/+$/, "");
    out.add(bare);
    out.add(`${bare}/`);
  }
  return [...out];
}

export async function verifyUserToken(
  token: string,
  p: { keys: TokenKeyResolver; issuers: readonly string[]; audience: string; nowSec?: number },
): Promise<VerifyTokenResult> {
  try {
    const { payload } = await jwtVerify(token, p.keys as never, {
      algorithms: ["ES256", "RS256"],
      typ: MINIAPP_TOKEN_TYP,
      issuer: issuerVariants(p.issuers),
      audience: p.audience,
      clockTolerance: MINIAPP_TOKEN_CLOCK_TOLERANCE_SEC,
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
      ...(typeof payload.name === "string" ? { name: payload.name } : {}),
      ...(typeof payload.picture === "string" ? { picture: payload.picture } : {}),
    };
    const creds = parseCreds(payload.creds);
    if (creds) claims.creds = creds;
    return { ok: true, claims };
  } catch (e) {
    if (e instanceof errors.JWTExpired) return { ok: false, code: "expired" };
    if (e instanceof errors.JWTClaimValidationFailed) {
      if (e.claim === "aud") return { ok: false, code: "wrong_audience" };
      if (e.claim === "iss") return { ok: false, code: "wrong_issuer" };
      return { ok: false, code: "malformed" };
    }
    if (e instanceof errors.JWSSignatureVerificationFailed) return { ok: false, code: "bad_signature" };
    if (!(e instanceof errors.JOSEError)) console.error("[miniapp] token verification error:", e);
    return { ok: false, code: "malformed" };
  }
}

/**
 * Signs through the community's identity service (`apps/roebel-id`,
 * `POST /internal/miniapp-token`). The service sets `iss`, `iat` and `jti` itself; this
 * sends the remaining claims and the expiry. Throws on any non-200 answer or after the timeout.
 */
export function keystoneTokenIssuer(p: { url: string; secret: string; fetch?: typeof fetch; timeoutMs?: number }): TokenIssuer {
  const base = p.url.replace(/\/+$/, "");
  const doFetch = p.fetch ?? fetch;
  const timeoutMs = p.timeoutMs ?? 5_000;
  return {
    issuer: base,
    async sign(claims) {
      const { iat: _iat, jti: _jti, exp, ...rest } = claims;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await doFetch(`${base}/internal/miniapp-token`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${p.secret}` },
          body: JSON.stringify({ claims: rest, exp }),
          signal: ctrl.signal,
        });
        if (res.status !== 200) throw new Error(`identity service answered ${res.status}`);
        const json = (await res.json()) as { token?: unknown };
        if (typeof json.token !== "string" || !json.token) throw new Error("identity service sent no token");
        return json.token;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

type FromEnv = { issuer: TokenIssuer; keys: TokenKeyResolver; issuers: string[] };
const DEFAULT_ISSUER = "https://www.roebel.app";
const cache = new Map<string, FromEnv | null>();

type LocalKeys = { issuer: TokenIssuer; kid: string; key: () => Promise<unknown> };

function localKeysFromJwk(raw: string, iss: string): LocalKeys | null {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    if (
      j.kty !== "EC" || j.crv !== "P-256" ||
      typeof j.x !== "string" || typeof j.y !== "string" || typeof j.d !== "string" ||
      typeof j.kid !== "string" || j.kid === ""
    ) {
      throw new Error("not a P-256 private JWK with kid");
    }
    // Explicit fields only: key_ops/use/alg/ext would make jose refuse the verify import.
    const jwk: PrivateJwk = { kty: "EC", crv: "P-256", x: j.x, y: j.y, d: j.d, kid: j.kid };
    const pub: JWK = { kty: "EC", crv: "P-256", x: j.x, y: j.y, kid: j.kid };
    let signer: Promise<TokenIssuer> | undefined;
    let verifyKey: Promise<unknown> | undefined;
    return {
      kid: j.kid,
      issuer: {
        issuer: iss,
        sign: async (claims) => (await (signer ??= localTokenIssuer({ issuer: iss, privateJwk: jwk }).catch((e) => { signer = undefined; throw e; }))).sign(claims),
      },
      key: async () => await (verifyKey ??= importJWK(pub, "ES256").catch((e) => { verifyKey = undefined; throw e; })),
    };
  } catch (e) {
    console.error("[miniapp] MINIAPP_TOKEN_PRIVATE_JWK is malformed:", (e as Error).message);
    return null;
  }
}

export interface TokenKeysDeps {
  fetch?: typeof fetch;
  /** Key resolver for the identity service's JWKS (tests inject a local set). */
  remoteJwks?: (url: URL) => TokenKeyResolver;
}

/**
 * Token signing and verification from env:
 * - issuer: the identity service when MINIAPP_ISSUER_URL and MINIAPP_ISSUER_SECRET are set,
 *   falling back to the local key (MINIAPP_TOKEN_PRIVATE_JWK) when the service fails; else
 *   the local key alone.
 * - keys: the local public key for its own `kid`, otherwise the identity service's JWKS
 *   (`<issuer>/jwks`, oidc-provider's default `jwks_uri`).
 * - issuers: both.
 * null when neither is configured.
 *
 * MINIAPP_ISSUER_URL must equal the identity service's ISSUER_URL (the `iss` it signs with); only
 * a trailing slash may differ (verifyUserToken accepts both forms).
 */
export function tokenKeysFromEnv(
  env: Record<string, string | undefined> = process.env,
  deps?: TokenKeysDeps,
): FromEnv | null {
  const raw = env.MINIAPP_TOKEN_PRIVATE_JWK;
  const ksUrl = env.MINIAPP_ISSUER_URL?.trim();
  const ksSecret = env.MINIAPP_ISSUER_SECRET;
  const hasKeystone = !!ksUrl && !!ksSecret;
  if (!raw && !hasKeystone) return null;
  const iss = env.MINIAPP_TOKEN_ISSUER || DEFAULT_ISSUER;
  const cacheKey = `${iss}\n${raw ?? ""}\n${hasKeystone ? `${ksUrl}\n${ksSecret}` : ""}`;
  if (!deps && cache.has(cacheKey)) return cache.get(cacheKey)!;

  const local = raw ? localKeysFromJwk(raw, iss) : null;
  let result: FromEnv | null = null;

  if (hasKeystone) {
    const keystone = keystoneTokenIssuer({ url: ksUrl, secret: ksSecret, ...(deps?.fetch ? { fetch: deps.fetch } : {}) });
    const jwksUrl = new URL(`${keystone.issuer}/jwks`);
    let remote: TokenKeyResolver | undefined;
    const remoteKeys = () => (remote ??= deps?.remoteJwks ? deps.remoteJwks(jwksUrl) : (createRemoteJWKSet(jwksUrl) as TokenKeyResolver));
    result = {
      issuer: {
        issuer: keystone.issuer,
        async sign(claims) {
          try {
            return await keystone.sign(claims);
          } catch (e) {
            if (!local) throw e;
            console.warn("[miniapp] identity service signing failed, using the local key:", (e as Error).message);
            return local.issuer.sign(claims);
          }
        },
      },
      keys: (async (header: { kid?: string }, token: unknown) => {
        if (local && header?.kid === local.kid) return local.key();
        return (remoteKeys() as unknown as (h: unknown, t: unknown) => Promise<unknown>)(header, token);
      }) as TokenKeyResolver,
      issuers: local ? [keystone.issuer, iss] : [keystone.issuer],
    };
  } else if (local) {
    result = { issuer: local.issuer, keys: (async () => local.key()) as TokenKeyResolver, issuers: [iss] };
  }

  if (!deps) cache.set(cacheKey, result);
  return result;
}
