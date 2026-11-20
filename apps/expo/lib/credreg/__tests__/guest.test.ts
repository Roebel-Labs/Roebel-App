jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/constants/gnosis', () => ({
  credentialRegistryGnosisAddress: '0x' + '11'.repeat(20),
  credentialRegistryDeployBlock: 0,
  citizenNFTGnosisAddress: '0x' + '22'.repeat(20),
}));
jest.mock('@/lib/org-safe/send', () => ({ sendOrgCalls: jest.fn(), sendOrgCallsKeepingHash: jest.fn() }));
jest.mock('@/lib/supabase-app-settings', () => ({
  fetchCredentialsEnabled: jest.fn(async () => false),
  fetchCredentialsEnabledProduction: jest.fn(async () => false),
}));
jest.mock('expo-updates', () => ({ channel: 'preview' }));

import { RESERVED_TYPE_IDS, selfClaimCall } from '@netizen-labs/credential-registry';
import type { Hex } from 'viem';
import {
  __resetGuestCacheForTests,
  guestCallIfNeeded,
  guestSkipKey,
  piggybackSkipKey,
  sendWithGuestClaim,
  sendWithPiggyback,
  withGuestClaim,
  type GuestDeps,
} from '../guest';

const REG = ('0x' + '11'.repeat(20)) as `0x${string}`;
const ADDR = ('0x' + 'ab'.repeat(20)) as `0x${string}`;
const account = { address: ADDR } as any;
const GUEST = selfClaimCall(REG, RESERVED_TYPE_IDS.guest);
const REAL = { to: ('0x' + '33'.repeat(20)) as `0x${string}`, data: '0x12345678' as Hex };
const HASH = ('0x' + 'ee'.repeat(32)) as Hex;
// Refused before submission (passkey sponsor answered 4xx / thirdweb paymaster): safe to resend.
const SPONSOR_REFUSED = new Error('HTTP 403: Diese Aktion wird nicht übernommen');
// Possibly sent: the op may land later.
const THIRDWEB_TIMEOUT = new Error('Timeout waiting for userOp to be mined on chain 100 with UserOp hash 0xabc');
const PASSKEY_TIMEOUT = new Error('timed out waiting for the userOp receipt');
const ABORTED = Object.assign(new Error('Aborted'), { name: 'AbortError' });

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    map: m,
    getItem: jest.fn(async (k: string) => m.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      m.set(k, v);
    }),
  };
}

let storage: ReturnType<typeof memoryStorage>;
let clock: number;

function deps(over: Partial<GuestDeps> = {}): GuestDeps & { holds: jest.Mock; send: jest.Mock; sendKeepingHash: jest.Mock } {
  return {
    configured: () => true,
    allowed: async () => true,
    holds: jest.fn(async () => false),
    storage,
    now: () => clock,
    send: jest.fn(async () => HASH),
    sendKeepingHash: jest.fn(async () => ({ txHash: HASH, confirmed: true })),
    ...over,
  } as any;
}

class PasskeyCancelledError extends Error {
  constructor() {
    super('Passkey-Vorgang abgebrochen');
    this.name = 'PasskeyCancelledError';
  }
}

beforeEach(() => {
  __resetGuestCacheForTests();
  storage = memoryStorage();
  clock = 1_800_000_000_000;
});

