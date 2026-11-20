// apps/web/tests/miniapp-user-token.test.ts
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import {
  audienceFor,
  localTokenIssuer,
  tokenKeysFromEnv,
  verifyUserToken,
  type TokenIssuer,
  type TokenKeyResolver,
} from "../src/lib/miniapp/userToken";

const ISS = "https://www.roebel.app";
const W = "0x1111111111111111111111111111111111111111";
const APP = "11111111-2222-3333-4444-555555555555";
const claims = { aud: "miniapp:demo", sub: W, addr: W, app: APP, iat: 1000, exp: 1600, jti: "j1", v: 1 as const };

let issuer: TokenIssuer;
let keys: TokenKeyResolver;
let privateJwk: Record<string, unknown>;
let otherPrivate: CryptoKey;

before(async () => {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  privateJwk = { ...(await exportJWK(privateKey)), kid: "k1" };
  issuer = await localTokenIssuer({ issuer: ISS, privateJwk });
  const parsed = tokenKeysFromEnv({ MINIAPP_TOKEN_PRIVATE_JWK: JSON.stringify(privateJwk) });
  assert.ok(parsed);
  keys = parsed.keys;
  otherPrivate = (await generateKeyPair("ES256")).privateKey;
});

const verify = (t: string, extra: Partial<{ audience: string; issuers: string[]; nowSec: number }> = {}) =>
  verifyUserToken(t, { keys, issuers: [ISS], audience: "miniapp:demo", nowSec: 1001, ...extra });

test("audienceFor prefixes the slug", () => {
  assert.equal(audienceFor("demo"), "miniapp:demo");
});

test("a signed token verifies and returns its claims", async () => {
  const t = await issuer.sign(claims);
  const r = await verify(t);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.claims.addr, W);
  assert.equal(r.ok && r.claims.app, APP);
  assert.equal(r.ok && r.claims.iss, ISS);
});

test("another app's audience is refused", async () => {
  const r = await verify(await issuer.sign(claims), { audience: "miniapp:other" });
  assert.deepEqual(r, { ok: false, code: "wrong_audience" });
});

test("an expired token is refused", async () => {
  const r = await verify(await issuer.sign(claims), { nowSec: 1640 });
  assert.deepEqual(r, { ok: false, code: "expired" });
});

test("a token 20 s past exp still verifies (30 s clock tolerance), 40 s past does not", async () => {
  const t = await issuer.sign(claims);
  assert.equal((await verify(t, { nowSec: 1620 })).ok, true);
  assert.deepEqual(await verify(t, { nowSec: 1640 }), { ok: false, code: "expired" });
});

test("a token signed by another key is refused", async () => {
  const t = await new SignJWT({ app: APP, v: 1, addr: W })
    .setProtectedHeader({ alg: "ES256", typ: "miniapp+jwt", kid: "k1" })
    .setIssuer(ISS).setAudience("miniapp:demo").setSubject(W).setIssuedAt(1000).setExpirationTime(1600).setJti("j")
    .sign(otherPrivate);
  assert.deepEqual(await verify(t), { ok: false, code: "bad_signature" });
});

test("a token from an unknown issuer is refused", async () => {
  const r = await verify(await issuer.sign(claims), { issuers: ["https://evil.example"] });
  assert.deepEqual(r, { ok: false, code: "wrong_issuer" });
});

test("an issuer differing only by a trailing slash still verifies (MINIAPP_ISSUER_URL vs roebel-id ISSUER_URL)", async () => {
  const slashed = await localTokenIssuer({ issuer: `${ISS}/`, privateJwk });
  assert.equal((await verify(await slashed.sign(claims))).ok, true);
  assert.equal((await verify(await issuer.sign(claims), { issuers: [`${ISS}//`] })).ok, true);
  assert.deepEqual(await verify(await issuer.sign(claims), { issuers: [`${ISS}/x`] }), { ok: false, code: "wrong_issuer" });
});

test("alg none and HS256 are refused", async () => {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = b64({ iss: ISS, aud: "miniapp:demo", sub: W, app: APP, v: 1, iat: 1000, exp: 1600 });
  const none = `${b64({ alg: "none", typ: "miniapp+jwt" })}.${body}.`;
  const hs = await new SignJWT({ app: APP, v: 1 })
    .setProtectedHeader({ alg: "HS256", typ: "miniapp+jwt" })
    .setIssuer(ISS).setAudience("miniapp:demo").setSubject(W).setIssuedAt(1000).setExpirationTime(1600)
    .sign(new TextEncoder().encode("secret-secret-secret-secret-secret"));
  for (const t of [none, hs]) assert.equal((await verify(t)).ok, false);
});

test("a JWT without typ miniapp+jwt is refused", async () => {
  const t = await new SignJWT({ app: APP, v: 1 })
    .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: "k1" })
    .setIssuer(ISS).setAudience("miniapp:demo").setSubject(W).setIssuedAt(1000).setExpirationTime(1600)
    .sign(await (await import("jose")).importJWK(privateJwk as never, "ES256"));
  assert.deepEqual(await verify(t), { ok: false, code: "malformed" });
});

test("a token with the wrong version is refused", async () => {
  const t = await issuer.sign({ ...claims, v: 2 as never });
  assert.deepEqual(await verify(t), { ok: false, code: "malformed" });
});

test("garbage is malformed", async () => {
  for (const t of ["abc", "", "a.b"]) assert.deepEqual(await verify(t), { ok: false, code: "malformed" });
});

test("tokenKeysFromEnv is null without the key or with a bad one", () => {
  const orig = console.error;
  console.error = () => {};
  try {
    assert.equal(tokenKeysFromEnv({}), null);
    assert.equal(tokenKeysFromEnv({ MINIAPP_TOKEN_PRIVATE_JWK: "{nope" }), null);
  } finally {
    console.error = orig;
  }
});

test("tokenKeysFromEnv is null for a JWK without kid", () => {
  const { kid: _k, ...noKid } = privateJwk;
  const orig = console.error;
  console.error = () => {};
  try {
    assert.equal(tokenKeysFromEnv({ MINIAPP_TOKEN_PRIVATE_JWK: JSON.stringify(noKid) }), null);
  } finally {
    console.error = orig;
  }
});

test("a JWK carrying key_ops, use and alg still signs and verifies", async () => {
  const jwk = { ...privateJwk, key_ops: ["sign"], use: "sig", alg: "ES256", ext: true };
  const r = tokenKeysFromEnv({ MINIAPP_TOKEN_PRIVATE_JWK: JSON.stringify(jwk) });
  assert.ok(r);
  const t = await r.issuer.sign(claims);
  const v = await verifyUserToken(t, { keys: r.keys, issuers: r.issuers, audience: "miniapp:demo", nowSec: 1001 });
  assert.equal(v.ok, true);
});

test("tokenKeysFromEnv defaults the issuer", () => {
  const r = tokenKeysFromEnv({ MINIAPP_TOKEN_PRIVATE_JWK: JSON.stringify(privateJwk) });
  assert.deepEqual(r?.issuers, [ISS]);
});
