import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import {
  bearerToken, buildChatMessage, issueSessionToken, SESSION_TTL_SECONDS, timestampToSeconds,
  verifySessionRequest, verifySessionToken,
} from "./session";

const SECRET = "test-secret-at-least-16-chars";
const WALLET = "0x00000000000000000000000000000000000000AB";

test("session message follows the signed-request grammar with the chat scope", () => {
  const emptyHash = createHash("sha256").update("{}").digest("hex");
  assert.equal(
    buildChatMessage("session", "0xABCDEF", 1700000000),
    `roebel-chat-v1:session:0xabcdef:1700000000:${emptyHash}`,
  );
  const sorted = createHash("sha256").update(JSON.stringify({ a: 1, b: 2 })).digest("hex");
  assert.equal(buildChatMessage("x", "0xA", 1, { b: 2, a: 1 }), `roebel-chat-v1:x:0xa:1:${sorted}`);
});

test("timestamps in ms are normalised to seconds", () => {
  assert.equal(timestampToSeconds(1700000000), 1700000000);
  assert.equal(timestampToSeconds(1700000000123), 1700000000);
});

test("JWT roundtrip returns the lowercased wallet", async () => {
  const now = Date.UTC(2026, 8, 25);
  const { token, expiresAt } = await issueSessionToken(WALLET, { secret: SECRET, nowMs: now });
  assert.equal(new Date(expiresAt).getTime(), now + SESSION_TTL_SECONDS * 1000);
  assert.equal(await verifySessionToken(token, { secret: SECRET, nowMs: now + 1000 }), WALLET.toLowerCase());
});

test("JWT is rejected with a wrong secret, when expired, or tampered", async () => {
  const now = Date.UTC(2026, 8, 25);
  const { token } = await issueSessionToken(WALLET, { secret: SECRET, nowMs: now });
  assert.equal(await verifySessionToken(token, { secret: "another-secret-16chars", nowMs: now }), null);
  assert.equal(await verifySessionToken(token, { secret: SECRET, nowMs: now + (SESSION_TTL_SECONDS + 60) * 1000 }), null);
  assert.equal(await verifySessionToken(`${token}x`, { secret: SECRET, nowMs: now }), null);
  assert.equal(await verifySessionToken(null, { secret: SECRET }), null);
});

test("bearerToken parses the Authorization header", () => {
  assert.equal(bearerToken("Bearer abc.def"), "abc.def");
  assert.equal(bearerToken("bearer  abc "), "abc");
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(bearerToken(null), null);
});

test("an EOA signature over the session message verifies (no RPC needed)", async () => {
  const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const ts = Math.floor(Date.now() / 1000);
  const signature = await account.signMessage({ message: buildChatMessage("session", account.address, ts) });
  const ok = await verifySessionRequest({ wallet: account.address, timestamp: ts, signature });
  assert.deepEqual(ok, { ok: true, wallet: account.address.toLowerCase() });
  const stale = await verifySessionRequest({ wallet: account.address, timestamp: ts - 3600, signature });
  assert.equal(stale.ok, false);
  const bad = await verifySessionRequest({ wallet: "nope", timestamp: ts, signature });
  assert.equal(bad.ok, false);
});
