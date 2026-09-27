jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { decodeFunctionData, getAddress, parseAbi, type Address, type Hex } from 'viem';
import {
  DETACH_EXPLANATION,
  assertDetachRequest,
  buildDetachRequest,
  evaluateDetachChecklist,
  markSponsoredOpSucceeded,
  resetSponsoredOpProof,
  runDetach,
  sponsoredOpSucceededThisSession,
  type ChecklistInputs,
  type DetachDeps,
} from '../detach';
import { SAFE_WEBAUTHN_SHARED_SIGNER } from '../constants';
import { predictSafeAddress } from '../safe-address';
import { createPasskeyAccount } from '../thirdweb-adapter';
import sv from './passkey-safe-vector.json';

const LEGACY = getAddress('0xc49dE63CcfeE46C6C5c3E393293f66779799Fb28');
const EOA = getAddress('0xD55b555ff6407670036AbA557F0eB2Ad10B325dB');
const SAFE = getAddress('0xe3d18fecdcf8e8b656b11340790f7c0147632deb');
const STRANGER = getAddress('0x1111111111111111111111111111111111111111');
const SIG = `0x${'ab'.repeat(65)}` as Hex;
const accountAbi = parseAbi([
  'struct SignerPermissionRequest { address signer; uint8 isAdmin; address[] approvedTargets; uint256 nativeTokenLimitPerTransaction; uint128 permissionStartTimestamp; uint128 permissionEndTimestamp; uint128 reqValidityStartTimestamp; uint128 reqValidityEndTimestamp; bytes32 uid; }',
  'function setPermissionsForSigner(SignerPermissionRequest req, bytes signature)',
]);

const green: ChecklistInputs = {
  passkeySyncedConfirmed: true,
  guardians: { count: 2, threshold: 2 },
  xmtpLinked: true,
  noDmsConfirmed: false,
  sponsoredOpSucceeded: true,
  localKeySlots: ['maci', 'nostr'],
  backupSlots: ['maci', 'nostr', 'salt'],
};

describe('checklist', () => {
  it('all five green → allGreen', () => {
    const r = evaluateDetachChecklist(green);
    expect(r.items.map((i) => i.id)).toEqual(['passkeySynced', 'guardians', 'messages', 'testAction', 'keyBackup']);
    expect(r.allGreen).toBe(true);
  });

  it.each<[string, Partial<ChecklistInputs>]>([
    ['passkey sync not confirmed', { passkeySyncedConfirmed: false }],
    ['1 guardian', { guardians: { count: 1, threshold: 1 } }],
    ['2 guardians, threshold 1', { guardians: { count: 2, threshold: 1 } }],
    ['guardians unreadable', { guardians: null }],
    ['XMTP not linked, no confirmation', { xmtpLinked: false }],
    ['XMTP unknown', { xmtpLinked: null }],
    ['no successful passkey op', { sponsoredOpSucceeded: false }],
    ['backup missing a local slot', { backupSlots: ['maci'] }],
    ['backup unreachable', { backupSlots: null }],
  ])('%s → not green', (_n, over) => {
    expect(evaluateDetachChecklist({ ...green, ...over }).allGreen).toBe(false);
  });

  it('"Ich nutze keine Direktnachrichten" replaces the XMTP link', () => {
    expect(evaluateDetachChecklist({ ...green, xmtpLinked: false, noDmsConfirmed: true }).allGreen).toBe(true);
  });

  it('item 1 carries the sync guidance; the explanation says it is irreversible', () => {
    expect(evaluateDetachChecklist(green).items[0].detail).toMatch(/Google-Passwortmanager \/ iCloud-Schlüsselbund/);
    expect(DETACH_EXPLANATION).toMatch(/nach 3 Tagen deine Vertrauenspersonen/);
    expect(DETACH_EXPLANATION).toMatch(/nicht rückgängig/);
  });
});

describe('session proof (checklist item 4)', () => {
  beforeEach(() => resetSponsoredOpProof());
  it('is set by a successful adapter send, not by a failed one', async () => {
    const session = { credentialId: 'c', x: sv.x as Hex, y: sv.y as Hex, safe: predictSafeAddress({ x: sv.x as Hex, y: sv.y as Hex }), identity: LEGACY, ownerType: 'sharedSigner' as const, owner: SAFE_WEBAUTHN_SHARED_SIGNER };
    const fail = createPasskeyAccount(session, { sign: jest.fn(), isSafeDeployed: async () => true, sendUserOp: async () => { throw new Error('x'); } });
    await expect(fail.sendTransaction({ chainId: 100, to: STRANGER, data: '0x0d873a79' })).rejects.toThrow();
    expect(sponsoredOpSucceededThisSession()).toBe(false);
    const ok = createPasskeyAccount(session, { sign: jest.fn(), isSafeDeployed: async () => true, sendUserOp: async () => ({ userOpHash: '0x01', txHash: '0x02' }) });
    await ok.sendTransaction({ chainId: 100, to: STRANGER, data: '0x0d873a79' });
    expect(sponsoredOpSucceededThisSession()).toBe(true);
  });
});

