import { formatAmount, nextStepFor, timeLeft, STAGE_STEPS, STAGE_LABELS } from '../vorhaben-labels';

describe('vorhaben labels', () => {
  test('amounts in German format, Münzen never as euro', () => {
    expect(formatAmount('5', 'EURe')).toBe('5,00 €');
    expect(formatAmount('0.25', 'EURe')).toBe('0,25 €');
    expect(formatAmount('10', 'MUENZEN')).toBe('10 Röbel Münzen');
    expect(formatAmount('0.5', 'MUENZEN')).toBe('0,5 Röbel Münzen');
    expect(formatAmount('7.5', 'XDAI')).toBe('7,5 xDAI');
  });

  test('next step depends on status and who is looking', () => {
    expect(nextStepFor({ status: 'vergeben', assignee_wallet: '0xa' }, '0xA')).toBe('Aufgabe starten');
    expect(nextStepFor({ status: 'in_arbeit', assignee_wallet: '0xa' }, '0xa')).toBe('Fortschritt melden');
    expect(nextStepFor({ status: 'eingereicht', assignee_wallet: '0xa' }, '0xa')).toBe('Wartet auf Abnahme');
    expect(nextStepFor({ status: 'abgenommen', assignee_wallet: '0xa' }, '0xa')).toBe('Auszahlung läuft');
    expect(nextStepFor({ status: 'in_arbeit', assignee_wallet: '0xa' }, '0xb')).toBeNull();
  });

  test('time left', () => {
    const now = Date.UTC(2026, 9, 5, 12);
    expect(timeLeft(new Date(now + 6 * 86400_000 + 1000).toISOString(), now)).toBe('noch 6 Tage');
    expect(timeLeft(new Date(now + 5 * 3600_000 + 1000).toISOString(), now)).toBe('noch 5 Stunden');
    expect(timeLeft(new Date(now - 1).toISOString(), now)).toBe('abgelaufen');
  });

  test('every stepper stage has a label', () => {
    for (const s of STAGE_STEPS) expect(STAGE_LABELS[s]).toBeTruthy();
  });
});
