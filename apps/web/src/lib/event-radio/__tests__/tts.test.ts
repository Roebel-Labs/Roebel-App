// apps/web/src/lib/event-radio/__tests__/tts.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { durationFromAlignment, synthesizeSpeech, TtsError } from "../tts";

const okBody = {
  audio_base64: Buffer.from("fake-mp3-bytes").toString("base64"),
  alignment: { character_end_times_seconds: [0.1, 0.5, 1.234] },
};

function fakeFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    return new Response(typeof next.body === "string" ? next.body : JSON.stringify(next.body), {
      status: next.status,
      headers: { "request-id": `req-${calls.length}` },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const noSleep = async () => {};

test("durationFromAlignment uses the last character end time", () => {
  assert.equal(durationFromAlignment({ character_end_times_seconds: [0.2, 1.234] }, 10), 1234);
});

test("durationFromAlignment estimates from bytes at 128 kbps without alignment", () => {
  // 16000 bytes * 8 / 128000 = 1 s
  assert.equal(durationFromAlignment(undefined, 16000), 1000);
});

test("synthesizeSpeech posts to with-timestamps and returns audio, duration, request id", async () => {
  const { impl, calls } = fakeFetch([{ status: 200, body: okBody }]);
  const result = await synthesizeSpeech({ text: "Moin", voiceId: "v1", apiKey: "k", previousText: "Intro", fetchImpl: impl, sleep: noSleep });
  assert.equal(result.audio.toString(), "fake-mp3-bytes");
  assert.equal(result.durationMs, 1234);
  assert.equal(result.requestId, "req-1");
  assert.ok(calls[0].url.includes("/v1/text-to-speech/v1/with-timestamps?output_format=mp3_44100_128"));
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.model_id, "eleven_multilingual_v2");
  assert.equal(body.previous_text, "Intro");
  assert.equal((calls[0].init.headers as Record<string, string>)["xi-api-key"], "k");
});

test("synthesizeSpeech retries 429 and 5xx, then succeeds", async () => {
  const { impl, calls } = fakeFetch([
    { status: 429, body: "slow down" },
    { status: 503, body: "busy" },
    { status: 200, body: okBody },
  ]);
  const result = await synthesizeSpeech({ text: "Moin", voiceId: "v1", apiKey: "k", fetchImpl: impl, sleep: noSleep });
  assert.equal(result.durationMs, 1234);
  assert.equal(calls.length, 3);
});

test("synthesizeSpeech does not retry a 400 and throws TtsError with status", async () => {
  const { impl, calls } = fakeFetch([{ status: 400, body: { detail: "bad voice" } }]);
  await assert.rejects(
    synthesizeSpeech({ text: "Moin", voiceId: "v1", apiKey: "k", fetchImpl: impl, sleep: noSleep }),
    (err: unknown) => err instanceof TtsError && err.status === 400,
  );
  assert.equal(calls.length, 1);
});
