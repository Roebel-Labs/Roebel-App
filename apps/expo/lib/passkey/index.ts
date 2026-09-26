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
  type SponsoredCall,
  type UnpackedUserOp,
  type UserOpDeps,
} from './userop';
export {
  buildAddAdminRequest,
  signerPermissionTypedData,
  encodeSetPermissions,
  encodeHandoverUserOpCallData,
  legacyAccountReadAbi,
  type SignerPermissionRequest,
} from './legacy-handover';
export { wrapSecret, unwrapSecret, PRF_VAULT_VERSION } from './prf-vault';
