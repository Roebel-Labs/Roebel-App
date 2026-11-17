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

/**
 * "This owner was seen as an owner of this Safe on chain", per `safe:owner`, kept on the device.
 * A `replaced` is only believed for a session that was once seen as an owner: a fresh session (a
 * key just added, a recovery just finalized) read from an RPC node a few blocks behind would
 * otherwise look replaced.
 */
export type OwnerSeenStore = {
  wasSeen: (key: string) => Promise<boolean>;
  markSeen: (key: string) => Promise<void>;
};

export const OWNER_SEEN_STORE_KEY = 'passkey_owner_seen_v1';
const OWNER_SEEN_MAX = 16;

export function ownerSeenKey(session: Pick<PasskeySession, 'safe' | 'owner'>): string {
  return `${session.safe.toLowerCase()}:${session.owner.toLowerCase()}`;
}

/** One SecureStore entry holding the last few `safe:owner` keys (SecureStore keys cannot hold `:`). */
export function createOwnerSeenStore(storage: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}): OwnerSeenStore {
  const read = async (): Promise<string[]> => {
    try {
      const list = JSON.parse((await storage.getItem(OWNER_SEEN_STORE_KEY)) ?? '[]') as unknown;
      return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  };
  return {
    wasSeen: async (key) => (await read()).includes(key),
    async markSeen(key) {
      const list = await read();
      if (list.includes(key)) return;
      await storage.setItem(OWNER_SEEN_STORE_KEY, JSON.stringify([...list, key].slice(-OWNER_SEEN_MAX)));
    },
  };
}

/** Delay before the confirming second read. */
export const REPLACED_CONFIRM_DELAY_MS = 45_000;

/**
 * The state a session may act on. `replaced` only when (a) this `safe:owner` was seen as an owner
 * before, and (b) a second read after `confirmDelayMs` agrees. A first `replaced` for a session
 * never seen as owner, a disagreeing second read, or any failure → `unknown`. Every `ok` /
 * `recovering` read marks the session as seen.
 */
export async function confirmedSessionOwnerState(
  session: Pick<PasskeySession, 'safe' | 'owner'>,
  deps: SessionHealthDeps & { seen: OwnerSeenStore; wait: (ms: number) => Promise<void>; confirmDelayMs?: number },
): Promise<SessionOwnerState> {
  const key = ownerSeenKey(session);
  try {
    const first = await sessionOwnerState(session, deps);
    if (first === 'ok' || first === 'recovering') {
      await deps.seen.markSeen(key).catch(() => undefined);
      return first;
    }
    if (first !== 'replaced') return 'unknown';
    if (!(await deps.seen.wasSeen(key))) return 'unknown';
    await deps.wait(deps.confirmDelayMs ?? REPLACED_CONFIRM_DELAY_MS);
    const second = await sessionOwnerState(session, deps);
    return second === 'replaced' ? 'replaced' : 'unknown';
  } catch {
    return 'unknown';
  }
}
