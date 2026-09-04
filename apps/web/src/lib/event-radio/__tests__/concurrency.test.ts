// apps/web/src/lib/event-radio/__tests__/concurrency.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { mapWithConcurrency } from "../concurrency";

test("mapWithConcurrency preserves order and captures errors", async () => {
  const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error("boom");
    return n * 10;
  });
  assert.deepEqual(results[0], { ok: true, value: 10 });
  assert.equal(results[1].ok, false);
  assert.deepEqual(results[2], { ok: true, value: 30 });
});

test("mapWithConcurrency never runs more than `limit` at once", async () => {
  let running = 0;
  let peak = 0;
  await mapWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running -= 1;
  });
  assert.equal(peak, 2);
});
