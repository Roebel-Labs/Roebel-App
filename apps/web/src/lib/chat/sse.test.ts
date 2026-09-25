import { test } from "node:test";
import assert from "node:assert/strict";
import { createSSEStream, encodeChatEvent, encodeSSE } from "./sse";
import { SplitStreamer, splitBubbles } from "./split";

test("encodeSSE writes event + single-line JSON data + blank line", () => {
  assert.equal(encodeSSE("delta", { messageId: "m", text: "a\nb" }), 'event: delta\ndata: {"messageId":"m","text":"a\\nb"}\n\n');
  assert.equal(encodeChatEvent({ event: "error", data: { code: "quota", message: "x" } }), 'event: error\ndata: {"code":"quota","message":"x"}\n\n');
});

test("createSSEStream emits events in order and closes", async () => {
  const stream = createSSEStream(async (emit) => {
    emit({ event: "bot_start", data: { botId: "b", messageId: "m" } });
    emit({ event: "delta", data: { messageId: "m", text: "Hi" } });
  }, { heartbeatMs: 60_000 });
  const text = await new Response(stream).text();
  assert.equal(text, 'event: bot_start\ndata: {"botId":"b","messageId":"m"}\n\nevent: delta\ndata: {"messageId":"m","text":"Hi"}\n\n');
});

test("createSSEStream turns a producer failure into an error event", async () => {
  const orig = console.error;
  console.error = () => {};
  try {
    const text = await new Response(createSSEStream(async () => { throw new Error("boom"); })).text();
    assert.match(text, /^event: error\ndata: \{"code":"internal"/);
  } finally {
    console.error = orig;
  }
});

function run(chunks: string[]) {
  const s = new SplitStreamer();
  const bubbles: string[] = [""];
  for (const ev of [...chunks.flatMap((c) => s.push(c)), ...s.end()]) {
    if (ev.type === "break") bubbles.push("");
    else bubbles[bubbles.length - 1] += ev.text;
  }
  return bubbles;
}

test("SplitStreamer splits on the marker even across chunk boundaries", () => {
  assert.deepEqual(run(["Hallo!\n---sp", "lit---\nWie geht's?"]), ["Hallo!\n", "\nWie geht's?"]);
  assert.deepEqual(run(["a---split---b---split---c---split---d"]), ["a", "b", "c\n\nd"]);
  assert.deepEqual(run(["no marker - just --- dashes"]), ["no marker - just --- dashes"]);
  assert.deepEqual(run(["ends with ---spl"]), ["ends with ---spl"]);
});

test("splitBubbles trims and caps", () => {
  assert.deepEqual(splitBubbles("Hi\n---split---\nDu?", 2), ["Hi", "Du?"]);
  assert.deepEqual(splitBubbles("a---split---b---split---c", 2), ["a", "b\n\nc"]);
  assert.deepEqual(splitBubbles("  nur eins  "), ["nur eins"]);
});
