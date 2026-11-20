jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/constants/gnosis', () => ({ credentialRegistryGnosisAddress: '0x' + '11'.repeat(20), credentialRegistryDeployBlock: 0 }));
jest.mock('../api', () => ({ respondInvitation: jest.fn() }));
jest.mock('@/lib/org-safe/send', () => ({ sendOrgCalls: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Hex } from 'viem';
import { readyClaimCalls, rememberReady, sendReadyClaims, setBadgeWish, settleArrivedBadges } from '../pending';
import { claimFor } from '../claim-call';
import type { InvitationView } from '../types';

const ADDR = '0x' + 'ab'.repeat(20);
const account = { address: ADDR } as any;
const tid = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as Hex;

function badgeInv(n: number, over: Partial<InvitationView> = {}): InvitationView {
  return {
    id: `inv-${n}`,
    state: 'invited',
    type: { typeId: tid(n), name: `Dabei ${n}`, description: null, imageUrl: null, kind: 'badge', recognised: false, publicClaimAllowed: true, benefits: [], eventId: `ev-${n}` },
    org: null,
    validUntil: null,
    claim: { batchId: String(10 + n), leaf: { kind: 'account', typeId: tid(n), subject: ADDR as any, validUntil: '0', salt: tid(1000 + n) }, proof: [tid(2000 + n)], claimSignature: null },
    ...over,
  };
}

describe('waiting stamps', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('a private wish accepts without any transaction', async () => {
    await setBadgeWish(ADDR, 'ev-1', 'private');
    const respond = jest.fn(async () => ({ ok: true as const, data: null }));
    const send = jest.fn();
    const r = await settleArrivedBadges(account, [badgeInv(1)], { respond, send } as any);
    expect(respond).toHaveBeenCalledWith(account, 'inv-1', 'accept');
    expect(send).not.toHaveBeenCalled();
    expect(r).toEqual({ acceptedPrivately: 1, ready: [] });
  });

  it('a public wish accepts and the claim becomes ready', async () => {
    await setBadgeWish(ADDR, 'ev-2', 'public');
    const respond = jest.fn(async () => ({ ok: true as const, data: null }));
    const r = await settleArrivedBadges(account, [badgeInv(2)], { respond });
    expect(respond).toHaveBeenCalledWith(account, 'inv-2', 'accept');
    expect(r.acceptedPrivately).toBe(0);
    expect(r.ready.map((i) => [i.id, i.state])).toEqual([['inv-2', 'accepted']]);
    // A failed accept leaves the invitation for the accept screen.
    await setBadgeWish(ADDR, 'ev-3', 'public');
    const failing = jest.fn(async () => ({ ok: false as const, code: 'NETWORK_ERROR', message: 'x' }));
    expect(await settleArrivedBadges(account, [badgeInv(3)], { respond: failing })).toEqual({ acceptedPrivately: 0, ready: [] });
  });

  it('an invitation without a wish is left for the accept screen', async () => {
    const respond = jest.fn(async () => ({ ok: true as const, data: null }));
    const membership = badgeInv(5, { type: { ...badgeInv(5).type, kind: 'membership', eventId: null } });
    await setBadgeWish(ADDR, 'ev-5', 'public');
    const r = await settleArrivedBadges(account, [badgeInv(4), membership, badgeInv(6, { state: 'accepted' })], { respond });
    expect(respond).not.toHaveBeenCalled();
    expect(r).toEqual({ acceptedPrivately: 0, ready: [] });
  });

  it('at most five ready claims ride along', async () => {
    const invs = Array.from({ length: 7 }, (_, k) => badgeInv(k + 10, { state: 'accepted' }));
    for (const i of invs) await setBadgeWish(ADDR, i.type.eventId!, 'public');
    // One of them has a private wish: never claimed publicly.
    await setBadgeWish(ADDR, 'ev-10', 'private');
    rememberReady(ADDR, invs);
    const calls = await readyClaimCalls(ADDR);
    expect(calls).toHaveLength(5);
    expect(calls[0]).toEqual(claimFor(invs[1]));
    expect(await readyClaimCalls('0x' + 'cd'.repeat(20))).toEqual([]);
  });

  it('the banner sends the ready claims alone in one operation', async () => {
    const invs = [badgeInv(30, { state: 'accepted' }), badgeInv(31, { state: 'accepted' })];
    for (const i of invs) await setBadgeWish(ADDR, i.type.eventId!, 'public');
    rememberReady(ADDR, invs);
    const send = jest.fn(async () => '0xhash');
    expect(await sendReadyClaims(account, { send })).toBe(2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(account, [claimFor(invs[0]), claimFor(invs[1])]);
    rememberReady(ADDR, []);
    expect(await sendReadyClaims(account, { send })).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
