/**
 * Passkey API session tokens: one signature per device session, bound to identity + device,
 * revocable, fail-closed; accepted as an alternative by the signed-request routes, the chat session
 * and the key backup; the edge copy is byte-identical and never needs viem's verifyHash.
 * Run: cd apps/web && npx tsx --test src/lib/passkey/__tests__/session-token.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAddress, hashMessage, hashTypedData, recoverTypedDataAddress, verifyMessage, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  PASSKEY_SESSION_MAX_TTL_SEC,
  authenticateEdgeSession,
  authenticatePasskeySession,
  buildPasskeySessionMessage,
  passkeySessionFromHeaders,
  readPasskeySessionToken,
  signPasskeySessionToken,
  type PasskeySessionClaims,
} from "../session-token-core";
import * as edgeCopy from "../../../../../expo/supabase/functions/_shared/verify-session-token";
import { handleSessionInfo, handleSessionRevoke, handleSessionStart, type PasskeySessionDeps } from "../session-handler";
import { InMemoryPasskeySessionStore } from "../session-token-store";
import { handleKeyBackupGet, handleKeyBackupPut, type KeyBackupDeps } from "../key-backup-handler";
import { InMemoryKeyBackupStore } from "../key-backup-store";
import { verifySignedRequest, type BearerAuth } from "../../signed-request/verify";
import { verifySessionRequest } from "../../chat/session";
import { createAccountSignatureVerifier, encodeSafeAdminSignature } from "../../auth/verify-account-signature";
import { makeAccountSignatureVerifier, type AccountSignatureClient } from "../../auth/account-signature-core";
import { fakeGnosisClient } from "../../auth/__tests__/fake-gnosis";
import { signAsPasskeySafe } from "./safe-1271-emulator";
import rv from "./recovery-vector.json";
import vector from "./session-message-vector.json";

const SECRET = "s".repeat(40);
const NOW = 1_790_000_000;
const DEV = "dev_0123456789abcdefXYZ";
const owner = privateKeyToAccount(`0x${"11".repeat(32)}`);
const stranger = privateKeyToAccount(`0x${"22".repeat(32)}`);
const ID = owner.address.toLowerCase();
const nonce = (n: number) => n.toString(16).padStart(32, "0");

const eoaVerify: PasskeySessionDeps["verify"] = ({ address, message, signature }) =>
  verifyMessage({ address: address as Address, message, signature: signature as Hex });

function deps(over: Partial<PasskeySessionDeps> = {}, store = new InMemoryPasskeySessionStore()): PasskeySessionDeps {
  return { enabled: true, secret: SECRET, store, verify: eoaVerify, nowSec: () => NOW, ...over };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api", { method: "POST", headers, body: JSON.stringify(body) });

async function startBody(p: { n?: number; signer?: typeof owner; identity?: string; issuedAt?: number; expiresAt?: number } = {}) {
  const identity = p.identity ?? ID;
  const issuedAt = p.issuedAt ?? NOW;
  const expiresAt = p.expiresAt ?? NOW + PASSKEY_SESSION_MAX_TTL_SEC;
  const n = nonce(p.n ?? 1);
  const message = buildPasskeySessionMessage({ identity, deviceId: DEV, nonce: n, issuedAt, expiresAt });
  return { identity, deviceId: DEV, nonce: n, issuedAt, expiresAt, signature: await (p.signer ?? owner).signMessage({ message }) };
}

async function start(d: PasskeySessionDeps, body?: Record<string, unknown>) {
  const r = await handleSessionStart(post(body ?? (await startBody())), d);
  return { status: r.status, json: (await r.json()) as Record<string, any> };
}

const bearer = (token: string, dev = DEV) => ({ authorization: `Bearer ${token}`, "x-roebel-device": dev });

// ---------------------------------------------------------------------------
// core
// ---------------------------------------------------------------------------

test("vector: the start message is byte-exact with apps/expo (session-message-vector.json)", () => {
  assert.equal(
    buildPasskeySessionMessage({
      identity: vector.identity,
      deviceId: vector.deviceId,
      nonce: vector.nonce,
      issuedAt: vector.issuedAt,
      expiresAt: vector.expiresAt,
    }),
    vector.message,
  );
});

test("edge copy is byte-identical to the web core", () => {
  const web = readFileSync(join(__dirname, "..", "session-token-core.ts"), "utf8");
  const edge = readFileSync(join(__dirname, "../../../../../expo/supabase/functions/_shared/verify-session-token.ts"), "utf8");
  assert.equal(edge, web);
});

const claims = (over: Partial<PasskeySessionClaims> = {}): PasskeySessionClaims => ({
  v: 1,
  jti: nonce(7),
  sub: ID,
  safe: null,
  dev: DEV,
  iat: NOW,
  exp: NOW + 3600,
  ...over,
});

test("token: roundtrip; tampered, foreign-secret, expired, malformed and short-secret tokens are refused", async () => {
  const t = await signPasskeySessionToken(claims(), SECRET);
  assert.deepEqual(await readPasskeySessionToken(t, SECRET, NOW), claims());
  const [v, p, m] = t.split(".");
  const forged = Buffer.from(JSON.stringify(claims({ sub: stranger.address.toLowerCase() }))).toString("base64url");
  assert.equal(await readPasskeySessionToken(`${v}.${forged}.${m}`, SECRET, NOW), null);
  assert.equal(await readPasskeySessionToken(`${v}.${p}.${m.slice(0, -2)}AA`, SECRET, NOW), null);
  assert.equal(await readPasskeySessionToken(t, "x".repeat(40), NOW), null);
  assert.equal(await readPasskeySessionToken(t, SECRET, NOW + 3600), null, "expired");
  assert.equal(await readPasskeySessionToken(`pst2.${p}.${m}`, SECRET, NOW), null);
  assert.equal(await readPasskeySessionToken("garbage", SECRET, NOW), null);
  assert.equal(await readPasskeySessionToken(t, "short", NOW), null);
  await assert.rejects(signPasskeySessionToken(claims(), "short"));
  // A lifetime above 30 days is refused even with a valid MAC.
  const long = await signPasskeySessionToken(claims({ exp: NOW + PASSKEY_SESSION_MAX_TTL_SEC + 1 }), SECRET);
  assert.equal(await readPasskeySessionToken(long, SECRET, NOW), null);
});

test("authenticate: wallet, device and revocation are all enforced; a store error fails closed (503)", async () => {
  const t = await signPasskeySessionToken(claims(), SECRET);
  const base = { token: t, deviceId: DEV, wallet: ID, secret: SECRET, nowSec: NOW, isActive: async () => true };
  assert.equal((await authenticatePasskeySession(base)).ok, true);
  assert.equal((await authenticatePasskeySession({ ...base, wallet: getAddress(ID) })).ok, true, "checksum case is fine");
  assert.deepEqual(await authenticatePasskeySession({ ...base, wallet: stranger.address }), { ok: false, status: 401, code: "SESSION_INVALID" });
  assert.deepEqual(await authenticatePasskeySession({ ...base, deviceId: "dev_other_0123456789" }), { ok: false, status: 401, code: "SESSION_INVALID" });
  assert.deepEqual(await authenticatePasskeySession({ ...base, deviceId: null }), { ok: false, status: 401, code: "SESSION_INVALID" });
  assert.deepEqual(await authenticatePasskeySession({ ...base, isActive: async () => false }), { ok: false, status: 401, code: "SESSION_INVALID" });
  assert.deepEqual(
    await authenticatePasskeySession({ ...base, isActive: async () => { throw new Error("db down"); } }),
    { ok: false, status: 503, code: "SESSION_UNAVAILABLE" },
  );
});

test("headers: x-roebel-session or Authorization Bearer pst1.…; a Supabase anon JWT is ignored", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  assert.deepEqual(passkeySessionFromHeaders(h({ "x-roebel-session": "pst1.a.b", "x-roebel-device": DEV })), { token: "pst1.a.b", deviceId: DEV });
  assert.deepEqual(passkeySessionFromHeaders(h({ authorization: "Bearer pst1.a.b" })), { token: "pst1.a.b", deviceId: null });
  assert.equal(passkeySessionFromHeaders(h({ authorization: "Bearer eyJhbGciOi.anon.key" })), null);
  assert.equal(passkeySessionFromHeaders(h({})), null);
});

// ---------------------------------------------------------------------------
// routes: start / info / revoke
// ---------------------------------------------------------------------------

test("info + start: disabled, missing secret or missing store → no tokens", async () => {
  assert.deepEqual(await handleSessionInfo(deps()).json(), { enabled: true });
  for (const d of [deps({ enabled: false }), deps({ secret: "short" }), deps({ store: null })]) {
    assert.deepEqual(await handleSessionInfo(d).json(), { enabled: false });
    const r = await start(d);
    assert.equal(r.status, 503);
    assert.equal(r.json.error, "disabled");
  }
});

test("start: one signature → a token bound to identity + device; replay 409; stale 400; foreign signer 401; RPC down 503", async () => {
  const store = new InMemoryPasskeySessionStore();
  const d = deps({}, store);
  const body = await startBody();
  const r = await start(d, body);
  assert.equal(r.status, 200);
  assert.equal(r.json.jti, nonce(1));
  assert.equal(r.json.expiresAt, NOW + PASSKEY_SESSION_MAX_TTL_SEC);
  const c = await readPasskeySessionToken(r.json.token, SECRET, NOW);
  assert.equal(c?.sub, ID);
  assert.equal(c?.dev, DEV);
  assert.equal(c?.safe, null);
  assert.equal(await store.isActive(nonce(1), ID, NOW), true);

  assert.equal((await start(d, body)).status, 409, "the same signed message cannot mint twice");
  assert.equal((await start(d, await startBody({ n: 2, issuedAt: NOW - 601 }))).status, 400);
  assert.equal((await start(d, await startBody({ n: 3, expiresAt: NOW + PASSKEY_SESSION_MAX_TTL_SEC + 1 }))).status, 400);
  assert.equal((await start(d, await startBody({ n: 4, signer: stranger }))).status, 401);
  assert.equal((await start(deps({ verify: async () => { throw new Error("rpc"); } }, store), await startBody({ n: 5 }))).status, 503);
  const failing = new InMemoryPasskeySessionStore();
  failing.failing = true;
  assert.equal((await start(deps({}, failing), await startBody({ n: 6 }))).status, 503);
  assert.equal((await start(d, { ...(await startBody({ n: 8 })), deviceId: "bad id" })).status, 400);
});

test("start: a new sign-in on the same device revokes the older token", async () => {
  const store = new InMemoryPasskeySessionStore();
  const d = deps({}, store);
  await start(d, await startBody({ n: 1 }));
  await start(d, await startBody({ n: 2 }));
  assert.equal(await store.isActive(nonce(1), ID, NOW), false);
  assert.equal(await store.isActive(nonce(2), ID, NOW), true);
});

test("start: a legacy identity signing with the passkey Safe-admin envelope records the Safe", async () => {
  const g = rv.guardianApproval;
  const SAFE = getAddress(g.guardianSafe) as Hex;
  const LEGACY = "0xc49de63ccfee46c6c5c3e393293f66779799fb28" as Hex;
  const verify = createAccountSignatureVerifier(
    fakeGnosisClient({
      thirdweb: new Map([[LEGACY, { admins: new Set([SAFE.toLowerCase()]), deployed: true }]]),
      safes: new Map([[SAFE.toLowerCase(), { x: g.guardianX as Hex, y: g.guardianY as Hex }]]),
    }),
  );
  const store = new InMemoryPasskeySessionStore();
  const d = deps({ verify: ({ address, message, signature }) => verify({ address, message, signature }) }, store);
  const expiresAt = NOW + 86400;
  const message = buildPasskeySessionMessage({ identity: LEGACY, deviceId: DEV, nonce: nonce(9), issuedAt: NOW, expiresAt });
  const inner = signAsPasskeySafe({
    safe: SAFE,
    privateKey: g.guardianPasskeyPrivateKey as Hex,
    x: g.guardianX as Hex,
    y: g.guardianY as Hex,
    hash: hashMessage(message),
    authenticatorData: g.authenticatorData as Hex,
  });
  const r = await start(d, { identity: LEGACY, deviceId: DEV, nonce: nonce(9), issuedAt: NOW, expiresAt, signature: encodeSafeAdminSignature(SAFE, inner) });
  assert.equal(r.status, 200);
  assert.equal((await readPasskeySessionToken(r.json.token, SECRET, NOW))?.safe, SAFE.toLowerCase());
});

test("revoke: the token itself, or all of the identity's tokens (needs an active one)", async () => {
  const store = new InMemoryPasskeySessionStore();
  const d = deps({}, store);
  const t1 = (await start(d, await startBody({ n: 1 }))).json.token;
  assert.equal((await handleSessionRevoke(post({}, bearer(t1, "dev_wrong_0123456789")), d)).status, 401);
  assert.equal((await handleSessionRevoke(post({}, bearer(t1)), d)).status, 200);
  assert.equal(await store.isActive(nonce(1), ID, NOW), false);
  // all: needs an ACTIVE token (a leaked revoked token cannot log the person out everywhere)
  assert.equal((await handleSessionRevoke(post({ all: true }, bearer(t1)), d)).status, 401);
  const t2 = (await start(d, await startBody({ n: 2 }))).json.token;
  await store.insert(claims({ jti: nonce(3), dev: "dev_second_phone_0001" }));
  assert.equal((await handleSessionRevoke(post({ all: true }, bearer(t2)), d)).status, 200);
  assert.equal(await store.isActive(nonce(3), ID, NOW), false);
});

// ---------------------------------------------------------------------------
// consumers
// ---------------------------------------------------------------------------

async function liveToken(store = new InMemoryPasskeySessionStore()) {
  const d = deps({}, store);
  const token = (await start(d, await startBody({ n: 42 }))).json.token as string;
  const bearerAuth: BearerAuth = async (headers, wallet) => {
    const { authenticateSessionHeaders } = await import("../session-handler");
    return authenticateSessionHeaders(headers, wallet, d);
  };
  return { token, store, d, bearerAuth };
}

const ticketBody = (wallet = ID) => ({ scope: "roebel-tickets-v1", action: "tickets_list", wallet, timestampSec: Math.floor(Date.now() / 1000), payload: {} });

test("signed-request: a session token replaces the signature for the same wallet only", async () => {
  const { token, store, bearerAuth } = await liveToken();
  const h = new Headers(bearer(token));
  const ok = await verifySignedRequest(ticketBody(), { actions: ["tickets_list"], headers: h, bearerAuth });
  assert.equal(ok.ok, true);
  const foreign = await verifySignedRequest(ticketBody(stranger.address), { actions: ["tickets_list"], headers: h, bearerAuth });
  assert.deepEqual(foreign.ok ? null : [foreign.status, foreign.code], [401, "SESSION_INVALID"]);
  // requireSignature (refunds): the token is ignored, a missing signature stays 401
  const refund = await verifySignedRequest({ ...ticketBody(), action: "refund_order" }, { actions: ["refund_order"], headers: h, bearerAuth, requireSignature: true });
  assert.deepEqual(refund.ok ? null : [refund.status, refund.code], [401, "BAD_SIGNATURE"]);
  // revoked → 401, never a fall-through
  await store.revoke(nonce(42), ID);
  const revoked = await verifySignedRequest(ticketBody(), { actions: ["tickets_list"], headers: h, bearerAuth });
  assert.deepEqual(revoked.ok ? null : [revoked.status, revoked.code], [401, "SESSION_INVALID"]);
});

test("signed-request: without a token the per-request signature still works", async () => {
  const body = ticketBody();
  const { buildSignedMessage } = await import("../../signed-request/message");
  const signature = await owner.signMessage({ message: buildSignedMessage("roebel-tickets-v1", "tickets_list", ID, body.timestampSec, {}) });
  const r = await verifySignedRequest({ ...body, signature }, { actions: ["tickets_list"], headers: new Headers(), bearerAuth: async () => null });
  assert.equal(r.ok, true);
});

test("chat session: the token replaces the 30-day chat sign-in signature", async () => {
  const { token, bearerAuth } = await liveToken();
  const r = await verifySessionRequest({ wallet: ID }, Date.now(), { headers: new Headers(bearer(token)), bearerAuth });
  assert.deepEqual(r, { ok: true, wallet: ID });
  const bad = await verifySessionRequest({ wallet: ID }, Date.now(), { headers: new Headers(bearer(token, "dev_wrong_0123456789")), bearerAuth });
  assert.equal(bad.ok, false);
});

test("key backup: token reads and writes; replace:true always needs a fresh proof", async () => {
  const { token, d } = await liveToken();
  const { authenticateSessionHeaders } = await import("../session-handler");
  const kb: KeyBackupDeps = {
    enabled: true,
    store: new InMemoryKeyBackupStore(),
    verify: async () => false,
    nowSec: () => NOW,
    sessionAuth: (headers, identity) => authenticateSessionHeaders(headers, identity, d),
  };
  const MACI = `pkv1:${"A".repeat(120)}`;
  const put = await handleKeyBackupPut(post({ identity: ID, blobs: { maci: MACI } }, bearer(token)), kb);
  assert.equal(put.status, 200);
  const get = await handleKeyBackupGet(post({ identity: ID }, bearer(token)), kb);
  assert.deepEqual(await get.json(), { blobs: { maci: MACI } });
  const replace = await handleKeyBackupPut(post({ identity: ID, blobs: { maci: MACI }, replace: true }, bearer(token)), kb);
  assert.equal(replace.status, 400, "replace without proof");
  const foreign = await handleKeyBackupGet(post({ identity: stranger.address }, bearer(token)), kb);
  assert.equal(foreign.status, 401);
  const none = await handleKeyBackupGet(post({ identity: ID }), kb);
  assert.equal(none.status, 400);
});

// ---------------------------------------------------------------------------
// edge functions (Deno copy, viem 2.21: no verifyHash)
// ---------------------------------------------------------------------------

/** A viem 2.21-style public client: verifyMessage/verifyTypedData only, NO verifyHash. */
function viem221Client(): AccountSignatureClient {
  const base = fakeGnosisClient({ thirdweb: new Map(), safes: new Map() });
  return {
    verifyMessage: ({ address, message, signature }) =>
      base.verifyHash!({ address, hash: hashMessage(message as string), signature }),
    readContract: (a) => base.readContract(a),
  };
}

