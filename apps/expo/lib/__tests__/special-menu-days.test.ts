import { dishDayLabel, resolveDishDay } from '../special-menu-days';

describe('resolveDishDay', () => {
  it('prefers an explicit dd.mm. date', () => {
    expect(resolveDishDay('Montag, 02.11.', '2026-11-02')).toBe('2026-11-02');
    expect(resolveDishDay('Freitag, 06.11.', '2026-11-02')).toBe('2026-11-06');
  });
  it('places a bare weekday in the start week', () => {
    // Menu starts on a Tuesday; DIENSTAG is that day, FREITAG three days later.
    expect(resolveDishDay('DIENSTAG', '2026-11-03')).toBe('2026-11-03');
    expect(resolveDishDay('FREITAG', '2026-11-03')).toBe('2026-11-06');
    expect(resolveDishDay('Fr', '2026-11-03')).toBe('2026-11-06');
  });
  it('rolls an early-January date into the next year', () => {
    expect(resolveDishDay('Freitag, 02.01.', '2026-12-28')).toBe('2027-01-02');
  });
  it('returns null without a day', () => {
    expect(resolveDishDay('Hauptgerichte', '2026-11-03')).toBeNull();
    expect(resolveDishDay(null, '2026-11-03')).toBeNull();
    expect(resolveDishDay('DIENSTAG', null)).toBeNull();
  });
});

describe('dishDayLabel', () => {
  it('names today, tomorrow and later weekdays', () => {
    expect(dishDayLabel('2026-11-05', '2026-11-05')).toBe('Heute');
    expect(dishDayLabel('2026-11-06', '2026-11-05')).toBe('Morgen');
    expect(dishDayLabel('2026-11-09', '2026-11-05')).toBe('Montag');
  });
});
