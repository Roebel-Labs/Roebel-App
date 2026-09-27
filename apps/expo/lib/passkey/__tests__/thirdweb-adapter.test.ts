jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import {
  decodeFunctionData,
  getAddress,
  hashMessage,
  hashTypedData,
  hexToString,
  isErc6492Signature,
  parseErc6492Signature,
  type Address,
  type Hex,
} from 'viem';
import { SAFE_PROXY_FACTORY, SAFE_WEBAUTHN_SHARED_SIGNER } from '../constants';
import { safeMessageHash } from '../guardians';
import { predictSafeAddress, safeFactoryData } from '../safe-address';
import type { PasskeySession } from '../session';
import {
  buildAdapterCalls,
  createPasskeyAccount,
  decodeOnBehalfSignature,
  encodeLegacyExecute,
  encodeLegacyExecuteBatch,
  signHashAsIdentity,
  WRONG_CHAIN_MESSAGE,
  type AdapterDeps,
} from '../thirdweb-adapter';
import type { PasskeyUserOpArgs } from '../userop';
import rv from './recovery-vector.json';
import sv from './passkey-safe-vector.json';

const g = rv.guardianApproval;
const LEGACY = getAddress('0xc49dE63CcfeE46C6C5c3E393293f66779799Fb28');
const TARGET = getAddress('0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8');
const x = sv.x as Hex;
const y = sv.y as Hex;
const SAFE = predictSafeAddress({ x, y });

const legacyExecuteAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_target', type: 'address' },
      { name: '_value', type: 'uint256' },
      { name: '_calldata', type: 'bytes' },
    ],
    outputs: [],
  },
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

function session(identity: Address, over: Partial<PasskeySession> = {}): PasskeySession {
  return { credentialId: 'cred', x, y, safe: SAFE, identity, ownerType: 'sharedSigner', owner: SAFE_WEBAUTHN_SHARED_SIGNER, ...over };
}

function deps(over: Partial<AdapterDeps> = {}) {
  const sent: PasskeyUserOpArgs[] = [];
  const d: AdapterDeps = {
    sign: jest.fn(async () => {
      throw new Error('no sign expected');
    }),
    isSafeDeployed: jest.fn(async () => true),
    sendUserOp: jest.fn(async (args: PasskeyUserOpArgs) => {
      sent.push(args);
      return { userOpHash: `0x${'aa'.repeat(32)}` as Hex, txHash: `0x${'bb'.repeat(32)}` as Hex };
    }),
    ...over,
  };
  return { d, sent };
}

describe('adapter address', () => {
  it('is the legacy account for a migrated person and the Safe for a passkey-only / moved person', () => {
    expect(createPasskeyAccount(session(LEGACY), deps().d).address).toBe(LEGACY);
    expect(createPasskeyAccount(session(SAFE), deps().d).address).toBe(SAFE);
  });
});

describe('buildAdapterCalls', () => {
  it('wraps each call in legacy.execute(to, value, data) for a legacy identity and names legacy', () => {
    const r = buildAdapterCalls(session(LEGACY), [{ chainId: 100, to: TARGET, value: 5n, data: '0x0d873a79' }]);
    expect(r.legacy).toBe(LEGACY);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].to).toBe(LEGACY);
    expect(r.calls[0].value).toBeUndefined();
    const dec = decodeFunctionData({ abi: legacyExecuteAbi, data: r.calls[0].data });
    expect(dec.args).toEqual([TARGET, 5n, '0x0d873a79']);
    expect(r.calls[0].data.slice(0, 10)).toBe('0xb61d27f6');
  });

  it('calls the target directly for a Safe identity (no legacy hint), value carried', () => {
    const r = buildAdapterCalls(session(SAFE), [
      { chainId: 100, to: TARGET, data: '0x0d873a79' },
      { chainId: 100, to: LEGACY, value: 7n, data: null },
    ]);
    expect(r.legacy).toBeUndefined();
    expect(r.calls).toEqual([
      { to: TARGET, data: '0x0d873a79' },
      { to: LEGACY, data: '0x', value: 7n },
    ]);
  });

  it('refuses other chains and deployments with a German message', () => {
    expect(() => buildAdapterCalls(session(SAFE), [{ chainId: 8453, to: TARGET, data: '0x' }])).toThrow(WRONG_CHAIN_MESSAGE);
    expect(() => buildAdapterCalls(session(SAFE), [{ chainId: 100, to: null, data: '0x60' }])).toThrow(/noch nicht unterstützt/);
  });
});

