import { PAY_LIMITS, buildPayConfirm, parsePay, preparePay, talerUnits } from '../miniapp-pay';

const A = '0x1111111111111111111111111111111111111111';
const ME = '0x2222222222222222222222222222222222222222';
const ORG = '0x4444444444444444444444444444444444444444';

const invalid = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return 'no error';
};

describe('parsePay', () => {
  it('accepts a normal payment', () =>
    expect(parsePay({ to: A, amount: 2.5, memo: ' Kaffee ' })).toEqual({ to: A, amount: 2.5, memo: 'Kaffee' }));

  it('drops an empty memo', () => expect(parsePay({ to: A, amount: 1, memo: '   ' })).toEqual({ to: A, amount: 1 }));

  it('accepts the limits exactly', () => {
    expect(parsePay({ to: A, amount: PAY_LIMITS.maxAmount }).amount).toBe(10_000);
    expect(parsePay({ to: A, amount: 0.01, memo: 'x'.repeat(80) }).memo).toHaveLength(80);
    expect(parsePay({ to: A, amount: 1.15 }).amount).toBe(1.15);
  });

  it('refuses zero, negative, more than 10000, three decimals, NaN', () => {
    for (const amount of [0, -1, 10_000.01, 1.234, NaN, Infinity, '5', undefined]) {
      expect(invalid(() => parsePay({ to: A, amount }))).toBe('invalid_params');
    }
  });

  it('refuses a recipient that is not an address', () => {
    for (const to of ['', 'PSV Röbel', '0x1234', `${A}00`, undefined, 42]) {
      expect(invalid(() => parsePay({ to, amount: 1 }))).toBe('invalid_params');
    }
  });

  it('refuses a memo over 80 characters', () =>
    expect(invalid(() => parsePay({ to: A, amount: 1, memo: 'x'.repeat(81) }))).toBe('invalid_params'));

  it('refuses a memo that is not text, and no params at all', () => {
    expect(invalid(() => parsePay({ to: A, amount: 1, memo: 5 }))).toBe('invalid_params');
    expect(invalid(() => parsePay(null))).toBe('invalid_params');
  });
});

describe('buildPayConfirm', () => {
  it('the sheet shows the name, never the address', () => {
    const r = buildPayConfirm('Demo', { recipientName: 'PSV Röbel', amount: 5, memo: 'Beitrag' });
    expect(r.title).toBe('Röbel Münzen senden');
    expect(r.appName).toBe('Demo');
    expect(r.rows).toEqual([
      { label: 'An', value: 'PSV Röbel' },
      { label: 'Betrag', value: '5 Röbel Münzen' },
      { label: 'Verwendungszweck', value: 'Beitrag' },
    ]);
    expect(r.cta).toBe('Bezahlen');
    expect(JSON.stringify(r)).not.toMatch(/0x[0-9a-fA-F]{6}/);
  });

  it('no memo, no memo row', () =>
    expect(buildPayConfirm('Demo', { recipientName: 'Anna', amount: 2.5 }).rows).toEqual([
      { label: 'An', value: 'Anna' },
      { label: 'Betrag', value: '2,50 Röbel Münzen' },
    ]));
});

describe('talerUnits', () => {
  it('converts to 18 decimals without float noise', () => {
    expect(talerUnits(1.15)).toBe(1_150_000_000_000_000_000n);
    expect(talerUnits(10_000)).toBe(10_000n * 10n ** 18n);
  });
});

describe('preparePay', () => {
  const deps = (over: Partial<Parameters<typeof preparePay>[1]> = {}) => ({
    self: ME,
    personName: async (a: string) => (a.toLowerCase() === A ? 'Anna' : null),
    orgName: async (a: string) => (a.toLowerCase() === ORG ? 'PSV Röbel' : null),
    balance: async () => 100n * 10n ** 18n,
    ...over,
  });
  const rejection = async (p: Promise<unknown>) => p.then(() => 'resolved', (e) => e);

  it('a person by name', async () =>
    expect(await preparePay({ to: A, amount: 5 }, deps())).toEqual({
      to: A,
      amount: 5,
      units: 5n * 10n ** 18n,
      recipientName: 'Anna',
    }));

  it('an org account by name', async () =>
    expect((await preparePay({ to: ORG, amount: 5, memo: 'Beitrag' }, deps())).recipientName).toBe('PSV Röbel'));

  it('an unknown recipient is refused', async () =>
    expect(await rejection(preparePay({ to: '0x5555555555555555555555555555555555555555', amount: 1 }, deps()))).toEqual({
      code: 'invalid_params',
      message: 'Der Empfänger ist in Röbel nicht bekannt.',
    }));

  it('paying yourself is refused', async () =>
    expect(
      await rejection(preparePay({ to: ME.toUpperCase().replace('0X', '0x'), amount: 1 }, deps({ personName: async () => 'Ich' }))),
    ).toMatchObject({ code: 'invalid_params' }));

  it('a balance below the amount is refused', async () =>
    expect(await rejection(preparePay({ to: A, amount: 5 }, deps({ balance: async () => 4n * 10n ** 18n })))).toEqual({
      code: 'invalid_params',
      message: 'Dein Guthaben reicht dafür nicht.',
    }));

  it('a failed balance read is an internal error, not a payment', async () =>
    expect(
      await rejection(preparePay({ to: A, amount: 5 }, deps({ balance: async () => Promise.reject(new Error('rpc')) }))),
    ).toMatchObject({ code: 'internal' }));
});
