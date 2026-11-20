import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Server-side secrets for the payment rails:
// - provider refresh tokens are stored AES-256-GCM encrypted with PAYMENT_TOKEN_KEY (base64, 32 bytes);
// - the OAuth `state` is an HMAC-signed blob binding org account + wallet + expiry (key derived from the
//   same secret, so no second env var is needed).

function tokenKey(): Buffer {
  const raw = process.env.PAYMENT_TOKEN_KEY ?? "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("PAYMENT_TOKEN_KEY must be base64 of exactly 32 bytes.");
  return key;
}

export function isPaymentTokenKeyConfigured(): boolean {
  try {
    tokenKey();
    return true;
  } catch {
    return false;
  }
}

/** "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

function stateKey(): Buffer {
  return createHmac("sha256", tokenKey()).update("ortis-payments-oauth-state-v1").digest();
}

export type OAuthState = { accountId: string; wallet: string; exp: number };

export function signState(accountId: string, wallet: string, ttlSeconds: number): string {
  const body = Buffer.from(
    JSON.stringify({ a: accountId, w: wallet.toLowerCase(), e: Math.floor(Date.now() / 1000) + ttlSeconds, n: randomBytes(8).toString("hex") }),
  ).toString("base64url");
  const mac = createHmac("sha256", stateKey()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyState(state: string): OAuthState | null {
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", stateKey()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof p.a !== "string" || typeof p.w !== "string" || typeof p.e !== "number") return null;
    if (p.e < Math.floor(Date.now() / 1000)) return null;
    return { accountId: p.a, wallet: p.w, exp: p.e };
  } catch {
    return null;
  }
}