describe('sendTransaction / sendBatchTransaction', () => {
  it('sends one sponsored op from the Safe and returns the bundle tx hash', async () => {
    const { d, sent } = deps();
    const acc = createPasskeyAccount(session(LEGACY), d);
    const res = await acc.sendTransaction({ chainId: 100, to: TARGET, data: '0x0d873a79' });
    expect(res).toEqual({ transactionHash: `0x${'bb'.repeat(32)}` });
    expect(sent[0]).toMatchObject({ credentialId: 'cred', x, y, legacy: LEGACY, deployed: true, sender: SAFE, owner: SAFE_WEBAUTHN_SHARED_SIGNER });
    expect(sent[0].calls[0].data).toBe(encodeLegacyExecute(TARGET, 0n, '0x0d873a79'));
  });

  it('a legacy identity sends a batch as ONE legacy.executeBatch call in ONE op', async () => {
    const { d, sent } = deps();
    const acc = createPasskeyAccount(session(LEGACY), d);
    await acc.sendBatchTransaction([
      { chainId: 100, to: TARGET, data: '0x0d873a79' },
      { chainId: 100, to: TARGET, value: 0n, data: '0x6cb498e5' },
    ]);
    expect(d.sendUserOp).toHaveBeenCalledTimes(1);
    expect(sent[0].legacy).toBe(LEGACY);
    expect(sent[0].calls).toHaveLength(1);
    expect(sent[0].calls[0].to).toBe(LEGACY);
    expect(sent[0].calls[0].data.slice(0, 10)).toBe('0x47e1da2a');
    const dec = decodeFunctionData({ abi: legacyExecuteAbi, data: sent[0].calls[0].data });
    expect(dec.functionName).toBe('executeBatch');
    expect(dec.args).toEqual([[TARGET, TARGET], [0n, 0n], ['0x0d873a79', '0x6cb498e5']]);
    expect(sent[0].calls[0].data).toBe(
      encodeLegacyExecuteBatch([
        { to: TARGET, value: 0n, data: '0x0d873a79' },
        { to: TARGET, value: 0n, data: '0x6cb498e5' },
      ]),
    );
  });

  it('a Safe identity sends the call itself, without a legacy hint; batches go in one op', async () => {
    const { d, sent } = deps({ isSafeDeployed: jest.fn(async () => false) });
    const acc = createPasskeyAccount(session(SAFE), d);
    await acc.sendBatchTransaction([
      { chainId: 100, to: TARGET, data: '0x01' },
      { chainId: 100, to: TARGET, data: '0x02' },
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0].legacy).toBeUndefined();
    expect(sent[0].deployed).toBe(false);
    expect(sent[0].calls.map((c) => c.data)).toEqual(['0x01', '0x02']);
  });
});

