import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPEECH_VOICES, buildMusicPayload, buildSpeechPayload, buildVideoPayload, decodeJobId, encodeJobId,
  markSyntheticMp3, parseMediaJob,
} from "./kie-media";

test("speech payload clamps speed and never sends a language code", () => {
  const p = buildSpeechPayload({ text: "Moin", voice: "emma", speed: 3 }) as { model: string; input: Record<string, unknown> };
  assert.equal(p.model, "elevenlabs/text-to-speech-multilingual-v2");
  assert.equal(p.input.voice, SPEECH_VOICES.emma);
  assert.equal(p.input.speed, 1.2);
  assert.equal(p.input.language_code, "");
});

test("music payload uses simple mode", () => {
  const p = buildMusicPayload({ prompt: "Shanty", instrumental: true }) as { input: Record<string, unknown> };
  assert.equal(p.input.custom_mode, false);
  assert.equal(p.input.instrumental, true);
});

test("video payload switches model with a source image and keeps the safety checks on", () => {
  const text = buildVideoPayload({ prompt: "Hafen", aspect: "9:16" }) as { model: string; input: Record<string, unknown> };
  assert.equal(text.model, "bytedance/v1-lite-text-to-video");
  assert.equal(text.input.aspect_ratio, "9:16");
  assert.equal(text.input.duration, "5");
  const image = buildVideoPayload({ prompt: "Hafen", imageUrl: "https://x/y.png" }) as { model: string; input: Record<string, unknown> };
  assert.equal(image.model, "bytedance/v1-lite-image-to-video");
  assert.equal(image.input.image_url, "https://x/y.png");
  assert.equal("aspect_ratio" in image.input, false);
  assert.equal(image.input.enable_safety_checker, true);
});

test("parseMediaJob reads resultUrls and credits", () => {
  const job = parseMediaJob({
    data: { state: "success", resultJson: JSON.stringify({ resultUrls: ["https://a/b.mp4", "http://insecure/x"] }), creditsConsumed: 50 },
  });
  assert.deepEqual(job, { state: "success", urls: ["https://a/b.mp4"], credits: 50 });
});

test("parseMediaJob reads music tracks from response.data", () => {
  const job = parseMediaJob({
    data: { state: "success", resultJson: "", response: { data: [{ audio_url: "https://a/1.mp3" }, { audio_url: "https://a/2.mp3" }] } },
  });
  assert.deepEqual(job, { state: "success", urls: ["https://a/1.mp3", "https://a/2.mp3"], credits: null });
});

test("parseMediaJob: success without a url is a failure, queue states are pending", () => {
  assert.equal(parseMediaJob({ data: { state: "success", resultJson: "{}" } }).state, "fail");
  for (const state of ["waiting", "queuing", "generating"]) {
    assert.equal(parseMediaJob({ data: { state } }).state, "pending");
  }
  assert.deepEqual(parseMediaJob({ data: { state: "fail", failMsg: "nope" } }), { state: "fail", error: "nope" });
});

test("job ids round-trip and reject anything else", () => {
  assert.deepEqual(decodeJobId(encodeJobId("video", "task_12345678")), { kind: "video", taskId: "task_12345678" });
  assert.equal(decodeJobId("image:task_12345678"), null);
  assert.equal(decodeJobId("video:../x"), null);
});

test("markSyntheticMp3 prepends an ID3 tag and replaces an existing one", () => {
  const audio = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3]);
  const first = markSyntheticMp3(audio, "kie.ai test");
  assert.equal(first.marked, true);
  assert.equal(new TextDecoder("latin1").decode(first.bytes.subarray(0, 3)), "ID3");
  assert.match(new TextDecoder("latin1").decode(first.bytes), /AI_GENERATED/);
  assert.deepEqual([...first.bytes.subarray(first.bytes.length - audio.length)], [...audio]);
  const second = markSyntheticMp3(first.bytes, "kie.ai test");
  assert.equal(second.bytes.length, first.bytes.length);
});

test("markSyntheticMp3 leaves non-MP3 bytes alone", () => {
  const other = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]);
  const res = markSyntheticMp3(other, "x");
  assert.equal(res.marked, false);
  assert.equal(res.bytes, other);
});
