// apps/web/tests/miniapp-keystone-issuer.test.ts
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, importJWK, type JWK } from "jose";
import { keystoneTokenIssuer, tokenKeysFromEnv, verifyUserToken } from "../src/lib/miniapp/userToken";

const LOCAL_ISS = "https://www.roebel.app";
const KEYSTONE = "https://id.example";
const SECRET = "k".repeat(40);
const APP = "11111111-2222-3333-4444-555555555555";
const NOW = 1_800_000_000;
const claims = { aud: "miniapp:demo", sub: "nz_x", app: APP, iat: NOW, exp: NOW + 600, jti: "j1", v: 1 as const };

let localJwk: Record<string, unknown>;
let rsaPrivate: JWK;
let rsaPublicJwks: { keys: JWK[] };

before(async () => {
  const ec = await generateKeyPair("ES256", { extractable: true });
  localJwk = { ...(await exportJWK(ec.privateKey)), kid: "local-1" };
  const rsa = await generateKeyPair("RS256", { extractable: true });
  rsaPrivate = { ...(await exportJWK(rsa.privateKey)), kid: "rsa-1" };
  rsaPublicJwks = { keys: [{ ...(await exportJWK(rsa.publicKey)), kid: "rsa-1", alg: "RS256" }] };
});

/** What the identity service would answer: the claims signed with the RSA key. */
async function keystoneSign(body: { claims: Record<string, unknown>; exp: number }, iss = KEYSTONE): Promise<string> {
  const { aud, sub, ...rest } = body.claims;
  return new SignJWT(rest)
    .setProtectedHeader({ alg: "RS256", typ: "miniapp+jwt", kid: "rsa-1" })
    .setIssuer(iss)
    .setAudience(aud as string)
    .setSubject(sub as string)
    .setIssuedAt(NOW)
    .setExpirationTime(body.exp)
    .setJti("ks-jti")
    .sign(await importJWK(rsaPrivate, "RS256"));
}

type Call = { url: string; auth: string | null; body: { claims: Record<string, unknown>; exp: number } };

function fakeFetch(calls: Call[], mode: "ok" | "fail" | "throw" = "ok"): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), auth: new Headers(init?.headers).get("authorization"), body });
    if (mode === "throw") throw new Error("network down");
    if (mode === "fail") return new Response(JSON.stringify({ error: "x" }), { status: 503 });
    return new Response(JSON.stringify({ token: await keystoneSign(body), expiresAt: body.exp }), { status: 200 });
  }) as typeof fetch;
}

const env = (over: Record<string, string> = {}) => ({
  MINIAPP_ISSUER_URL: KEYSTONE + "/",
  MINIAPP_ISSUER_SECRET: SECRET,
  MINIAPP_TOKEN_PRIVATE_JWK: JSON.stringify(localJwk),
  ...over,
});

const remoteJwks = () => createLocalJWKSet(rsaPublicJwks);

test("the keystone issuer posts the claims with the secret and returns the token", async () => {
  const calls: Call[] = [];
  const iss = keystoneTokenIssuer({ url: KEYSTONE + "/", secret: SECRET, fetch: fakeFetch(calls) });
  assert.equal(iss.issuer, KEYSTONE);
  const t = await iss.sign({ ...claims, addr: "0xabc", creds: [{ type: "citizen", recognised: true }] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, KEYSTONE + "/internal/miniapp-token");
  assert.equal(calls[0].auth, `Bearer ${SECRET}`);
  assert.equal(calls[0].body.exp, NOW + 600);
  assert.deepEqual(calls[0].body.claims, {
    aud: "miniapp:demo", sub: "nz_x", app: APP, v: 1, addr: "0xabc", creds: [{ type: "citizen", recognised: true }],
  });
  const v = await verifyUserToken(t, { keys: remoteJwks() as never, issuers: [KEYSTONE], audience: "miniapp:demo", nowSec: NOW });
  assert.ok(v.ok && v.claims.sub === "nz_x" && v.claims.creds?.[0].type === "citizen");
});

test("the keystone issuer throws on a non-200 answer", async () => {
  const iss = keystoneTokenIssuer({ url: KEYSTONE, secret: SECRET, fetch: fakeFetch([], "fail") });
  await assert.rejects(iss.sign(claims));
});

test("when the keystone fails the local key signs and the token still verifies", async () => {
  const calls: Call[] = [];
  const k = tokenKeysFromEnv(env(), { fetch: fakeFetch(calls, "throw"), remoteJwks });
  assert.ok(k);
  const orig = console.warn;
  console.warn = () => {};
  let t: string;
  try {
    t = await k.issuer.sign(claims);
  } finally {
    console.warn = orig;
  }
  assert.equal(calls.length, 1);
  const v = await verifyUserToken(t, { keys: k.keys, issuers: k.issuers, audience: "miniapp:demo", nowSec: NOW });
  assert.ok(v.ok && v.claims.iss === LOCAL_ISS);
});

test("the keystone signs when it is reachable", async () => {
  const k = tokenKeysFromEnv(env(), { fetch: fakeFetch([]), remoteJwks });
  assert.ok(k);
  assert.equal(k.issuer.issuer, KEYSTONE);
  const t = await k.issuer.sign(claims);
  const v = await verifyUserToken(t, { keys: k.keys, issuers: k.issuers, audience: "miniapp:demo", nowSec: NOW });
  assert.ok(v.ok && v.claims.iss === KEYSTONE);
});

test("without a local key a keystone failure rejects", async () => {
  const { MINIAPP_TOKEN_PRIVATE_JWK: _drop, ...noLocal } = env();
  const k = tokenKeysFromEnv(noLocal, { fetch: fakeFetch([], "fail"), remoteJwks });
  assert.ok(k);
  assert.deepEqual(k.issuers, [KEYSTONE]);
  await assert.rejects(k.issuer.sign(claims));
});

test("verification accepts both issuers and nothing else", async () => {
  const k = tokenKeysFromEnv(env(), { fetch: fakeFetch([]), remoteJwks });
  assert.ok(k);
  assert.deepEqual([...k.issuers].sort(), [KEYSTONE, LOCAL_ISS].sort());
  const opts = { keys: k.keys, issuers: k.issuers, audience: "miniapp:demo", nowSec: NOW };
  const fromKeystone = await keystoneSign({ claims, exp: NOW + 600 });
  assert.equal((await verifyUserToken(fromKeystone, opts)).ok, true);
  const foreign = await keystoneSign({ claims, exp: NOW + 600 }, "https://evil.example");
  assert.deepEqual(await verifyUserToken(foreign, opts), { ok: false, code: "wrong_issuer" });
  // Signed by an unknown key that claims the local kid: refused.
  const other = await generateKeyPair("ES256");
  const forged = await new SignJWT({ app: APP, v: 1 })
    .setProtectedHeader({ alg: "ES256", typ: "miniapp+jwt", kid: "local-1" })
    .setIssuer(LOCAL_ISS).setAudience("miniapp:demo").setSubject("nz_x").setIssuedAt(NOW).setExpirationTime(NOW + 600).setJti("f")
    .sign(other.privateKey);
  assert.equal((await verifyUserToken(forged, opts)).ok, false);
});
