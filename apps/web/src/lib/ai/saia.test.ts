import { test } from "node:test";
import assert from "node:assert/strict";
import { saiaChatModel, saiaEnabled, withSaiaFallback, type FallbackTarget } from "./saia";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

test("saiaEnabled needs a key and the route in SAIA_ROUTES", () => {
  assert.equal(saiaEnabled("bot-fast", env({ SAIA_ROUTES: "bot-fast" })), false);
  assert.equal(saiaEnabled("bot-fast", env({ SAIA_API_KEY: "k", SAIA_ROUTES: "" })), false);
  assert.equal(saiaEnabled("bot-fast", env({ SAIA_API_KEY: "k", SAIA_ROUTES: "stt, bot-fast" })), true);
  assert.equal(saiaEnabled("bot-smart", env({ SAIA_API_KEY: "k", SAIA_ROUTES: "stt,bot-fast" })), false);
});

test("a failing SAIA call goes to the fallback model", async () => {
  const primary = saiaChatModel("bot-fast", env({ SAIA_API_KEY: "k" }));
  const failing = Object.assign(Object.create(primary), {
    doGenerate: async () => { throw new Error("429"); },
    doStream: async () => { throw new Error("429"); },
  });
  const calls: string[] = [];
  const fallback = {
    provider: "fallback",
    modelId: "fallback",
    doGenerate: async () => { calls.push("generate"); return { ok: true }; },
    doStream: async () => { calls.push("stream"); return { stream: new ReadableStream() }; },
  } as unknown as FallbackTarget;
  const model = withSaiaFallback(failing, fallback);
  const opts = { prompt: [] } as unknown as Parameters<typeof model.doGenerate>[0];
  assert.deepEqual(await model.doGenerate(opts), { ok: true });
  await model.doStream(opts);
  assert.deepEqual(calls, ["generate", "stream"]);
  // After a failure SAIA is skipped for a cool-down.
  assert.equal(saiaEnabled("bot-fast", env({ SAIA_API_KEY: "k", SAIA_ROUTES: "bot-fast" })), false);
});
