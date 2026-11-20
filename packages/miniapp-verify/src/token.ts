import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { MiniAppVerifyError } from "./errors";

export const MINIAPP_TOKEN_TYP = "miniapp+jwt";

export interface MiniAppCredential {
  /** `citizen`, `attester`, `guest` or `type:0x<64 hex>`. */
  type: string;
  /** The org's account id (uuid) when the type belongs to an org. */
  org?: string;
  /** Unix seconds; absent = no expiry. */
  validUntil?: number;
  /** Recognised by the community. */
  recognised: boolean;
}

export interface MiniAppUser {
  /** Stable per mini app; a pseudonym unless the person shared their account. */
  id: string;
  /** Only when the person agreed to share their account. */
  address?: string;
  name?: string;
  picture?: string;
  /** Held credentials the person agreed to share. */
  credentials: MiniAppCredential[];
  /** `citizen`, `type:0x…` or `org:<uuid>`. */
  has(pattern: string): boolean;
  /** Unix seconds. */
  expiresAt: number;
}

const TYPE_RE = /^type:(0x[0-9a-fA-F]{64})$/;
const ORG_RE = /^org:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
const BUILTINS = ["citizen", "attester", "guest"];

/** Same rule as the SDK's `credentialMatches`. */
export function credentialMatches(pattern: string, held: { type: string; org?: string }): boolean {
  if (typeof pattern !== "string") return false;
  const org = ORG_RE.exec(pattern);
  if (org) return typeof held.org === "string" && held.org.toLowerCase() === org[1].toLowerCase();
  if (BUILTINS.includes(pattern)) return held.type === pattern;
  const t = TYPE_RE.exec(pattern);
  const h = TYPE_RE.exec(held.type);
  return !!t && !!h && t[1].toLowerCase() === h[1].toLowerCase();
}

type KeySet = ReturnType<typeof createRemoteJWKSet>;
const keySets = new Map<string, KeySet>();
const discovered = new Map<string, Promise<string>>();

async function discoverJwksUri(issuer: string): Promise<string> {
  const base = issuer.replace(/\/+$/, "");
  let p = discovered.get(base);
  if (!p) {
    p = (async () => {
      const res = await fetch(`${base}/.well-known/openid-configuration`);
      if (!res.ok) throw new Error(`discovery answered ${res.status}`);
      const json = (await res.json()) as { jwks_uri?: unknown };
      if (typeof json.jwks_uri !== "string" || !json.jwks_uri) throw new Error("discovery has no jwks_uri");
      return json.jwks_uri;
    })();
    discovered.set(base, p);
    p.catch(() => discovered.delete(base));
  }
  return p;
}

function keySet(uri: string): KeySet {
  let k = keySets.get(uri);
  if (!k) {
    k = createRemoteJWKSet(new URL(uri));
    keySets.set(uri, k);
  }
  return k;
}

function parseCredentials(v: unknown): MiniAppCredential[] {
  if (!Array.isArray(v)) return [];
  const out: MiniAppCredential[] = [];
  for (const c of v) {
    if (!c || typeof c !== "object" || typeof (c as { type?: unknown }).type !== "string") continue;
    const x = c as { type: string; org?: unknown; exp?: unknown; recognised?: unknown };
    out.push({
      type: x.type,
      ...(typeof x.org === "string" ? { org: x.org } : {}),
      ...(typeof x.exp === "number" ? { validUntil: x.exp } : {}),
      recognised: x.recognised === true,
    });
  }
  return out;
}

/**
 * Verifies a mini-app user token (`sdk.auth.getToken()`) on the app's own server. The token
 * must be signed by the community's identity service (`issuer`), carry `typ: miniapp+jwt` and
 * the audience `miniapp:<slug>`. Throws `MiniAppVerifyError` otherwise.
 */
export async function verifyUserToken(
  token: string,
  opts: { issuer: string; slug: string; jwksUri?: string; clockToleranceSec?: number },
): Promise<MiniAppUser> {
  if (typeof token !== "string" || token.split(".").length !== 3) throw new MiniAppVerifyError("malformed");
  let uri: string;
  try {
    uri = opts.jwksUri ?? (await discoverJwksUri(opts.issuer));
  } catch (e) {
    throw new MiniAppVerifyError("wrong_issuer", `issuer discovery failed: ${(e as Error).message}`);
  }
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, keySet(uri), {
      algorithms: ["RS256", "ES256"],
      typ: MINIAPP_TOKEN_TYP,
      issuer: opts.issuer,
      audience: `miniapp:${opts.slug}`,
      clockTolerance: opts.clockToleranceSec ?? 30,
    }));
  } catch (e) {
    if (e instanceof errors.JWTExpired) throw new MiniAppVerifyError("expired");
    if (e instanceof errors.JWTClaimValidationFailed) {
      if (e.claim === "aud") throw new MiniAppVerifyError("wrong_audience");
      if (e.claim === "iss") throw new MiniAppVerifyError("wrong_issuer");
      throw new MiniAppVerifyError("malformed", e.message);
    }
    if (e instanceof errors.JWSSignatureVerificationFailed || e instanceof errors.JWKSNoMatchingKey) {
      throw new MiniAppVerifyError("bad_signature");
    }
    throw new MiniAppVerifyError("malformed", (e as Error).message);
  }
  if (typeof payload.sub !== "string" || !payload.sub || typeof payload.exp !== "number") {
    throw new MiniAppVerifyError("malformed");
  }
  const credentials = parseCredentials(payload.creds);
  return {
    id: payload.sub,
    ...(typeof payload.addr === "string" ? { address: payload.addr } : {}),
    ...(typeof payload.name === "string" ? { name: payload.name } : {}),
    ...(typeof payload.picture === "string" ? { picture: payload.picture } : {}),
    credentials,
    has: (pattern: string) => credentials.some((c) => credentialMatches(pattern, c)),
    expiresAt: payload.exp,
  };
}
