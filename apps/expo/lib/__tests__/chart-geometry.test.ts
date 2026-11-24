import { niceTicks, linePath, areaPath, formatCompact, bucketSeries } from '../charts/geometry';

describe('niceTicks', () => {
  it('gives a single 0 tick for empty data', () => {
    expect(niceTicks(0)).toEqual([0]);
  });
  it('gives three round ticks reaching at least the max', () => {
    const t = niceTicks(174);
    expect(t).toHaveLength(3);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(174);
    expect(t[0]).toBeGreaterThan(0);
  });
});

describe('linePath', () => {
  it('never produces NaN for all-zero data', () => {
    expect(linePath([0, 0, 0], 100, 50, 0)).not.toMatch(/NaN|Infinity/);
  });
  it('draws a flat line for a single value', () => {
    const d = linePath([3], 100, 50, 10);
    expect(d).not.toMatch(/NaN/);
    expect(d.startsWith('M')).toBe(true);
  });
  it('maps the max to the top and zero to the bottom', () => {
    expect(linePath([0, 10], 100, 50, 10)).toBe('M0,50 L100,0');
  });
});

describe('areaPath', () => {
  it('closes along the bottom edge', () => {
    expect(areaPath([0, 10], 100, 50, 10)).toBe('M0,50 L100,0 L100,50 L0,50 Z');
  });
  it('is empty for no data', () => {
    expect(areaPath([], 100, 50, 10)).toBe('');
  });
});

describe('formatCompact', () => {
  it('formats German style', () => {
    expect(formatCompact(169)).toBe('169');
    expect(formatCompact(1234)).toBe('1.234');
    expect(formatCompact(12345)).toBe('12,3 Tsd.');
    expect(formatCompact(2_500_000)).toBe('2,5 Mio.');
  });
});

describe('bucketSeries', () => {
  it('keeps daily points for short ranges', () => {
    expect(bucketSeries([1, 2, 3], 7)).toEqual([1, 2, 3]);
  });
  it('sums into weeks for long ranges', () => {
    const daily = new Array(100).fill(1);
    const weekly = bucketSeries(daily, 7);
    expect(weekly).toHaveLength(15);
    expect(weekly.reduce((a, b) => a + b, 0)).toBe(100);
  });
});