describe('ERC-1271 signatures', () => {
  const guardianSafe = getAddress(g.guardianSafe);
  const vectorAssertion = {
    authenticatorData: g.authenticatorData as Hex,
    clientDataJSON: hexToString(g.clientDataJSONHex as Hex),
    r: BigInt(g.r),
    s: BigInt(g.s),
  };
  const guardianSession = (identity: Address) =>
    session(identity, { safe: guardianSafe, x: g.guardianX as Hex, y: g.guardianY as Hex });

  it('reproduces the fork-proven Safe signature byte-for-byte (identity = Safe)', async () => {
    const sign = jest.fn(async (_id: string, challenge: Hex) => {
      expect(challenge).toBe(g.safeMessageHash);
      return vectorAssertion;
    });
    const { d } = deps({ sign });
    const sig = await signHashAsIdentity(guardianSession(guardianSafe), g.recoveryHash as Hex, d);
    expect(sig).toBe(g.guardianSignature);
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it('wraps it in the on-behalf envelope for a legacy identity', async () => {
    const { d } = deps({ sign: jest.fn(async () => vectorAssertion) });
    const sig = await signHashAsIdentity(guardianSession(LEGACY), g.recoveryHash as Hex, d);
    expect(decodeOnBehalfSignature(sig)).toEqual({ safe: guardianSafe, signature: g.guardianSignature });
    expect(decodeOnBehalfSignature(g.guardianSignature as Hex)).toBeNull();
  });

  it('signMessage / signTypedData sign safeMessageHash(safe, EIP-191 / EIP-712 hash)', async () => {
    const challenges: Hex[] = [];
    const sign = jest.fn(async (_id: string, c: Hex) => {
      challenges.push(c);
      throw Object.assign(new Error('stop'), { name: 'PasskeyCancelledError' });
    });
    const acc = createPasskeyAccount(session(LEGACY), deps({ sign }).d);
    await expect(acc.signMessage({ message: 'roebel-org-v1:x' })).rejects.toThrow('stop');
    expect(challenges[0]).toBe(safeMessageHash(SAFE, hashMessage('roebel-org-v1:x')));
    const td = {
      domain: { name: 'T', version: '1', chainId: 100 },
      types: { M: [{ name: 'a', type: 'string' }] },
      primaryType: 'M' as const,
      message: { a: 'b' },
    };
    await expect(acc.signTypedData(td)).rejects.toThrow('stop');
    expect(challenges[1]).toBe(safeMessageHash(SAFE, hashTypedData(td)));
    await expect(acc.signTypedData({ ...td, domain: { ...td.domain, chainId: 8453 } })).rejects.toThrow(WRONG_CHAIN_MESSAGE);
  });

  it('ERC-6492-wraps the signature of a counterfactual Safe with its own factory call', async () => {
    const { d } = deps({ sign: jest.fn(async () => vectorAssertion), isSafeDeployed: jest.fn(async () => false) });
    // The vector assertion does not belong to this key; only the envelope layout is checked here.
    const challenge = safeMessageHash(SAFE, g.recoveryHash as Hex);
    const sign = jest.fn(async (_id: string, c: Hex) => ({
      ...vectorAssertion,
      clientDataJSON: vectorAssertion.clientDataJSON.replace(/"challenge":"[^"]+"/, `"challenge":"${Buffer.from(c.slice(2), 'hex').toString('base64url')}"`),
    }));
    const sig = await signHashAsIdentity(session(SAFE), g.recoveryHash as Hex, { ...d, sign });
    expect(sign).toHaveBeenCalledWith('cred', challenge);
    expect(isErc6492Signature(sig)).toBe(true);
    const parsed = parseErc6492Signature(sig);
    expect(getAddress(parsed.address as Address)).toBe(getAddress(SAFE_PROXY_FACTORY));
    expect(parsed.data).toBe(safeFactoryData({ x, y }));
  });
});

describe('Safe-admin envelope matches the server', () => {
  it('uses the magic of apps/web/src/lib/auth/account-signature-core.ts as a 32-byte prefix', () => {
    const { SAFE_ADMIN_SIGNATURE_MAGIC, encodeOnBehalfSignature } = require('../thirdweb-adapter');
    expect(SAFE_ADMIN_SIGNATURE_MAGIC).toBe('0xc147971c4ed41e39ec9a286f1686117a7a3e33a2a5a6bcd0ec1881c11ac60de5');
    const env: string = encodeOnBehalfSignature(LEGACY, '0x1234');
    expect(env.startsWith(SAFE_ADMIN_SIGNATURE_MAGIC)).toBe(true);
    // server layout: MAGIC ++ safe word ++ offset 0x40 ++ length ++ padded bytes
    expect(env).toBe(
      `${SAFE_ADMIN_SIGNATURE_MAGIC}${LEGACY.slice(2).toLowerCase().padStart(64, '0')}${(64).toString(16).padStart(64, '0')}${(2).toString(16).padStart(64, '0')}1234${'0'.repeat(60)}`,
    );
  });
});
