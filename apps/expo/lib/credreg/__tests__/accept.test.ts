jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/constants/gnosis', () => ({ credentialRegistryGnosisAddress: '0x' + '11'.repeat(20), credentialRegistryDeployBlock: 0 }));
jest.mock('@/lib/org-safe/send', () => ({ sendOrgCalls: jest.fn() }));
jest.mock('thirdweb/react', () => ({ useActiveAccount: () => undefined }));

import { claimCall, renounceCall } from '@netizen-labs/credential-registry';
import type { Hex } from 'viem';
import type { HeldCredential } from '../held';
import type { InvitationView } from '../types';
import { acceptInvitation, acceptOptions, makePrivate, makePublic, type AcceptDeps } from '../accept';

const REG = ('0x' + '11'.repeat(20)) as `0x${string}`;
const ADDR = '0x' + 'ab'.repeat(20);
const account = { address: ADDR, signMessage: jest.fn(async () => '0x') } as any;
const tid = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as Hex;
const SIG = ('0x' + 'cd'.repeat(65)) as Hex;

function inv(over: Partial<InvitationView> = {}, type: Partial<InvitationView['type']> = {}): InvitationView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    state: 'invited',
    type: {
      typeId: tid(7),
      name: 'Kassenwart',
      description: null,
      imageUrl: null,
      kind: 'membership',
      recognised: false,
      publicClaimAllowed: true,
      benefits: [],
      ...type,
    },
    org: { accountId: 'org1', name: 'Verein', avatarUrl: null },
    validUntil: null,
    claim: {
      batchId: '3',
      leaf: { kind: 'account', typeId: tid(7), subject: ADDR as any, validUntil: '0', salt: tid(99) },
      proof: [tid(1), tid(2)],
      claimSignature: null,
    },
    ...over,
  };
}

function deps(over: Partial<AcceptDeps> = {}): AcceptDeps & { send: jest.Mock; respond: jest.Mock; fetchMine: jest.Mock } {
  return {
    send: jest.fn(async () => {}),
    respond: jest.fn(async () => ({ ok: true, data: null })),
    fetchMine: jest.fn(async () => ({ ok: true, data: [] })),
    holds: jest.fn(async () => false),
    configured: () => true,
    nowSec: () => 1_800_000_000,
    ...over,
  } as any;
}

const expectedClaim = (i: InvitationView, sig?: Hex) =>
  claimCall(REG, {
    batchId: BigInt(i.claim.batchId),
    leaf: { ...i.claim.leaf, validUntil: BigInt(i.claim.leaf.validUntil) },
    proof: i.claim.proof,
    claimSignature: sig,
  });

describe('acceptOptions', () => {
  it('a recognised role can only be accepted publicly', () => {
    expect(acceptOptions(inv({}, { kind: 'role', recognised: true }))).toEqual({ canPublic: true, canPrivate: false, reason: 'office' });
  });

  it('a membership of an org whose members may not be public can only be accepted privately', () => {
    expect(acceptOptions(inv({}, { kind: 'membership', publicClaimAllowed: false }))).toEqual({
      canPublic: false,
      canPrivate: true,
      reason: 'private_only',
    });
  });

  it('a free invitation offers both', () => {
    expect(acceptOptions(inv())).toEqual({ canPublic: true, canPrivate: true, reason: 'free' });
    expect(acceptOptions(inv({}, { kind: 'badge' }))).toEqual({ canPublic: true, canPrivate: true, reason: 'free' });
  });
});

