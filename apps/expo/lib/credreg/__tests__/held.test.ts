jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/constants/gnosis', () => ({ credentialRegistryGnosisAddress: '0x' + '11'.repeat(20), credentialRegistryDeployBlock: 0 }));
jest.mock('thirdweb/react', () => ({ useActiveAccount: () => undefined }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { RESERVED_TYPE_IDS } from '@netizen-labs/credential-registry';
import type { Hex } from 'viem';
import type { InvitationView } from '../types';
import { rememberedReady } from '../pending';
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

  it('carries a valid card design and keeps the preview picture for older builds', async () => {
    const { TEMPLATES } = require('@roebel/card-design');
    const design = TEMPLATES[0].design;
    const sha = 'f'.repeat(64);
    const preview = 'https://www.roebel.app/api/credentials/designs/' + sha + '/image';
    const { d } = deps({
      fetchMine: jest.fn(async () => ({
        ok: true as const,
        data: [
          inv('a', tid(1), { design, designSha: sha, type: { ...inv('a', tid(1)).type, imageUrl: preview } }),
          inv('b', tid(2), { design: { schema: 99 }, designSha: sha }),
        ],
      })),
    });
    const [a, b] = await loadHeld(account, d);
    expect(a).toMatchObject({ design, designSha: sha, imageUrl: preview });
    // A broken design is dropped: the card falls back to its picture.
    expect(b.design).toBeUndefined();
    // The design survives the cache.
    const cached = JSON.parse((await AsyncStorage.getItem(heldCacheKey(ADDR)))!);
    expect(cached[0].design).toEqual(design);
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

  it('of a re-issued type the valid invitation with the latest validUntil wins, forever beats a date', async () => {
    const past = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const later = new Date(Date.now() + 100 * 86_400_000).toISOString();
    const run = async (data: InvitationView[]) =>
      loadHeld(account, deps({ fetchMine: jest.fn(async () => ({ ok: true as const, data })) }).d);
    // oldest first, as `mine` sends them
    let held = await run([inv('old', tid(1), { validUntil: past }), inv('new', tid(1), { validUntil: soon })]);
    expect(held.map((h) => h.invitationId)).toEqual(['new']);
    held = await run([inv('a', tid(1), { validUntil: later }), inv('b', tid(1), { validUntil: soon })]);
    expect(held.map((h) => h.invitationId)).toEqual(['a']);
    held = await run([inv('a', tid(1), { validUntil: later }), inv('b', tid(1), { validUntil: null })]);
    expect(held.map((h) => h.invitationId)).toEqual(['b']);
    held = await run([inv('a', tid(1), { validUntil: soon }), inv('b', tid(1), { validUntil: soon })]);
    expect(held.map((h) => h.invitationId)).toEqual(['b']);
  });

  it('an expired entry keeps the visibility known from the cache', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    await loadHeld(account, deps().d); // tid(1) public in cache
    const expired = deps({ fetchMine: jest.fn(async () => ({ ok: true as const, data: [inv('a', tid(1), { validUntil: past })] })) });
    // chain says not held (expired) — still public, as it was
    expired.holdsMany.mockImplementation(async (ids: readonly Hex[]) => ids.map(() => false));
    const [h] = await loadHeld(account, expired.d);
    expect(h.visibility).toBe('public');
  });

  it('the cache never stores proofs or claim signatures, and ignores malformed entries', async () => {
    await loadHeld(account, deps().d);
    const raw = JSON.parse((await AsyncStorage.getItem(heldCacheKey(ADDR)))!);
    expect(raw.every((h: any) => h.claim === null)).toBe(true);
    await AsyncStorage.setItem(heldCacheKey(ADDR), JSON.stringify([...raw, { typeId: 'nope' }, null, { ...raw[0], visibility: 'x' }]));
    const offline = deps({ fetchMine: jest.fn(async () => ({ ok: false as const, code: 'NETWORK_ERROR', message: 'x' })) });
    const cached = await loadHeld(account, offline.d);
    expect(cached.map((h) => h.typeId)).toEqual([tid(1), tid(2)]);
    expect(cached.every((h) => h.claim === null)).toBe(true);
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

describe('waiting badges in loadHolder', () => {
  it('passes the pending badges through and remembers accepted badges not yet held as ready', async () => {
    const badge = (id: string, typeId: Hex, state: InvitationView['state']) =>
      inv(id, typeId, { state, type: { ...inv(id, typeId).type, kind: 'badge', eventId: 'ev-' + id } });
    const pendingBadge = { eventId: 'ev-x', eventTitle: 'Fest', eventDate: '2026-12-05', orgName: null, typeId: null, name: 'Dabei', imageUrl: null, state: 'waiting_for_issue' as const };
    const { d } = deps({
      fetchMine: jest.fn(async () => ({
        ok: true as const,
        data: { invitations: [badge('p', tid(1), 'accepted'), badge('q', tid(2), 'accepted'), badge('r', tid(3), 'invited')], pendingBadges: [pendingBadge] },
      })) as any,
    });
    const r = await loadHolder(account, d);
    expect(r.pendingBadges).toEqual([pendingBadge]);
    // tid(1) is held on chain (public already); tid(2) accepted privately so far: ready.
    expect(r.ready.map((i) => i.id)).toEqual(['q']);
    expect(rememberedReady(ADDR).map((i) => i.id)).toEqual(['q']);
  });
});