describe('guestCallIfNeeded', () => {
  it('adds the Guest call for a non-citizen who does not hold it', async () => {
    const d = deps();
    await expect(guestCallIfNeeded({ address: ADDR, isCitizen: false }, d)).resolves.toEqual(GUEST);
    expect(d.holds).toHaveBeenCalledWith(RESERVED_TYPE_IDS.guest, ADDR);
  });

  it('adds nothing for a citizen, a holder, a closed gate or a failing read', async () => {
    const citizen = deps();
    await expect(guestCallIfNeeded({ address: ADDR, isCitizen: true }, citizen)).resolves.toBeNull();
    expect(citizen.holds).not.toHaveBeenCalled();

    __resetGuestCacheForTests();
    await expect(guestCallIfNeeded({ address: ADDR, isCitizen: false }, deps({ holds: jest.fn(async () => true) }))).resolves.toBeNull();

    __resetGuestCacheForTests();
    const closed = deps({ allowed: async () => false });
    await expect(guestCallIfNeeded({ address: ADDR, isCitizen: false }, closed)).resolves.toBeNull();
    expect(closed.holds).not.toHaveBeenCalled();

    __resetGuestCacheForTests();
    const unconfigured = deps({ configured: () => false, allowed: jest.fn(async () => true) });
    await expect(guestCallIfNeeded({ address: ADDR, isCitizen: false }, unconfigured)).resolves.toBeNull();
    expect(unconfigured.allowed).not.toHaveBeenCalled();

    __resetGuestCacheForTests();
    const failing = deps({ holds: jest.fn(async () => Promise.reject(new Error('rpc down'))) });
    await expect(guestCallIfNeeded({ address: ADDR, isCitizen: false }, failing)).resolves.toBeNull();

    __resetGuestCacheForTests();
    const gateThrows = deps({ allowed: async () => Promise.reject(new Error('x')) });
    await expect(guestCallIfNeeded({ address: ADDR, isCitizen: false }, gateThrows)).resolves.toBeNull();
  });

  it('a lazy citizen check runs only behind the open gate and a failing check counts as citizen', async () => {
    const lazy = jest.fn(async () => false);
    await expect(guestCallIfNeeded({ address: ADDR, isCitizen: lazy }, deps({ allowed: async () => false }))).resolves.toBeNull();
    expect(lazy).not.toHaveBeenCalled();
    await expect(guestCallIfNeeded({ address: ADDR, isCitizen: lazy }, deps())).resolves.toEqual(GUEST);
    expect(lazy).toHaveBeenCalledTimes(1);
    __resetGuestCacheForTests();
    await expect(
      guestCallIfNeeded({ address: ADDR, isCitizen: () => Promise.reject(new Error('rpc')) }, deps()),
    ).resolves.toBeNull();
  });

  it('the holding is read once per address and session', async () => {
    const d = deps({ holds: jest.fn(async () => true) });
    await guestCallIfNeeded({ address: ADDR, isCitizen: false }, d);
    await guestCallIfNeeded({ address: ADDR, isCitizen: false }, d);
    expect(d.holds).toHaveBeenCalledTimes(1);
  });
});

