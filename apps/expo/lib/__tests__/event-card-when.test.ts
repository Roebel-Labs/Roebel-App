import { formatEventCardWhen } from '../utils';

// Wednesday 2026-09-16 (ISO week Mon 14 → Sun 20).
const NOW = new Date(2026, 8, 16, 12, 0, 0);

describe('formatEventCardWhen', () => {
  it('says Heute / Morgen with the start time', () => {
    expect(formatEventCardWhen('2026-09-16', '16:00:00', NOW)).toBe('Heute um 16:00');
    expect(formatEventCardWhen('2026-09-17', '19:30:00', NOW)).toBe('Morgen um 19:30');
  });

  it('uses the weekday name for the rest of this week', () => {
    expect(formatEventCardWhen('2026-09-19', '20:00:00', NOW)).toBe('Samstag um 20:00');
    expect(formatEventCardWhen('2026-09-20', null, NOW)).toBe('Sonntag');
  });

  it('falls back to a short date beyond this week', () => {
    expect(formatEventCardWhen('2026-10-03', '20:00:00', NOW)).toBe('Sa., 3. Okt um 20:00');
    expect(formatEventCardWhen('2026-12-24', null, NOW)).toBe('Do., 24. Dez');
  });

  it('never names a weekday that already passed this week', () => {
    expect(formatEventCardWhen('2026-09-14', null, NOW)).toBe('Mo., 14. Sep');
  });
});
