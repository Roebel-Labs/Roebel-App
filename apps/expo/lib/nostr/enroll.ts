/**
 * Public-record enrollment, chained into the app's ONE consent system.
 *
 * There is deliberately no separate dialog: the privacy consent (first-launch
 * screen and the policy-version re-consent sheet) carries the public-record
 * clause, and pressing its Accept is the consent moment. This module remembers
 * that acceptance and turns it into an enrollment — immediately, or later via
 * self-heal (offline at acceptance, verified later, new device).
 *
 * The durable acceptance proof remains the wallet-signed registration itself;
 * the flag here only bridges the gap between "accepted" and "enrolled".
 */
import * as SecureStore from '@/lib/storage/secureStorage';
import type { SigningAccount } from './identity';

const CONSENT_AT_KEY = 'nostr.publicRecordConsentAt';

/**
 * Whether accounts without a Bürger-NFT are enrolled (identity, kind-0 profile,
 * historic backfill). OFF until a privacy-policy version whose public-record
 * clause covers every account has been approved and accepted: the accepted
 * 1.1.0 text names only "Bürger:innen". While off, non-citizens behave as before
 * Stage 1 and their Vorhaben actions use the wallet-signed route.
 */
export const ENROLL_NON_CITIZENS = false;

/** May this account be enrolled automatically under the consent accepted today? */
export function mayEnroll(isVerifiedCitizen: boolean): boolean {
  return isVerifiedCitizen || ENROLL_NON_CITIZENS;
}

export async function markPublicRecordConsent(): Promise<void> {
  try {
    await SecureStore.setItemAsync(CONSENT_AT_KEY, new Date().toISOString());
  } catch {
    // Worst case the self-heal never fires and enrollment happens on the next
    // policy-version acceptance. Never block the consent flow over storage.
  }
}

export async function hasPublicRecordConsent(): Promise<boolean> {
  try {
    return !!(await SecureStore.getItemAsync(CONSENT_AT_KEY));
  } catch {
    return false;
  }
}

/**
 * Enroll and start the historic backfill for an account that `mayEnroll`;
 * everything in here is silent and never throws.
 */
export async function enrollNow(account: SigningAccount, isVerifiedCitizen: boolean): Promise<void> {
  if (!mayEnroll(isVerifiedCitizen)) return;
  try {
    const { ensureIdentitySilently, getRegisteredAt } = require('./identity') as typeof import('./identity');
    await ensureIdentitySilently(account);
    if (await getRegisteredAt()) {
      const { ensureProfilePublished, retryPendingPublications } = require('./publish') as typeof import('./publish');
      await ensureProfilePublished(account.address);
      await retryPendingPublications(account.address);
    }
  } catch {
    // Self-heal retries on a later launch.
  }
}

/**
 * Launch-time repair: consent was given but enrollment has not completed on
 * this device — the account was offline or the relay was down when they accepted. Also nudges the backfill along for the
 * already-enrolled.
 */
export async function selfHealEnrollment(account: SigningAccount, isVerifiedCitizen: boolean): Promise<void> {
  if (!mayEnroll(isVerifiedCitizen)) return;
  if (!(await hasPublicRecordConsent())) return;
  await enrollNow(account, isVerifiedCitizen);
}
