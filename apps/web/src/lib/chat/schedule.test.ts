import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSchedule, nextRunAt, parseGermanSchedule, validateSchedule } from "./schedule";

test("daily: later today, else tomorrow (CEST)", () => {
  const s = validateSchedule({ kind: "daily", hour: 7, minute: 30 })!;
  // 2026-09-25 05:00 Berlin = 03:00Z → today 07:30 Berlin = 05:30Z
  assert.equal(nextRunAt(s, new Date("2026-09-25T03:00:00Z")).toISOString(), "2026-09-25T05:30:00.000Z");
  // exactly at run time → next day
  assert.equal(nextRunAt(s, new Date("2026-09-25T05:30:00Z")).toISOString(), "2026-09-26T05:30:00.000Z");
});

test("weekly: next matching weekday in Berlin time", () => {
  const monday8 = validateSchedule({ kind: "weekly", weekday: 1, hour: 8, minute: 0 })!;
  // Friday 2026-09-25 → Monday 2026-09-28 08:00 CEST = 06:00Z
  assert.equal(nextRunAt(monday8, new Date("2026-09-25T10:00:00Z")).toISOString(), "2026-09-28T06:00:00.000Z");
  const friday = validateSchedule({ kind: "weekly", weekday: 5, hour: 9, minute: 0 })!;
  // Friday after 09:00 → next Friday
  assert.equal(nextRunAt(friday, new Date("2026-09-25T08:00:00Z")).toISOString(), "2026-10-02T07:00:00.000Z");
});

test("handles the DST switch (CEST → CET on 2026-10-25)", () => {
  const daily = validateSchedule({ kind: "daily", hour: 7, minute: 0 })!;
  // 2026-10-24 12:00Z → 2026-10-25 07:00 CET = 06:00Z
  assert.equal(nextRunAt(daily, new Date("2026-10-24T12:00:00Z")).toISOString(), "2026-10-25T06:00:00.000Z");
});

test("late-evening UTC counts as the next Berlin day", () => {
  const daily = validateSchedule({ kind: "daily", hour: 0, minute: 30 })!;
  // 2026-09-25 23:10Z = 26th 01:10 Berlin → next 00:30 Berlin is 27th = 26th 22:30Z
  assert.equal(nextRunAt(daily, new Date("2026-09-25T23:10:00Z")).toISOString(), "2026-09-26T22:30:00.000Z");
});

test("validateSchedule rejects bad input", () => {
  assert.equal(validateSchedule({ kind: "weekly", hour: 8, minute: 0 }), null);
  assert.equal(validateSchedule({ kind: "daily", hour: 24, minute: 0 }), null);
  assert.equal(validateSchedule({ kind: "hourly", hour: 1, minute: 0 }), null);
  assert.equal(validateSchedule(null), null);
  assert.deepEqual(validateSchedule({ kind: "daily", hour: 6 }), { kind: "daily", hour: 6, minute: 0, tz: "Europe/Berlin" });
});

test("parseGermanSchedule: weekly phrases", () => {
  assert.deepEqual(parseGermanSchedule("jeden Sonntag um 8:41"), { kind: "weekly", weekday: 0, hour: 8, minute: 41, tz: "Europe/Berlin" });
  assert.deepEqual(parseGermanSchedule("Montags 18 Uhr"), { kind: "weekly", weekday: 1, hour: 18, minute: 0, tz: "Europe/Berlin" });
  assert.deepEqual(parseGermanSchedule("immer freitags um 7.05"), { kind: "weekly", weekday: 5, hour: 7, minute: 5, tz: "Europe/Berlin" });
  assert.deepEqual(parseGermanSchedule("jeden Samstag abends um 8"), { kind: "weekly", weekday: 6, hour: 20, minute: 0, tz: "Europe/Berlin" });
  assert.deepEqual(parseGermanSchedule("sonnabends um halb 10"), { kind: "weekly", weekday: 6, hour: 9, minute: 30, tz: "Europe/Berlin" });
  assert.deepEqual(parseGermanSchedule("Mittwoch morgen"), { kind: "weekly", weekday: 3, hour: 8, minute: 0, tz: "Europe/Berlin" });
});

test("parseGermanSchedule: daily phrases", () => {
  assert.deepEqual(parseGermanSchedule("täglich um 7:30"), { kind: "daily", hour: 7, minute: 30, tz: "Europe/Berlin" });
  assert.deepEqual(parseGermanSchedule("jeden Morgen um viertel nach 6"), { kind: "daily", hour: 6, minute: 15, tz: "Europe/Berlin" });
  assert.deepEqual(parseGermanSchedule("jeden Abend um viertel vor 9"), { kind: "daily", hour: 20, minute: 45, tz: "Europe/Berlin" });
  assert.deepEqual(parseGermanSchedule("jeden Tag um 12 Uhr 30"), { kind: "daily", hour: 12, minute: 30, tz: "Europe/Berlin" });
  assert.deepEqual(parseGermanSchedule("jeden Abend"), { kind: "daily", hour: 18, minute: 0, tz: "Europe/Berlin" });
});

test("parseGermanSchedule: rejects unclear phrases", () => {
  assert.equal(parseGermanSchedule("morgen um 8"), null);
  assert.equal(parseGermanSchedule("montags und freitags um 8"), null);
  assert.equal(parseGermanSchedule("irgendwann"), null);
  assert.equal(parseGermanSchedule("jeden Sonntag"), null);
});

test("formatSchedule: German label", () => {
  assert.equal(formatSchedule({ kind: "weekly", weekday: 0, hour: 8, minute: 41, tz: "Europe/Berlin" }), "Sonntags · 08:41");
  assert.equal(formatSchedule({ kind: "daily", hour: 7, minute: 5, tz: "Europe/Berlin" }), "Täglich · 07:05");
});

test("parse → nextRunAt: Sunday 08:41 from Saturday", () => {
  const s = parseGermanSchedule("jeden Sonntag um 8:41")!;
  // Sat 2026-09-26 12:00Z → Sun 2026-09-27 08:41 CEST = 06:41Z
  assert.equal(nextRunAt(s, new Date("2026-09-26T12:00:00Z")).toISOString(), "2026-09-27T06:41:00.000Z");
});
