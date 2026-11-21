/**
 * Passkey Münzen claim: one tap → one batch → one sponsored userOp (one fingerprint).
 * The batch reaches the Safe as ONE legacy.executeBatch([hub, hub], [0, 0], [personalMint, groupMint])
 * — the exact shape apps/web's everyday allowlist accepts (everyday-policy.test.ts).
 */
jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' }));
jest.mock('@/lib/storage/secureStorage', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

import { decodeFunctionData, getAddress, type Address, type Hex } from 'viem';
import {
  buildMuenzenClaimTxs,
  claimMuenzenAsOneBatch,
  claimMuenzenRouted,
  claimMuenzenWithDeviceSession,
  claimsAsOneBatch,
  CLAIM_NOTHING_MESSAGE,
  groupMintAmount,
  wholeMuenzen,
  type ClaimReads,
} from '../muenzen-claim';
import { createPasskeyAccount, type AdapterDeps } from '../passkey/thirdweb-adapter';
import { SAFE_WEBAUTHN_SHARED_SIGNER } from '../passkey/constants';
import { predictSafeAddress } from '../passkey/safe-address';
import type { PasskeySession } from '../passkey/session';
import type { PasskeyUserOpArgs } from '../passkey/userop';
import sv from '../passkey/__tests__/passkey-safe-vector.json';
import kv from '../passkey/__tests__/session-keys-vector.json';
import { grantDeviceSession, type GrantDeps } from '../passkey/session-keys/grant';
import { DeviceSessionRejectedError, isDeviceSessionRejection } from '../passkey/session-keys/session-op';
import {
  DEVICE_SESSION_STORE_KEY,
  activateDeviceSession,
  deleteDeviceSession,
  loadDeviceSession,
  savePendingDeviceSession,
  type DeviceKeyStore,
} from '../passkey/session-keys/device-key';
import { SESSION_DAYS, permissionIdsOf } from '../passkey/session-keys/builders';
import type { UserOpDeps } from '../passkey/userop';

const HUB = getAddress('0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8');
const GROUP = getAddress('0xAc2CeCdBead594F97358a0d3132454f24F3E470c');
const LEGACY = getAddress('0xc49dE63CcfeE46C6C5c3E393293f66779799Fb28');
const x = sv.x as Hex;
const y = sv.y as Hex;
const SAFE = predictSafeAddress({ x, y });
const ONE = 10n ** 18n;

const hubAbi = [
  { type: 'function', name: 'personalMint', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'groupMint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_group', type: 'address' },
      { name: '_collateralAvatars', type: 'address[]' },
      { name: '_amounts', type: 'uint256[]' },
      { name: '_data', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;
const accountAbi = [
  {
    type: 'function',
    name: 'executeBatch',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_target', type: 'address[]' },
      { name: '_value', type: 'uint256[]' },
      { name: '_calldata', type: 'bytes[]' },
    ],
    outputs: [],
  },
] as const;

function passkeyAccount(identity: Address = LEGACY) {
  const sent: PasskeyUserOpArgs[] = [];
  const d: AdapterDeps = {
    sign: jest.fn(async () => {
      throw new Error('no signature expected');
    }),
    isSafeDeployed: jest.fn(async () => true),
    sendUserOp: jest.fn(async (args: PasskeyUserOpArgs) => {
      sent.push(args);
      return { userOpHash: `0x${'aa'.repeat(32)}` as Hex, txHash: `0x${'bb'.repeat(32)}` as Hex };
    }),
  };
  const session: PasskeySession = {
    credentialId: 'cred',
    x,
    y,
    safe: SAFE,
    identity,
    ownerType: 'sharedSigner',
    owner: SAFE_WEBAUTHN_SHARED_SIGNER,
  };
  return { account: createPasskeyAccount(session, d), d, sent };
}

const reads = (over: Partial<Record<keyof ClaimReads, unknown>> = {}): ClaimReads => ({
  isGroupMember: jest.fn(async () => (over.isGroupMember ?? true) as boolean),
  personalBalance: jest.fn(async () => (over.personalBalance ?? 2n * ONE) as bigint),
  mintable: jest.fn(async () => (over.mintable ?? 3n * ONE) as bigint),
});

describe('buildMuenzenClaimTxs (batch composition)', () => {
  it('citizen: personalMint then groupMint(group, [self], [personal + mintable − 0.1 %], 0x)', () => {
    const txs = buildMuenzenClaimTxs({ hub: HUB, group: GROUP, self: LEGACY, member: true, personalBalance: 2n * ONE, mintable: 3n * ONE });
    expect(txs).toHaveLength(2);
    expect(txs.every((t) => t.to === HUB && t.value === 0n && t.chainId === 100)).toBe(true);
    expect(decodeFunctionData({ abi: hubAbi, data: txs[0].data }).functionName).toBe('personalMint');
    const gm = decodeFunctionData({ abi: hubAbi, data: txs[1].data });
    expect(gm.functionName).toBe('groupMint');
    expect(gm.args).toEqual([GROUP, [LEGACY], [5n * ONE - (5n * ONE) / 1000n], '0x']);
    expect(txs[0].data.slice(0, 10)).toBe('0x0d873a79');
    expect(txs[1].data.slice(0, 10)).toBe('0x6cb498e5');
  });

  it('guest (not a group member): personalMint only', () => {
    const txs = buildMuenzenClaimTxs({ hub: HUB, group: GROUP, self: LEGACY, member: false, personalBalance: ONE, mintable: ONE });
    expect(txs.map((t) => decodeFunctionData({ abi: hubAbi, data: t.data }).functionName)).toEqual(['personalMint']);
  });

  it('nothing accrued: sweeps leftover personal Münzen, or nothing at all', () => {
    const sweep = buildMuenzenClaimTxs({ hub: HUB, group: GROUP, self: LEGACY, member: true, personalBalance: ONE, mintable: 0n });
    expect(sweep.map((t) => decodeFunctionData({ abi: hubAbi, data: t.data }).functionName)).toEqual(['groupMint']);
    expect(buildMuenzenClaimTxs({ hub: HUB, group: GROUP, self: LEGACY, member: true, personalBalance: 0n, mintable: 0n })).toEqual([]);
  });

  it('margin never exceeds what personalMint leaves', () => {
    expect(groupMintAmount(0n, 1000n)).toBe(999n);
    expect(groupMintAmount(0n, 1n)).toBe(1n);
    expect(wholeMuenzen(3n * ONE)).toBe(3);
    expect(wholeMuenzen(ONE / 10n)).toBe(1);
  });
});

describe('passkey vs thirdweb', () => {
  it('only a passkey account claims as one batch', () => {
    expect(claimsAsOneBatch(passkeyAccount().account)).toBe(true);
    expect(claimsAsOneBatch({ address: LEGACY, sendTransaction: jest.fn() })).toBe(false);
    expect(claimsAsOneBatch(null)).toBe(false);
  });

  it('refuses a thirdweb account (its flow stays the unchanged two-send dailyMint)', async () => {
    const thirdweb = { address: LEGACY, sendBatchTransaction: jest.fn() };
    await expect(claimMuenzenAsOneBatch(thirdweb, reads(), { hub: HUB, group: GROUP })).rejects.toThrow(/passkey sessions only/);
    expect(thirdweb.sendBatchTransaction).not.toHaveBeenCalled();
  });
});

describe('claimMuenzenAsOneBatch', () => {
  it('legacy identity: ONE userOp, ONE call = legacy.executeBatch([hub, hub], [0, 0], [personalMint, groupMint])', async () => {
    const { account, d, sent } = passkeyAccount(LEGACY);
    const r = await claimMuenzenAsOneBatch(account, reads(), { hub: HUB, group: GROUP });
    expect(r.mintedRaw).toBe(3n * ONE);
    expect(d.sendUserOp).toHaveBeenCalledTimes(1); // one op = one fingerprint
    expect(sent[0].legacy).toBe(LEGACY);
    expect(sent[0].calls).toHaveLength(1);
    expect(sent[0].calls[0].to).toBe(LEGACY);
    const batch = decodeFunctionData({ abi: accountAbi, data: sent[0].calls[0].data });
    const [targets, values, datas] = batch.args;
    expect(targets).toEqual([HUB, HUB]);
    expect(values).toEqual([0n, 0n]);
    expect(decodeFunctionData({ abi: hubAbi, data: datas[0] }).functionName).toBe('personalMint');
    expect(decodeFunctionData({ abi: hubAbi, data: datas[1] }).args).toEqual([GROUP, [LEGACY], [5n * ONE - (5n * ONE) / 1000n], '0x']);
  });

  it('Safe identity: one op with the two Hub calls made by the Safe itself', async () => {
    const { account, sent } = passkeyAccount(SAFE);
    await claimMuenzenAsOneBatch(account, reads(), { hub: HUB, group: GROUP });
    expect(sent).toHaveLength(1);
    expect(sent[0].legacy).toBeUndefined();
    expect(sent[0].calls.map((c) => c.to)).toEqual([HUB, HUB]);
  });

  it('guest Safe (isGroupMember false): the userOp carries personalMint ONLY, never groupMint', async () => {
    const { account, d, sent } = passkeyAccount(SAFE);
    const r = reads({ isGroupMember: false, personalBalance: 5n * ONE, mintable: 3n * ONE });
    await claimMuenzenAsOneBatch(account, r, { hub: HUB, group: GROUP });
    expect(d.sendUserOp).toHaveBeenCalledTimes(1);
    expect(sent[0].calls).toHaveLength(1);
    expect(sent[0].calls[0].to).toBe(HUB);
    expect(decodeFunctionData({ abi: hubAbi, data: sent[0].calls[0].data }).functionName).toBe('personalMint');
    // No groupMint selector anywhere in the op, however much personal balance there is.
    expect(sent[0].calls.some((c) => c.data.startsWith('0x6cb498e5'))).toBe(false);
  });

  it('guest Safe with nothing accrued: nothing is sent (no groupMint sweep)', async () => {
    const { account, d } = passkeyAccount(SAFE);
    const r = reads({ isGroupMember: false, personalBalance: 5n * ONE, mintable: 0n });
    await expect(claimMuenzenAsOneBatch(account, r, { hub: HUB, group: GROUP })).rejects.toThrow(CLAIM_NOTHING_MESSAGE);
    expect(d.sendUserOp).not.toHaveBeenCalled();
  });

  it('nothing to claim: German message, no op', async () => {
    const { account, d } = passkeyAccount();
    await expect(
      claimMuenzenAsOneBatch(account, reads({ personalBalance: 0n, mintable: 0n }), { hub: HUB, group: GROUP }),
    ).rejects.toThrow(CLAIM_NOTHING_MESSAGE);
    expect(d.sendUserOp).not.toHaveBeenCalled();
  });

  it('a failed membership read throws instead of silently skipping the group mint', async () => {
    const { account, d } = passkeyAccount();
    const r = reads();
    (r.isGroupMember as jest.Mock).mockRejectedValueOnce(new Error('rpc down'));
    await expect(claimMuenzenAsOneBatch(account, r, { hub: HUB, group: GROUP })).rejects.toThrow('rpc down');
    expect(d.sendUserOp).not.toHaveBeenCalled();
  });
});


// ---------------------------------------------------------------------------
// Device session claim (Münzen ohne Fingerabdruck)
// ---------------------------------------------------------------------------

describe('claimMuenzenWithDeviceSession', () => {
  it('one session op per tx, in order: personalMint, then groupMint(group, [self], [amount])', async () => {
    const send = jest.fn(async () => `0x${'cc'.repeat(32)}` as Hex);
    const res = await claimMuenzenWithDeviceSession({ address: LEGACY }, reads(), { hub: HUB, group: GROUP }, send);
    expect(res).toEqual({ mintedRaw: 3n * ONE, partial: false });
    expect(send.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(['personalMint', 'groupMint']);
    const g = decodeFunctionData({ abi: hubAbi, data: (send.mock.calls[1] as unknown as [string, Hex])[1] });
    expect(g.functionName).toBe('groupMint');
    expect(g.args).toEqual([GROUP, [LEGACY], [5n * ONE - (5n * ONE * 10n) / 10_000n], '0x']);
  });

  it('groupMint failure after personalMint returns a partial result', async () => {
    const err = new DeviceSessionRejectedError('expired between the two ops');
    const send = jest.fn(async (kind: string) => {
      if (kind === 'groupMint') throw err;
      return `0x${'cc'.repeat(32)}` as Hex;
    });
    const res = await claimMuenzenWithDeviceSession({ address: LEGACY }, reads(), { hub: HUB, group: GROUP }, send);
    expect(res).toEqual({ mintedRaw: 3n * ONE, partial: true, error: err });
  });

  it('a failure of the first op propagates (nothing landed)', async () => {
    const send = jest.fn(async () => {
      throw new Error('boom');
    });
    await expect(claimMuenzenWithDeviceSession({ address: LEGACY }, reads(), { hub: HUB, group: GROUP }, send)).rejects.toThrow('boom');
  });

  it('nothing to claim: German message, no op', async () => {
    const send = jest.fn();
    await expect(
      claimMuenzenWithDeviceSession({ address: LEGACY }, reads({ personalBalance: 0n, mintable: 0n }), { hub: HUB, group: GROUP }, send),
    ).rejects.toThrow(CLAIM_NOTHING_MESSAGE);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('claimMuenzenRouted', () => {
  const KSAFE = getAddress(kv.inputs.safe);
  const KPK = kv.inputs.sessionPrivateKey as Hex;
  const KSIGNER = getAddress(kv.inputs.signer);
  const KUNTIL = Number(kv.inputs.validUntil);
  const KPIDS = permissionIdsOf({ legacy: LEGACY, signer: KSIGNER, validUntil: KUNTIL });
  const kSession: PasskeySession = {
    credentialId: 'cred',
    x,
    y,
    safe: KSAFE,
    identity: LEGACY,
    ownerType: 'sharedSigner',
    owner: SAFE_WEBAUTHN_SHARED_SIGNER,
  };

  function world(o: { pids?: 'mine' | 'none'; sessionSend?: (kind: string) => Promise<Hex> } = {}) {
    const data = new Map<string, string>();
    const store: DeviceKeyStore = {
      getItemAsync: async (k) => data.get(k) ?? null,
      setItemAsync: async (k, v) => {
        data.set(k, v);
      },
      deleteItemAsync: async (k) => {
        data.delete(k);
      },
    };
    let onChain: Hex[] = o.pids === 'mine' ? [KPIDS.personalMint, KPIDS.groupMint] : [];
    // the passkey: every prompt is counted
    const sign = jest.fn(async () => ({}) as any);
    const grantDeps: GrantDeps = {
      store,
      nowSec: () => KUNTIL - SESSION_DAYS * 86_400,
      userOp: { sign } as UserOpDeps,
      readLayout: async () => '4337',
      readModules: async () => kv.inputs.modulesBefore.map((m) => getAddress(m)),
      readPermissionIds: async () => onChain,
      readSmartSessionInstalled: async () => false,
      newKey: () => ({ privateKey: KPK, signer: KSIGNER }),
      sendPasskeyOp: jest.fn(async (args: PasskeyUserOpArgs, d: UserOpDeps) => {
        await d.sign!(args.credentialId, '0x00');
        onChain = [KPIDS.personalMint, KPIDS.groupMint];
        return { userOpHash: '0x01' as Hex, txHash: '0x02' as Hex };
      }),
    };
    const sessionSend = jest.fn(o.sessionSend ?? (async () => `0x${'cc'.repeat(32)}` as Hex));
    const passkeyClaim = jest.fn(async () => {
      await sign('cred', '0x00');
      return { mintedRaw: 3n * ONE };
    });
    const deps = (path: 'session' | 'renew-then-session' | 'offer' | 'passkey', allowGrant = false) => ({
      path,
      allowGrant,
      account: { address: LEGACY },
      reads: reads(),
      addrs: { hub: HUB, group: GROUP },
      grant: async () => {
        await grantDeviceSession(kSession, grantDeps);
      },
      loadSession: () => loadDeviceSession(store, KSAFE, async () => onChain),
      sendSessionCall: (_s: unknown, kind: 'personalMint' | 'groupMint') => sessionSend(kind),
      isRejection: isDeviceSessionRejection,
      dropSession: () => deleteDeviceSession(store, KSAFE),
      passkeyClaim,
    });
    const seedActive = async () => {
      await savePendingDeviceSession(store, { v: 1, safe: KSAFE, legacy: LEGACY, signer: KSIGNER, validUntil: KUNTIL, permissionIds: KPIDS }, KPK);
      await activateDeviceSession(store, KSAFE);
    };
    return { data, sign, sessionSend, passkeyClaim, deps, seedActive, grantDeps };
  }

  it('session: claims with session ops, no passkey prompt', async () => {
    const w = world({ pids: 'mine' });
    await w.seedActive();
    const res = await claimMuenzenRouted(w.deps('session'));
    expect(res).toEqual({ mintedRaw: 3n * ONE, partial: false, via: 'session' });
    expect(w.sessionSend).toHaveBeenCalledTimes(2);
    expect(w.sign).not.toHaveBeenCalled();
  });

  it('offer accepted = exactly one passkey prompt for grant + claim', async () => {
    const w = world();
    const res = await claimMuenzenRouted(w.deps('offer', true));
    expect(w.sign).toHaveBeenCalledTimes(1);
    expect(w.grantDeps.sendPasskeyOp).toHaveBeenCalledTimes(1);
    expect(w.passkeyClaim).not.toHaveBeenCalled();
    expect(w.sessionSend).toHaveBeenCalledTimes(2);
    expect(res.via).toBe('session');
    expect(JSON.parse(w.data.get(DEVICE_SESSION_STORE_KEY(KSAFE))!).status).toBe('active');
  });

  it('offer without allowGrant ("Nicht jetzt" / profile pill) = today\'s passkey claim', async () => {
    const w = world();
    const res = await claimMuenzenRouted(w.deps('offer'));
    expect(res.via).toBe('passkey');
    expect(w.sign).toHaveBeenCalledTimes(1);
    expect(w.grantDeps.sendPasskeyOp).not.toHaveBeenCalled();
  });

  it('renew-then-session: one prompt (renew), then session ops', async () => {
    const w = world({ pids: 'mine' });
    await w.seedActive();
    const res = await claimMuenzenRouted(w.deps('renew-then-session'));
    expect(w.sign).toHaveBeenCalledTimes(1);
    expect(w.grantDeps.sendPasskeyOp).toHaveBeenCalledTimes(1);
    expect(res.via).toBe('session');
  });

  it('kill switch off → passkey claim even with an active record', async () => {
    const w = world({ pids: 'mine' });
    await w.seedActive();
    const res = await claimMuenzenRouted(w.deps('passkey', true));
    expect(res.via).toBe('passkey');
    expect(w.sessionSend).not.toHaveBeenCalled();
    expect(w.sign).toHaveBeenCalledTimes(1);
  });

  it('stale permission falls back to passkey and clears the record', async () => {
    const w = world({
      pids: 'mine',
      sessionSend: async () => {
        throw new DeviceSessionRejectedError('device session rejected: InvalidPermissionId');
      },
    });
    await w.seedActive();
    const res = await claimMuenzenRouted(w.deps('session'));
    expect(res.via).toBe('passkey');
    expect(w.sessionSend).toHaveBeenCalledTimes(1); // never retried
    expect(w.passkeyClaim).toHaveBeenCalledTimes(1);
    expect(w.sign).toHaveBeenCalledTimes(1);
    expect(w.data.size).toBe(0);
  });

  it('a sponsor 403 on the first op counts as a rejection too', async () => {
    const w = world({
      pids: 'mine',
      sessionSend: async () => {
        throw Object.assign(new Error('HTTP 403: device sessions are switched off'), { status: 403 });
      },
    });
    await w.seedActive();
    expect((await claimMuenzenRouted(w.deps('session'))).via).toBe('passkey');
    expect(w.data.size).toBe(0);
  });

  it('a rejection after personalMint landed: partial, record dropped, no passkey prompt', async () => {
    const w = world({
      pids: 'mine',
      sessionSend: async (kind) => {
        if (kind === 'groupMint') throw new DeviceSessionRejectedError('device session expired');
        return `0x${'cc'.repeat(32)}` as Hex;
      },
    });
    await w.seedActive();
    const res = await claimMuenzenRouted(w.deps('session'));
    expect(res).toEqual({ mintedRaw: 3n * ONE, partial: true, via: 'session' });
    expect(w.passkeyClaim).not.toHaveBeenCalled();
    expect(w.sign).not.toHaveBeenCalled();
    expect(w.data.size).toBe(0);
  });

  it('a network error (not a rejection) propagates and keeps the record', async () => {
    const w = world({
      pids: 'mine',
      sessionSend: async () => {
        throw new Error('timed out waiting for the userOp receipt');
      },
    });
    await w.seedActive();
    await expect(claimMuenzenRouted(w.deps('session'))).rejects.toThrow('timed out');
    expect(w.passkeyClaim).not.toHaveBeenCalled();
    expect(w.data.size).toBe(2);
  });
});
