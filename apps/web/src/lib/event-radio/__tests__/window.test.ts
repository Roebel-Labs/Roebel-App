// apps/web/src/lib/event-radio/__tests__/window.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  berlinToday,
  germanLongDate,
  germanWeekday,
  isoWeekKey,
  previousWeekKey,
  weekWindow,
} from "../window";

test("berlinToday uses the Berlin calendar date, not UTC", () => {
  // 23:30 UTC on Sep 4 is already Sep 5 in Berlin (UTC+2 in summer).
  assert.equal(berlinToday(new Date("2026-09-04T23:30:00Z")), "2026-09-05");
  assert.equal(berlinToday(new Date("2026-09-04T10:00:00Z")), "2026-09-04");
});

test("weekWindow mirrors the app: today through next Sunday", () => {
  // 2026-09-04 is a Friday.
  assert.deepEqual(weekWindow("2026-09-04"), {
    start: "2026-09-04",
    end: "2026-09-06",
    weekKey: "2026-W36",
  });
});

test("weekWindow on a Sunday reaches the following Sunday (app formula)", () => {
  assert.equal(weekWindow("2026-09-06").end, "2026-09-13");
});

test("isoWeekKey handles year boundaries", () => {
  assert.equal(isoWeekKey("2026-09-04"), "2026-W36");
  assert.equal(isoWeekKey("2026-01-01"), "2026-W01");
  assert.equal(isoWeekKey("2027-01-01"), "2026-W53");
});

test("previousWeekKey and addDays", () => {
  assert.equal(previousWeekKey("2026-09-04"), "2026-W35");
  assert.equal(addDays("2026-09-04", -3), "2026-09-01");
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
});

test("German date words for prompts", () => {
  assert.equal(germanWeekday("2026-09-06"), "Sonntag");
  assert.equal(germanLongDate("2026-09-06"), "Sonntag, 6. September");
});
