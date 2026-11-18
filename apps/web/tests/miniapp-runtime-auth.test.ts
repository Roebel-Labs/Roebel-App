// apps/web/tests/miniapp-runtime-auth.test.ts
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { exportJWK, generateKeyPair } from "jose";
import { localTokenIssuer, tokenKeysFromEnv, verifyUserToken, type TokenIssuer, type TokenKeyResolver } from "../src/lib/miniapp/userToken";
import { forRuntimeUser, hostLabel, resolveRuntimeUser, type RuntimeAuthDeps } from "../src/lib/miniapp/runtimeAuth";
import { MiniAppError } from "../src/lib/miniapp/types";

const ISS = "https://www.roebel.app";
const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const APP_ID = "11111111-2222-3333-4444-555555555555";
const OTHER_APP_ID = "99999999-2222-3333-4444-555555555555";
const NOW = 1_800_000_000;
const app = { id: APP_ID, slug: "demo" };

let issuer: TokenIssuer;
let keys: TokenKeyResolver;
let tok: string;

async function mint(over: { aud?: string; app?: string; exp?: number; addr?: string | null } = {}): Promise<string> {
  return issuer.sign({
    aud: over.aud ?? "miniapp:demo",
    sub: WALLET,
    app: over.app ?? APP_ID,
    iat: NOW - 10,
    exp: over.exp ?? NOW + 600,
    jti: "jti-1",
    v: 1,
    ...(over.addr === null ? {} : { addr: over.addr ?? WALLET }),
  });
}

before(async () => {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  const privateJwk = { ...(await exportJWK(privateKey)), kid: "k1" };
  issuer = await localTokenIssuer({ issuer: ISS, privateJwk });
  const parsed = tokenKeysFromEnv({ MINIAPP_TOKEN_PRIVATE_JWK: JSON.stringify(privateJwk) });
  assert.ok(parsed);
  keys = parsed.keys;
  tok = await mint();
});

type LegacyCall = { appId: string; route: string; host?: string };

function deps(over: Partial<RuntimeAuthDeps> & { legacy?: LegacyCall[] } = {}): RuntimeAuthDeps {
  const { legacy, ...rest } = over;
  return {
    verify: (token, audience) => verifyUserToken(token, { keys, issuers: [ISS], audience, nowSec: NOW }),
    requireToken: false,
    onLegacy: (info) => legacy?.push(info),
    ...rest,
  };
}

async function assert401(p: Promise<unknown>) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof MiniAppError, "expected MiniAppError");
    assert.equal(e.code, "unauthorized");
    assert.equal(e.status, 401);
    return true;
  });
}

test("a valid token wins over a different claimed wallet", async () => {
  const u = await resolveRuntimeUser({ authorization: `Bearer ${tok}`, app, claimedWallet: OTHER, route: "rewards" }, deps({ requireToken: false }));
  assert.deepEqual(u, { wallet: WALLET, via: "token" });
});

test("a valid token works with the switch on and no claimed wallet", async () => {
  const u = await resolveRuntimeUser({ authorization: `Bearer ${tok}`, app, claimedWallet: null, route: "data" }, deps({ requireToken: true }));
  assert.deepEqual(u, { wallet: WALLET, via: "token" });
});

test("a token for another app is 401 even with the switch off", async () => {
  const other = await mint({ aud: "miniapp:other", app: OTHER_APP_ID });
  await assert401(resolveRuntimeUser({ authorization: `Bearer ${other}`, app, claimedWallet: WALLET, route: "rewards" }, deps()));
});

test("a token whose app id does not match the resolved app is 401", async () => {
  const mismatched = await mint({ app: OTHER_APP_ID });
  await assert401(resolveRuntimeUser({ authorization: `Bearer ${mismatched}`, app, claimedWallet: WALLET, route: "rewards" }, deps()));
});

test("an expired token plus a valid wallet is 401 with the switch off", async () => {
  const legacy: LegacyCall[] = [];
  const expired = await mint({ exp: NOW - 60 });
  await assert401(resolveRuntimeUser({ authorization: `Bearer ${expired}`, app, claimedWallet: WALLET, route: "notifications" }, deps({ legacy })));
  assert.equal(legacy.length, 0);
});

test("a garbage token plus a valid wallet is 401 with the switch off", async () => {
  await assert401(resolveRuntimeUser({ authorization: "Bearer not.a.jwt", app, claimedWallet: WALLET, route: "data" }, deps()));
});

test("a token without an address is 401", async () => {
  const noAddr = await mint({ addr: null });
  await assert401(resolveRuntimeUser({ authorization: `Bearer ${noAddr}`, app, claimedWallet: WALLET, route: "rewards" }, deps()));
});

test("no token, switch off: the claimed wallet is used and logged", async () => {
  const legacy: LegacyCall[] = [];
  const u = await resolveRuntimeUser({ authorization: null, app, claimedWallet: WALLET, route: "muenzen-balance" }, deps({ legacy }));
  assert.deepEqual(u, { wallet: WALLET, via: "legacy" });
  assert.deepEqual(legacy, [{ appId: APP_ID, route: "muenzen-balance" }]);
});

test("no token, switch off: a well-formed x-roebel-host is recorded as host", async () => {
  const legacy: LegacyCall[] = [];
  await resolveRuntimeUser({ authorization: null, app, claimedWallet: WALLET, route: "data", host: "expo" }, deps({ legacy }));
  assert.deepEqual(legacy, [{ appId: APP_ID, route: "data", host: "expo" }]);
});

test("no token, switch off: a malformed x-roebel-host is omitted", async () => {
  const legacy: LegacyCall[] = [];
  for (const host of ["Expo", "a".repeat(21), "web host", "", null]) {
    await resolveRuntimeUser({ authorization: null, app, claimedWallet: WALLET, route: "data", host }, deps({ legacy }));
  }
  assert.deepEqual(legacy, Array(5).fill({ appId: APP_ID, route: "data" }));
});

