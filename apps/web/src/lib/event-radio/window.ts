// apps/web/src/lib/event-radio/window.ts
// Pure date helpers for the Wochen-Radio generator. No I/O, no Next imports,
// so they run under `tsx --test`.

const DAY_MS = 86_400_000;

export type WeekWindow = { start: string; end: string; weekKey: string };

/** Today's calendar date in Europe/Berlin as YYYY-MM-DD. */
export function berlinToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00Z`);
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateKey: string, days: number): string {
  return toDateKey(new Date(parseDateKey(dateKey).getTime() + days * DAY_MS));
}

/**
 * Mirrors apps/expo `fetchThisWeekEvents`: from today through the next
 * Sunday. On a Sunday the formula yields the following Sunday (8 days).
 */
export function weekWindow(todayKey: string): WeekWindow {
  const day = parseDateKey(todayKey).getUTCDay();
  const daysUntilSunday = (7 - day) % 7 || 7;
  return {
    start: todayKey,
    end: addDays(todayKey, daysUntilSunday),
    weekKey: isoWeekKey(todayKey),
  };
}

/** ISO-8601 week key, e.g. 2026-W36. */
export function isoWeekKey(dateKey: string): string {
  const d = parseDateKey(dateKey);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function previousWeekKey(dateKey: string): string {
  return isoWeekKey(addDays(dateKey, -7));
}

/** "Sonntag, 6. September", used as a spoken-date hint in prompts. */
export function germanLongDate(dateKey: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(parseDateKey(dateKey));
}

export function germanWeekday(dateKey: string): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "long" }).format(
    parseDateKey(dateKey),
  );
}
