import { consumeWelcomeDeferral, deferWelcomeWizard, resetWelcomeDeferrals } from '../onboarding-deferral';

const ADDR = '0xAbCdEf0000000000000000000000000000000001';

describe('welcome wizard deferral', () => {
  beforeEach(() => resetWelcomeDeferrals());

  it('is consumed exactly once, case-insensitively', () => {
    deferWelcomeWizard(ADDR);
    expect(consumeWelcomeDeferral(ADDR.toLowerCase())).toBe(true);
    expect(consumeWelcomeDeferral(ADDR)).toBe(false);
  });

  it('only applies to the deferred address', () => {
    deferWelcomeWizard(ADDR);
    expect(consumeWelcomeDeferral('0x0000000000000000000000000000000000000002')).toBe(false);
    expect(consumeWelcomeDeferral(ADDR)).toBe(true);
  });

  it('ignores empty input', () => {
    deferWelcomeWizard(null);
    deferWelcomeWizard(undefined);
    expect(consumeWelcomeDeferral(null)).toBe(false);
    expect(consumeWelcomeDeferral(undefined)).toBe(false);
  });
});
