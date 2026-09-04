// apps/web/src/lib/event-radio/__tests__/generate-helpers.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { concurrencyFromEnv } from "../generate-helpers";

test("concurrencyFromEnv defaults to 2 and clamps to 1..5", () => {
  assert.equal(concurrencyFromEnv({}), 2);
  assert.equal(concurrencyFromEnv({ ELEVENLABS_CONCURRENCY: "4" }), 4);
  assert.equal(concurrencyFromEnv({ ELEVENLABS_CONCURRENCY: "0" }), 1);
  assert.equal(concurrencyFromEnv({ ELEVENLABS_CONCURRENCY: "9" }), 5);
  assert.equal(concurrencyFromEnv({ ELEVENLABS_CONCURRENCY: "abc" }), 2);
});
