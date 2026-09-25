// Routine schedules (spec §3.3 chat_routines.schedule) → next run instant.
import type { RoutineSchedule } from "./types";
import { CHAT_TZ, zonedParts, zonedTimeToUtc } from "./time";

export function validateSchedule(input: unknown): RoutineSchedule | null {
  if (!input || typeof input !== "object") return null;
  const s = input as Record<string, unknown>;
  const kind = s.kind;
  const hour = Number(s.hour);
  const minute = Number(s.minute ?? 0);
  if (kind !== "weekly" && kind !== "daily") return null;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (kind === "weekly") {
    const weekday = Number(s.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
    return { kind, weekday, hour, minute, tz: CHAT_TZ };
  }
  return { kind, hour, minute, tz: CHAT_TZ };
}

/** First instant strictly after `from` matching the schedule in Europe/Berlin. */
export function nextRunAt(schedule: RoutineSchedule, from: Date = new Date()): Date {
  const tz = schedule.tz || CHAT_TZ;
  const today = zonedParts(from, tz);
  // Walk local calendar days; Date.UTC handles month/year rollover.
  for (let offset = 0; offset <= 8; offset++) {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const weekday = d.getUTCDay();
    if (schedule.kind === "weekly" && weekday !== schedule.weekday) continue;
    const candidate = zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), schedule.hour, schedule.minute, tz);
    if (candidate.getTime() > from.getTime()) return candidate;
  }
  // Unreachable for valid schedules; fall back to one day later.
  return new Date(from.getTime() + 24 * 60 * 60 * 1000);
}
