import { partitionExploreEvents, selectHeroEvents } from '../explore-events';
import type { EventRecord } from '../types';

// Wednesday 2026-09-16 (ISO week Mon 14 → Sun 20).
const NOW = new Date(2026, 8, 16, 12, 0, 0);

function ev(partial: Partial<EventRecord> & { id: string; date: string }): EventRecord {
  return {
    title: partial.id,
    description: null,
    time: null,
    end_time: null,
    location: 'Marktplatz 1, 17207 Röbel/Müritz',
    organizer_name: 'Test',
    organizer_email: '',
    organizer_phone: null,
    category: null,
    status: 'approved',
    image_url: null,
    audio_url: null,
    website_url: null,
    ticket_price: null,
    max_attendees: null,
    created_at: '',
    updated_at: '',
    is_popular: null,
    is_cancelled: null,
    is_recurring: null,
    latitude: null,
    longitude: null,
    place_id: null,
    formatted_address: null,
    address_components: null,
    ...partial,
  } as EventRecord;
}

const ids = (list: EventRecord[]) => list.map((e) => e.id);

describe('partitionExploreEvents', () => {
  it('puts a Röbel event later this week into thisWeek only', () => {
    const { thisWeek, later, nearby } = partitionExploreEvents(
      [ev({ id: 'a', date: '2026-09-19' })],
      NOW
    );
    expect(ids(thisWeek)).toEqual(['a']);
    expect(ids(later)).toEqual([]);
    expect(ids(nearby)).toEqual([]);
  });

  it('puts a Röbel event next week into later only', () => {
    const { thisWeek, later, nearby } = partitionExploreEvents(
      [ev({ id: 'b', date: '2026-09-23' })],
      NOW
    );
    expect(ids(thisWeek)).toEqual([]);
    expect(ids(later)).toEqual(['b']);
    expect(ids(nearby)).toEqual([]);
  });

  it('lists an out-of-town event under nearby, and under later when it is not this week', () => {
    const { thisWeek, later, nearby } = partitionExploreEvents(
      [
        ev({ id: 'waren-thisweek', date: '2026-09-18', location: 'Waren' }),
        ev({ id: 'waren-later', date: '2026-10-02', location: 'Waren' }),
      ],
      NOW
    );
    expect(ids(thisWeek)).toEqual([]);
    expect(ids(nearby)).toEqual(['waren-thisweek', 'waren-later']);
    expect(ids(later)).toEqual(['waren-later']);
  });

  it('keeps popular events out of nearby and later but inside thisWeek', () => {
    const { thisWeek, later, nearby } = partitionExploreEvents(
      [
        ev({ id: 'pop-roebel', date: '2026-09-17', is_popular: true }),
        ev({ id: 'pop-waren', date: '2026-10-05', is_popular: true, location: 'Waren' }),
      ],
      NOW
    );
    expect(ids(thisWeek)).toEqual(['pop-roebel']);
    expect(ids(later)).toEqual([]);
    expect(ids(nearby)).toEqual([]);
  });

  it('drops past events from every bucket (restored cache from a previous day)', () => {
    const { thisWeek, later, nearby } = partitionExploreEvents(
      [
        ev({ id: 'yesterday', date: '2026-09-15' }),
        ev({ id: 'yesterday-waren', date: '2026-09-15', location: 'Waren' }),
      ],
      NOW
    );
    expect(ids(thisWeek)).toEqual([]);
    expect(ids(later)).toEqual([]);
    expect(ids(nearby)).toEqual([]);
  });

  it('counts today as a future event', () => {
    const { thisWeek } = partitionExploreEvents([ev({ id: 'today', date: '2026-09-16' })], NOW);
    expect(ids(thisWeek)).toEqual(['today']);
  });

  it('preserves input order inside each bucket', () => {
    const { later } = partitionExploreEvents(
      [ev({ id: 'x', date: '2026-09-30' }), ev({ id: 'y', date: '2026-09-25' })],
      NOW
    );
    expect(ids(later)).toEqual(['x', 'y']);
  });
});

describe('selectHeroEvents', () => {
  it('drops past popular events and keeps order', () => {
    const hero = selectHeroEvents(
      [
        ev({ id: 'old', date: '2026-09-01', is_popular: true }),
        ev({ id: 'soon', date: '2026-09-16', is_popular: true }),
        ev({ id: 'next', date: '2026-09-30', is_popular: true }),
      ],
      NOW
    );
    expect(ids(hero)).toEqual(['soon', 'next']);
  });

  it('returns the same array instance when nothing is filtered out', () => {
    const input = [ev({ id: 'soon', date: '2026-09-16', is_popular: true })];
    expect(selectHeroEvents(input, NOW)).toBe(input);
  });
});
