import {
  MIN_MINTABLE,
  MINT_COOLDOWN_MS,
  claimAmount,
  computeNextStreak,
  dayStart,
  formatCooldownClock,
  isInCooldown,
  rtClaimKey,
  rtStreakKey,
} from '../muenzen-daily-mint';

const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0, 0).getTime();

describe('claimAmount', () => {
  it('never claims less than one whole Münze', () => {
    expect(claimAmount(0)).toBe(1);
    expect(claimAmount(0.3)).toBe(1);
  });
  it('rounds the accrued amount', () => {
    expect(claimAmount(2.4)).toBe(2);
    expect(claimAmount(2.6)).toBe(3);
  });
});

describe('isInCooldown', () => {
  it('is false without a previous claim', () => {
    expect(isInCooldown(null, 1_000)).toBe(false);
  });
  it('is true inside the cooldown window and false after', () => {
    const last = 10_000;
    expect(isInCooldown(last, last + MINT_COOLDOWN_MS - 1)).toBe(true);
    expect(isInCooldown(last, last + MINT_COOLDOWN_MS)).toBe(false);
  });
});

describe('computeNextStreak', () => {
  it('starts at 1 on the first claim', () => {
    expect(computeNextStreak(0, null, noon(2026, 9, 13))).toBe(1);
  });
  it('keeps the streak on a second claim the same day', () => {
    expect(computeNextStreak(4, noon(2026, 9, 13) - 3_600_000, noon(2026, 9, 13))).toBe(4);
  });
  it('repairs a zero streak on the same day to 1', () => {
    expect(computeNextStreak(0, noon(2026, 9, 13) - 3_600_000, noon(2026, 9, 13))).toBe(1);
  });
  it('increments when the last claim was yesterday', () => {
    expect(computeNextStreak(4, noon(2026, 9, 12), noon(2026, 9, 13))).toBe(5);
  });
  it('increments across a DST change', () => {
    // 2026-10-25 is the European DST switch (25h day).
    expect(computeNextStreak(2, noon(2026, 10, 25), noon(2026, 10, 26))).toBe(3);
  });
  it('resets after a gap', () => {
    expect(computeNextStreak(9, noon(2026, 9, 10), noon(2026, 9, 13))).toBe(1);
  });
});

describe('storage keys', () => {
  it('are lower-cased per wallet', () => {
    expect(rtClaimKey('0xABC')).toBe('rt_lastclaim_0xabc');
    expect(rtStreakKey('0xABC')).toBe('rt_streak_0xabc');
  });
});

describe('dayStart', () => {
  it('is idempotent', () => {
    const t = noon(2026, 9, 13);
    expect(dayStart(dayStart(t))).toBe(dayStart(t));
    expect(dayStart(t)).toBeLessThan(t);
  });
});

describe('formatCooldownClock', () => {
  it('formats minutes and seconds with padding', () => {
    expect(formatCooldownClock(59 * 60_000 + 7_000)).toBe('59:07');
    expect(formatCooldownClock(60 * 60_000)).toBe('60:00');
    expect(formatCooldownClock(4_500)).toBe('00:05');
  });
  it('clamps at zero', () => {
    expect(formatCooldownClock(0)).toBe('00:00');
    expect(formatCooldownClock(-5_000)).toBe('00:00');
  });
});

it('exposes the threshold', () => {
  expect(MIN_MINTABLE).toBe(0.1);
});
