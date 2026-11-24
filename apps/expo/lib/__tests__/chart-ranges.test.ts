import { rangeDates, previousRange, isValidCustomRange, RANGE_LABELS, deltaPercent } from '../charts/ranges';

const today = new Date(2026, 10, 24); // 24 Nov 2026, local

describe('rangeDates', () => {
  it('7 Tage is today and the six days before', () => {
    expect(rangeDates('7d', today)).toEqual({ from: '2026-11-18', to: '2026-11-24' });
  });
  it('28, 90 and 365 Tage', () => {
    expect(rangeDates('28d', today)).toEqual({ from: '2026-10-28', to: '2026-11-24' });
    expect(rangeDates('90d', today).from).toBe('2026-08-27');
    expect(rangeDates('365d', today).from).toBe('2025-11-25');
  });
  it('uses the custom dates for Zeitraum', () => {
    expect(rangeDates('custom', today, { from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) })).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });
  it('labels the pills in German', () => {
    expect(Object.values(RANGE_LABELS)).toEqual(['7 Tage', '28 Tage', '90 Tage', '365 Tage', 'Zeitraum']);
  });
});

describe('previousRange', () => {
  it('is the same length directly before', () => {
    expect(previousRange({ from: '2026-11-18', to: '2026-11-24' })).toEqual({ from: '2026-11-11', to: '2026-11-17' });
  });
});

describe('isValidCustomRange', () => {
  it('refuses an end before the start', () => {
    expect(isValidCustomRange(new Date(2026, 5, 2), new Date(2026, 5, 1))).toBe(false);
  });
  it('refuses more than 730 days', () => {
    expect(isValidCustomRange(new Date(2024, 0, 1), new Date(2026, 0, 2))).toBe(false);
  });
  it('accepts a normal range', () => {
    expect(isValidCustomRange(new Date(2026, 5, 1), new Date(2026, 5, 30))).toBe(true);
  });
});

describe('deltaPercent', () => {
  it('is null when there was nothing before (shown as "neu")', () => {
    expect(deltaPercent(5, 0)).toBeNull();
  });
  it('is 0 when both are zero', () => {
    expect(deltaPercent(0, 0)).toBe(0);
  });
  it('rounds to whole percent', () => {
    expect(deltaPercent(150, 100)).toBe(50);
    expect(deltaPercent(1, 3)).toBe(-67);
  });
});
