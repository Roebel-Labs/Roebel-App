/**
 * May this mini app be opened here and now? Every place that mounts `MiniAppHost` asks this
 * first; a locked app goes to its detail page, which shows why and the way in.
 *
 * A locked app is a courtesy on the device, not security: the app's own server checks the
 * credential. Pure: no network, no tracking.
 */
import type { MatchCredential } from './miniapp-credentials';
import type { MiniApp } from './miniapps';
import { audienceState } from './miniapp-audience';

export type OpenDecision = 'open' | 'locked' | 'wait';

/**
 * Apps without a required audience open at once. A required app opens as soon as a held
 * credential matches; otherwise it waits until the credentials are `ready`, then locks.
 */
export function openDecision(
  app: Pick<MiniApp, 'audience'>,
  held: readonly MatchCredential[],
  ready: boolean,
): OpenDecision {
  const audience = app.audience;
  if (!audience || audience.mode !== 'required' || audience.anyOf.length === 0) return 'open';
  if (audienceState(app, held) === 'match') return 'open';
  return ready ? 'locked' : 'wait';
}

/** The org account ids this person belongs to (any role), for "Meine Vereine" and "Für dich". */
export function orgIdsOf(accounts: readonly { id: string; account_type?: string | null }[]): string[] {
  return accounts.filter((a) => a.account_type !== 'personal').map((a) => a.id.toLowerCase());
}