test("edge: token path authenticates without any viem call; a signed request is still decided by its signature (viem 2.21 client)", async () => {
  const store = new InMemoryPasskeySessionStore();
  const { token } = await liveToken(store);
  const isActive = (jti: string, id: string, now: number) => store.isActive(jti, id, now);
  const headers = new Headers({ "x-roebel-session": token, "x-roebel-device": DEV, authorization: "Bearer anon-jwt" });
  const base = { headers, wallet: ID, secret: SECRET, nowSec: NOW, isActive };

  assert.equal((await edgeCopy.authenticateEdgeSession({ ...base, signature: undefined }))?.ok, true);
  assert.equal((await edgeCopy.authenticateEdgeSession({ ...base, signature: "" }))?.ok, true);
  // off: no/short secret or no lookup → null (the function then requires its signature as before)
  assert.equal(await edgeCopy.authenticateEdgeSession({ ...base, signature: undefined, secret: undefined }), null);
  assert.equal(await edgeCopy.authenticateEdgeSession({ ...base, signature: undefined, isActive: null }), null);
  // a request WITH a signature is never decided by the token
  assert.equal(await edgeCopy.authenticateEdgeSession({ ...base, signature: "0xdead" }), null);
  // foreign wallet / revoked → 401; store down → 503
  assert.equal((await edgeCopy.authenticateEdgeSession({ ...base, signature: undefined, wallet: stranger.address }))?.ok, false);
  const down = await edgeCopy.authenticateEdgeSession({ ...base, signature: undefined, isActive: async () => { throw new Error("x"); } });
  assert.deepEqual(down, { ok: false, status: 503, code: "SESSION_UNAVAILABLE" });

  // The signature fallback the edge functions keep: shared rule on a 2.21-style client.
  const verify = makeAccountSignatureVerifier({ client: viem221Client(), utils: { hashMessage, hashTypedData, recoverTypedDataAddress } });
  const message = "roebel-org-v1:update_account:" + ID + ":1790000000:abc";
  assert.equal(await verify({ address: ID, message, signature: await owner.signMessage({ message }) }), true);
  assert.equal(await verify({ address: ID, message, signature: await stranger.signMessage({ message }) }), false);
});

