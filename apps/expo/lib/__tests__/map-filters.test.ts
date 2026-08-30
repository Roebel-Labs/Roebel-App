import { filterOpenNow } from '@/lib/map/filters';
import type { OpeningHours } from '@/lib/types';

// Wednesday 2026-09-02 12:00 local
const WEDNESDAY_NOON = new Date(2026, 8, 2, 12, 0, 0);

const hours = (open: string, close: string): OpeningHours =>
  ({
    monday: { open, close },
    tuesday: { open, close },
    wednesday: { open, close },
    thursday: { open, close },
    friday: { open, close },
    saturday: { open, close },
    sunday: { open, close },
  }) as unknown as OpeningHours;

describe('filterOpenNow', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(WEDNESDAY_NOON);
  });
  afterAll(() => jest.useRealTimers());

  const openPlace = { id: 'a', opening_hours: hours('09:00', '18:00') };
  const closedPlace = { id: 'b', opening_hours: hours('14:00', '18:00') };
  const noHours = { id: 'c', opening_hours: null };

  it('passes everything through when disabled', () => {
    expect(filterOpenNow([openPlace, closedPlace, noHours], false)).toHaveLength(3);
  });

  it('keeps only currently open places when enabled', () => {
    const out = filterOpenNow([openPlace, closedPlace, noHours], true);
    expect(out.map((p) => p.id)).toEqual(['a']);
  });
});
