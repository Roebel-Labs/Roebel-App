/**
 * UI decisions for device sessions ("Gerät ohne Fingerabdruck"), pure, no I/O:
 *   - deviceSessionView: which state the settings section shows
 *   - claimWithDeviceSessionOffer: the first-claim offer around `claimNow`
 *   - formatSessionDate: dd.MM.yyyy (de-DE) of a unix-seconds timestamp
 */
import type { ClaimPath } from './claim-route';
import type { DeviceSessionState } from './grant';

export type DeviceSessionView =
  | { kind: 'hidden' }
  | { kind: 'active'; until: number }
  | { kind: 'expired' }
  | { kind: 'off' }
  | { kind: 'other'; until: number };

/**
 * Settings section state. Not eligible → hidden. Kill switch off → only a live session is shown
 * (so it can still be ended), everything else hidden. A pending record counts as "aus".
 * A foreign session without a readable / future expiry counts as "aus" (granting replaces it).
 */
export function deviceSessionView(p: {
  enabled: boolean;
  eligible: boolean;
  state: DeviceSessionState | null;
  nowSec: number;
}): DeviceSessionView {
  if (!p.eligible || !p.state) return { kind: 'hidden' };
  const local = p.state.local;
  const active = local && local.status === 'active' ? local : null;
  if (active && active.validUntil > p.nowSec) return { kind: 'active', until: active.validUntil };
  if (!p.enabled) return { kind: 'hidden' };
  if (active) return { kind: 'expired' };
  const other = p.state.otherDeviceUntil;
  if (p.state.foreignPids.length > 0 && other !== null && other > p.nowSec) return { kind: 'other', until: other };
  return { kind: 'off' };
}

/** dd.MM.yyyy, independent of the device's Intl data. */
export function formatSessionDate(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export type OfferChoice = 'grant' | 'decline' | 'dismiss';

/**
 * Claim with the first-claim offer: path 'offer' → ask (sheet). 'grant' → claimNow({ allowGrant }),
 * 'decline' → declineDeviceSession() then the passkey claim, 'dismiss' → no claim (null).
 * Every other path (or a failing / missing path read) → today's claimNow().
 */
export async function claimWithDeviceSessionOffer<R>(deps: {
  claimPath?: () => Promise<ClaimPath>;
  claimNow: (opts?: { allowGrant?: boolean }) => Promise<R>;
  decline: () => Promise<void>;
  askOffer: () => Promise<OfferChoice>;
}): Promise<R | null> {
  let path: ClaimPath = 'passkey';
  try {
    if (deps.claimPath) path = await deps.claimPath();
  } catch {
    path = 'passkey';
  }
  if (path !== 'offer') return deps.claimNow();
  const choice = await deps.askOffer();
  if (choice === 'grant') return deps.claimNow({ allowGrant: true });
  if (choice === 'decline') {
    await deps.decline().catch(() => {});
    return deps.claimNow();
  }
  return null;
}

export const PARTIAL_CLAIM_NOTICE =
  'Ein Teil deiner Münzen ist angekommen. Der Rest wird beim nächsten Abholen umgewandelt.';
