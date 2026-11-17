/**
 * Is this device's passkey owner still an owner of its Safe?
 *
 *   ok          not deployed yet (nothing can replace a counterfactual Safe), or still an owner
 *               with no foreign recovery pending
 *   recovering  still an owner, and someone else's recovery is pending (the banner's case)
 *   replaced    the Safe is deployed and this owner is no longer in getOwners(): a recovery
 *               finished on another device
 *   unknown     any read failed (or answered nonsense)
 *
 * Only `replaced` may end a session. `unknown` is never a logout (spec 5.9): a flaky RPC must not
 * sign anyone out.
 */
import { isAddressEqual, type Address } from 'viem';
import type { RecoveryRequest } from './guardians';
import { isForeignRecoveryPending } from './recovery-flow';
import type { PasskeySession } from './session';

export type SessionOwnerState = 'ok' | 'recovering' | 'replaced' | 'unknown';

export type SessionHealthDeps = {
  isDeployed: (safe: Address) => Promise<boolean>;
  readOwners: (safe: Address) => Promise<Address[]>;
  readRequest: (safe: Address) => Promise<RecoveryRequest | null>;
};

export async function sessionOwnerState(
  session: Pick<PasskeySession, 'safe' | 'owner'>,
  deps: SessionHealthDeps,
): Promise<SessionOwnerState> {
  try {
    if (!(await deps.isDeployed(session.safe))) return 'ok';
    const owners = await deps.readOwners(session.safe);
    // A deployed Safe always has at least one owner: an empty list is a bad read, not a replacement.
    if (owners.length === 0) return 'unknown';
    if (!owners.some((o) => isAddressEqual(o, session.owner))) return 'replaced';
    const request = await deps.readRequest(session.safe);
    return isForeignRecoveryPending(request, session.owner) ? 'recovering' : 'ok';
  } catch {
    return 'unknown';
  }
}
