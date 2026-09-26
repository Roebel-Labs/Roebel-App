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

// ---- German natural language → schedule ------------------------------------------

const WEEKDAY_WORDS: [RegExp, number][] = [
  [/\bsonntags?\b/, 0],
  [/\bmontags?\b/, 1],
  [/\bdienstags?\b/, 2],
  [/\bmittwochs?\b/, 3],
  [/\bdonnerstags?\b/, 4],
  [/\bfreitags?\b/, 5],
  [/\b(?:samstags?|sonnabends?)\b/, 6],
];

const DAILY_RE = /\b(?:t(?:ä|ae)glich|jeden\s+(?:tag|morgen|abend|mittag|nachmittag|vormittag)|jede\s+nacht|allmorgendlich|morgens|abends|mittags|nachmittags|vormittags)\b/;
const PM_RE = /\b(?:abends?|nachmittags?)\b/;
const DEFAULT_HOURS: [RegExp, number][] = [
  [/\b(?:morgens?|fr(?:ü|ue)h)\b/, 8],
  [/\bvormittags?\b/, 10],
  [/\bmittags?\b/, 12],
  [/\bnachmittags?\b/, 15],
  [/\babends?\b/, 18],
];

/** Hour + minute from phrases like "8:41", "8.41 Uhr", "um 18 Uhr", "halb 8", "viertel nach 7". */
function parseGermanTime(s: string): { hour: number; minute: number } | null {
  let m = s.match(/\b([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)\b/);
  if (m) return { hour: Number(m[1]), minute: Number(m[2]) };
  m = s.match(/\bhalb\s+([01]?\d|2[0-4])\b/);
  if (m) return { hour: (Number(m[1]) + 23) % 24, minute: 30 };
  m = s.match(/\bviertel\s+nach\s+([01]?\d|2[0-3])\b/);
  if (m) return { hour: Number(m[1]), minute: 15 };
  m = s.match(/\bviertel\s+vor\s+([01]?\d|2[0-4])\b/);
  if (m) return { hour: (Number(m[1]) + 23) % 24, minute: 45 };
  m = s.match(/\b([01]?\d|2[0-3])\s*uhr(?:\s+([0-5]?\d))?\b/);
  if (m) return { hour: Number(m[1]), minute: m[2] ? Number(m[2]) : 0 };
  m = s.match(/\bum\s+([01]?\d|2[0-3])\b(?!\s*[:.]?\d)/);
  if (m) return { hour: Number(m[1]), minute: 0 };
  return null;
}

/**
 * Parses German schedule phrases ("jeden Sonntag um 8:41", "täglich um halb 8",
 * "montags 18 Uhr", "jeden Abend") into a schedule in Europe/Berlin.
 * Returns null when no weekday/daily cue or no time can be recognised.
 */
export function parseGermanSchedule(text: string): RoutineSchedule | null {
  const s = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const weekdays = WEEKDAY_WORDS.filter(([re]) => re.test(s)).map(([, d]) => d);
  if (weekdays.length > 1) return null;
  const daily = weekdays.length === 0 && DAILY_RE.test(s);
  if (!weekdays.length && !daily) return null;

  let time = parseGermanTime(s);
  if (time && PM_RE.test(s) && time.hour < 12) time = { hour: time.hour + 12, minute: time.minute };
  if (!time) {
    const hit = DEFAULT_HOURS.find(([re]) => re.test(s));
    if (!hit) return null;
    time = { hour: hit[1], minute: 0 };
  }
  return weekdays.length
    ? { kind: "weekly", weekday: weekdays[0], hour: time.hour, minute: time.minute, tz: CHAT_TZ }
    : { kind: "daily", hour: time.hour, minute: time.minute, tz: CHAT_TZ };
}

const WEEKDAY_PLURAL = ["Sonntags", "Montags", "Dienstags", "Mittwochs", "Donnerstags", "Freitags", "Samstags"];

/** "Sonntags · 08:41" / "Täglich · 07:30". */
export function formatSchedule(schedule: RoutineSchedule): string {
  const hh = String(schedule.hour).padStart(2, "0");
  const mm = String(schedule.minute).padStart(2, "0");
  const day = schedule.kind === "weekly" ? WEEKDAY_PLURAL[schedule.weekday ?? 0] ?? "Wöchentlich" : "Täglich";
  return `${day} · ${hh}:${mm}`;
}