describe('detach request', () => {
  it('removes the EOA (isAdmin 2), empty permissions, 1 h validity', () => {
    const r = buildDetachRequest(EOA, 1_790_000_000);
    expect(r).toMatchObject({ signer: EOA, isAdmin: 2, approvedTargets: [], nativeTokenLimitPerTransaction: 0n, permissionStartTimestamp: 0n, permissionEndTimestamp: 0n });
    expect(r.reqValidityStartTimestamp).toBe(1_790_000_000n - 300n);
    expect(r.reqValidityEndTimestamp).toBe(1_790_000_000n + 3600n);
  });
  it('the guard refuses removing the Safe or adding anyone', () => {
    expect(() => assertDetachRequest({ ...buildDetachRequest(SAFE, 1), signer: SAFE }, SAFE, SAFE)).toThrow();
    expect(() => assertDetachRequest({ ...buildDetachRequest(EOA, 1), isAdmin: 1 }, EOA, SAFE)).toThrow();
    expect(() => assertDetachRequest(buildDetachRequest(EOA, 1), EOA, SAFE)).not.toThrow();
  });
});

function world(over: Partial<{ admins: Address[]; guardians: { count: number; threshold: number }; sendFails: boolean; afterAdmins: Address[] }> = {}) {
  let admins = over.admins ?? [EOA, SAFE];
  const signed: any[] = [];
  const sent: any[] = [];
  const d: DetachDeps = {
    legacy: LEGACY,
    safe: SAFE,
    eoa: EOA,
    getAllAdmins: jest.fn(async () => admins),
    isAdmin: jest.fn(async (_l: Address, s: Address) => admins.some((a) => a.toLowerCase() === s.toLowerCase())),
    readGuardianState: jest.fn(async () => over.guardians ?? { count: 2, threshold: 2 }),
    signTypedDataAsEoa: jest.fn(async (t) => {
      signed.push(t);
      return SIG;
    }),
    sendUserOp: jest.fn(async (args) => {
      sent.push(args);
      if (over.sendFails) throw new Error('reverted');
      admins = over.afterAdmins ?? [SAFE];
      return { txHash: '0xfeed' as Hex };
    }),
    now: () => 1_790_000_000,
  };
  return { d, signed, sent };
}

describe('runDetach', () => {
  it('EOA signs isAdmin:2 under the Account/1/100/legacy domain; the Safe submits one call; verified on chain', async () => {
    const { d, signed, sent } = world();
    await expect(runDetach(d)).resolves.toEqual({ status: 'done', txHash: '0xfeed', alreadyDetached: false });
    expect(signed[0].domain).toEqual({ name: 'Account', version: '1', chainId: 100, verifyingContract: LEGACY });
    expect(signed[0].message).toMatchObject({ signer: EOA, isAdmin: 2 });
    expect(sent[0].legacy).toBe(LEGACY);
    expect(sent[0].calls).toHaveLength(1);
    expect(sent[0].calls[0].to).toBe(LEGACY);
    const dec = decodeFunctionData({ abi: accountAbi, data: sent[0].calls[0].data });
    expect(dec.args[0].signer).toBe(EOA);
    expect(dec.args[0].isAdmin).toBe(2);
    expect(dec.args[1]).toBe(SIG);
  });

  it('another EOA admin → lists it and stops BEFORE signing', async () => {
    const { d, signed, sent } = world({ admins: [EOA, SAFE, STRANGER] });
    await expect(runDetach(d)).resolves.toEqual({ status: 'otherAdmins', admins: [STRANGER] });
    expect(signed).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('already detached → done without signing', async () => {
    const { d, signed } = world({ admins: [SAFE] });
    await expect(runDetach(d)).resolves.toMatchObject({ status: 'done', alreadyDetached: true });
    expect(signed).toHaveLength(0);
  });

  it('Safe not admin, or the signed-in EOA not admin → error before signing', async () => {
    let w = world({ admins: [EOA] });
    expect((await runDetach(w.d)).status).toBe('error');
    expect(w.signed).toHaveLength(0);
    w = world({ admins: [SAFE, STRANGER] });
    expect((await runDetach(w.d)).status).toBe('otherAdmins');
  });

  it('fewer than 2 guardians or threshold 1 → error before signing', async () => {
    for (const guardians of [{ count: 1, threshold: 1 }, { count: 3, threshold: 1 }]) {
      const w = world({ guardians });
      expect((await runDetach(w.d)).status).toBe('error');
      expect(w.signed).toHaveLength(0);
    }
  });

  it('a failed op reports that nothing changed', async () => {
    const w = world({ sendFails: true });
    await expect(runDetach(w.d)).resolves.toEqual({ status: 'error', message: 'Das Trennen ist fehlgeschlagen. Es wurde nichts geändert.' });
  });

  it('never reports success unless the chain shows admins == [Safe]', async () => {
    const w = world({ afterAdmins: [EOA, SAFE] });
    expect((await runDetach(w.d)).status).toBe('error');
  });
});

describe('markSponsoredOpSucceeded', () => {
  it('is a plain in-memory flag', () => {
    resetSponsoredOpProof();
    markSponsoredOpSucceeded();
    expect(sponsoredOpSucceededThisSession()).toBe(true);
  });
});
