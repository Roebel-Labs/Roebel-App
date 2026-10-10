/**
 * Which events belong on the map right now.
 *
 * `events.date` is only the FIRST date of an event — a weekly course that
 * started in August still runs in October through its `event_dates` rows.
 * So every event is moved to its next occurrence first; events with none
 * left are over and stay off the map.
 */
import type { EventWithCoordinates } from './geojson';

/** How far ahead the default map looks. "Ausgehen" shows everything upcoming. */
export const MAP_EVENT_WINDOW_DAYS = 14;

export type EventOccurrence = { event_id: string; date: string; is_cancelled?: boolean | null };

/** YYYY-MM-DD in the device's local time zone (events carry local dates). */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * Upcoming, non-cancelled events, each with `date` set to its next
 * occurrence on or after `today`, sorted soonest first.
 */
export function withNextOccurrence(
  events: EventWithCoordinates[],
  occurrences: EventOccurrence[],
  today: string
): EventWithCoordinates[] {
  const next = new Map<string, string>();
  for (const o of occurrences) {
    if (o.is_cancelled || o.date < today) continue;
    const current = next.get(o.event_id);
    if (!current || o.date < current) next.set(o.event_id, o.date);
  }

  const out: EventWithCoordinates[] = [];
  for (const e of events) {
    if (e.is_cancelled) continue;
    const candidates = [e.date >= today ? e.date : null, next.get(e.id) ?? null].filter(
      (d): d is string => d != null
    );
    if (candidates.length === 0) continue;
    const date = candidates.sort()[0];
    out.push(date === e.date ? e : { ...e, date });
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')
  );
}

/** Events whose (next) date falls within `[today, lastDay]`, both inclusive. */
export function eventsUntil(
  events: EventWithCoordinates[],
  lastDay: string
): EventWithCoordinates[] {
  return events.filter((e) => e.date <= lastDay);
}
