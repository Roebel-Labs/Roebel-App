/**
 * On-device audience matching for mini apps. The store reads every live app; which ones are
 * "for you", locked or in "Meine Vereine" is decided here, against the credentials held on this
 * phone (lib/miniapp-credentials.ts). Pure: no network, no tracking, nothing logged — a private
 * membership must never leave the device through a recommendation.
 *
 * A locked app is a courtesy, not security: the app's own server checks the credential.
 */
import { credentialMatches, parseCredentialRef } from '@netizen-labs/miniapp-sdk/host';
import type { MatchCredential } from './miniapp-credentials';
import type { MiniApp } from './miniapps';

export type AudienceState = 'open' | 'match' | 'locked';

/** No audience → open; a held credential matches → match; else locked (required) or open (recommended). */
export function audienceState(app: Pick<MiniApp, 'audience'>, held: readonly MatchCredential[]): AudienceState {
  const audience = app.audience;
  if (!audience || audience.anyOf.length === 0) return 'open';
  const matches = audience.anyOf.some((pattern) => held.some((h) => credentialMatches(pattern, h)));
  if (matches) return 'match';
  return audience.mode === 'required' ? 'locked' : 'open';
}

const lowerSet = (ids: readonly string[]) => new Set(ids.map((id) => id.toLowerCase()));

/** The app's org confirmed it and is one of mine. `orgAccountId` is null unless confirmed. */
function isMyOrgApp(app: Pick<MiniApp, 'orgAccountId'>, mine: Set<string>): boolean {
  return !!app.orgAccountId && mine.has(app.orgAccountId.toLowerCase());
}

/** The audience matches, or the app's confirmed org is one of mine. */
export function isForYou(
  app: Pick<MiniApp, 'audience' | 'orgAccountId'>,
  held: readonly MatchCredential[],
  myOrgIds: readonly string[],
): boolean {
  return audienceState(app, held) === 'match' || isMyOrgApp(app, lowerSet(myOrgIds));
}

/** Apps for this person, in the given order. */
export function forYou(apps: readonly MiniApp[], held: readonly MatchCredential[], myOrgIds: readonly string[]): MiniApp[] {
  return apps.filter((a) => isForYou(a, held, myOrgIds));
}

/** Apps whose org confirmed them and that I belong to, in the given order. */
export function myOrgApps(apps: readonly MiniApp[], myOrgIds: readonly string[]): MiniApp[] {
  const mine = lowerSet(myOrgIds);
  if (mine.size === 0) return [];
  return apps.filter((a) => isMyOrgApp(a, mine));
}

export interface LockInfo {
  text: string;
  cta?: { label: string; href: string };
}

/**
 * Why an app is locked and the way in, from the first entry of `anyOf`. An org is named and
 * linked only when the app's binding is confirmed (`orgAccountId` set) — and, for an `org:`
 * reference, only when it is that org.
 */
export function lockInfo(app: Pick<MiniApp, 'audience' | 'orgAccountId' | 'orgName'>): LockInfo {
  const first = app.audience?.anyOf[0];
  const ref = first ? parseCredentialRef(first) : null;
  if (ref?.kind === 'builtin') {
    if (ref.name === 'citizen') {
      return { text: 'Für Bürger:innen.', cta: { label: 'Bürger:in werden', href: '/citizen-verification' } };
    }
    if (ref.name === 'attester') return { text: 'Für Bescheiniger:innen.' };
    return { text: 'Für Gäste.' };
  }
  const org = app.orgAccountId?.toLowerCase() ?? null;
  const sameOrg = !!org && (ref?.kind !== 'org' || ref.org === org);
  if (!sameOrg) return { text: 'Für Mitglieder.' };
  return {
    text: app.orgName ? `Für Mitglieder von ${app.orgName}.` : 'Für Mitglieder.',
    cta: { label: 'Mitglied werden', href: `/account/${org}` },
  };
}
