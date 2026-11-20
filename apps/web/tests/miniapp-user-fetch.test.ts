// apps/web/tests/miniapp-user-fetch.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createUserFetch } from "../src/lib/miniapp-host/userFetch";

function stub(status: number) {
  const calls: { url: string; headers: Record<string, string>; method?: string }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, method: init?.method });
    return new Response("{}", { status });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

test("sends x-roebel-host: web and the token, keeping the caller's headers", async () => {
  const s = stub(200);
  const f = createUserFetch({ getUserToken: async () => "tok", fetch: s.fetch });
  await f("/api/mini-apps/rewards", { method: "POST", headers: { "content-type": "application/json" } });
  assert.deepEqual(s.calls[0].headers, { "content-type": "application/json", "x-roebel-host": "web", authorization: "Bearer tok" });
  assert.equal(s.calls[0].method, "POST");
});

test("without a token: only x-roebel-host, and a 401 reports nothing", async () => {
  const s = stub(401);
  const rejected: string[] = [];
  const f = createUserFetch({ getUserToken: async () => null, onUserTokenRejected: (t) => rejected.push(t), fetch: s.fetch });
  const res = await f("/api/mini-apps/data");
  assert.equal(res.status, 401);
  assert.deepEqual(s.calls[0].headers, { "x-roebel-host": "web" });
  assert.deepEqual(rejected, []);
});

test("a 401 on a call carrying a token reports that token and is not retried", async () => {
  const s = stub(401);
  const rejected: string[] = [];
  const f = createUserFetch({ getUserToken: async () => "tok", onUserTokenRejected: (t) => rejected.push(t), fetch: s.fetch });
  const res = await f("/api/mini-apps/muenzen-balance?app=a");
  assert.equal(res.status, 401);
  assert.deepEqual(rejected, ["tok"]);
  assert.equal(s.calls.length, 1);
});

test("other errors keep the token; a throwing getUserToken counts as no token", async () => {
  const s = stub(500);
  const rejected: string[] = [];
  await createUserFetch({ getUserToken: async () => "tok", onUserTokenRejected: (t) => rejected.push(t), fetch: s.fetch })("/x");
  assert.deepEqual(rejected, []);
  await createUserFetch({ getUserToken: async () => { throw new Error("x"); }, fetch: s.fetch })("/x");
  assert.equal(s.calls[1].headers.authorization, undefined);
});
