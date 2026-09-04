// apps/web/src/lib/event-radio/__tests__/storage.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { objectPathFromPublicUrl, segmentObjectPath } from "../storage";

test("segmentObjectPath is content addressed", () => {
  assert.equal(
    segmentObjectPath("2026-W36", "event", "abc", "0123456789abcdef"),
    "radio/2026-W36/event-abc-01234567.mp3",
  );
});

test("objectPathFromPublicUrl extracts the bucket-relative path", () => {
  const url = "https://wwbeqhkslxdxhktqzqti.supabase.co/storage/v1/object/public/story-audio/radio/2026-W36/intro-2026-09-04-deadbeef.mp3";
  assert.equal(objectPathFromPublicUrl(url), "radio/2026-W36/intro-2026-09-04-deadbeef.mp3");
  assert.equal(objectPathFromPublicUrl("https://example.org/other.mp3"), null);
});
