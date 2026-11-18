/**
 * Consent keys for a version-2 manifest's `identity` section. Hosts store, per app and account,
 * which keys the person was already asked about; only the rest is shown in the consent sheet.
 */
import type { MiniAppIdentityRequest } from '../types';

export type ConsentKey = 'profile' | 'address' | `cred:${string}`;

/** Everything the manifest requests: profile, address, then credentials in manifest order. */
export function consentKeys(identity: MiniAppIdentityRequest | undefined): ConsentKey[] {
  if (!identity) return [];
  const keys: ConsentKey[] = [];
  if (identity.profile) keys.push('profile');
  if (identity.address) keys.push('address');
  for (const c of identity.credentials ?? []) keys.push(`cred:${c.type}`);
  return keys;
}

/** The requested keys the person was never asked about (granted or declined). */
export function pendingConsentKeys(
  identity: MiniAppIdentityRequest | undefined,
  asked: readonly string[],
): ConsentKey[] {
  const seen = new Set(asked);
  return consentKeys(identity).filter((k) => !seen.has(k));
}
