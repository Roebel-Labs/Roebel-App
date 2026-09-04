/**
 * Which onboarding screen comes next, as a pure function of the user Gnosis Pay
 * reports plus whether we have recorded terms acceptance.
 *
 * The order is not a UX preference -- it is the API's prerequisite chain:
 * source-of-funds requires kycStatus 'approved', and POST /safe/deploy returns
 * 422 unless KYC, source-of-funds and phone verification are all complete.
 */
import type { GpKycStatus, GpUser } from './types';

export type OnboardingStep =
  | 'signup'
  | 'terms'
  | 'kyc'
  | 'kyc_wait'
  | 'kyc_blocked'
  | 'source_of_funds'
  | 'phone'
  | 'deploy'
  | 'done';

/** The steps that occupy a slot in the progress rail, in order. */
export const ONBOARDING_ORDER: OnboardingStep[] = [
  'signup',
  'terms',
  'kyc',
  'source_of_funds',
  'phone',
  'deploy',
  'done',
];

/** Failure states no amount of retrying inside the app will clear. */
export function isKycTerminal(status: GpKycStatus): boolean {
  return status === 'rejected' || status === 'requiresAction';
}

export function nextStep(user: GpUser | null, termsAccepted: boolean): OnboardingStep {
  if (!user) return 'signup';
  if (!termsAccepted) return 'terms';

  if (isKycTerminal(user.kycStatus)) return 'kyc_blocked';
  if (user.kycStatus === 'pending' || user.kycStatus === 'processing') return 'kyc_wait';
  if (user.kycStatus !== 'approved') return 'kyc';

  if (!user.isSourceOfFundsAnswered) return 'source_of_funds';
  if (!user.isPhoneValidated) return 'phone';
  // A missing array means the API did not report a Safe, which is the same as
  // not having one -- deploy is idempotent, so retrying is safe.
  if (!user.safeWallet || user.safeWallet.length === 0) return 'deploy';
  return 'done';
}

/** Position in the progress rail; the KYC sub-states share KYC's slot. */
export function stepProgress(step: OnboardingStep): { index: number; total: number } {
  const normalised: OnboardingStep =
    step === 'kyc_wait' || step === 'kyc_blocked' ? 'kyc' : step;
  const zeroBased = ONBOARDING_ORDER.indexOf(normalised);
  return {
    index: zeroBased < 0 ? 1 : zeroBased + 1,
    total: ONBOARDING_ORDER.length,
  };
}
