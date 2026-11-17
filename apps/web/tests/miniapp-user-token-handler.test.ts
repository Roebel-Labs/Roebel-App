// apps/web/tests/miniapp-user-token-handler.test.ts
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { exportJWK, generateKeyPair } from "jose";
import { localTokenIssuer, tokenKeysFromEnv, verifyUserToken, type TokenIssuer, type TokenKeyResolver } from "../src/lib/miniapp/userToken";
import { handleUserTokenRequest, type UserTokenDeps } from "../src/lib/miniapp/userTokenHandler";

const ISS = "https://www.roebel.app";
const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const APP_ID = "11111111-2222-3333-4444-555555555555";
const NOW = 1_800_000_000;
const headers = { get: () => null };

let issuer: TokenIssuer;
let keys: TokenKeyResolver;

before(async () => {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  const privateJwk = { ...(await exportJWK(privateKey)), kid: "k1" };
  issuer = await localTokenIssuer({ issuer: ISS, privateJwk });
  const parsed = tokenKeysFromEnv({ MINIAPP_TOKEN_PRIVATE_JWK: JSON.stringify(privateJwk) });
  assert.ok(parsed);
  keys = parsed.keys;
});

const body = (payload: Record<string, unknown>) => ({ scope: "roebel-miniapp-v1", action: "user_token", wallet: WALLET, timestampSec: NOW, payload });

function deps(over: Partial<UserTokenDeps> = {}): UserTokenDeps {
  return {
    verify: async (_b, _h) => ({ ok: true, wallet: WALLET, action: "user_token", payload: (_b as { payload: Record<string, unknown> }).payload }),
    getApp: async (ref) => (ref === "demo" || ref === APP_ID ? { id: APP_ID, slug: "demo", status: "approved" } : null),
    issuer,
    take: async () => true,
    nowSec: () => NOW,
    jti: () => "jti-1",
    ...over,
  };
}

test("a verified request for a live app gets a token for that app and wallet", async () => {
  const r = await handleUserTokenRequest(body({ app: "demo" }), headers, deps());
  assert.equal(r.status, 200);
  const v = await verifyUserToken(r.json.token as string, { keys, issuers: [ISS], audience: "miniapp:demo", nowSec: NOW });
  assert.ok(v.ok && v.claims.addr === WALLET && v.claims.sub === WALLET && v.claims.app === APP_ID && v.claims.exp === NOW + 600);
  assert.equal(r.json.expiresAt, NOW + 600);
  assert.equal(r.json.expiresIn, 600);
});

test("the wallet comes from the verified request, not from the payload", async () => {
  const r = await handleUserTokenRequest(body({ app: "demo", wallet: OTHER }), headers, deps());
  const v = await verifyUserToken(r.json.token as string, { keys, issuers: [ISS], audience: "miniapp:demo", nowSec: NOW });
  assert.ok(v.ok && v.claims.addr === WALLET);
});

test("a failed signature check is passed through", async () => {
  const r = await handleUserTokenRequest(body({ app: "demo" }), headers, deps({
    verify: async () => ({ ok: false, status: 401, code: "BAD_SIGNATURE", message: "signer does not match wallet" }),
  }));
  assert.equal(r.status, 401);
  assert.equal(r.json.code, "BAD_SIGNATURE");
});

test("an unknown app is 404, a suspended app is 403", async () => {
  const a = await handleUserTokenRequest(body({ app: "nope" }), headers, deps());
  assert.equal(a.status, 404);
  assert.equal(a.json.code, "not_found");
  const b = await handleUserTokenRequest(body({ app: "demo" }), headers, deps({
    getApp: async () => ({ id: APP_ID, slug: "demo", status: "suspended" }),
  }));
  assert.equal(b.status, 403);
  assert.equal(b.json.code, "forbidden");
});

test("a missing app reference is 404", async () => {
  const r = await handleUserTokenRequest(body({}), headers, deps());
  assert.equal(r.status, 404);
});

test("no signing key configured is 503 token_unavailable", async () => {
  const r = await handleUserTokenRequest(body({ app: "demo" }), headers, deps({ issuer: null }));
  assert.equal(r.status, 503);
  assert.equal(r.json.code, "token_unavailable");
});

test("the per-wallet limit answers 429", async () => {
  const seen: string[] = [];
  const r = await handleUserTokenRequest(body({ app: "demo" }), headers, deps({ take: async (w) => { seen.push(w); return false; } }));
  assert.equal(r.status, 429);
  assert.equal(r.json.code, "rate_limited");
  assert.deepEqual(seen, [WALLET]);
});
