import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { SignJWT, exportJWK, generateKeyPair, type KeyLike } from "jose";
import { verifyUserToken, MiniAppVerifyError } from "../src/index.ts";

const T = "type:0x" + "ab".repeat(32);
const ORG = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-2222-3333-4444-555555555555";

let server: Server;
let ISS = "";
let jwksUri = "";
let key: KeyLike;

before(async () => {
  const kp = await generateKeyPair("ES256");
  key = kp.privateKey;
  const pub = { ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "ES256", use: "sig" };
  server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/jwks") return res.end(JSON.stringify({ keys: [pub] }));
    if (req.url === "/.well-known/openid-configuration") return res.end(JSON.stringify({ issuer: ISS, jwks_uri: jwksUri }));
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  ISS = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  jwksUri = `${ISS}/jwks`;
});

after(() => new Promise<void>((r) => server.close(() => r())));

function tok(
  claims: Record<string, unknown>,
  o: { typ?: string; aud?: string; iss?: string; exp?: number; iat?: number } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ app: "demo", v: 1, ...claims })
    .setProtectedHeader({ alg: "ES256", typ: o.typ ?? "miniapp+jwt", kid: "k1" })
    .setIssuer(o.iss ?? ISS)
    .setAudience(o.aud ?? "miniapp:demo")
    .setIssuedAt(o.iat ?? now)
    .setExpirationTime(o.exp ?? now + 600)
    .setJti("j1")
    .sign(key);
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof MiniAppVerifyError, String(e));
    return e.code;
  }
  return "no error";
}

test("a valid token yields the user", async () => {
  const u = await verifyUserToken(await tok({ sub: "nz_x", creds: [{ type: T, org: ORG }] }), { issuer: ISS, slug: "demo", jwksUri });
  assert.equal(u.id, "nz_x");
  assert.equal(u.address, undefined);
  assert.equal(u.has("org:" + ORG), true);
  assert.equal(u.has("org:" + OTHER), false);
  assert.equal(u.has(T), true);
  assert.equal(u.has("citizen"), false);
  assert.deepEqual(u.credentials, [{ type: T, org: ORG, recognised: false }]);
  assert.equal(typeof u.expiresAt, "number");
});

test("profile, address and credential details are passed through", async () => {
  const u = await verifyUserToken(
    await tok({ sub: "nz_y", addr: "0xabc", name: "Ada", picture: "https://x/p.png", creds: [{ type: "citizen", recognised: true, exp: 2000000000 }] }),
    { issuer: ISS, slug: "demo", jwksUri },
  );
  assert.equal(u.address, "0xabc");
  assert.equal(u.name, "Ada");
  assert.equal(u.picture, "https://x/p.png");
  assert.deepEqual(u.credentials, [{ type: "citizen", validUntil: 2000000000, recognised: true }]);
  assert.equal(u.has("citizen"), true);
});

test("the jwks_uri is discovered from the issuer", async () => {
  const u = await verifyUserToken(await tok({ sub: "nz_z" }), { issuer: ISS, slug: "demo" });
  assert.equal(u.id, "nz_z");
  assert.deepEqual(u.credentials, []);
});

test("a token for another slug is refused", async () => {
  assert.equal(await code(verifyUserToken(await tok({ sub: "nz_x" }, { aud: "miniapp:other" }), { issuer: ISS, slug: "demo", jwksUri })), "wrong_audience");
});

test("a JWT with typ JWT signed by the same key is refused", async () => {
  const t = await tok({ sub: "nz_x" }, { typ: "JWT" });
  assert.equal(await code(verifyUserToken(t, { issuer: ISS, slug: "demo", jwksUri })), "malformed");
});

test("an expired token is refused", async () => {
  const now = Math.floor(Date.now() / 1000);
  const t = await tok({ sub: "nz_x" }, { iat: now - 4000, exp: now - 3000 });
  assert.equal(await code(verifyUserToken(t, { issuer: ISS, slug: "demo", jwksUri })), "expired");
});

test("an unknown issuer is refused", async () => {
  const t = await tok({ sub: "nz_x" }, { iss: "https://evil.example" });
  assert.equal(await code(verifyUserToken(t, { issuer: ISS, slug: "demo", jwksUri })), "wrong_issuer");
});

test("a token signed by another key is refused", async () => {
  const other = await generateKeyPair("ES256");
  const now = Math.floor(Date.now() / 1000);
  const t = await new SignJWT({ app: "demo", v: 1, sub: "nz_x" })
    .setProtectedHeader({ alg: "ES256", typ: "miniapp+jwt", kid: "k1" })
    .setIssuer(ISS).setAudience("miniapp:demo").setIssuedAt(now).setExpirationTime(now + 60)
    .sign(other.privateKey);
  assert.equal(await code(verifyUserToken(t, { issuer: ISS, slug: "demo", jwksUri })), "bad_signature");
});

test("garbage is malformed", async () => {
  assert.equal(await code(verifyUserToken("not.a.jwt", { issuer: ISS, slug: "demo", jwksUri })), "malformed");
});
