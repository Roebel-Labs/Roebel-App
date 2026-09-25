// Europe/Berlin wall-clock helpers without a date library (Intl only).
export const CHAT_TZ = "Europe/Berlin";

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date: Date, tz = CHAT_TZ): ZonedParts {
  const parts = Object.fromEntries(formatter(tz).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour) % 24, minute: Number(parts.minute), second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
  };
}

/** Offset (ms) of `tz` relative to UTC at the given instant. */
function offsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The UTC instant at which the wall clock in `tz` shows the given local time. */
export function zonedTimeToUtc(
  year: number, month: number, day: number, hour: number, minute: number, tz = CHAT_TZ,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let ts = guess - offsetMs(new Date(guess), tz);
  // Re-check once: the offset may differ at the corrected instant (DST edges).
  const second = guess - offsetMs(new Date(ts), tz);
  if (second !== ts) ts = second;
  return new Date(ts);
}

/** UTC instant of local midnight (tz) of the day containing `date`. */
export function startOfZonedDay(date: Date, tz = CHAT_TZ): Date {
  const p = zonedParts(date, tz);
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, tz);
}
