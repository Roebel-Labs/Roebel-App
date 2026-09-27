/**
 * Passkey Münzen claim: one tap → one batch → one sponsored userOp (one fingerprint).
 * The batch reaches the Safe as ONE legacy.executeBatch([hub, hub], [0, 0], [personalMint, groupMint])
 * — the exact shape apps/web's everyday allowlist accepts (everyday-policy.test.ts).
 */
jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { decodeFunctionData, getAddress, type Address, type Hex } from 'viem';
import {
  buildMuenzenClaimTxs,
  claimMuenzenAsOneBatch,
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