describe('sendWithGuestClaim', () => {
  it('without a Guest call the operation is sent exactly as before', async () => {
    const d = deps({ allowed: async () => false });
    await expect(sendWithGuestClaim(account, [REAL], { isCitizen: false }, d)).resolves.toBe(HASH);
    expect(d.send).toHaveBeenCalledWith(account, [REAL]);
    expect(d.sendKeepingHash).not.toHaveBeenCalled();
  });

  it('one operation carries the Guest call first and the real calls after it', async () => {
    const d = deps();
    await expect(sendWithGuestClaim(account, [REAL], { isCitizen: false }, d)).resolves.toBe(HASH);
    expect(d.sendKeepingHash).toHaveBeenCalledTimes(1);
    expect(d.sendKeepingHash).toHaveBeenCalledWith(account, [GUEST, REAL]);
    expect(d.send).not.toHaveBeenCalled();
    // Now held: the next operation carries no Guest call and reads nothing.
    await sendWithGuestClaim(account, [REAL], { isCitizen: false }, d);
    expect(d.send).toHaveBeenCalledWith(account, [REAL]);
    expect(d.holds).toHaveBeenCalledTimes(1);
  });

  it('a refusal before submission with the Guest call is retried once without it and the real action succeeds', async () => {
    const d = deps({ sendKeepingHash: jest.fn(async () => Promise.reject(SPONSOR_REFUSED)) });
    await expect(sendWithGuestClaim(account, [REAL], { isCitizen: false }, d)).resolves.toBe(HASH);
    expect(d.sendKeepingHash).toHaveBeenCalledTimes(1);
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.send).toHaveBeenCalledWith(account, [REAL]);
  });

  it('a failure of the real action without Guest surfaces the real error, retried only once', async () => {
    const real = new Error('real failure');
    const d = deps({
      sendKeepingHash: jest.fn(async () => Promise.reject(SPONSOR_REFUSED)),
      send: jest.fn(async () => Promise.reject(real)),
    });
    await expect(sendWithGuestClaim(account, [REAL], { isCitizen: false }, d)).rejects.toBe(real);
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['thirdweb receipt timeout', THIRDWEB_TIMEOUT],
    ['passkey receipt timeout', PASSKEY_TIMEOUT],
    ['aborted submission', ABORTED],
  ])('sent then %s: never sent a second time', async (_label, err) => {
    const d = deps({ sendKeepingHash: jest.fn(async () => Promise.reject(err)) });
    await expect(sendWithGuestClaim(account, [REAL], { isCitizen: false }, d)).rejects.toBe(err);
    expect(d.send).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();

    __resetGuestCacheForTests();
    const run = jest.fn(async () => Promise.reject(err));
    await expect(withGuestClaim({ address: ADDR, isCitizen: false }, run, deps())).rejects.toBe(err);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a mined revert (atomic, nothing happened) is retried once without Guest', async () => {
    const d = deps({ sendKeepingHash: jest.fn(async () => Promise.reject(new Error('userOp reverted: x'))) });
    await expect(sendWithGuestClaim(account, [REAL], { isCitizen: false }, d)).resolves.toBe(HASH);
    expect(d.send).toHaveBeenCalledWith(account, [REAL]);
  });

  it('after a refusal Guest is re-read: held now or an unreadable register means no resend', async () => {
    const holdsNow = deps({
      holds: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
      sendKeepingHash: jest.fn(async () => Promise.reject(SPONSOR_REFUSED)),
    });
    await expect(sendWithGuestClaim(account, [REAL], { isCitizen: false }, holdsNow)).rejects.toBe(SPONSOR_REFUSED);
    expect(holdsNow.send).not.toHaveBeenCalled();
    // Marked held: the next operation carries no Guest call.
    await sendWithGuestClaim(account, [REAL], { isCitizen: false }, holdsNow);
    expect(holdsNow.send).toHaveBeenCalledWith(account, [REAL]);

    __resetGuestCacheForTests();
    const unreadable = deps({
      holds: jest.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('rpc down')),
      sendKeepingHash: jest.fn(async () => Promise.reject(SPONSOR_REFUSED)),
    });
    await expect(sendWithGuestClaim(account, [REAL], { isCitizen: false }, unreadable)).rejects.toBe(SPONSOR_REFUSED);
    expect(unreadable.send).not.toHaveBeenCalled();
  });

  it('a cancellation by the person is not retried', async () => {
    const cancel = new PasskeyCancelledError();
    const d = deps({ sendKeepingHash: jest.fn(async () => Promise.reject(cancel)) });
    await expect(sendWithGuestClaim(account, [REAL], { isCitizen: false }, d)).rejects.toBe(cancel);
    expect(d.send).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('an operation that went out but whose receipt is unknown is not sent again', async () => {
    const d = deps({ sendKeepingHash: jest.fn(async () => ({ txHash: HASH, confirmed: false })) });
    await expect(sendWithGuestClaim(account, [REAL], { isCitizen: false }, d)).rejects.toBeInstanceOf(Error);
    expect(d.send).not.toHaveBeenCalled();
  });

  it('after a fallback the Guest call is skipped for 24 hours', async () => {
    const d = deps({ sendKeepingHash: jest.fn(async () => Promise.reject(SPONSOR_REFUSED)) });
    await sendWithGuestClaim(account, [REAL], { isCitizen: false }, d);
    expect(storage.map.has(guestSkipKey(ADDR))).toBe(true);

    __resetGuestCacheForTests();
    clock += 23 * 3600_000;
    await expect(guestCallIfNeeded({ address: ADDR, isCitizen: false }, d)).resolves.toBeNull();
    await sendWithGuestClaim(account, [REAL], { isCitizen: false }, d);
    expect(d.sendKeepingHash).toHaveBeenCalledTimes(1);

    clock += 2 * 3600_000;
    await expect(guestCallIfNeeded({ address: ADDR, isCitizen: false }, d)).resolves.toEqual(GUEST);
  });

  it('an empty operation sends nothing', async () => {
    const d = deps();
    await expect(sendWithGuestClaim(account, [], { isCitizen: false }, d)).resolves.toBeNull();
    expect(d.send).not.toHaveBeenCalled();
    expect(d.sendKeepingHash).not.toHaveBeenCalled();
  });
});

