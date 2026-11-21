/**
 * Which way a passkey Münzen claim goes (pure, no I/O).
 *
 *   'session'            this device holds a live mint session: no prompt
 *   'renew-then-session' the session expires within SESSION_RENEW_BEFORE_SEC (or has expired):
 *                        renew (one prompt), then session ops
 *   'offer'              eligible, no session, not declined: the first-claim offer sheet
 *   'passkey'            today's one-batch passkey claim (kill switch off, not eligible, declined)
 */
import { isWordsOwner, identityKind, type PasskeySession } from '../session';
import { MINT_SESSION_KINDS, SESSION_RENEW_BEFORE_SEC } from './builders';
import type { DeviceSessionState } from './grant';

export type ClaimPath = 'session' | 'renew-then-session' | 'offer' | 'passkey';

/** AsyncStorage key: unix seconds until which "Nicht jetzt" suppresses the offer. */
export const DEVICE_SESSION_DECLINED_KEY = 'rt_device_session_declined_until';
/** "Nicht jetzt" suppresses the offer for 7 days. */
export const DEVICE_SESSION_DECLINE_SEC = 7 * 86_400;

/**
 * Static eligibility: a passkey owner (never 12 words), a legacy identity (never a Safe identity),
 * and a native platform (on web the secure store is localStorage: never offer device sessions there).
 * Deployment is checked by the state read (an undeployed Safe has no layout → no state).
 */
export function isDeviceSessionEligible(
  session: Pick<PasskeySession, 'safe' | 'identity' | 'ownerType' | 'credentialId'> | null | undefined,
  platformOs: string,
): boolean {
  if (!session || platformOs === 'web') return false;
  if (isWordsOwner(session) || !session.credentialId) return false;
  return identityKind(session) === 'legacy';
}

export function chooseClaimPath(p: {
  enabled: boolean;
  eligible: boolean;
  state: DeviceSessionState | null;
  nowSec: number;
  declinedUntilSec: number | null;
}): ClaimPath {
  // 1. kill switch off / not eligible / state unreadable (undeployed, RPC error)
  if (!p.enabled || !p.eligible || !p.state) return 'passkey';
  // 2. a live local session (both pids still on chain)
  const rec = p.state.local;
  if (rec && rec.status === 'active') {
    const onChain = new Set(p.state.onChainPids.map((x) => x.toLowerCase()));
    if (MINT_SESSION_KINDS.every((k) => onChain.has(rec.permissionIds[k].toLowerCase()))) {
      return rec.validUntil - p.nowSec >= SESSION_RENEW_BEFORE_SEC ? 'session' : 'renew-then-session';
    }
  }
  // 3. "Nicht jetzt"
  if (p.declinedUntilSec !== null && p.declinedUntilSec > p.nowSec) return 'passkey';
  // 4.
  return 'offer';
}
