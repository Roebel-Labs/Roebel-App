import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChatPart } from "../types";
import { livePartKey, patchImagePart, upsertLivePart } from "./parts";

const gen = (imageId: string, over: Partial<Extract<ChatPart, { type: "generated_image" }>> = {}): ChatPart => ({
  type: "generated_image", imageId, status: "generating", prompt: "Ein Boot", width: 1024, height: 1024, ...over,
});

test("livePartKey identifies generated images, approvals and tasks", () => {
  assert.equal(livePartKey(gen("a")), "generated_image:a");
  assert.equal(livePartKey({ type: "text", text: "x" }), null);
  assert.equal(livePartKey({ type: "task", taskId: "t", title: "x", status: "running", steps: [] }), "task:t");
});

test("upsertLivePart replaces by imageId, appends new ones and never touches plain parts", () => {
  const parts: ChatPart[] = [{ type: "text", text: "hi" }, gen("a")];
  assert.equal(upsertLivePart(parts, gen("a", { status: "done", url: "https://x/a.png" })), true);
  assert.equal(parts.length, 2);
  assert.equal((parts[1] as { status: string }).status, "done");
  assert.equal(upsertLivePart(parts, gen("b")), false);
  assert.equal(upsertLivePart(parts, { type: "text", text: "hi" }), false);
  assert.equal(parts.length, 4);
});

test("patchImagePart patches only the matching image and keeps the rest untouched", () => {
  const parts: ChatPart[] = [{ type: "text", text: "hi" }, gen("a"), gen("b")];
  const hit = patchImagePart(parts, "b", { status: "done", url: "https://x/b.png", width: 800, height: 1000 });
  assert.ok(hit);
  assert.deepEqual(hit.part, { type: "generated_image", imageId: "b", status: "done", prompt: "Ein Boot", url: "https://x/b.png", width: 800, height: 1000 });
  assert.equal(hit.parts[1], parts[1]);
  assert.equal((parts[2] as { status: string }).status, "generating"); // input not mutated
  assert.equal(patchImagePart(parts, "missing", { status: "done" }), null);
});

test("patchImagePart: failed drops the url, done drops a stale error", () => {
  const failed = patchImagePart([gen("a", { url: "https://x/a.png" })], "a", { status: "failed", error: "Zu lange." });
  assert.equal(failed?.part.url, undefined);
  assert.equal(failed?.part.error, "Zu lange.");
  const done = patchImagePart([gen("a", { status: "failed", error: "Zu lange." })], "a", { status: "done", url: "https://x/a.png" });
  assert.equal(done?.part.error, undefined);
});
