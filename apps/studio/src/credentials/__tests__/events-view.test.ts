import { describe, expect, it } from 'vitest';
import { eventRows } from '../events-view';
import type { EventBadgeListItem } from '../types';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const ev = (eventId: string, date: string, p: Partial<EventBadgeListItem> = {}): EventBadgeListItem => ({
  eventId,
  title: `Fest ${eventId}`,
  date,
  badge: null,
  attendees: 0,
  issued: 0,
  accepted: 0,
  ...p,
});
const badge = { typeId: '0x01', name: 'Dabei', chain: 'onchain' as const, auto: false };

describe('eventRows', () => {
  it('lists upcoming events first (soonest first), then past ones (newest first)', () => {
    const rows = eventRows(
      [ev('old', '2026-10-01'), ev('next-month', '2026-12-20'), ev('today', '2026-11-18'), ev('last-week', '2026-11-11'), ev('tomorrow', '2026-11-19')],
      NOW,
    );
    expect(rows.map((r) => r.eventId)).toEqual(['today', 'tomorrow', 'next-month', 'last-week', 'old']);
    expect(rows[0].title).toBe('Fest today');
    expect(rows[0].when).toMatch(/2026/);
  });

  it('builds the count line', () => {
    const [r] = eventRows([ev('a', '2026-11-11', { badge, attendees: 40, issued: 32, accepted: 20 })], NOW);
    expect(r.line).toBe('40 Teilnehmende · 32 eingeladen · 20 angenommen');
  });

  it('has the three primary states of the dashboard panel', () => {
    const [none, some, all] = eventRows(
      [
        ev('a', '2026-11-20', { attendees: 5 }),
        ev('b', '2026-11-21', { badge, attendees: 40, issued: 32 }),
        ev('c', '2026-11-22', { badge, attendees: 12, issued: 12 }),
      ],
      NOW,
    );
    expect(none.primary).toEqual({ label: 'Abzeichen für Teilnehmende einrichten', disabled: false });
    expect(some.primary).toEqual({ label: 'Abzeichen vergeben (8)', disabled: false });
    expect(all.primary).toEqual({ label: 'Alle haben ihr Abzeichen', disabled: true });
  });
});
