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
    grants: null,
    credentials: { held: async () => [], describe: async () => null },
    profile: async () => null,
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

// ---- Version 2: pseudonym, granted profile and credentials (plan miniapp-2, Task 7) ----
import { decodeJwt } from "jose";
import { deriveSubject } from "../src/lib/miniapp/subject";
import { EMPTY_GRANT, type GrantRow, type GrantStore } from "../src/lib/miniapp/grants";
import type { CredentialAnswer, CredentialSource } from "../src/lib/miniapp/credentialSource";

const SECRET = "s".repeat(40);
const V2_ID = "77777777-2222-3333-4444-555555555555";
const SUBJECT = deriveSubject(SECRET, V2_ID, WALLET);
const v2App = {
  id: V2_ID,
  slug: "v2",
  status: "approved",
  manifest_version: "2" as const,
  identity: {
    profile: true,
    address: true,
    credentials: [
      { type: "citizen", reason: "r" },
      { type: "attester", reason: "r" },
    ],
  },
};

function grantStore(grant: GrantRow | null): GrantStore {
  return {
    get: async () => grant,
    put: async () => {},
    subject: async (a, w) => deriveSubject(SECRET, a, w),
    walletOf: async (s) => (s === SUBJECT ? WALLET : null),
  };
}

function source(held: Partial<CredentialAnswer>[]): CredentialSource {
  return {
    held: async (_w, refs) =>
      held
        .filter((h) => refs.includes(h.type!))
        .map((h) => ({ kind: "builtin", name: h.type!, validUntil: null, recognised: true, private: false, ...h }) as CredentialAnswer),
    describe: async () => null,
  };
}

async function handle(
  payload: Record<string, unknown>,
  o: { grant?: GrantRow | null; held?: Partial<CredentialAnswer>[]; profile?: { name?: string; picture?: string } | null } = {},
) {
  return handleUserTokenRequest(body(payload), headers, deps({
    getApp: async (ref) => (ref === "v2" || ref === V2_ID ? v2App : ref === "demo" ? { id: APP_ID, slug: "demo", status: "approved" } : null),
    grants: grantStore(o.grant === undefined ? EMPTY_GRANT : o.grant),
    credentials: source(o.held ?? [{ type: "citizen" }]),
    profile: async () => (o.profile === undefined ? { name: "Erika", picture: "https://x/p.png" } : o.profile),
  }));
}

async function claimsOf(r: { status: number; json: Record<string, unknown> }) {
  assert.equal(r.status, 200);
  const v = await verifyUserToken(r.json.token as string, { keys, issuers: [ISS], audience: "miniapp:v2", nowSec: NOW });
  assert.ok(v.ok);
  return { ...v.claims, raw: decodeJwt(r.json.token as string), expiresAt: r.json.expiresAt };
}

const full = (over: Partial<GrantRow>): GrantRow => ({ profile: false, address: false, credentials: [], asked: [], ...over });

test("version 2, nothing granted: pseudonym only", async () => {
  const c = await claimsOf(await handle({ app: "v2" }, { grant: EMPTY_GRANT }));
  assert.equal(c.sub, SUBJECT);
  assert.equal(c.addr, undefined);
  assert.equal(c.name, undefined);
  assert.deepEqual(c.creds, []);
  assert.ok(!JSON.stringify(c.raw).toLowerCase().includes(WALLET.slice(2)));
});

test("version 2, no stored grant at all: pseudonym only", async () => {
  const c = await claimsOf(await handle({ app: "v2" }, { grant: null }));
  assert.equal(c.sub, SUBJECT);
  assert.equal(c.addr, undefined);
  assert.deepEqual(c.creds, []);
});

test("version 2, address and citizen granted", async () => {
  const c = await claimsOf(await handle({ app: "v2" }, { grant: full({ address: true, credentials: ["citizen"] }) }));
  assert.equal(c.sub, SUBJECT);
  assert.equal(c.addr, WALLET);
  assert.equal(c.name, undefined);
  assert.deepEqual(c.creds, [{ type: "citizen", recognised: true }]);
});

test("version 2, profile granted: name and picture", async () => {
  const c = await claimsOf(await handle({ app: "v2" }, { grant: full({ profile: true }) }));
  assert.equal(c.name, "Erika");
  assert.equal(c.picture, "https://x/p.png");
  assert.equal(c.addr, undefined);
});

test("a credential that is granted but not held is absent", async () => {
  const c = await claimsOf(await handle({ app: "v2" }, { grant: full({ credentials: ["citizen", "attester"] }), held: [{ type: "citizen" }] }));
  assert.deepEqual(c.creds, [{ type: "citizen", recognised: true }]);
});

test("a withdrawn credential is absent from the next token", async () => {
  const before = await claimsOf(await handle({ app: "v2" }, { grant: full({ credentials: ["citizen"] }) }));
  assert.equal(before.creds?.length, 1);
  const after = await claimsOf(await handle({ app: "v2" }, { grant: full({ credentials: [] }) }));
  assert.deepEqual(after.creds, []);
});

test("the token expires with the earliest credential", async () => {
  const c = await claimsOf(await handle({ app: "v2" }, {
    grant: full({ credentials: ["citizen", "attester"] }),
    held: [{ type: "citizen", validUntil: NOW + 300 }, { type: "attester", validUntil: NOW + 120 }],
  }));
  assert.equal(c.exp, NOW + 120);
  assert.equal(c.expiresAt, NOW + 120);
  assert.deepEqual(c.creds, [
    { type: "citizen", exp: NOW + 300, recognised: true },
    { type: "attester", exp: NOW + 120, recognised: true },
  ]);
});

test("version 1 claims are unchanged", async () => {
  const r = await handle({ app: "demo" });
  const v = await verifyUserToken(r.json.token as string, { keys, issuers: [ISS], audience: "miniapp:demo", nowSec: NOW });
  assert.ok(v.ok && v.claims.sub === WALLET && v.claims.addr === WALLET);
  const raw = decodeJwt(r.json.token as string);
  assert.equal("creds" in raw, false);
  assert.equal("name" in raw, false);
});

test("a private credential is not marked in the token", async () => {
  const c = await claimsOf(await handle({ app: "v2" }, {
    grant: full({ credentials: ["citizen"] }),
    held: [{ type: "citizen", private: true, org: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" }],
  }));
  assert.ok(!JSON.stringify(c.raw).includes("private"));
  assert.deepEqual(c.creds, [{ type: "citizen", org: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", recognised: true }]);
});

test("version 2 without a subject secret is 503 token_unavailable", async () => {
  const r = await handleUserTokenRequest(body({ app: "v2" }), headers, deps({
    getApp: async () => v2App,
    grants: null,
  }));
  assert.equal(r.status, 503);
  assert.equal(r.json.code, "token_unavailable");
});
