jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/constants/gnosis', () => ({ credentialRegistryGnosisAddress: '0x' + '11'.repeat(20), credentialRegistryDeployBlock: 0 }));
jest.mock('thirdweb/react', () => ({ useActiveAccount: () => undefined }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { RESERVED_TYPE_IDS } from '@netizen-labs/credential-registry';
import type { Hex } from 'viem';
import type { InvitationView } from '../types';
import { __resetPublicDirectory, clearHeld, heldCacheKey, loadHeld, loadHolder, loadPublicHeld, type HeldDeps } from '../held';

const ADDR = '0x' + 'AB'.repeat(20);
const account = { address: ADDR, signMessage: jest.fn(async () => '0x') };
const tid = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as Hex;

const inv = (id: string, typeId: Hex, over: Partial<InvitationView> = {}): InvitationView => ({
  id,
  state: 'accepted',
  type: {
    typeId,
    name: 'Typ ' + id,
    description: null,
    imageUrl: null,
    kind: 'role',
    recognised: false,
    publicClaimAllowed: true,
    benefits: [],
  },
  org: { accountId: 'org1', name: 'Verein', avatarUrl: null },
  validUntil: null,
  claim: {
    batchId: '1',
    leaf: { kind: 'account', typeId, subject: ADDR as any, validUntil: '0', salt: tid(99) },
    proof: [],
    claimSignature: null,
  },
  ...over,
});

function deps(over: Partial<HeldDeps> = {}) {
  const holdsMany = jest.fn(async (ids: readonly Hex[]) => ids.map((id) => id === tid(1)));
  const fetchMine = jest.fn(async () => ({
    ok: true as const,
    data: [inv('a', tid(1)), inv('b', tid(2)), inv('c', tid(3), { state: 'revoked' }), inv('d', tid(4), { state: 'invited' })],
  }));
  const d: HeldDeps = { fetchMine, reader: () => ({ holdsMany }) as any, configured: () => true, ...over };
  return { d, holdsMany, fetchMine };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetPublicDirectory();
  delete (global as any).fetch;
});

describe('loadHeld', () => {
  it('loadHeld marks chain-held types public and accepted-only ones private', async () => {
    const { d, holdsMany } = deps();
    const held = await loadHeld(account, d);
    expect(held.map((h) => [h.typeId, h.visibility])).toEqual([
      [tid(1), 'public'],
      [tid(2), 'private'],
    ]);
    expect(holdsMany).toHaveBeenCalledTimes(1);
    expect(holdsMany.mock.calls[0][0]).toEqual([tid(1), tid(2)]);
    expect(held[1]).toMatchObject({ invitationId: 'b', title: 'Typ b', orgName: 'Verein', claim: expect.objectContaining({ batchId: '1' }) });
  });

  it('converts validUntil to unix seconds', async () => {
    const { d } = deps({
      fetchMine: jest.fn(async () => ({ ok: true as const, data: [inv('a', tid(1), { validUntil: '2027-01-01T00:00:00.000Z' })] })),
    });
    const [h] = await loadHeld(account, d);
    expect(h.validUntil).toBe(Date.UTC(2027, 0, 1) / 1000);
  });

  it('loadHolder returns pending invitations separately', async () => {
    const { d } = deps();
    const r = await loadHolder(account, d);
    expect(r.pending.map((p) => p.id)).toEqual(['d']);
    expect(r.fromCache).toBe(false);
  });

  it('loadHeld returns the cache when the request fails and refreshes it when it succeeds', async () => {
    const { d } = deps();
    await loadHeld(account, d);
    const key = heldCacheKey(ADDR);
    expect(key).toBe('credreg:held:v1:' + ADDR.toLowerCase());
    expect(JSON.parse((await AsyncStorage.getItem(key))!)).toHaveLength(2);

    const offline = deps({ fetchMine: jest.fn(async () => ({ ok: false as const, code: 'NETWORK_ERROR', message: 'x' })) });
    const cached = await loadHeld(account, offline.d);
    expect(cached.map((h) => h.typeId)).toEqual([tid(1), tid(2)]);
    expect(offline.holdsMany).not.toHaveBeenCalled();

    const fresh = deps({ fetchMine: jest.fn(async () => ({ ok: true as const, data: [inv('x', tid(7))] })) });
    const now = await loadHeld(account, fresh.d);
    expect(now.map((h) => h.typeId)).toEqual([tid(7)]);
    expect(JSON.parse((await AsyncStorage.getItem(key))!).map((h: any) => h.typeId)).toEqual([tid(7)]);
  });

  it('a failing chain read keeps cached visibility and does not overwrite the cache', async () => {
    const { d } = deps();
    await loadHeld(account, d);
    const broken = deps({ reader: () => ({ holdsMany: jest.fn(async () => { throw new Error('rpc'); }) }) as any });
    const held = await loadHeld(account, broken.d);
    expect(held.map((h) => h.visibility)).toEqual(['public', 'private']);
  });

  it('after clearHeld a new loadHeld restores private entries from the server (reinstall case)', async () => {
    const { d } = deps();
    await loadHeld(account, d);
    await clearHeld(ADDR);
    expect(await AsyncStorage.getItem(heldCacheKey(ADDR))).toBeNull();
    const again = deps();
    const held = await loadHeld(account, again.d);
    expect(again.fetchMine).toHaveBeenCalledTimes(1);
    expect(held.find((h) => h.typeId === tid(2))).toMatchObject({ visibility: 'private', invitationId: 'b' });
  });

  it('with no registry configured nothing is fetched and nothing is read on chain', async () => {
    const reader = jest.fn();
    const { d, fetchMine } = deps({ configured: () => false, reader });
    expect(await loadHeld(account, d)).toEqual([]);
    expect(fetchMine).not.toHaveBeenCalled();
    expect(reader).not.toHaveBeenCalled();
  });
});

describe('loadPublicHeld', () => {
  const directory = [
    { typeId: tid(1), kind: 'role', name: 'Kassenwart', imageUrl: null, orgName: 'Verein', orgAccountId: 'o', recognised: false },
    { typeId: tid(2), kind: 'badge', name: 'Helfer', imageUrl: 'https://x/y.png', orgName: null, orgAccountId: null, recognised: true },
    { typeId: RESERVED_TYPE_IDS.guest, kind: 'badge', name: 'Gast', imageUrl: null, orgName: null, orgAccountId: null, recognised: true },
  ];

  it('uses the public directory plus one holdsMany, returns only public entries, cached 5 minutes', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ types: directory }) }));
    (global as any).fetch = fetchMock;
    const holdsMany = jest.fn(async (ids: readonly Hex[]) => ids.map((id) => id === tid(2)));
    const d = { reader: () => ({ holdsMany }) as any, configured: () => true };
    const res = await loadPublicHeld(ADDR as any, d);
    expect(res).toEqual([
      expect.objectContaining({ typeId: tid(2), kind: 'badge', title: 'Helfer', visibility: 'public', invitationId: null, claim: null, recognised: true }),
    ]);
    expect(holdsMany.mock.calls[0][0]).toEqual([tid(1), tid(2)]);
    expect((fetchMock.mock.calls[0] as any)[0]).toMatch(/\/api\/credentials\/types$/);
    await loadPublicHeld(ADDR as any, d);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns [] when the directory is unreachable or no registry is configured', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
    const holdsMany = jest.fn();
    expect(await loadPublicHeld(ADDR as any, { reader: () => ({ holdsMany }) as any, configured: () => true })).toEqual([]);
    const reader = jest.fn();
    expect(await loadPublicHeld(ADDR as any, { reader, configured: () => false })).toEqual([]);
    expect(reader).not.toHaveBeenCalled();
  });
});
