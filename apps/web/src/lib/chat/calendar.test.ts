import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALENDAR_CONTEXT_MAX, applyPartStatus, calendarPromptBlock, formatEventWhen, sanitizeCalendarContext, toCalendarEventPart,
} from "./calendar";
import type { ChatPart } from "./types";

const NOW = new Date("2026-09-26T06:00:00Z"); // Sa 08:00 Berlin
const at = (h: number, dayOffset = 0) => new Date(NOW.getTime() + dayOffset * 86_400_000 + h * 3_600_000).toISOString();

test("sanitizeCalendarContext: absent → null, non-array → invalid", () => {
  assert.equal(sanitizeCalendarContext(undefined, NOW), null);
  assert.equal(sanitizeCalendarContext(null, NOW), null);
  assert.equal(sanitizeCalendarContext({}, NOW), "invalid");
});

test("sanitizeCalendarContext: drops invalid + out-of-window, sorts, clips", () => {
  const out = sanitizeCalendarContext([
    { title: "B", start: at(5), end: at(6) },
    { title: "A", start: at(1), end: at(2), location: "  Rathaus   Röbel ", extra: "x" },
    { title: "past", start: at(-10), end: at(-9) },
    { title: "far", start: at(0, 20), end: at(1, 20) },
    { title: "bad", start: "nope", end: at(1) },
    { title: "reversed", start: at(3), end: at(2) },
    { start: at(3), end: at(4) },
    "junk",
  ], NOW);
  assert.ok(Array.isArray(out));
  assert.deepEqual(out.map((e) => e.title), ["A", "(ohne Titel)", "B"]);
  assert.equal(out[0].location, "Rathaus Röbel");
  assert.equal("extra" in out[0], false);
});

test("sanitizeCalendarContext: caps at 50", () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ title: `E${i}`, start: at(i), end: at(i + 1) }));
  const out = sanitizeCalendarContext(many, NOW);
  assert.ok(Array.isArray(out));
  assert.equal(out.length, CALENDAR_CONTEXT_MAX);
  assert.equal(out[0].title, "E0");
});

test("formatEventWhen: Berlin time, same day and all-day", () => {
  assert.equal(formatEventWhen("2026-09-26T08:00:00Z", "2026-09-26T08:30:00Z"), "Sa., 26.09. 10:00–10:30");
  assert.equal(formatEventWhen("2026-09-25T22:00:00Z", "2026-09-26T22:00:00Z"), "Sa., 26.09. ganztägig");
});

test("calendarPromptBlock: no access vs empty vs events", () => {
  assert.match(calendarPromptBlock(null), /request_calendar_access/);
  assert.match(calendarPromptBlock([]), /keine Termine/);
  const block = calendarPromptBlock([{ title: "Zahnarzt", start: "2026-09-26T08:00:00Z", end: "2026-09-26T08:30:00Z", location: "Markt 1" }]);
  assert.match(block, /Kalender des Nutzers/);
  assert.match(block, /Sa\., 26\.09\. 10:00–10:30 · Zahnarzt · Markt 1/);
});

test("toCalendarEventPart: defaults end to +1h and validates", () => {
  const p = toCalendarEventPart({ title: "Lauftreff", start: "2026-09-27T09:00:00+02:00", location: "Hafen" });
  assert.ok(!("error" in p));
  assert.equal(p.status, "proposed");
  assert.equal(p.start, "2026-09-27T07:00:00.000Z");
  assert.equal(p.end, "2026-09-27T08:00:00.000Z");
  assert.equal(p.location, "Hafen");
  assert.ok("error" in toCalendarEventPart({ title: "", start: "2026-09-27T09:00:00+02:00" }));
  assert.ok("error" in toCalendarEventPart({ title: "x", start: "morgen" }));
  assert.ok("error" in toCalendarEventPart({ title: "x", start: "2026-09-27T09:00:00Z", end: "2026-09-27T08:00:00Z" }));
  assert.ok("error" in toCalendarEventPart({ title: "x", start: "2026-09-27T09:00:00Z", end: "2026-12-27T08:00:00Z" }));
});

test("applyPartStatus: calendar_event + integration transitions", () => {
  const parts: ChatPart[] = [
    { type: "text", text: "hi" },
    { type: "calendar_event", title: "T", start: "2026-09-27T07:00:00Z", end: "2026-09-27T08:00:00Z", status: "proposed" },
    { type: "integration", provider: "device_calendar", title: "Kalender", description: "d", status: "pending" },
  ];
  const added = applyPartStatus(parts, 1, "added");
  assert.ok(Array.isArray(added));
  assert.equal((added[1] as { status: string }).status, "added");
  assert.equal((parts[1] as { status: string }).status, "proposed", "input not mutated");
  const connected = applyPartStatus(parts, 2, "connected");
  assert.ok(Array.isArray(connected));
  assert.equal((connected[2] as { status: string }).status, "connected");
  assert.ok("error" in (applyPartStatus(parts, 0, "added") as object));
  assert.ok("error" in (applyPartStatus(parts, 1, "connected") as object));
  assert.ok("error" in (applyPartStatus(parts, 9, "added") as object));
  assert.ok("error" in (applyPartStatus(parts, 2, "added") as object));
});
