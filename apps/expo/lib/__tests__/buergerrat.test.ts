import { isBuergerratNew, summarizeBuergerrat, BUERGERRAT_TOTAL } from '../buergerrat';

describe('isBuergerratNew', () => {
  const now = Date.parse('2026-09-20T00:00:00Z');
  it('is true within 14 days of the newest thread and false after or without one', () => {
    expect(isBuergerratNew('2026-09-16T12:00:00Z', now)).toBe(true);
    expect(isBuergerratNew('2026-09-01T12:00:00Z', now)).toBe(false);
    expect(isBuergerratNew(null, now)).toBe(false);
  });
});

describe('summarizeBuergerrat', () => {
  it('counts threads and terminal stages and keeps the newest created_at', () => {
    const s = summarizeBuergerrat([
      { created_at: '2026-09-16T12:00:10Z', stage: 'diskussion' },
      { created_at: '2026-09-16T12:00:09Z', stage: 'beschlossen' },
      { created_at: '2026-09-16T12:00:08Z', stage: 'umgesetzt' },
      { created_at: '2026-09-16T12:00:07Z', stage: null },
    ]);
    expect(s).toEqual({ count: 4, newestCreatedAt: '2026-09-16T12:00:10Z', beschlossen: 1, umgesetzt: 1 });
    expect(summarizeBuergerrat([])).toEqual({ count: 0, newestCreatedAt: null, beschlossen: 0, umgesetzt: 0 });
    expect(BUERGERRAT_TOTAL).toBe(11);
  });
});
