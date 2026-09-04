/**
 * Wire types for the Gnosis Pay partner API (api.gnosispay.com, v1).
 *
 * Only the fields this app reads are modelled -- the API returns more. Status
 * unions are copied verbatim from the vendor docs; a value outside them means
 * the API changed and the onboarding state machine should refuse to guess.
 */

/** KYC lifecycle as reported by GET /api/v1/user. */
export type GpKycStatus =
  | 'notStarted'
  | 'documentsRequested'
  | 'pending'
  | 'processing'
  | 'approved'
  | 'resubmissionRequested'
  | 'rejected'
  | 'requiresAction';

export interface GpUser {
  id: string;
  kycStatus: GpKycStatus;
  isSourceOfFundsAnswered: boolean;
  isPhoneValidated: boolean;
  /** Empty until POST /api/v1/safe/deploy has completed. */
  safeWallet: { address: string }[];
}

export interface GpSafeConfig {
  address: string;
  /** 0 means fully configured and ready to use. */
  accountStatus: number;
  tokenSymbol?: string;
}

export interface GpTerms {
  id: string;
  version: string;
  accepted?: boolean;
}

export interface GpKycIntegration {
  type: 'SUMSUB_WEB';
  url: string;
}

export interface GpSourceOfFundsQuestion {
  question: string;
  answers: string[];
}

export type GpErrorCode =
  | 'UNAUTHORIZED'
  | 'KYC_REQUIRED'
  | 'ALREADY_DONE'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'NOT_CONFIGURED'
  | 'BAD_REQUEST';

/**
 * Every call returns this instead of throwing: a failed call is an expected
 * outcome in an onboarding wizard, not an exception.
 */
export type GpResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: GpErrorCode; message: string };