test("hostLabel accepts only [a-z0-9-]{1,20}", () => {
  assert.equal(hostLabel("expo"), "expo");
  assert.equal(hostLabel("web-2"), "web-2");
  assert.equal(hostLabel("a".repeat(20)), "a".repeat(20));
  assert.equal(hostLabel("a".repeat(21)), undefined);
  assert.equal(hostLabel("EXPO"), undefined);
  assert.equal(hostLabel(null), undefined);
});

test("no token, switch off: a mixed-case claimed wallet is lowercased", async () => {
  const u = await resolveRuntimeUser({ authorization: null, app, claimedWallet: "0xABCDEFabcdef0000000000000000000000000000", route: "data" }, deps());
  assert.deepEqual(u, { wallet: "0xabcdefabcdef0000000000000000000000000000", via: "legacy" });
});

test("no token, switch on: 401", async () => {
  const legacy: LegacyCall[] = [];
  await assert.rejects(
    resolveRuntimeUser({ authorization: null, app, claimedWallet: WALLET, route: "rewards" }, deps({ requireToken: true, legacy })),
    (e: unknown) => {
      assert.ok(e instanceof MiniAppError);
      assert.equal(e.status, 401);
      assert.equal(e.message, "Nutzer-Token fehlt. Hole es mit sdk.auth.getToken() und sende es als Authorization: Bearer.");
      return true;
    },
  );
  assert.equal(legacy.length, 0);
});

test("no token, switch off, malformed wallet: 401", async () => {
  await assert401(resolveRuntimeUser({ authorization: null, app, claimedWallet: "0x123", route: "rewards" }, deps()));
  await assert401(resolveRuntimeUser({ authorization: null, app, claimedWallet: undefined, route: "rewards" }, deps()));
});

test("a non-Bearer Authorization header counts as no token", async () => {
  const legacy: LegacyCall[] = [];
  const u = await resolveRuntimeUser({ authorization: `Basic ${tok}`, app, claimedWallet: WALLET, route: "data" }, deps({ legacy }));
  assert.deepEqual(u, { wallet: WALLET, via: "legacy" });
  assert.equal(legacy.length, 1);
  await assert401(resolveRuntimeUser({ authorization: `Basic ${tok}`, app, claimedWallet: WALLET, route: "data" }, deps({ requireToken: true })));
});

test("an onLegacy failure never fails the request", async () => {
  const u = await resolveRuntimeUser({ authorization: null, app, claimedWallet: WALLET, route: "data" }, deps({
    onLegacy: () => { throw new Error("log down"); },
  }));
  assert.deepEqual(u, { wallet: WALLET, via: "legacy" });
});

// ---- Pseudonym resolution (plan miniapp-2, Task 7) ----
import { resolveTokenWallet } from "../src/lib/miniapp/runtimeAuth";

const PSEUDO = "nz_abcdefghijklmnopqrstuvwxyz0";

test("resolveTokenWallet finds the wallet behind a pseudonym", async () => {
  const claims = { iss: ISS, aud: "miniapp:demo", sub: PSEUDO, app: APP_ID, iat: NOW, exp: NOW + 600, jti: "j", v: 1 as const };
  const w = await resolveTokenWallet(claims, { walletOf: async (s) => (s === PSEUDO ? WALLET.toUpperCase().replace("0X", "0x") : null) });
  assert.equal(w, WALLET);
});

test("resolveTokenWallet prefers the granted address", async () => {
  const claims = { iss: ISS, aud: "miniapp:demo", sub: PSEUDO, app: APP_ID, iat: NOW, exp: NOW + 600, jti: "j", v: 1 as const, addr: WALLET };
  assert.equal(await resolveTokenWallet(claims, { walletOf: async () => OTHER }), WALLET);
});

test("an unknown pseudonym is unauthorized", async () => {
  const claims = { iss: ISS, aud: "miniapp:demo", sub: "nz_unknownunknownunknownunkno", app: APP_ID, iat: NOW, exp: NOW + 600, jti: "j", v: 1 as const };
  await assert401(resolveTokenWallet(claims, { walletOf: async () => null }));
});

test("a pseudonym token resolves through the store in resolveRuntimeUser", async () => {
  const t = await issuer.sign({ aud: "miniapp:demo", sub: PSEUDO, app: APP_ID, iat: NOW - 10, exp: NOW + 600, jti: "j2", v: 1 });
  const u = await resolveRuntimeUser(
    { authorization: `Bearer ${t}`, app, claimedWallet: OTHER, route: "data" },
    deps({ walletOf: async (s) => (s === PSEUDO ? WALLET : null) }),
  );
  assert.deepEqual(u, { wallet: WALLET, via: "token", pseudonymous: true });
});

test("a reward outcome keeps txRef for an address token and a legacy call", () => {
  const outcome = { granted: true, amount: 1, txRef: "0xabc", remainingBudget: 9 };
  assert.deepEqual(forRuntimeUser(outcome, { wallet: WALLET, via: "token" }), outcome);
  assert.deepEqual(forRuntimeUser(outcome, { wallet: WALLET, via: "legacy" }), outcome);
});

test("a reward outcome drops txRef for a pseudonym token (the tx hash would reveal the wallet)", () => {
  const outcome = { granted: true, amount: 1, txRef: "0xabc", remainingBudget: 9 };
  assert.deepEqual(forRuntimeUser(outcome, { wallet: WALLET, via: "token", pseudonymous: true }), {
    granted: true,
    amount: 1,
    remainingBudget: 9,
  });
});
