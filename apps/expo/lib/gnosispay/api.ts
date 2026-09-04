/**
 * One typed function per Gnosis Pay endpoint this app uses. Paths, methods and
 * body shapes live here and nowhere else, so a vendor change is a one-file fix.
 *
 * Sequence (each step's prerequisite is the previous one):
 *   signup -> terms -> KYC -> source-of-funds -> phone OTP -> safe deploy
 */
import { GP_PARTNER_ID, gpFetch } from './client';
import type {
  GpKycIntegration,
  GpResult,
  GpSafeConfig,
  GpSourceOfFundsQuestion,
  GpTerms,
  GpUser,
} from './types';

/** The three agreements a merchant must accept before KYC. */
export const REQUIRED_TERMS = [
  'general-tos',
  'card-monavate-tos',
  'privacy-policy',
] as const;

export type RequiredTerm = (typeof REQUIRED_TERMS)[number];

export function getUser(token: string): Promise<GpResult<GpUser>> {
  return gpFetch<GpUser>('/api/v1/user', { token });
}

export function signup(
  authEmail: string,
  token: string,
): Promise<GpResult<{ id: string }>> {
  return gpFetch<{ id: string }>('/api/v1/auth/signup', {
    method: 'POST',
    token,
    body: { authEmail, partnerId: GP_PARTNER_ID },
  });
}

export function getTerms(token: string): Promise<GpResult<GpTerms[]>> {
  return gpFetch<GpTerms[]>('/api/v1/user/terms', { token });
}

export function acceptTerm(
  id: string,
  version: string,
  token: string,
): Promise<GpResult<unknown>> {
  return gpFetch('/api/v1/user/terms', {
    method: 'POST',
    token,
    body: { terms: id, version },
  });
}

/** Hosted Sumsub flow -- opened in an in-app browser, so this ships over OTA. */
export function getKycLink(
  token: string,
  lang = 'de',
): Promise<GpResult<GpKycIntegration>> {
  return gpFetch<GpKycIntegration>(`/api/v1/kyc/integration?lang=${lang}`, { token });
}

export function getSourceOfFundsQuestions(
  token: string,
): Promise<GpResult<GpSourceOfFundsQuestion[]>> {
  return gpFetch<GpSourceOfFundsQuestion[]>('/api/v1/source-of-funds', { token });
}

export function submitSourceOfFunds(
  answers: { question: string; answer: string }[],
  token: string,
): Promise<GpResult<unknown>> {
  return gpFetch('/api/v1/source-of-funds', {
    method: 'POST',
    token,
    body: { answers },
  });
}

export function requestPhoneOtp(
  phoneNumber: string,
  token: string,
): Promise<GpResult<unknown>> {
  return gpFetch('/api/v1/verification', {
    method: 'POST',
    token,
    body: { phoneNumber },
  });
}

export function verifyPhoneOtp(code: string, token: string): Promise<GpResult<unknown>> {
  return gpFetch('/api/v1/verification/check', {
    method: 'POST',
    token,
    body: { code },
  });
}

/** Idempotent: re-posting while a deployment runs returns 202 without restarting it. */
export function deploySafe(
  token: string,
  dailyAllowanceEur?: number,
): Promise<GpResult<{ status: string }>> {
  return gpFetch<{ status: string }>('/api/v1/safe/deploy', {
    method: 'POST',
    token,
    body: dailyAllowanceEur === undefined ? {} : { dailyAllowance: dailyAllowanceEur },
  });
}

/** Statuses: processing | ok | failed | not_deployed. */
export function getSafeDeployStatus(token: string): Promise<GpResult<{ status: string }>> {
  return gpFetch<{ status: string }>('/api/v1/safe/deploy', { token });
}

/** accountStatus === 0 means fully configured and ready. */
export function getSafeConfig(token: string): Promise<GpResult<GpSafeConfig>> {
  return gpFetch<GpSafeConfig>('/api/v1/safe-config', { token });
}
