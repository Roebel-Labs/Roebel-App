/**
 * Passkey sovereign accounts — tranche 1 library (no UI).
 * Spec: docs/superpowers/specs/2026-09-26-passkey-sovereign-accounts-design.md
 */
export * from './constants';
export {
  createPasskey,
  signWithPasskey,
  getPrfSecret,
  decodePrfOutput,
  PasskeyCancelledError,
  PasskeyNotSupportedError,
  type PasskeyCredential,
  type PasskeyAssertion,
} from './webauthn';
export { parseAttestationObject, publicKeyFromAttestationObject, type ParsedAttestation } from './cose';
export {
  buildSafeSetup,
  predictSafeAddress,
  safeFactoryData,
  safeInitCode,
  type PasskeyPublicKey,
} from './safe-address';
export {
  sendPasskeyUserOp,
  isSafeDeployed,
  buildCallData,
  safeOpHash,
  safeSignatureFromAssertion,
  userOpSignatureFromAssertion,
  sponsorRequestBody,
  type PasskeyUserOpArgs,
  type SponsoredCall,
  type UnpackedUserOp,
  type UserOpDeps,
} from './userop';
export {
  encodeAddGuardian,
  encodeRevokeGuardian,
  encodeChangeThreshold,
  prevGuardianOf,
  encodeMultiConfirmRecovery,
  encodeConfirmRecovery,
  encodeExecuteRecovery,
  encodeFinalizeRecovery,
  encodeCancelRecovery,
  encodeCreateSigner,
  recoveryApprovalTypedData,
  recoveryHash,
  safeMessageHash,
  signRecoveryApprovalAsGuardian,
  readGuardians,
  readThreshold,
  readRecoveryNonce,
  readRecoveryRequest,
  readRecoveryApprovals,
  readWebAuthnSigner,
  type GuardianApproval,
  type RecoveryRequest,
} from './guardians';
export {
  parseV3Config,
  isV3Enabled,
  buildMoveToCalls,
  buildCreateLegacyAccountCall,
  buildMigrationV3Calls,
  needsLegacyDeploy,
  predictLegacyAccount,
  readIdentityTokens,
  type V3Config,
} from './migration-v3';
export {
  buildAddAdminRequest,
  signerPermissionTypedData,
  encodeSetPermissions,
  encodeHandoverUserOpCallData,
  legacyAccountReadAbi,
  type SignerPermissionRequest,
} from './legacy-handover';
export { wrapSecret, unwrapSecret, PRF_VAULT_VERSION } from './prf-vault';