describe('withGuestClaim (custom senders)', () => {
  it('runs once with the Guest call, then once with null after a failure', async () => {
    const run = jest.fn(async (g: unknown) => {
      if (g) throw SPONSOR_REFUSED;
      return 'ok';
    });
    await expect(withGuestClaim({ address: ADDR, isCitizen: false }, run, deps())).resolves.toBe('ok');
    expect(run.mock.calls).toEqual([[GUEST], [null]]);
  });

  it('a closed gate runs once with null', async () => {
    const run = jest.fn(async () => 'ok');
    await withGuestClaim({ address: ADDR, isCitizen: false }, run, deps({ configured: () => false }));
    expect(run.mock.calls).toEqual([[null]]);
  });
});

describe('sendWithPiggyback', () => {
  const CLAIM_A = { to: REG, data: '0xaaaa' as Hex };
  const CLAIM_B = { to: REG, data: '0xbbbb' as Hex };

  it('sendWithPiggyback orders Guest, ready claims, then the real calls in one operation', async () => {
    const d = { ...deps(), readyClaims: jest.fn(async () => [CLAIM_A, CLAIM_B]) };
    await expect(sendWithPiggyback(account, [REAL], { isCitizen: false }, d)).resolves.toBe(HASH);
    expect(d.sendKeepingHash).toHaveBeenCalledTimes(1);
    expect(d.sendKeepingHash).toHaveBeenCalledWith(account, [GUEST, CLAIM_A, CLAIM_B, REAL]);
    expect(d.send).not.toHaveBeenCalled();
    // A claim that is also one of the real calls (accepting that badge now) is not sent twice.
    const d2 = { ...deps(), readyClaims: jest.fn(async () => [CLAIM_A, CLAIM_B]) };
    await sendWithPiggyback(account, [CLAIM_A], { isCitizen: true }, d2);
    expect(d2.sendKeepingHash).toHaveBeenCalledWith(account, [CLAIM_B, CLAIM_A]);
    // Nothing ready: exactly sendWithGuestClaim.
    const d3 = { ...deps({ allowed: async () => false }), readyClaims: jest.fn(async () => []) };
    await sendWithPiggyback(account, [REAL], { isCitizen: false }, d3);
    expect(d3.send).toHaveBeenCalledWith(account, [REAL]);
  });

  it('a failing piggyback falls back to the real calls alone and skips claims for 24 hours', async () => {
    const d = { ...deps({ sendKeepingHash: jest.fn(async () => Promise.reject(SPONSOR_REFUSED)) }), readyClaims: jest.fn(async () => [CLAIM_A]) };
    await expect(sendWithPiggyback(account, [REAL], { isCitizen: true }, d)).resolves.toBe(HASH);
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.send).toHaveBeenCalledWith(account, [REAL]);
    expect(storage.map.has(piggybackSkipKey(ADDR))).toBe(true);
    // Within 24 hours no claim rides along (and none is even looked up).
    clock += 23 * 3600_000;
    await sendWithPiggyback(account, [REAL], { isCitizen: true }, d);
    expect(d.readyClaims).toHaveBeenCalledTimes(1);
    expect(d.send).toHaveBeenLastCalledWith(account, [REAL]);
    clock += 2 * 3600_000;
    d.sendKeepingHash.mockImplementation(async () => ({ txHash: HASH, confirmed: true }));
    await sendWithPiggyback(account, [REAL], { isCitizen: true }, d);
    expect(d.sendKeepingHash).toHaveBeenLastCalledWith(account, [CLAIM_A, REAL]);
  });

  it('a piggyback operation that may have gone out is never sent again', async () => {
    const d = { ...deps({ sendKeepingHash: jest.fn(async () => Promise.reject(THIRDWEB_TIMEOUT)) }), readyClaims: jest.fn(async () => [CLAIM_A]) };
    await expect(sendWithPiggyback(account, [REAL], { isCitizen: true }, d)).rejects.toBe(THIRDWEB_TIMEOUT);
    expect(d.send).not.toHaveBeenCalled();
  });
});