describe('acceptInvitation', () => {
  it("public sends exactly one claim call for the app's registry address, then reports accept", async () => {
    const d = deps();
    const i = inv();
    const order: string[] = [];
    d.send.mockImplementation(async () => void order.push('send'));
    d.respond.mockImplementation(async () => {
      order.push('respond');
      return { ok: true, data: null };
    });
    expect(await acceptInvitation(account, i, 'public', d)).toEqual({ ok: true });
    expect(d.send).toHaveBeenCalledTimes(1);
    const [, calls] = d.send.mock.calls[0];
    expect(calls).toEqual([expectedClaim(i)]);
    expect(calls[0].to).toBe(REG);
    expect(d.respond).toHaveBeenCalledWith(account, i.id, 'accept');
    expect(order).toEqual(['send', 'respond']);
  });

  it('private sends no transaction and reports accept', async () => {
    const d = deps();
    const i = inv();
    expect(await acceptInvitation(account, i, 'private', d)).toEqual({ ok: true });
    expect(d.send).not.toHaveBeenCalled();
    expect(d.holds).not.toHaveBeenCalled();
    expect(d.respond).toHaveBeenCalledWith(account, i.id, 'accept');
  });

  it('decline sends no transaction and reports decline', async () => {
    const d = deps();
    expect(await acceptInvitation(account, inv(), 'decline', d)).toEqual({ ok: true });
    expect(d.send).not.toHaveBeenCalled();
    expect(d.respond).toHaveBeenCalledWith(account, inv().id, 'decline');
  });

  it('a failed claim does not report accept and returns a German message without an address', async () => {
    const d = deps({
      send: jest.fn(async () => {
        throw new Error('execution reverted at 0x' + 'ab'.repeat(20));
      }),
    });
    const r = await acceptInvitation(account, inv(), 'public', d);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).not.toMatch(/0x[0-9a-fA-F]{6,}/);
      expect(r.message).toMatch(/nicht geklappt/);
    }
    expect(d.respond).not.toHaveBeenCalled();
  });

  it('claim-key invitations pass the server signature; account invitations pass 0x', async () => {
    const keyInv = inv({
      claim: { ...inv().claim, leaf: { ...inv().claim.leaf, kind: 'claimKey', subject: ('0x' + '22'.repeat(20)) as any }, claimSignature: SIG },
    });
    const d1 = deps();
    await acceptInvitation(account, keyInv, 'public', d1);
    expect(d1.send.mock.calls[0][1]).toEqual([expectedClaim(keyInv, SIG)]);
    expect(d1.send.mock.calls[0][1][0].data).toContain(SIG.slice(2));

    const d2 = deps();
    const accountInv = inv({ claim: { ...inv().claim, claimSignature: SIG } }); // a stray signature is ignored
    await acceptInvitation(account, accountInv, 'public', d2);
    expect(d2.send.mock.calls[0][1]).toEqual([expectedClaim(accountInv)]);
    expect(d2.send.mock.calls[0][1][0].data).not.toContain(SIG.slice(2));

    const d3 = deps();
    const unsigned = inv({ claim: { ...keyInv.claim, claimSignature: null } });
    const r = await acceptInvitation(account, unsigned, 'public', d3);
    expect(r.ok).toBe(false);
    expect(d3.send).not.toHaveBeenCalled();
  });

  it('refuses a choice the invitation does not offer and never sends', async () => {
    const office = inv({}, { kind: 'role', recognised: true });
    const d1 = deps();
    expect((await acceptInvitation(account, office, 'private', d1)).ok).toBe(false);
    expect(d1.respond).not.toHaveBeenCalled();
    const closed = inv({}, { publicClaimAllowed: false });
    const d2 = deps();
    expect((await acceptInvitation(account, closed, 'public', d2)).ok).toBe(false);
    expect(d2.send).not.toHaveBeenCalled();
  });

  it('an account that already holds the type publicly is not asked to claim again', async () => {
    const d = deps({ holds: jest.fn(async () => true) });
    expect(await acceptInvitation(account, inv(), 'public', d)).toEqual({ ok: true });
    expect(d.send).not.toHaveBeenCalled();
    expect(d.respond).toHaveBeenCalledWith(account, inv().id, 'accept');
  });

  it('a revoked or expired invitation is refused', async () => {
    const d = deps();
    expect((await acceptInvitation(account, inv({ state: 'revoked' }), 'private', d)).ok).toBe(false);
    const expired = inv({ validUntil: new Date(1_000_000_000 * 1000).toISOString() });
    expect((await acceptInvitation(account, expired, 'public', d)).ok).toBe(false);
    expect(d.send).not.toHaveBeenCalled();
    expect(d.respond).not.toHaveBeenCalled();
  });
});

describe('makePublic / makePrivate', () => {
  const held = (over: Partial<HeldCredential> = {}): HeldCredential => ({
    typeId: tid(7),
    kind: 'membership',
    title: 'Kassenwart',
    orgName: 'Verein',
    imageUrl: null,
    recognised: false,
    visibility: 'private',
    validUntil: null,
    invitationId: inv().id,
    claim: null, // the device cache holds no proofs
    publicAllowed: true,
    ...over,
  });

  it('makePublic sends one claim; makePrivate sends one renounce and nothing else', async () => {
    const accepted = inv({ state: 'accepted' });
    const d = deps({ fetchMine: jest.fn(async () => ({ ok: true, data: [accepted] })) });
    expect(await makePublic(account, held(), d)).toEqual({ ok: true });
    expect(d.fetchMine).toHaveBeenCalledTimes(1);
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.send.mock.calls[0][1]).toEqual([expectedClaim(accepted)]);
    expect(d.respond).not.toHaveBeenCalled();

    const send = jest.fn(async () => {});
    expect(await makePrivate(account, { typeId: tid(7), state: 'valid' }, { send })).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(account, [renounceCall(REG, tid(7))]);
  });

  it('makePublic refuses when the org keeps members private or the card is expired', async () => {
    const d = deps();
    expect((await makePublic(account, held({ publicAllowed: false }), d)).ok).toBe(false);
    expect((await makePublic(account, held({ validUntil: 1_000_000_000 }), d)).ok).toBe(false);
    expect(d.send).not.toHaveBeenCalled();
  });

  it('makePublic refuses when the server now says the type may not be public', async () => {
    const closed = inv({ state: 'accepted' }, { publicClaimAllowed: false });
    const d = deps({ fetchMine: jest.fn(async () => ({ ok: true, data: [closed] })) });
    const r = await makePublic(account, held(), d);
    expect(r.ok).toBe(false);
    expect(d.send).not.toHaveBeenCalled();
  });
});
