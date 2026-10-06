import { STAGE_STEPPER_LABELS, formatAmount, nextStepFor, timeLeft, STAGE_STEPS, STAGE_LABELS, boardTabFor, progressOf, parseEuroInput, taskTone, contractPurpose, payoutErrorText, paidProofText, PAYOUT_NETWORK_ERROR } from '../vorhaben-labels';

describe('vorhaben labels', () => {
  test('amounts in German format, Münzen never as euro', () => {
    expect(formatAmount('5', 'EURe')).toBe('5,00 €');
    expect(formatAmount('0.25', 'EURe')).toBe('0,25 €');
    expect(formatAmount('10', 'MUENZEN')).toBe('10 Röbel Münzen');
    expect(formatAmount('0.5', 'MUENZEN')).toBe('0,5 Röbel Münzen');
    expect(formatAmount('7.5', 'XDAI')).toBe('7,50 €');
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

describe('task board helpers', () => {
  test('board tabs and progress', () => {
    expect(boardTabFor('offen')).toBe('offen');
    expect(boardTabFor('eingereicht')).toBe('in_arbeit');
    expect(boardTabFor('abgenommen')).toBe('in_arbeit');
    expect(boardTabFor('abgebrochen')).toBe('erledigt');
    expect(progressOf(['ausgezahlt', 'offen', 'abgebrochen', 'in_arbeit'])).toEqual({ done: 2, total: 4 });
    expect(progressOf([])).toEqual({ done: 0, total: 0 });
  });

  test('euro input', () => {
    expect(parseEuroInput('5')).toBe('5');
    expect(parseEuroInput('5,50')).toBe('5.50');
    expect(parseEuroInput(' 12.5 ')).toBe('12.5');
    expect(parseEuroInput('5,555')).toBeNull();
    expect(parseEuroInput('0')).toBeNull();
    expect(parseEuroInput('abc')).toBeNull();
    expect(parseEuroInput('10000000')).toBeNull();
    expect(parseEuroInput('9999999.99')).toBe('9999999.99');
  });

  test('status tones', () => {
    expect(taskTone('offen')).toBe('info');
    expect(taskTone('in_arbeit')).toBe('neutral');
    expect(taskTone('eingereicht')).toBe('warning');
    expect(taskTone('ausgezahlt')).toBe('success');
    expect(taskTone('abgebrochen')).toBe('error');
  });
});

describe('contractPurpose', () => {
  const titles = new Map([['t1', 'Banner aufhängen']]);
  test('describes what each line is for', () => {
    expect(contractPurpose({ role: 'aufgabe', referenceId: 't1' }, titles, 'Verein X')).toBe('Banner aufhängen');
    expect(contractPurpose({ role: 'aufgabe', referenceId: 'zz' }, titles, 'Verein X')).toBe('Aufgabe');
    expect(contractPurpose({ role: 'wahlhelfer', referenceId: 'w' }, titles, 'Verein X')).toBe('Bestätigung der Auszählung');
    expect(contractPurpose({ role: 'empfaenger', referenceId: 'p' }, titles, 'Verein X')).toBe('Verein X');
    expect(contractPurpose({ role: 'plattform', referenceId: 'p' }, titles, 'Verein X')).toBe('Plattformanteil');
  });
});

test('stepper labels are the plain labels plus soft hyphens only', () => {
  for (const [stage, label] of Object.entries(STAGE_STEPPER_LABELS)) {
    expect(label.replace(/\u00AD/g, '')).toBe(STAGE_LABELS[stage as keyof typeof STAGE_LABELS]);
  }
  expect(STAGE_STEPPER_LABELS.abstimmung.split('\u00AD')).toEqual(['Bür', 'ger', 'ab', 'stim', 'mung']);
});

describe('payout recording copy', () => {
  test('a timeout or lost connection never shows the raw fetch text', () => {
    const text = payoutErrorText({ code: 'NETWORK_ERROR', message: 'fetch failed: Fetch request has been canceled' });
    expect(text).toBe(PAYOUT_NETWORK_ERROR);
    expect(text).toContain('nicht doppelt gezählt');
    expect(payoutErrorText({ code: 'BAD_RESPONSE', message: 'Unexpected token <' })).not.toContain('token');
    expect(payoutErrorText({ code: 'SIGN_FAILED', message: 'User rejected the request' })).toBe('Die Signatur ist fehlgeschlagen. Bitte versuche es erneut.');
    expect(payoutErrorText({ code: 'BAD_TX', message: 'Die Transaktion passt nicht.' })).toBe('Die Transaktion passt nicht.');
  });

  test('proof line shows what the Safe paid when it differs from the promise, and card payments', () => {
    expect(paidProofText({ amount: '5', asset: 'EURe', paidAsset: 'XDAI', paidAmount: '5' })).toBeNull();
    expect(paidProofText({ amount: '5', asset: 'EURe', paidAsset: 'EURe', paidAmount: '5' })).toBeNull();
    expect(paidProofText({ amount: '150', asset: 'EURe', paidAsset: 'XDAI', paidAmount: '168.88', paymentMethod: 'card' }))
      .toBe('bezahlt: 168,88 € · per Karte');
    expect(paidProofText({ amount: '150', asset: 'EURe', paidAsset: null, paidAmount: null, paymentMethod: null })).toBeNull();
  });
});
