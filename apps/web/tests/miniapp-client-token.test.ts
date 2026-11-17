// apps/web/tests/miniapp-client-token.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchUserTokenWithAccount, invalidateUserToken } from "../src/lib/miniapp/clientToken";
import { buildSignedMessage, MINIAPP_SCOPE } from "../src/lib/signed-request/message";

const APP = "11111111-2222-3333-4444-555555555555";
const T0 = 1_800_000_000_000; // ms
let walletSeq = 0;

/** A fresh wallet per test, so the module-level cache never leaks between tests. */
function setup(opts: { sign?: "ok" | "decline"; status?: number; expiresAt?: number; expiresIn?: number; serverSkewMs?: number } = {}) {
  walletSeq++;
  const address = `0x${walletSeq.toString(16).padStart(40, "0")}`;
  const c = { signs: 0, posts: 0, now: T0, lastBody: null as Record<string, unknown> | null, lastMessage: "" };
  const account = {
    address,
    signMessage: async ({ message }: { message: string }) => {
      c.signs++;
      c.lastMessage = message;
      if ((opts.sign ?? "ok") === "decline") throw new Error("declined");
      return "0xsig";
    },
  };
  const fetchStub = (async (_url: string, init?: { body?: string }) => {
    c.posts++;
    c.lastBody = JSON.parse(init?.body ?? "{}");
    const status = opts.status ?? 200;
    const serverNowSec = Math.floor((c.now + (opts.serverSkewMs ?? 0)) / 1000);
    const expiresAt = opts.expiresAt ?? serverNowSec + (opts.expiresIn ?? 900);
    const json = { token: `tok-${c.posts}`, expiresAt, ...(opts.expiresIn !== undefined ? { expiresIn: opts.expiresIn } : {}) };
    return new Response(JSON.stringify(status === 200 ? json : { ok: false }), { status });
  }) as unknown as typeof fetch;
  const deps = { nowMs: () => c.now, fetch: fetchStub };
  return { c, account, deps };
}

test("posts a signed request the server can verify and returns the token", async () => {
  const { c, account, deps } = setup();
  const tok = await fetchUserTokenWithAccount(account, APP, deps);
  assert.equal(tok, "tok-1");
  const b = c.lastBody!;
  assert.equal(b.scope, MINIAPP_SCOPE);
  assert.equal(b.action, "user_token");
  assert.deepEqual(b.payload, { app: APP });
  assert.equal(c.lastMessage, buildSignedMessage(MINIAPP_SCOPE, "user_token", account.address, b.timestampSec as number, { app: APP }));
});

test("a cached token is reused without signing again", async () => {
  const { c, account, deps } = setup();
  await fetchUserTokenWithAccount(account, APP, deps);
  c.now += 60_000;
  assert.equal(await fetchUserTokenWithAccount(account, APP, deps), "tok-1");
  assert.equal(c.signs, 1);
  assert.equal(c.posts, 1);
});

test("refreshes within 60 s of expiresAt", async () => {
  const { c, account, deps } = setup({ expiresAt: Math.floor(T0 / 1000) + 900 });
  await fetchUserTokenWithAccount(account, APP, deps);
  c.now = T0 + (900 - 59) * 1000;
  assert.equal(await fetchUserTokenWithAccount(account, APP, deps), "tok-2");
  assert.equal(c.signs, 2);
});

test("null on a non-200 response, then no new attempt for 60 s", async () => {
  const { c, account, deps } = setup({ status: 503 });
  assert.equal(await fetchUserTokenWithAccount(account, APP, deps), null);
  c.now += 30_000;
  assert.equal(await fetchUserTokenWithAccount(account, APP, deps), null);
  assert.equal(c.posts, 1);
  assert.equal(c.signs, 1);
});

test("a declined signature backs off for 60 s, then asks again", async () => {
  const { c, account, deps } = setup({ sign: "decline" });
  assert.equal(await fetchUserTokenWithAccount(account, APP, deps), null);
  c.now += 59_000;
  assert.equal(await fetchUserTokenWithAccount(account, APP, deps), null);
  assert.equal(c.signs, 1);
  assert.equal(c.posts, 0);
  c.now += 2_000;
  assert.equal(await fetchUserTokenWithAccount(account, APP, deps), null);
  assert.equal(c.signs, 2);
});

test("parallel calls share one signature", async () => {
  const { c, account, deps } = setup();
  const [a, b] = await Promise.all([fetchUserTokenWithAccount(account, APP, deps), fetchUserTokenWithAccount(account, APP, deps)]);
  assert.equal(a, "tok-1");
  assert.equal(b, "tok-1");
  assert.equal(c.signs, 1);
});

test("expiresIn counts on the local clock: a device 120 s behind the server refreshes in time", async () => {
  // Server is 120 s ahead; token lives 600 s from the server's view.
  const { c, account, deps } = setup({ expiresIn: 600, serverSkewMs: 120_000 });
  assert.equal(await fetchUserTokenWithAccount(account, APP, deps), "tok-1");
  // 541 s later (local): within the 60 s margin of the local expiry (T0 + 600 s) → refresh,
  // although server expiresAt - 60 is still ahead of the slow local clock.
  c.now = T0 + 541_000;
  assert.equal(await fetchUserTokenWithAccount(account, APP, deps), "tok-2");
  assert.equal(c.signs, 2);
});

test("expiresIn: the token is reused until 60 s before the local expiry", async () => {
  const { c, account, deps } = setup({ expiresIn: 600, serverSkewMs: -300_000 });
  await fetchUserTokenWithAccount(account, APP, deps);
  c.now = T0 + 539_000;
  assert.equal(await fetchUserTokenWithAccount(account, APP, deps), "tok-1");
  assert.equal(c.signs, 1);
});

test("invalidateUserToken drops the cached token so the next call fetches a new one", async () => {
  const { c, account, deps } = setup();
  await fetchUserTokenWithAccount(account, APP, deps);
  invalidateUserToken(account.address.toUpperCase().replace("0X", "0x"), APP, "tok-1");
  assert.equal(await fetchUserTokenWithAccount(account, APP, deps), "tok-2");
  assert.equal(c.signs, 2);
});

test("invalidateUserToken with an older token keeps the newer cached one", async () => {
  const { c, account, deps } = setup();
  await fetchUserTokenWithAccount(account, APP, deps);
  invalidateUserToken(account.address, APP, "tok-0");
  assert.equal(await fetchUserTokenWithAccount(account, APP, deps), "tok-1");
  assert.equal(c.signs, 1);
});
