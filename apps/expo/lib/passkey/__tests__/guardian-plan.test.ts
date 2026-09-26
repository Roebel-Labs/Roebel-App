jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { decodeFunctionData, getAddress, type Hex } from 'viem';
import { socialRecoveryAbi } from '../guardians';
import { SOCIAL_RECOVERY_MODULE, SOCIAL_RECOVERY_SENTINEL } from '../constants';
import {
  allGuardiansAreAttesters,
  clampThreshold,
  defaultThreshold,
  identityModeFor,
  isValidThreshold,
  pendingSuggestions,
  planAddGuardians,
  planChangeThreshold,
  planGuardianConfirm,
  planRemoveGuardian,
  planV3Move,
  thresholdLabel,
} from '../guardian-plan';

const A = getAddress('0x00000000000000000000000000000000000000a1');
const B = getAddress('0x00000000000000000000000000000000000000b2');
const C = getAddress('0x00000000000000000000000000000000000000c3');
const WALLET = getAddress('0x00000000000000000000000000000000000000ff');
const LEGACY = getAddress('0x00000000000000000000000000000000000000ee');
const SIGNER = getAddress('0x00000000000000000000000000000000000000dd');

const decode = (data: Hex) => decodeFunctionData({ abi: socialRecoveryAbi, data });

describe('threshold rules', () => {
  it('defaults to 2, never above the count', () => {
    expect(defaultThreshold(0)).toBe(0);
    expect(defaultThreshold(1)).toBe(1);
    expect(defaultThreshold(3)).toBe(2);
  });
  it('clamps into [1, count]', () => {
    expect(clampThreshold(5, 3)).toBe(3);
    expect(clampThreshold(0, 3)).toBe(1);
    expect(clampThreshold(2, 0)).toBe(0);
    expect(isValidThreshold(3, 3)).toBe(true);
    expect(isValidThreshold(4, 3)).toBe(false);
    expect(isValidThreshold(0, 3)).toBe(false);
  });
  it('labels in plain German', () => {
    expect(thresholdLabel(2, 3)).toBe('2 von 3 müssen zustimmen');
    expect(thresholdLabel(3, 3)).toBe('Alle 3 müssen zustimmen');
    expect(thresholdLabel(1, 1)).toBe('Diese Person muss zustimmen');
    expect(thresholdLabel(0, 0)).toBe('Noch keine Vertrauenspersonen');
  });
  it('planChangeThreshold refuses a value above the count', () => {
    expect(() => planChangeThreshold(2, 3)).toThrow();
    const c = planChangeThreshold(3, 2);
    expect(c.to).toBe(SOCIAL_RECOVERY_MODULE);
    expect(decode(c.data).args).toEqual([2n]);
  });
});

describe('planAddGuardians', () => {
  it('suggestion: adds all in one batch, each threshold valid, the last sets 2', () => {
    const p = planAddGuardians({ wallet: WALLET, current: [], currentThreshold: 0, add: [A, B, C], threshold: 2 });
    expect(p.added).toEqual([A, B, C]);
    expect(p.threshold).toBe(2);
    expect(p.calls.map((c) => decode(c.data).args)).toEqual([
      [A, 1n],
      [B, 2n],
      [C, 2n],
    ]);
  });
  it('drops duplicates, existing guardians, the wallet itself and reserved addresses', () => {
    const p = planAddGuardians({
      wallet: WALLET,
      current: [A],
      currentThreshold: 1,
      add: [A, B, B, WALLET, SOCIAL_RECOVERY_SENTINEL, '0x0000000000000000000000000000000000000000'],
    });
    expect(p.added).toEqual([B]);
    expect(p.calls).toHaveLength(1);
    expect(decode(p.calls[0].data).args).toEqual([B, 2n]);
  });
  it('never sets a threshold above the new count', () => {
    const p = planAddGuardians({ wallet: WALLET, current: [], currentThreshold: 0, add: [A], threshold: 2 });
    expect(decode(p.calls[0].data).args).toEqual([A, 1n]);
  });
  it('nothing new → no calls', () => {
    expect(planAddGuardians({ wallet: WALLET, current: [A], currentThreshold: 1, add: [A] }).calls).toEqual([]);
  });
});

describe('planRemoveGuardian', () => {
  it('uses the linked-list predecessor and lowers the threshold to the new count', () => {
    const r = planRemoveGuardian({ current: [A, B], currentThreshold: 2, guardian: B });
    const d = decode(r.call.data);
    expect(d.functionName).toBe('revokeGuardianWithThreshold');
    expect(d.args).toEqual([A, B, 1n]);
  });
  it('the first guardian has the sentinel as predecessor', () => {
    const r = planRemoveGuardian({ current: [A, B, C], currentThreshold: 2, guardian: A });
    expect(decode(r.call.data).args).toEqual([SOCIAL_RECOVERY_SENTINEL, A, 2n]);
  });
  it('throws for a non-guardian', () => {
    expect(() => planRemoveGuardian({ current: [A], currentThreshold: 1, guardian: B })).toThrow();
  });
});

