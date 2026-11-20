import assert from "node:assert/strict";
import test from "node:test";
import { FixedWindowLimiter, SupabaseRateLimiter } from "../email-rate-limit";

type Call = { fn: string; args: Record<string, unknown> };

function fakeDb(result: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  return {
    calls,
    db: {
      async rpc(fn: string, args: Record<string, unknown>) {
        calls.push({ fn, args });
        return result;
      },
    },
  };
}

test("SupabaseRateLimiter hashes the lowercased key and never sends the address", async () => {
  const { db, calls } = fakeDb({ data: true, error: null });
  const l = new SupabaseRateLimiter(db, "email-address", 3, 3600);
  assert.equal(await l.take("A@b.de"), true);
  assert.equal(await l.take("a@b.de"), true);
  assert.equal(calls[0].fn, "passkey_rate_take");
  assert.match(String(calls[0].args.p_key_hash), /^[0-9a-f]{64}$/);
  assert.equal(calls[0].args.p_key_hash, calls[1].args.p_key_hash);
  assert.equal(calls[0].args.p_scope, "email-address");
  assert.equal(calls[0].args.p_limit, 3);
  assert.equal(calls[0].args.p_window_seconds, 3600);
  assert.ok(!JSON.stringify(calls).includes("b.de"));
});

test("SupabaseRateLimiter: data false means limited", async () => {
  const { db } = fakeDb({ data: false, error: null });
  assert.equal(await new SupabaseRateLimiter(db, "email-safe", 5, 3600).take("0xabc"), false);
});

test("SupabaseRateLimiter: an RPC error rejects", async () => {
  const { db } = fakeDb({ data: null, error: { message: "down" } });
  await assert.rejects(new SupabaseRateLimiter(db, "email-safe", 5, 3600).take("0xabc"));
});

test("FixedWindowLimiter take resolves to a promise", async () => {
  const l = new FixedWindowLimiter(1, 1000);
  assert.equal(await l.take("k"), true);
  assert.equal(await l.take("k"), false);
});
