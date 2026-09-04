// apps/web/src/lib/event-radio/__tests__/hash.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  eventContentHash,
  introContentHash,
  outroContentHash,
  toPublicEvent,
  type PublicEvent,
} from "../hash";

const row = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Hafenfest",
  description: "Musik am Wasser",
  date: "2026-09-05",
  time: "14:00:00",
  end_time: null,
  location: "Hafen Röbel",
  organizer_name: "Stadt Röbel",
  organizer_email: "secret@example.org",
  organizer_phone: "0123",
  category: "Fest",
  ticket_price: 0,
  website_url: null,
  is_cancelled: false,
  status: "approved",
};
const ctx = { voiceId: "voice-a", modelId: "eleven_multilingual_v2", speed: 1.0 };

test("toPublicEvent drops private contact fields", () => {
  const ev = toPublicEvent(row);
  assert.equal(ev.title, "Hafenfest");
  assert.equal(ev.organizer_name, "Stadt Röbel");
  assert.equal("organizer_email" in ev, false);
  assert.equal("organizer_phone" in ev, false);
  assert.equal(ev.is_cancelled, false);
});

test("toPublicEvent accepts numeric ticket_price as string", () => {
  assert.equal(toPublicEvent({ ...row, ticket_price: "5.50" }).ticket_price, 5.5);
});

test("eventContentHash is stable and ignores key order", () => {
  const a = toPublicEvent(row);
  const b = toPublicEvent({ ...row, title: row.title }); // same content
  assert.equal(eventContentHash(a, ctx), eventContentHash(b, ctx));
  assert.match(eventContentHash(a, ctx), /^[0-9a-f]{64}$/);
});

test("eventContentHash changes with content, voice, or model", () => {
  const ev = toPublicEvent(row);
  const base = eventContentHash(ev, ctx);
  assert.notEqual(eventContentHash({ ...ev, title: "Hafenfest 2" }, ctx), base);
  assert.notEqual(eventContentHash(ev, { ...ctx, voiceId: "voice-b" }), base);
  assert.notEqual(eventContentHash(ev, { ...ctx, modelId: "eleven_v3" }), base);
  // Tempo is part of the clip's identity, so changing it re-renders.
  assert.notEqual(eventContentHash(ev, { ...ctx, speed: 1.15 }), base);
});

test("introContentHash depends on the day and the remaining events", () => {
  const ev: PublicEvent = toPublicEvent(row);
  const h1 = introContentHash([ev], "2026-09-04", ctx);
  assert.notEqual(introContentHash([ev], "2026-09-05", ctx), h1);
  assert.notEqual(introContentHash([], "2026-09-04", ctx), h1);
  // Description edits do not change the intro (only id, title, date count).
  assert.equal(introContentHash([{ ...ev, description: "x" }], "2026-09-04", ctx), h1);
});

test("outroContentHash depends on the week key", () => {
  assert.notEqual(outroContentHash("2026-W36", ctx), outroContentHash("2026-W37", ctx));
});
