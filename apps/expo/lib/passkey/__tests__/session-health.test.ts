import type { Address } from 'viem';
import type { RecoveryRequest } from '../guardians';
import {
  confirmedSessionOwnerState,
  createOwnerSeenStore,
  OWNER_SEEN_STORE_KEY,
  ownerSeenKey,
  REPLACED_CONFIRM_DELAY_MS,
  sessionOwnerState,
} from '../session-health';

const SAFE = '0x1111111111111111111111111111111111111111' as Address;
const OWNER = '0x22222222222222222222222222222222222222ab' as Address;
const OTHER = '0x3333333333333333333333333333333333333333' as Address;
const session = { safe: SAFE, owner: OWNER };

const noRequest: RecoveryRequest = { guardiansApprovalCount: 0n, newThreshold: 0n, executeAfter: 0n, newOwners: [] };
const foreign: RecoveryRequest = { guardiansApprovalCount: 1n, newThreshold: 1n, executeAfter: 1_800_000_000n, newOwners: [OTHER] };
const mine: RecoveryRequest = { ...foreign, newOwners: [OWNER] };

function deps(over: Partial<Parameters<typeof sessionOwnerState>[1]> = {}) {
  return {
    isDeployed: jest.fn(async () => true),
    readOwners: jest.fn(async () => [OWNER]),
    readRequest: jest.fn(async () => noRequest as RecoveryRequest | null),
    ...over,
  };
}

describe('sessionOwnerState', () => {
  it('a Safe that is not deployed yet is ok and reads nothing else', async () => {
    const d = deps({ isDeployed: jest.fn(async () => false) });
    await expect(sessionOwnerState(session, d)).resolves.toBe('ok');
    expect(d.readOwners).not.toHaveBeenCalled();
  });

  it('owner still an owner, no request: ok (case-insensitive)', async () => {
    const d = deps({ readOwners: jest.fn(async () => ['0x22222222222222222222222222222222222222AB' as Address]) });
    await expect(sessionOwnerState(session, d)).resolves.toBe('ok');
    await expect(sessionOwnerState(session, deps({ readRequest: jest.fn(async () => null) }))).resolves.toBe('ok');
  });

  it('owner still an owner and a foreign request pending: recovering', async () => {
    await expect(sessionOwnerState(session, deps({ readRequest: jest.fn(async () => foreign) }))).resolves.toBe('recovering');
    // A recovery TO this device's owner is not foreign.
    await expect(sessionOwnerState(session, deps({ readRequest: jest.fn(async () => mine) }))).resolves.toBe('ok');
  });

  it('owner no longer an owner: replaced', async () => {
    const d = deps({ readOwners: jest.fn(async () => [OTHER]) });
    await expect(sessionOwnerState(session, d)).resolves.toBe('replaced');
  });

  it('readOwners throwing: unknown, never replaced', async () => {
    const d = deps({ readOwners: jest.fn(async () => Promise.reject(new Error('rpc down'))) });
    await expect(sessionOwnerState(session, d)).resolves.toBe('unknown');
  });

  it('any other read error, or an empty owner list, is unknown', async () => {
    await expect(sessionOwnerState(session, deps({ isDeployed: jest.fn(async () => Promise.reject(new Error('x'))) }))).resolves.toBe('unknown');
    await expect(sessionOwnerState(session, deps({ readRequest: jest.fn(async () => Promise.reject(new Error('x'))) }))).resolves.toBe('unknown');
    await expect(sessionOwnerState(session, deps({ readOwners: jest.fn(async () => []) }))).resolves.toBe('unknown');
  });
});

describe('confirmedSessionOwnerState', () => {
  const memoryStorage = () => {
    const m = new Map<string, string>();
    return { m, getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v) };
  };
  const seenStore = (seen: boolean) => {
    const s = createOwnerSeenStore(memoryStorage());
    return seen ? s.markSeen(ownerSeenKey(session)).then(() => s) : Promise.resolve(s);
  };
  const ownersSeq = (...lists: Address[][]) => {
    const f = jest.fn();
    for (const l of lists) f.mockResolvedValueOnce(l);
    return f as unknown as (s: Address) => Promise<Address[]>;
  };

  it('a first-read replaced followed by ok never ends the session', async () => {
    const wait = jest.fn(async () => undefined);
    const state = await confirmedSessionOwnerState(session, {
      ...deps({ readOwners: ownersSeq([OTHER], [OWNER]) }),
      seen: await seenStore(true),
      wait,
    });
    expect(state).toBe('unknown');
    expect(wait).toHaveBeenCalledWith(REPLACED_CONFIRM_DELAY_MS);
  });

  it('replaced for a session never seen as owner is unknown, without a second read', async () => {
    const d = deps({ readOwners: ownersSeq([OTHER], [OTHER]) });
    const wait = jest.fn(async () => undefined);
    await expect(confirmedSessionOwnerState(session, { ...d, seen: await seenStore(false), wait })).resolves.toBe('unknown');
    expect(wait).not.toHaveBeenCalled();
    expect(d.readOwners).toHaveBeenCalledTimes(1);
  });

  it('two agreeing replaced reads after "seen as owner" → replaced', async () => {
    const state = await confirmedSessionOwnerState(session, {
      ...deps({ readOwners: ownersSeq([OTHER], [OTHER]) }),
      seen: await seenStore(true),
      wait: async () => undefined,
    });
    expect(state).toBe('replaced');
  });

  it('a failing second read, or a failing seen store, is unknown', async () => {
    const failSecond = jest.fn().mockResolvedValueOnce([OTHER]).mockRejectedValueOnce(new Error('rpc'));
    await expect(
      confirmedSessionOwnerState(session, { ...deps({ readOwners: failSecond }), seen: await seenStore(true), wait: async () => undefined }),
    ).resolves.toBe('unknown');
    const broken = { wasSeen: async () => Promise.reject(new Error('x')), markSeen: async () => undefined };
    await expect(
      confirmedSessionOwnerState(session, { ...deps({ readOwners: ownersSeq([OTHER], [OTHER]) }), seen: broken, wait: async () => undefined }),
    ).resolves.toBe('unknown');
  });

  it('an ok read marks the session as seen (persisted), so a later confirmed replacement counts', async () => {
    const storage = memoryStorage();
    const seen = createOwnerSeenStore(storage);
    await expect(confirmedSessionOwnerState(session, { ...deps(), seen, wait: async () => undefined })).resolves.toBe('ok');
    expect(JSON.parse(storage.m.get(OWNER_SEEN_STORE_KEY)!)).toEqual([ownerSeenKey(session)]);
    // a fresh store over the same storage (app restart) still knows it
    const again = createOwnerSeenStore(storage);
    await expect(
      confirmedSessionOwnerState(session, { ...deps({ readOwners: ownersSeq([OTHER], [OTHER]) }), seen: again, wait: async () => undefined }),
    ).resolves.toBe('replaced');
  });

  it('a corrupt seen entry reads as never seen', async () => {
    const storage = memoryStorage();
    storage.m.set(OWNER_SEEN_STORE_KEY, '{not json');
    await expect(createOwnerSeenStore(storage).wasSeen(ownerSeenKey(session))).resolves.toBe(false);
  });
});
