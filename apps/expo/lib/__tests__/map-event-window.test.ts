import { addDays, eventsUntil, localDateKey, withNextOccurrence } from '@/lib/map/event-window';
import type { EventWithCoordinates } from '@/lib/map/geojson';

const ev = (id: string, date: string, over: Partial<EventWithCoordinates> = {}) =>
  ({ id, date, time: null, is_cancelled: false, latitude: 1, longitude: 1, ...over }) as
    EventWithCoordinates;

describe('withNextOccurrence', () => {
  const today = '2026-10-10';

  it('drops events that are over', () => {
    expect(withNextOccurrence([ev('old', '2025-12-06')], [], today)).toEqual([]);
  });

  it('keeps an event happening today', () => {
    expect(withNextOccurrence([ev('t', today)], [], today).map((e) => e.id)).toEqual(['t']);
  });

  it('moves a recurring event to its next date', () => {
    const out = withNextOccurrence(
      [ev('course', '2026-08-27')],
      [
        { event_id: 'course', date: '2026-09-03' },
        { event_id: 'course', date: '2026-10-15' },
        { event_id: 'course', date: '2026-10-22' },
      ],
      today
    );
    expect(out.map((e) => e.date)).toEqual(['2026-10-15']);
  });

  it('skips cancelled dates and cancelled events', () => {
    const out = withNextOccurrence(
      [ev('a', '2026-08-01'), ev('b', '2026-10-20', { is_cancelled: true })],
      [
        { event_id: 'a', date: '2026-10-12', is_cancelled: true },
        { event_id: 'a', date: '2026-10-19' },
      ],
      today
    );
    expect(out.map((e) => [e.id, e.date])).toEqual([['a', '2026-10-19']]);
  });

  it('sorts soonest first', () => {
    const out = withNextOccurrence([ev('late', '2026-11-01'), ev('soon', '2026-10-11')], [], today);
    expect(out.map((e) => e.id)).toEqual(['soon', 'late']);
  });
});

describe('eventsUntil', () => {
  it('keeps events up to and including the last day', () => {
    const out = eventsUntil([ev('in', '2026-10-24'), ev('out', '2026-10-25')], '2026-10-24');
    expect(out.map((e) => e.id)).toEqual(['in']);
  });
});

describe('date keys', () => {
  it('formats local dates and adds days across a month end', () => {
    const d = new Date(2026, 9, 31, 12);
    expect(localDateKey(d)).toBe('2026-10-31');
    expect(localDateKey(addDays(d, 1))).toBe('2026-11-01');
  });
});
