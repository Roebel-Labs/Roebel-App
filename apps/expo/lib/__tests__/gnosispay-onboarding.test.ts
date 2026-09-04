/**
 * The onboarding wizard never decides for itself what comes next -- it asks
 * nextStep(). The order is fixed by the Gnosis Pay API's own prerequisites:
 * KYC must be approved before source-of-funds, and POST /safe/deploy returns
 * 422 unless KYC, source-of-funds and phone are all done.
 */
import {
  ONBOARDING_ORDER,
  isKycTerminal,
  nextStep,
  stepProgress,
} from '../gnosispay/onboarding';
import type { GpUser } from '../gnosispay/types';

function user(overrides: Partial<GpUser> = {}): GpUser {
  return {
    id: 'u1',
    kycStatus: 'approved',
    isSourceOfFundsAnswered: true,
    isPhoneValidated: true,
    safeWallet: [{ address: '0xsafe' }],
    ...overrides,
  };
}

describe('nextStep', () => {
  it('starts at signup when there is no user yet', () => {
    expect(nextStep(null, false)).toBe('signup');
  });

  it('asks for terms before anything else once a user exists', () => {
    expect(nextStep(user({ kycStatus: 'notStarted' }), false)).toBe('terms');
  });

  it('opens KYC when terms are accepted and KYC has not started', () => {
    expect(nextStep(user({ kycStatus: 'notStarted' }), true)).toBe('kyc');
  });

  it('re-opens KYC when documents or a resubmission are requested', () => {
    expect(nextStep(user({ kycStatus: 'documentsRequested' }), true)).toBe('kyc');
    expect(nextStep(user({ kycStatus: 'resubmissionRequested' }), true)).toBe('kyc');
  });

  it('waits while KYC is pending or processing', () => {
    expect(nextStep(user({ kycStatus: 'pending' }), true)).toBe('kyc_wait');
    expect(nextStep(user({ kycStatus: 'processing' }), true)).toBe('kyc_wait');
  });

  it('blocks on a terminal KYC failure instead of looping', () => {
    expect(nextStep(user({ kycStatus: 'rejected' }), true)).toBe('kyc_blocked');
    expect(nextStep(user({ kycStatus: 'requiresAction' }), true)).toBe('kyc_blocked');
  });

  it('asks source-of-funds only after KYC approval', () => {
    expect(nextStep(user({ isSourceOfFundsAnswered: false, safeWallet: [] }), true)).toBe(
      'source_of_funds',
    );
  });

  it('asks for phone verification after source-of-funds', () => {
    expect(nextStep(user({ isPhoneValidated: false, safeWallet: [] }), true)).toBe('phone');
  });

  it('deploys the Safe once every prerequisite is met and none exists', () => {
    expect(nextStep(user({ safeWallet: [] }), true)).toBe('deploy');
  });

  it('is done when a Safe exists', () => {
    expect(nextStep(user(), true)).toBe('done');
  });

  it('does not skip ahead when several things are missing at once', () => {
    const incomplete = user({
      kycStatus: 'notStarted',
      isSourceOfFundsAnswered: false,
      isPhoneValidated: false,
      safeWallet: [],
    });
    expect(nextStep(incomplete, true)).toBe('kyc');
  });

  it('treats a missing safeWallet array as no Safe', () => {
    const withoutField = { ...user() } as GpUser & { safeWallet?: unknown };
    delete withoutField.safeWallet;
    expect(nextStep(withoutField as GpUser, true)).toBe('deploy');
  });
});

describe('isKycTerminal', () => {
  it('is true only for the two states support must resolve', () => {
    expect(isKycTerminal('rejected')).toBe(true);
    expect(isKycTerminal('requiresAction')).toBe(true);
    expect(isKycTerminal('pending')).toBe(false);
    expect(isKycTerminal('approved')).toBe(false);
  });
});

describe('stepProgress', () => {
  it('numbers the visible steps from 1 and shares one total', () => {
    expect(stepProgress('signup')).toEqual({ index: 1, total: ONBOARDING_ORDER.length });
    expect(stepProgress('done')).toEqual({
      index: ONBOARDING_ORDER.length,
      total: ONBOARDING_ORDER.length,
    });
  });

  it('reports the waiting and blocked states at their KYC position', () => {
    expect(stepProgress('kyc_wait').index).toBe(stepProgress('kyc').index);
    expect(stepProgress('kyc_blocked').index).toBe(stepProgress('kyc').index);
  });

  it('never returns an index outside the rail', () => {
    for (const step of [...ONBOARDING_ORDER, 'kyc_wait', 'kyc_blocked'] as const) {
      const { index, total } = stepProgress(step);
      expect(index).toBeGreaterThanOrEqual(1);
      expect(index).toBeLessThanOrEqual(total);
    }
  });
});
