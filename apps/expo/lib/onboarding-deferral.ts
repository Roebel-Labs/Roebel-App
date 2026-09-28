/**
 * "Später vervollständigen": a person who creates a passkey account straight from the first-launch
 * welcome screen lands in the app logged in, WITHOUT the welcome wizard being pushed on top
 * (UserContext normally pushes /welcome for a row without `onboarding_completed_at`). The skipped
 * steps show up on the profile's "Profil vervollständigen" card instead.
 *
 * One-shot and in memory only: the deferral is consumed by the first user sync of that address in
 * this app run. Pure module (no React, no storage).
 */
const deferred = new Set<string>();

export function deferWelcomeWizard(address: string | null | undefined): void {
  if (address) deferred.add(address.toLowerCase());
}

/** True exactly once per deferred address; later calls (and other addresses) return false. */
export function consumeWelcomeDeferral(address: string | null | undefined): boolean {
  if (!address) return false;
  return deferred.delete(address.toLowerCase());
}

/** Test helper. */
export function resetWelcomeDeferrals(): void {
  deferred.clear();
}
