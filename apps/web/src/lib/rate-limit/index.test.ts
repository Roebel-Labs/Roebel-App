import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryLimiter, SharedLimiter, takeAll, type RpcClient } from "./index";

test("memory limiter allows `limit` hits per window, then refuses, then resets", async () => {
  let now = 0;
  const l = new MemoryLimiter(2, 1000, () => now);
  assert.equal(await l.take("a"), true);
  assert.equal(await l.take("a"), true);
  assert.equal(await l.take("a"), false);
  assert.equal(await l.take("b"), true, "keys are independent");
  now = 1000;
  assert.equal(await l.take("a"), true, "new window");
});

test("shared limiter asks the RPC with a namespaced key and honours a false answer", async () => {
  const calls: Record<string, unknown>[] = [];
  const client: RpcClient = {
    rpc: async (fn, args) => {
      assert.equal(fn, "api_rate_limit_take");
      calls.push(args);
      return { data: calls.length < 2, error: null };
    },
  };
  const l = new SharedLimiter({ name: "rule", limit: 5, windowMs: 60_000 }, () => client);
  assert.equal(await l.take("0xabc"), true);
  assert.equal(await l.take("0xabc"), false);
  assert.deepEqual(calls[0], { p_key: "rule:0xabc", p_limit: 5, p_window_seconds: 60 });
});

test("shared limiter falls back to the memory layer when the RPC errors or no client exists", async () => {
  const broken: RpcClient = { rpc: async () => ({ data: null, error: { message: "function does not exist" } }) };
  const l = new SharedLimiter({ name: "r", limit: 1, windowMs: 60_000 }, () => broken);
  assert.equal(await l.take("k"), true);
  assert.equal(await l.take("k"), false, "memory layer still enforces the limit");
  const none = new SharedLimiter({ name: "r", limit: 1, windowMs: 60_000 }, () => null);
  assert.equal(await none.take("k"), true);
  assert.equal(await none.take("k"), false);
});

test("takeAll needs every limiter and stops at the first refusal", async () => {
  const a = new MemoryLimiter(1, 1000, () => 0);
  const b = new MemoryLimiter(5, 1000, () => 0);
  assert.equal(await takeAll([a, b], "k"), true);
  assert.equal(await takeAll([a, b], "k"), false);
});
