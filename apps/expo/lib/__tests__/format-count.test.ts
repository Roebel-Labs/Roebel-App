import { formatCompactCount } from '../utils/format-count';

describe('formatCompactCount', () => {
  it('passes small numbers through', () => {
    expect(formatCompactCount(0)).toBe('0');
    expect(formatCompactCount(7)).toBe('7');
    expect(formatCompactCount(999)).toBe('999');
  });

  it('formats thousands with German decimal comma', () => {
    expect(formatCompactCount(1000)).toBe('1K');
    expect(formatCompactCount(1234)).toBe('1,2K');
    expect(formatCompactCount(9950)).toBe('10K');
    expect(formatCompactCount(12345)).toBe('12K');
    expect(formatCompactCount(999499)).toBe('999K');
  });

  it('formats millions', () => {
    expect(formatCompactCount(1_200_000)).toBe('1,2M');
    expect(formatCompactCount(25_000_000)).toBe('25M');
  });
});