test("edge: supabasePasskeySessionLookup reads jti + identity and treats revoked/expired/missing/error correctly", async () => {
  const rows: Record<string, { revoked_at: string | null; expires_at: string } | null> = {
    [nonce(1)]: { revoked_at: null, expires_at: new Date((NOW + 60) * 1000).toISOString() },
    [nonce(2)]: { revoked_at: new Date().toISOString(), expires_at: new Date((NOW + 60) * 1000).toISOString() },
    [nonce(3)]: { revoked_at: null, expires_at: new Date((NOW - 1) * 1000).toISOString() },
  };
  const seen: string[] = [];
  const client = (fail = false) => ({
    from: (table: string) => ({
      select: (_c: string) => ({
        eq: (c1: string, v1: string) => ({
          eq: (c2: string, v2: string) => ({
            maybeSingle: async () => {
              seen.push(`${table}:${c1}=${v1}:${c2}=${v2}`);
              return fail ? { data: null, error: { message: "down" } } : { data: rows[v1] ?? null, error: null };
            },
          }),
        }),
      }),
    }),
  });
  const lookup = edgeCopy.supabasePasskeySessionLookup(client());
  assert.equal(await lookup(nonce(1), getAddress(ID), NOW), true);
  assert.equal(await lookup(nonce(2), ID, NOW), false);
  assert.equal(await lookup(nonce(3), ID, NOW), false);
  assert.equal(await lookup(nonce(4), ID, NOW), false);
  assert.equal(seen[0], `passkey_api_sessions:jti=${nonce(1)}:identity_address=${ID}`);
  await assert.rejects(edgeCopy.supabasePasskeySessionLookup(client(true))(nonce(1), ID, NOW));
});