describe('suggestions + warnings', () => {
  it('pendingSuggestions skips current guardians and excluded addresses', () => {
    expect(pendingSuggestions({ suggested: [A, B, C, B], current: [A], exclude: [C] })).toEqual([B]);
  });
  it('warns only when every guardian is an attester', () => {
    const attesters = new Set([A, B]);
    expect(allGuardiansAreAttesters([A, B], (g) => attesters.has(g))).toBe(true);
    expect(allGuardiansAreAttesters([A, C], (g) => attesters.has(g))).toBe(false);
    expect(allGuardiansAreAttesters([], () => true)).toBe(false);
  });
});

describe('identityModeFor', () => {
  it('safe once the Safe is a citizen', () => {
    expect(identityModeFor({ record: { legacy: LEGACY, status: 'done' }, safeIsCitizen: true, legacyIsCitizen: true })).toEqual({
      mode: 'safe',
    });
  });
  it('legacy while citizenship sits on the legacy account', () => {
    expect(identityModeFor({ record: { legacy: LEGACY, status: 'done' }, safeIsCitizen: false, legacyIsCitizen: true })).toEqual({
      mode: 'legacy',
      legacy: LEGACY,
    });
  });
  it('null for a non-citizen Safe or an unfinished handover', () => {
    expect(identityModeFor({ record: { status: 'passkeyCreated' }, safeIsCitizen: false, legacyIsCitizen: false })).toBeNull();
    expect(
      identityModeFor({ record: { legacy: LEGACY, status: 'passkeyCreated' }, safeIsCitizen: false, legacyIsCitizen: true }),
    ).toBeNull();
  });
});

describe('planGuardianConfirm', () => {
  const base = { wallet: WALLET, signer: SIGNER };
  it('my Safe is the guardian → SRM.confirmRecovery(wallet, [signer], 1, false) directly', () => {
    const p = planGuardianConfirm({ ...base, guardians: [B, A], mySafe: A, recoveryLegacy: LEGACY });
    expect(p.kind).toBe('safe');
    if (p.kind !== 'safe') return;
    expect(p.recoveryLegacy).toBe(LEGACY);
    expect(p.calls[0].to).toBe(SOCIAL_RECOVERY_MODULE);
    const d = decode(p.calls[0].data);
    expect(d.functionName).toBe('confirmRecovery');
    expect(d.args).toEqual([WALLET, [SIGNER], 1n, false]);
  });
  it('my legacy account is the guardian → legacy.execute(SRM, 0, confirmRecovery)', () => {
    const p = planGuardianConfirm({ ...base, guardians: [B], mySafe: A, myLegacy: B });
    expect(p.kind).toBe('legacy');
    if (p.kind !== 'legacy') return;
    expect(p.legacy).toBe(B);
    expect(p.calls[0].to).toBe(B);
    const outer = decodeFunctionData({
      abi: [
        {
          type: 'function',
          name: 'execute',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 't', type: 'address' },
            { name: 'v', type: 'uint256' },
            { name: 'd', type: 'bytes' },
          ],
          outputs: [],
        },
      ] as const,
      data: p.calls[0].data,
    });
    expect(outer.args[0]).toBe(SOCIAL_RECOVERY_MODULE);
    expect(outer.args[1]).toBe(0n);
    expect(decode(outer.args[2]).functionName).toBe('confirmRecovery');
  });
  it('not a guardian / my own wallet', () => {
    expect(planGuardianConfirm({ ...base, guardians: [B], mySafe: A }).kind).toBe('notGuardian');
    expect(planGuardianConfirm({ ...base, guardians: [WALLET], mySafe: WALLET }).kind).toBe('self');
  });
});

describe('planV3Move', () => {
  const none = { citizenV3: false, attesterV3: false };
  it('moves what the legacy holds and the Safe does not', () => {
    expect(planV3Move({ safeIsAdmin: true, legacy: { citizenV3: true, attesterV3: true }, safe: none })).toEqual({
      kind: 'move',
      moveCitizen: true,
      moveAttester: true,
    });
  });
  it('handover first when the Safe is not admin yet', () => {
    expect(planV3Move({ safeIsAdmin: false, legacy: { citizenV3: true, attesterV3: false }, safe: none }).kind).toBe(
      'handoverFirst',
    );
  });
  it('done once the Safe holds it; nothingToMove without v3 tokens', () => {
    expect(planV3Move({ safeIsAdmin: true, legacy: none, safe: { citizenV3: true, attesterV3: false } }).kind).toBe('done');
    expect(planV3Move({ safeIsAdmin: true, legacy: none, safe: none }).kind).toBe('nothingToMove');
  });
});
