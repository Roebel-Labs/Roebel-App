import { createPublicKey, verify as nodeVerify } from 'crypto';
import { concatHex, hexToBytes, hexToString, numberToHex, pad, size, type Hex } from 'viem';
import {
  applySponsorship,
  dummyUserOpSignature,
  encodeSafeSignature,
  encodeUserOpSignature,
  encodeWebAuthnSignature,
  extractClientDataFields,
  packUserOp,
  safeOpHash,
  sendPasskeyUserOp,
  splitPaymasterAndData,
  stubPaymasterAndData,
  webAuthnSigningDigest,
  type UnpackedUserOp,
} from '../userop';
import { NETIZEN_VERIFYING_PAYMASTER, SAFE_4337_MODULE, SAFE_PROXY_FACTORY } from '../constants';
import { predictSafeAddress, safeFactoryData } from '../safe-address';
import vector from './passkey-safe-vector.json';

/** Fallback-handler storage word of a Safe4337Module (pre-migration) Safe. */
const LAYOUT_4337_WORD = pad(SAFE_4337_MODULE, { size: 32 });

jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

const w = vector.webauthn;
const u = vector.userOp;
const key = { x: vector.x as Hex, y: vector.y as Hex };
const clientDataJSON = hexToString(w.clientDataJSONHex as Hex);

/** The golden op in unpacked (v0.7 RPC) form with the 372-byte stub paymaster. */
function fixtureOp(): UnpackedUserOp {
  return {
    sender: u.sender as Hex,
    nonce: 0n,
    factory: SAFE_PROXY_FACTORY,
    factoryData: safeFactoryData(key),
    callData: u.callData as Hex,
    callGasLimit: BigInt(u.callGasLimit),
    verificationGasLimit: BigInt(u.verificationGasLimit),
    preVerificationGas: BigInt(u.preVerificationGas),
    maxFeePerGas: BigInt(u.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(u.maxPriorityFeePerGas),
    paymaster: NETIZEN_VERIFYING_PAYMASTER,
    paymasterVerificationGasLimit: 150_000n,
    paymasterPostOpGasLimit: 50_000n,
    paymasterData: `0x${'00'.repeat(320)}`,
    signature: '0x',
  };
}

describe('userop — pure encodings vs golden vector', () => {
  it('packs the op exactly like the fork proof', () => {
    const p = packUserOp(fixtureOp());
    expect(p.initCode).toBe(u.initCode);
    expect(p.accountGasLimits).toBe(u.accountGasLimits);
    expect(p.gasFees).toBe(u.gasFees);
    expect(p.paymasterAndData).toBe(u.paymasterAndData);
    expect(size(p.paymasterAndData)).toBe(372);
  });

  it('stubPaymasterAndData is the 372-byte stub', () => {
    expect(stubPaymasterAndData(150_000n, 50_000n)).toBe(u.paymasterAndData);
  });

  it('Safe4337Module op hash equals getOperationHash on the real module', () => {
    expect(safeOpHash(fixtureOp(), 0, 0)).toBe(u.safeOpHash);
    expect(w.challenge).toBe(u.safeOpHash);
  });

  it('extracts clientDataFields and checks the challenge', () => {
    expect(extractClientDataFields(clientDataJSON, w.challenge as Hex)).toBe(w.clientDataFields);
    expect(() => extractClientDataFields(clientDataJSON, `0x${'11'.repeat(32)}`)).toThrow(/challenge/);
  });

  it('signing digest matches and (r,s) verify against the passkey key (node P-256)', () => {
    const digestInput = webAuthnSigningDigest(w.authenticatorData as Hex, clientDataJSON);
    expect(digestInput.digest).toBe(w.signingDigest);
    const pub = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: Buffer.from(hexToBytes(key.x)).toString('base64url'),
        y: Buffer.from(hexToBytes(key.y)).toString('base64url'),
      },
      format: 'jwk',
    });
    const sig = Buffer.from(hexToBytes(concatHex([w.r as Hex, w.s as Hex])));
    expect(
      nodeVerify('sha256', Buffer.from(hexToBytes(digestInput.message)), { key: pub, dsaEncoding: 'ieee-p1363' }, sig),
    ).toBe(true);
  });

  it('encodes the WebAuthn / Safe / userOp signatures byte-for-byte', () => {
    const webAuthn = encodeWebAuthnSignature(w.authenticatorData as Hex, w.clientDataFields, BigInt(w.r), BigInt(w.s));
    expect(webAuthn).toBe(w.webAuthnSignature);
    const safeSig = encodeSafeSignature(webAuthn);
    expect(safeSig).toBe(w.safeSignature);
    expect(encodeUserOpSignature(0, 0, safeSig)).toBe(w.userOpSignature);
  });

  it('dummy signature is realistic length (>= the real one)', () => {
    expect(size(dummyUserOpSignature())).toBeGreaterThanOrEqual(size(w.userOpSignature as Hex));
  });

  it('applySponsorship keeps the sponsor-echoed paymaster gas limits verbatim', () => {
    const op = { ...fixtureOp(), paymasterVerificationGasLimit: 999n, paymasterPostOpGasLimit: 888n };
    const pmd = concatHex([
      NETIZEN_VERIFYING_PAYMASTER,
      numberToHex(123_457n, { size: 16 }),
      numberToHex(54_321n, { size: 16 }),
      `0x${'ab'.repeat(320)}`,
    ]);
    const sponsored = applySponsorship(op, {
      paymasterAndData: pmd,
      paymasterVerificationGasLimit: numberToHex(123_457n),
      paymasterPostOpGasLimit: numberToHex(54_321n),
      validUntil: 1_790_000_600,
    });
    expect(sponsored.paymasterVerificationGasLimit).toBe(123_457n);
    expect(sponsored.paymasterPostOpGasLimit).toBe(54_321n);
    expect(sponsored.paymasterData).toBe(`0x${'ab'.repeat(320)}`);
    expect(packUserOp(sponsored).paymasterAndData).toBe(pmd.toLowerCase());
    // everything else untouched
    expect(sponsored.callGasLimit).toBe(op.callGasLimit);
    expect(sponsored.verificationGasLimit).toBe(op.verificationGasLimit);
    expect(sponsored.preVerificationGas).toBe(op.preVerificationGas);
  });

  it('applySponsorship rejects inconsistent / foreign sponsor replies', () => {
    const op = fixtureOp();
    const good = concatHex([
      NETIZEN_VERIFYING_PAYMASTER,
      numberToHex(1n, { size: 16 }),
      numberToHex(2n, { size: 16 }),
      `0x${'00'.repeat(320)}`,
    ]);
    // echoed limit differs from the one embedded in paymasterAndData
    expect(() =>
      applySponsorship(op, { paymasterAndData: good, paymasterVerificationGasLimit: '0x5', paymasterPostOpGasLimit: '0x2', validUntil: 0 }),
    ).toThrow();
    // wrong paymaster
    expect(() =>
      applySponsorship(op, {
        paymasterAndData: `0x${'11'.repeat(20)}${good.slice(42)}` as Hex,
        paymasterVerificationGasLimit: '0x1',
        paymasterPostOpGasLimit: '0x2',
        validUntil: 0,
      }),
    ).toThrow(/paymaster/);
    // wrong length
    expect(() =>
      applySponsorship(op, { paymasterAndData: good.slice(0, -2) as Hex, paymasterVerificationGasLimit: '0x1', paymasterPostOpGasLimit: '0x2', validUntil: 0 }),
    ).toThrow(/372/);
  });

  it('splitPaymasterAndData round-trips', () => {
    const s = splitPaymasterAndData(u.paymasterAndData as Hex);
    expect(s.paymaster.toLowerCase()).toBe(NETIZEN_VERIFYING_PAYMASTER.toLowerCase());
    expect(s.paymasterVerificationGasLimit).toBe(150_000n);
    expect(s.paymasterPostOpGasLimit).toBe(50_000n);
    expect(size(s.paymasterData)).toBe(320);
  });
});

describe('sendPasskeyUserOp — sequence (estimate stub → sponsor → verbatim limits → sign → send → receipt)', () => {
  it('reproduces the golden userOp signature end-to-end with mocked network + passkey', async () => {
    const calls: { url: string; method: string; body: any }[] = [];
    const fetchMock = jest.fn(async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      calls.push({ url, method: body.method ?? 'sponsor', body });
      const ok = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result }) });
      if (url.endsWith('/api/passkey/sponsor')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            paymasterAndData: u.paymasterAndData, // stub bytes => same op hash as the vector
            paymasterVerificationGasLimit: numberToHex(150_000n),
            paymasterPostOpGasLimit: numberToHex(50_000n),
            validUntil: 1_790_000_600,
          }),
        };
      }
      switch (body.method) {
        case 'eth_getStorageAt':
          return ok(LAYOUT_4337_WORD); // Safe fallback handler = Safe4337Module
        case 'eth_call':
          return ok(numberToHex(0n, { size: 32 })); // EntryPoint.getNonce
        case 'eth_getBlockByNumber':
          return ok({ baseFeePerGas: numberToHex(500_000_000n) });
        case 'eth_maxPriorityFeePerGas':
          return ok(numberToHex(1_000_000_000n));
        case 'pimlico_getUserOperationGasPrice':
          return ok({
            slow: { maxFeePerGas: numberToHex(1_500_000_000n), maxPriorityFeePerGas: numberToHex(1_000_000_000n) },
            standard: { maxFeePerGas: numberToHex(1_800_000_000n), maxPriorityFeePerGas: numberToHex(1_000_000_000n) },
            fast: { maxFeePerGas: numberToHex(2_000_000_000n), maxPriorityFeePerGas: numberToHex(1_000_000_000n) },
          });
        case 'eth_estimateUserOperationGas':
          return ok({
            callGasLimit: numberToHex(500_000n),
            verificationGasLimit: numberToHex(1_000_000n),
            preVerificationGas: numberToHex(100_000n),
            paymasterVerificationGasLimit: numberToHex(150_000n),
            paymasterPostOpGasLimit: numberToHex(50_000n),
          });
        case 'eth_sendUserOperation':
          return ok(`0x${'ee'.repeat(32)}`);
        case 'eth_getUserOperationReceipt':
          return ok({ success: true, receipt: { transactionHash: `0x${'dd'.repeat(32)}` } });
        default:
          throw new Error(`unexpected ${body.method}`);
      }
    });

    const sign = jest.fn(async (_credentialId: string, challenge: Hex) => {
      expect(challenge).toBe(u.safeOpHash);
      return {
        authenticatorData: w.authenticatorData as Hex,
        clientDataJSON,
        r: BigInt(w.r),
        s: BigInt(w.s),
      };
    });

    const result = await sendPasskeyUserOp(
      {
        credentialId: 'cred',
        x: key.x,
        y: key.y,
        deployed: false,
        legacy: vector.handover.legacyAccount as Hex,
        calls: [{ to: vector.handover.legacyAccount as Hex, data: vector.handover.setPermissionsForSignerCallData as Hex }],
      },
      {
        fetch: fetchMock as any,
        paymaster: NETIZEN_VERIFYING_PAYMASTER,
        sign,
        apiUrl: 'https://preview.example',
        bundlerUrl: 'https://preview.example/api/bundler',
        rpcUrl: 'https://rpc.example',
        pollIntervalMs: 1,
      },
    );

    expect(result).toEqual({ userOpHash: `0x${'ee'.repeat(32)}`, txHash: `0x${'dd'.repeat(32)}` });
    const order = calls.map((c) => c.method).filter((m) => m !== 'eth_call' && m !== 'eth_getBlockByNumber' && m !== 'eth_maxPriorityFeePerGas');
    // Fees come from the bundler BEFORE estimation and sponsoring.
    expect(order).toEqual([
      'pimlico_getUserOperationGasPrice',
      'eth_estimateUserOperationGas',
      'sponsor',
      'eth_sendUserOperation',
      'eth_getUserOperationReceipt',
    ]);

    const est = calls.find((c) => c.method === 'eth_estimateUserOperationGas')!.body.params[0];
    expect(est.paymaster).toBe(NETIZEN_VERIFYING_PAYMASTER);
    expect(size(est.paymasterData)).toBe(320);
    expect(size(est.signature)).toBeGreaterThanOrEqual(size(w.userOpSignature as Hex));

    const sponsorBody = calls.find((c) => c.method === 'sponsor')!.body;
    expect(sponsorBody.chainId).toBe(100);
    expect(sponsorBody.userOp.sender).toBe(u.sender);
    expect(sponsorBody.userOp.callData).toBe(u.callData);
    expect(sponsorBody.userOp.factory).toBe(SAFE_PROXY_FACTORY);
    // C1: the sponsor needs the passkey key and the citizen's legacy account.
    expect(sponsorBody.x).toBe(key.x);
    expect(sponsorBody.y).toBe(key.y);
    expect(sponsorBody.legacy).toBe(vector.handover.legacyAccount);
    expect(sponsorBody.userOp.maxFeePerGas).toBe(numberToHex(2_000_000_000n));

    const sent = calls.find((c) => c.method === 'eth_sendUserOperation')!.body.params;
    expect(sent[1]).toBe('0x0000000071727De22E5E9d8BAf0edAc6f37da032');
    expect(sent[0].signature).toBe(w.userOpSignature);
    expect(sent[0].paymasterVerificationGasLimit).toBe(numberToHex(150_000n));
    expect(sent[0].paymasterPostOpGasLimit).toBe(numberToHex(50_000n));
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it('refuses to run without a sponsor API URL', async () => {
    await expect(
      sendPasskeyUserOp(
        { credentialId: 'c', x: key.x, y: key.y, deployed: true, legacy: vector.handover.legacyAccount as Hex, calls: [] },
        { apiUrl: '', fetch: jest.fn() as any, paymaster: NETIZEN_VERIFYING_PAYMASTER },
      ),
    ).rejects.toThrow();
  });
});

// ---- fees (H2) + paymaster gas floors (M1) ----

type Mock = {
  gasPrice?: 'unsupported' | { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
  baseFee?: bigint;
  priority?: bigint;
  pmVerif?: bigint;
  pmPost?: bigint | null;
};

/** Runs sendPasskeyUserOp up to the sponsor call and returns what was estimated / sent to the sponsor. */
async function runToSponsor(m: Mock, paymaster: Hex | '' = NETIZEN_VERIFYING_PAYMASTER) {
  const calls: { method: string; body: any }[] = [];
  const fetchMock = jest.fn(async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push({ method: body.method ?? 'sponsor', body });
    const ok = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result }) });
    if (url.endsWith('/api/passkey/sponsor')) return { ok: false, status: 403, json: async () => ({ error: 'stop here' }) };
    switch (body.method) {
      case 'eth_getStorageAt':
        return ok(LAYOUT_4337_WORD); // Safe fallback handler = Safe4337Module
      case 'eth_call':
        return ok(numberToHex(0n, { size: 32 }));
      case 'eth_getBlockByNumber':
        return ok({ baseFeePerGas: numberToHex(m.baseFee ?? 7n) });
      case 'eth_maxPriorityFeePerGas':
        return ok(numberToHex(m.priority ?? 10n));
      case 'pimlico_getUserOperationGasPrice':
        if (!m.gasPrice || m.gasPrice === 'unsupported') {
          return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } }) };
        }
        return ok({
          standard: { maxFeePerGas: numberToHex(m.gasPrice.maxFeePerGas), maxPriorityFeePerGas: numberToHex(m.gasPrice.maxPriorityFeePerGas) },
        });
      case 'eth_estimateUserOperationGas':
        return ok({
          callGasLimit: numberToHex(200_000n),
          verificationGasLimit: numberToHex(600_000n),
          preVerificationGas: numberToHex(80_000n),
          paymasterVerificationGasLimit: numberToHex(m.pmVerif ?? 40_000n),
          ...(m.pmPost === null ? {} : { paymasterPostOpGasLimit: numberToHex(m.pmPost ?? 0n) }),
        });
      default:
        throw new Error(`unexpected ${body.method}`);
    }
  });
  const promise = sendPasskeyUserOp(
    { credentialId: 'c', x: key.x, y: key.y, deployed: true, legacy: vector.handover.legacyAccount as Hex, calls: [{ to: vector.handover.legacyAccount as Hex, data: '0x1234' }] },
    { fetch: fetchMock as any, sign: jest.fn(), apiUrl: 'https://preview.example', bundlerUrl: 'https://b.example', rpcUrl: 'https://rpc.example', paymaster },
  );
  const error = await promise.then(() => null, (e: Error) => e);
  const est = calls.find((c) => c.method === 'eth_estimateUserOperationGas')?.body.params[0];
  const sponsor = calls.find((c) => c.method === 'sponsor')?.body;
  return { error, est, sponsor, calls };
}

describe('sendPasskeyUserOp — fees from the bundler (H2)', () => {
  it('floors the bundler price at 1.5 gwei (Gnosis Pimlico minimum), never ~24 wei', async () => {
    const { est, sponsor } = await runToSponsor({ gasPrice: { maxFeePerGas: 24n, maxPriorityFeePerGas: 10n } });
    expect(BigInt(est.maxFeePerGas)).toBe(1_500_000_000n);
    expect(BigInt(est.maxPriorityFeePerGas)).toBe(10n);
    expect(sponsor.userOp.maxFeePerGas).toBe(est.maxFeePerGas);
  });

  it('uses the bundler price when above the floor', async () => {
    const { est } = await runToSponsor({ gasPrice: { maxFeePerGas: 2_200_000_000n, maxPriorityFeePerGas: 2_000_000_000n } });
    expect(BigInt(est.maxFeePerGas)).toBe(2_200_000_000n);
    expect(BigInt(est.maxPriorityFeePerGas)).toBe(2_000_000_000n);
  });

  it('errors clearly when the bundler demands more than the 3 gwei sponsor cap', async () => {
    const { error, sponsor } = await runToSponsor({ gasPrice: { maxFeePerGas: 5_000_000_000n, maxPriorityFeePerGas: 1n } });
    expect(error?.message).toMatch(/3 gwei/);
    expect(sponsor).toBeUndefined();
  });

  it('falls back to max(1.5 gwei, 2*baseFee + priority) when the bundler lacks the method', async () => {
    expect(BigInt((await runToSponsor({ gasPrice: 'unsupported', baseFee: 7n, priority: 10n })).est.maxFeePerGas)).toBe(1_500_000_000n);
    const mid = await runToSponsor({ gasPrice: 'unsupported', baseFee: 500_000_000n, priority: 1_000_000_000n });
    expect(BigInt(mid.est.maxFeePerGas)).toBe(2_000_000_000n);
    expect(BigInt(mid.est.maxPriorityFeePerGas)).toBe(1_000_000_000n);
    // A spike above the cap is clamped to 3 gwei (the chain may then just be slow).
    const hi = await runToSponsor({ gasPrice: 'unsupported', baseFee: 10_000_000_000n, priority: 1_000_000_000n });
    expect(BigInt(hi.est.maxFeePerGas)).toBe(3_000_000_000n);
  });
});

describe('sendPasskeyUserOp — paymaster gas floors (M1)', () => {
  it('raises an under-estimated paymaster verification / postOp gas to 150k / 50k', async () => {
    const { sponsor } = await runToSponsor({ gasPrice: { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1n }, pmVerif: 40_000n, pmPost: null });
    expect(BigInt(sponsor.userOp.paymasterVerificationGasLimit)).toBe(150_000n);
    expect(BigInt(sponsor.userOp.paymasterPostOpGasLimit)).toBe(50_000n);
  });

  it('keeps a larger estimate', async () => {
    const { sponsor } = await runToSponsor({ gasPrice: { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1n }, pmVerif: 210_000n, pmPost: 60_000n });
    expect(BigInt(sponsor.userOp.paymasterVerificationGasLimit)).toBe(210_000n);
    expect(BigInt(sponsor.userOp.paymasterPostOpGasLimit)).toBe(60_000n);
  });

  it('refuses estimates above the sponsor route caps (300k / 100k)', async () => {
    const { error, sponsor } = await runToSponsor({ gasPrice: { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1n }, pmVerif: 300_001n });
    expect(error?.message).toMatch(/paymaster/);
    expect(sponsor).toBeUndefined();
  });

  it('refuses to run without a configured paymaster', async () => {
    const { error, calls } = await runToSponsor({ gasPrice: { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1n } }, '');
    expect(error?.message).toMatch(/PAYMASTER/);
    expect(calls).toHaveLength(0);
  });
});

describe('buildCallData batching', () => {
  it('delegatecalls only into MultiSendCallOnly (the sponsor route rejects full MultiSend)', () => {
    const { decodeFunctionData } = require('viem');
    const { buildCallData } = require('../userop');
    const { MULTI_SEND_CALL_ONLY } = require('../constants');
    const call = { to: '0x0479b2020000000000000000000000000000eb8d', data: '0x1234' } as const;
    const data = buildCallData([call, call]);
    const decoded = decodeFunctionData({
      abi: [{ type: 'function', name: 'executeUserOp', stateMutability: 'nonpayable', inputs: [
        { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' }, { name: 'operation', type: 'uint8' }], outputs: [] }],
      data,
    });
    expect(decoded.args[0].toLowerCase()).toBe(MULTI_SEND_CALL_ONLY.toLowerCase());
    expect(decoded.args[3]).toBe(1);
  });
});

// ---- recovered Safe: the owner is the new passkey's per-key signer (review L4) ----

import rv from './recovery-vector.json';
import { sponsorRequestBody, userOpSignatureFromAssertion } from '../userop';
import { SAFE_WEBAUTHN_SHARED_SIGNER } from '../constants';
import { encodeCancelRecovery } from '../guardians';

const pr = rv.postRecoveryUserOp;
const recoveredWallet = pr.sender as Hex;
const newSigner = rv.guardianApproval.newOwner as Hex;
const prClientDataJSON = hexToString(pr.clientDataJSONHex as Hex);

function recoveredOp(): UnpackedUserOp {
  return {
    sender: recoveredWallet,
    nonce: BigInt(pr.nonce),
    callData: pr.callData as Hex,
    callGasLimit: BigInt(pr.callGasLimit),
    verificationGasLimit: BigInt(pr.verificationGasLimit),
    preVerificationGas: BigInt(pr.preVerificationGas),
    maxFeePerGas: BigInt(pr.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(pr.maxPriorityFeePerGas),
    paymaster: NETIZEN_VERIFYING_PAYMASTER,
    paymasterVerificationGasLimit: 150_000n,
    paymasterPostOpGasLimit: 50_000n,
    paymasterData: `0x${'00'.repeat(320)}`,
    signature: '0x',
  };
}

describe('userop — post-recovery signature vector', () => {
  it('op hash and signature (owner = per-key signer) match the fork fixture', () => {
    expect(packUserOp(recoveredOp()).paymasterAndData).toBe(pr.paymasterAndData);
    expect(safeOpHash(recoveredOp(), 0, 0)).toBe(pr.safeOpHash);
    const assertion = { authenticatorData: pr.authenticatorData as Hex, clientDataJSON: prClientDataJSON, r: BigInt(pr.r), s: BigInt(pr.s) };
    const sig = userOpSignatureFromAssertion(assertion, pr.safeOpHash as Hex, newSigner);
    expect(sig).toBe(pr.userOpSignature);
    // The static part names the signer, not the SharedSigner.
    expect(sig.slice(2 + 24 + 24, 2 + 24 + 64).toLowerCase()).toBe(newSigner.slice(2).toLowerCase());
    expect(userOpSignatureFromAssertion(assertion, pr.safeOpHash as Hex)).not.toBe(pr.userOpSignature);
    expect(userOpSignatureFromAssertion(assertion, pr.safeOpHash as Hex, SAFE_WEBAUTHN_SHARED_SIGNER).slice(2 + 24 + 24, 2 + 24 + 64)).toBe(
      SAFE_WEBAUTHN_SHARED_SIGNER.slice(2).toLowerCase(),
    );
  });

  it('sendPasskeyUserOp signs a recovered Safe through its signer and sends no legacy', async () => {
    const calls: { method: string; body: any }[] = [];
    const fetchMock = jest.fn(async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      calls.push({ method: body.method ?? 'sponsor', body });
      const ok = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result }) });
      if (url.endsWith('/api/passkey/sponsor')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            paymasterAndData: pr.paymasterAndData,
            paymasterVerificationGasLimit: numberToHex(150_000n),
            paymasterPostOpGasLimit: numberToHex(50_000n),
            validUntil: 1,
          }),
        };
      }
      switch (body.method) {
        case 'eth_getStorageAt':
          return ok(LAYOUT_4337_WORD); // Safe fallback handler = Safe4337Module
        case 'eth_call':
          return ok(numberToHex(BigInt(pr.nonce), { size: 32 }));
        case 'pimlico_getUserOperationGasPrice':
          return ok({ fast: { maxFeePerGas: numberToHex(BigInt(pr.maxFeePerGas)), maxPriorityFeePerGas: numberToHex(BigInt(pr.maxPriorityFeePerGas)) } });
        case 'eth_estimateUserOperationGas':
          expect(body.params[0].signature.slice(2 + 24 + 24, 2 + 24 + 64).toLowerCase()).toBe(newSigner.slice(2).toLowerCase());
          return ok({
            callGasLimit: numberToHex(BigInt(pr.callGasLimit)),
            verificationGasLimit: numberToHex(BigInt(pr.verificationGasLimit)),
            preVerificationGas: numberToHex(BigInt(pr.preVerificationGas)),
          });
        case 'eth_sendUserOperation':
          return ok(`0x${'ee'.repeat(32)}`);
        case 'eth_getUserOperationReceipt':
          return ok({ success: true, receipt: { transactionHash: `0x${'dd'.repeat(32)}` } });
        default:
          throw new Error(`unexpected ${body.method}`);
      }
    });
    const sign = jest.fn(async (_c: string, challenge: Hex) => {
      expect(challenge).toBe(pr.safeOpHash);
      return { authenticatorData: pr.authenticatorData as Hex, clientDataJSON: prClientDataJSON, r: BigInt(pr.r), s: BigInt(pr.s) };
    });
    await sendPasskeyUserOp(
      {
        credentialId: 'new',
        x: rv.newX as Hex,
        y: rv.newY as Hex,
        calls: [encodeCancelRecovery()],
        deployed: true,
        sender: recoveredWallet,
        owner: newSigner,
      },
      {
        fetch: fetchMock as any,
        paymaster: NETIZEN_VERIFYING_PAYMASTER,
        sign,
        apiUrl: 'https://preview.example',
        bundlerUrl: 'https://preview.example/api/bundler',
        rpcUrl: 'https://rpc.example',
        pollIntervalMs: 1,
      },
    );
    const sponsorBody = calls.find((c) => c.method === 'sponsor')!.body;
    expect(sponsorBody.legacy).toBeUndefined();
    expect('legacy' in sponsorBody).toBe(false);
    expect(sponsorBody.userOp.sender).toBe(recoveredWallet);
    const sent = calls.find((c) => c.method === 'eth_sendUserOperation')!.body.params[0];
    expect(sent.signature).toBe(pr.userOpSignature);
  });

  it('refuses to deploy a sender that is not the passkey Safe for (x, y)', async () => {
    await expect(
      sendPasskeyUserOp(
        { credentialId: 'c', x: key.x, y: key.y, deployed: false, sender: rv.newSafe as Hex, calls: [{ to: recoveredWallet, data: '0x' }] },
        { apiUrl: 'https://a', fetch: jest.fn() as any, paymaster: NETIZEN_VERIFYING_PAYMASTER },
      ),
    ).rejects.toThrow(/deployed by its first userOp/);
  });

  it('sponsorRequestBody carries legacy / recoveryLegacy only when set', () => {
    const b = sponsorRequestBody(recoveredOp(), { proof: { x: key.x, y: key.y } });
    expect(Object.keys(b).sort()).toEqual(['chainId', 'userOp', 'x', 'y']);
    const r = sponsorRequestBody(recoveredOp(), { proof: { x: key.x, y: key.y }, recoveryLegacy: recoveredWallet });
    expect(r.recoveryLegacy).toBe(recoveredWallet);
    expect((r.userOp as any).signature).toBeUndefined();
  });
});

// ---- signer-neutral sender: the expert-path (ECDSA-owner) Safe (plan 3 Task 2) ----

import { getAddress, isAddressEqual, recoverAddress, zeroAddress, type Address } from 'viem';
import ev from './ecdsa-safe-vector.json';
import { ecdsaSafeFactoryData } from '../ecdsa-safe';
import {
  ECDSA_DUMMY_SIGNATURE,
  ecdsaOpSigner,
  normalizeEcdsaSignature,
  passkeyOpSigner,
  sendSafeUserOp,
  type SafeOpSigner,
  type SafeUserOpArgs,
} from '../userop';
import { validatePhrase, wordsFromSeed } from '../words';

const ecdsaVector = { ...ev, owner: ev.owner as Address };
const eu = ev.userOp;
const ECDSA_CALL = { to: '0x000000000000000000000000000000000000dEaD' as Address, data: '0x' as Hex, value: 1n };

/** The fork vector's op in unpacked (v0.7 RPC) form, with the 372-byte stub paymaster. */
function vectorOp(v: typeof ecdsaVector): UnpackedUserOp {
  const ag = v.userOp.accountGasLimits as Hex;
  const fees = v.userOp.gasFees as Hex;
  const pm = splitPaymasterAndData(v.userOp.paymasterAndData as Hex);
  return {
    sender: getAddress(v.userOp.sender),
    nonce: BigInt(v.userOp.nonce),
    factory: SAFE_PROXY_FACTORY,
    factoryData: ecdsaSafeFactoryData(v.owner),
    callData: v.userOp.callData as Hex,
    verificationGasLimit: BigInt(`0x${ag.slice(2, 34)}`),
    callGasLimit: BigInt(`0x${ag.slice(34)}`),
    preVerificationGas: BigInt(v.userOp.preVerificationGas),
    maxPriorityFeePerGas: BigInt(`0x${fees.slice(2, 34)}`),
    maxFeePerGas: BigInt(`0x${fees.slice(34)}`),
    ...pm,
    signature: '0x',
  };
}

/**
 * The fake network of the sendPasskeyUserOp tests, answering with the ECDSA vector's gas, fees and
 * stub voucher (so the op hash is the vector's). Returns the request bodies and the sent op.
 */
async function runWithFakeNetwork(args: Omit<SafeUserOpArgs, 'calls'> & { calls: SafeUserOpArgs['calls'] }) {
  const op = vectorOp(ecdsaVector);
  const calls: { method: string; body: any }[] = [];
  const fetchMock = jest.fn(async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push({ method: body.method ?? 'sponsor', body });
    const ok = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result }) });
    if (url.endsWith('/api/passkey/sponsor')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          paymasterAndData: eu.paymasterAndData,
          paymasterVerificationGasLimit: numberToHex(op.paymasterVerificationGasLimit!),
          paymasterPostOpGasLimit: numberToHex(op.paymasterPostOpGasLimit!),
          validUntil: 1,
        }),
      };
    }
    switch (body.method) {
      case 'eth_getStorageAt':
        return ok(LAYOUT_4337_WORD); // Safe fallback handler = Safe4337Module
      case 'eth_call':
        return ok(numberToHex(op.nonce, { size: 32 }));
      case 'pimlico_getUserOperationGasPrice':
        return ok({ fast: { maxFeePerGas: numberToHex(op.maxFeePerGas), maxPriorityFeePerGas: numberToHex(op.maxPriorityFeePerGas) } });
      case 'eth_estimateUserOperationGas':
        return ok({
          callGasLimit: numberToHex(op.callGasLimit),
          verificationGasLimit: numberToHex(op.verificationGasLimit),
          preVerificationGas: numberToHex(op.preVerificationGas),
          paymasterVerificationGasLimit: numberToHex(op.paymasterVerificationGasLimit!),
          paymasterPostOpGasLimit: numberToHex(op.paymasterPostOpGasLimit!),
        });
      case 'eth_sendUserOperation':
        return ok(`0x${'ee'.repeat(32)}`);
      case 'eth_getUserOperationReceipt':
        return ok({ success: true, receipt: { transactionHash: `0x${'dd'.repeat(32)}` } });
      default:
        throw new Error(`unexpected ${body.method}`);
    }
  });
  const result = await sendSafeUserOp(args, {
    fetch: fetchMock as any,
    paymaster: NETIZEN_VERIFYING_PAYMASTER,
    apiUrl: 'https://preview.example',
    bundlerUrl: 'https://preview.example/api/bundler',
    rpcUrl: 'https://rpc.example',
    pollIntervalMs: 1,
  });
  const body = (m: string) => calls.find((c) => c.method === m)?.body;
  return {
    result,
    bodies: { estimate: body('eth_estimateUserOperationGas')?.params[0], sponsor: body('sponsor') },
    sent: body('eth_sendUserOperation')?.params[0],
  };
}

describe('ECDSA signer (expert path) vs the fork vector', () => {
  it('ECDSA signer: the op hash and the userOp signature match the fork vector', async () => {
    const check = validatePhrase(ecdsaVector.phrase);
    if (!check.ok) throw new Error('vector phrase invalid');
    const account = wordsFromSeed(check.phrase).account(0);
    expect(account.address).toBe(getAddress(ecdsaVector.owner));
    const signer = ecdsaOpSigner(ecdsaVector.owner, (digest) => account.sign({ hash: digest }));
    expect(safeOpHash(vectorOp(ecdsaVector), 0, 0)).toBe(eu.safeOpHash);
    expect(await signer.signOpHash(eu.safeOpHash as Hex)).toBe(eu.userOpSignature);
    // The raw digest is signed (no message prefix): the owner signature is the vector's.
    expect(await account.sign({ hash: eu.safeOpHash as Hex })).toBe(eu.ownerSignature);
  });

  it('ecdsaOpSigner: predicted Safe, factoryData, proof and a 65-byte 0xff dummy', () => {
    const s = ecdsaOpSigner(ecdsaVector.owner, async () => eu.ownerSignature as Hex);
    expect(s.predicted).toBe(getAddress(ecdsaVector.safeAddress));
    expect(s.factoryData).toBe(ecdsaSafeFactoryData(ecdsaVector.owner));
    expect(s.proof).toEqual({ ecdsaOwner: getAddress(ecdsaVector.owner) });
    expect(s.dummySignature).toBe(encodeUserOpSignature(0, 0, ECDSA_DUMMY_SIGNATURE));
    expect(size(s.dummySignature)).toBe(size(eu.userOpSignature as Hex));
  });

  it('I-2: the ECDSA dummy is a well-formed 65-byte v = 27 signature that recovers to a non-owner', async () => {
    expect(size(ECDSA_DUMMY_SIGNATURE)).toBe(65);
    expect(parseInt(ECDSA_DUMMY_SIGNATURE.slice(-2), 16)).toBe(27);
    expect(normalizeEcdsaSignature(ECDSA_DUMMY_SIGNATURE)).toBe(ECDSA_DUMMY_SIGNATURE);
    // No zero byte: the estimate's calldata is never cheaper than a real signature's.
    expect(ECDSA_DUMMY_SIGNATURE.slice(2).match(/../g)).not.toContain('00');
    // Low-s and a real point: it recovers (to some address that is not the owner) over the op hash.
    const s = BigInt(`0x${ECDSA_DUMMY_SIGNATURE.slice(66, 130)}`);
    expect(s <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n).toBe(true);
    const recovered = await recoverAddress({ hash: eu.safeOpHash as Hex, signature: ECDSA_DUMMY_SIGNATURE });
    expect(recovered).not.toBe(zeroAddress);
    expect(isAddressEqual(recovered, ecdsaVector.owner)).toBe(false);
  });

  it('ecdsaOpSigner refuses a signature that is not 65 bytes', async () => {
    const s = ecdsaOpSigner(ecdsaVector.owner, async () => `0x${'ab'.repeat(64)}` as Hex);
    await expect(s.signOpHash(eu.safeOpHash as Hex)).rejects.toThrow(/65 bytes/);
  });

  it('ecdsaOpSigner normalises a y-parity v (0/1 → 27/28) and refuses any other v', async () => {
    const rs = (eu.ownerSignature as string).slice(0, -2); // vector v = 0x1b (27)
    const withV = (v: string) => ecdsaOpSigner(ecdsaVector.owner, async () => `${rs}${v}` as Hex).signOpHash(eu.safeOpHash as Hex);
    expect(await withV('00')).toBe(eu.userOpSignature);
    expect(await withV('1b')).toBe(eu.userOpSignature);
    expect((await withV('01')).slice(-2)).toBe('1c');
    expect((await withV('1c')).slice(-2)).toBe('1c');
    for (const bad of ['02', '1a', '1d', '1f', '20', 'ff']) await expect(withV(bad)).rejects.toThrow(/v = 27 or 28/);
  });

  it('sendSafeUserOp with an ECDSA signer: deploy op carries the ECDSA factoryData and the body names ecdsaOwner, no x/y', async () => {
    const digests: Hex[] = [];
    const signer = ecdsaOpSigner(ecdsaVector.owner, async (d) => {
      digests.push(d);
      return eu.ownerSignature as Hex;
    });
    const { result, bodies, sent } = await runWithFakeNetwork({ signer, deployed: false, calls: [ECDSA_CALL] });
    expect(result).toEqual({ userOpHash: `0x${'ee'.repeat(32)}`, txHash: `0x${'dd'.repeat(32)}` });
    expect(bodies.sponsor.ecdsaOwner).toBe(ecdsaVector.owner);
    expect(bodies.sponsor.x).toBeUndefined();
    expect(bodies.sponsor.y).toBeUndefined();
    expect('x' in bodies.sponsor).toBe(false);
    expect(bodies.sponsor.userOp.factoryData).toBe(ecdsaSafeFactoryData(ecdsaVector.owner));
    expect(bodies.estimate.signature).toBe(signer.dummySignature);
    expect(sent.factoryData).toBe(ecdsaSafeFactoryData(ecdsaVector.owner));
    expect(sent.sender).toBe(getAddress(ecdsaVector.safeAddress));
    expect(sent.callData).toBe(eu.callData);
    // The whole op equals the vector's: same hash signed, same signature sent.
    expect(digests).toEqual([eu.safeOpHash]);
    expect(sent.signature).toBe(eu.userOpSignature);
  });

  it('sendSafeUserOp refuses to deploy a sender that is not the signer\'s own Safe', async () => {
    const signer = ecdsaOpSigner(ecdsaVector.owner, async () => eu.ownerSignature as Hex);
    await expect(
      sendSafeUserOp(
        { signer, deployed: false, sender: rv.newSafe as Hex, calls: [ECDSA_CALL] },
        { apiUrl: 'https://a', fetch: jest.fn() as any, paymaster: NETIZEN_VERIFYING_PAYMASTER },
      ),
    ).rejects.toThrow(/deployed by its first userOp/);
  });

  it('the passkey wrapper still produces the old sponsor body (x, y, legacy; no ecdsaOwner)', async () => {
    const { sponsor } = await runToSponsor({ gasPrice: { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n } });
    expect(sponsor.x).toBe(key.x);
    expect(sponsor.y).toBe(key.y);
    expect(sponsor.legacy).toBe(vector.handover.legacyAccount);
    expect('ecdsaOwner' in sponsor).toBe(false);
    expect(Object.keys(sponsor).sort()).toEqual(['chainId', 'legacy', 'userOp', 'x', 'y']);
  });

  it('passkeyOpSigner carries the passkey proof, Safe, factoryData and owner-specific dummy', async () => {
    const sign = jest.fn(async () => ({ authenticatorData: w.authenticatorData as Hex, clientDataJSON, r: BigInt(w.r), s: BigInt(w.s) }));
    const s: SafeOpSigner = passkeyOpSigner({ credentialId: 'cred', x: key.x, y: key.y }, sign);
    expect(s.proof).toEqual({ x: key.x, y: key.y });
    expect(s.predicted).toBe(predictSafeAddress(key));
    expect(s.factoryData).toBe(safeFactoryData(key));
    expect(s.dummySignature).toBe(dummyUserOpSignature());
    expect(await s.signOpHash(u.safeOpHash as Hex)).toBe(w.userOpSignature);
    expect(sign).toHaveBeenCalledWith('cred', u.safeOpHash);
    const recovered = passkeyOpSigner({ credentialId: 'new', x: rv.newX as Hex, y: rv.newY as Hex, owner: newSigner }, sign);
    expect(recovered.dummySignature).toBe(dummyUserOpSignature(newSigner));
  });

  it('sponsorRequestBody names x, y for a passkey proof and ecdsaOwner for an ECDSA proof, never both', () => {
    const p = sponsorRequestBody(recoveredOp(), { proof: { x: key.x, y: key.y } });
    expect(Object.keys(p).sort()).toEqual(['chainId', 'userOp', 'x', 'y']);
    const e = sponsorRequestBody(recoveredOp(), { proof: { ecdsaOwner: ecdsaVector.owner }, pollId: 7n });
    expect(Object.keys(e).sort()).toEqual(['chainId', 'ecdsaOwner', 'pollId', 'userOp']);
    expect(e.ecdsaOwner).toBe(getAddress(ecdsaVector.owner));
  });
});

// ---- Safe7579 root path + device-session plumbing (session keys plan, Task 5) ----

import { decodeFunctionData, toFunctionSelector } from 'viem';
import { getUserOperationHash } from 'viem/account-abstraction';
import skv from './session-keys-vector.json';
import { legacyClaimBatchData, SAFE7579, SESSION_NONCE_KEY } from '../session-keys/builders';
import { invalidateSafeLayout, readSafeLayout } from '../safe-layout';
import { buildCallData, entryPointUserOpHash, type SafeOpSigner, type SponsorResponse } from '../userop';

const EXECUTE_7579_SELECTOR = toFunctionSelector('execute(bytes32,bytes)');
const EXECUTE_USEROP_SELECTOR = toFunctionSelector('executeUserOp(address,uint256,bytes,uint8)');
const skLegacy = skv.inputs.legacy as Address;
const skSafe = skv.inputs.safe as Address;
const claimCalls = [{ to: skLegacy, data: legacyClaimBatchData(skLegacy, BigInt(skv.groupMintAmount)) }];
const skPaymaster = getAddress(skv.rootOp.paymasterAndData.slice(0, 42));
const getNonceAbiT = [
  {
    type: 'function',
    name: 'getNonce',
    stateMutability: 'view',
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'key', type: 'uint192' },
    ],
    outputs: [{ name: 'nonce', type: 'uint256' }],
  },
] as const;

type VecOp = typeof skv.rootOp;

/**
 * A fake network that answers with one vector op's nonce, gas, fees and stub voucher (so the op the
 * app builds hashes exactly like the vector's). `handler` = the Safe's fallback-handler word.
 */
function vectorNetwork(o: {
  op: Pick<VecOp, 'nonce' | 'verificationGasLimit' | 'callGasLimit' | 'preVerificationGas' | 'maxFeePerGas' | 'maxPriorityFeePerGas' | 'paymasterAndData'>;
  handler?: Address;
  fees?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
  reply?: Partial<SponsorResponse>;
}) {
  const calls: { method: string; body: any }[] = [];
  const fetchMock = jest.fn(async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push({ method: body.method ?? 'sponsor', body });
    const ok = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result }) });
    if (url.endsWith('/api/passkey/sponsor')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          paymasterAndData: o.op.paymasterAndData,
          paymasterVerificationGasLimit: numberToHex(150_000n),
          paymasterPostOpGasLimit: numberToHex(50_000n),
          validUntil: 1,
          ...o.reply,
        }),
      };
    }
    switch (body.method) {
      case 'eth_getStorageAt':
        if (!o.handler) throw new Error('unexpected layout read');
        return ok(pad(o.handler, { size: 32 }));
      case 'eth_call':
        return ok(numberToHex(BigInt(o.op.nonce), { size: 32 }));
      case 'pimlico_getUserOperationGasPrice': {
        const f = o.fees ?? { maxFeePerGas: BigInt(o.op.maxFeePerGas), maxPriorityFeePerGas: BigInt(o.op.maxPriorityFeePerGas) };
        return ok({ fast: { maxFeePerGas: numberToHex(f.maxFeePerGas), maxPriorityFeePerGas: numberToHex(f.maxPriorityFeePerGas) } });
      }
      case 'eth_estimateUserOperationGas':
        return ok({
          callGasLimit: numberToHex(BigInt(o.op.callGasLimit)),
          verificationGasLimit: numberToHex(BigInt(o.op.verificationGasLimit)),
          preVerificationGas: numberToHex(BigInt(o.op.preVerificationGas)),
          paymasterVerificationGasLimit: numberToHex(150_000n),
          paymasterPostOpGasLimit: numberToHex(50_000n),
        });
      case 'eth_sendUserOperation':
        return ok(`0x${'ee'.repeat(32)}`);
      case 'eth_getUserOperationReceipt':
        return ok({ success: true, receipt: { transactionHash: `0x${'dd'.repeat(32)}` } });
      default:
        throw new Error(`unexpected ${body.method}`);
    }
  });
  const deps = {
    fetch: fetchMock as any,
    paymaster: skPaymaster,
    apiUrl: 'https://preview.example',
    bundlerUrl: 'https://preview.example/api/bundler',
    rpcUrl: 'https://rpc.example',
    pollIntervalMs: 1,
  };
  const body = (m: string) => calls.find((c) => c.method === m)?.body;
  return { deps, calls, body, sent: () => body('eth_sendUserOperation')?.params[0] };
}

/** A recording signer for `sender` (a deployed Safe; predicted/factoryData are never used). */
function recordingSigner(sender: Address, extra: Partial<SafeOpSigner> = {}, signature: Hex = `0x${'cd'.repeat(80)}`) {
  const signOpHash = jest.fn(async (_h: Hex) => signature);
  const signer: SafeOpSigner = {
    proof: { x: key.x, y: key.y },
    predicted: sender,
    factoryData: '0x',
    dummySignature: `0x${'ab'.repeat(100)}`,
    signOpHash,
    ...extra,
  };
  return { signer, signOpHash };
}

/** The sent RPC op back in UnpackedUserOp form (signature cleared), for re-hashing. */
function unsignedFromRpc(sent: Record<string, Hex>): UnpackedUserOp {
  return {
    sender: sent.sender,
    nonce: BigInt(sent.nonce),
    callData: sent.callData,
    callGasLimit: BigInt(sent.callGasLimit),
    verificationGasLimit: BigInt(sent.verificationGasLimit),
    preVerificationGas: BigInt(sent.preVerificationGas),
    maxFeePerGas: BigInt(sent.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(sent.maxPriorityFeePerGas),
    paymaster: sent.paymaster,
    paymasterVerificationGasLimit: BigInt(sent.paymasterVerificationGasLimit),
    paymasterPostOpGasLimit: BigInt(sent.paymasterPostOpGasLimit),
    paymasterData: sent.paymasterData,
    signature: '0x',
  };
}

describe('userop — Safe7579 root path (migrated passkey Safes)', () => {
  beforeEach(() => {
    invalidateSafeLayout(skSafe);
  });

  test('buildCallData 7579 = Safe7579.execute; the claim batch matches the fork root op', () => {
    expect(buildCallData(claimCalls, '7579').toLowerCase()).toBe(skv.rootClaimCallData);
    expect(buildCallData(claimCalls, '7579').startsWith(EXECUTE_7579_SELECTOR)).toBe(true);
    expect(buildCallData(claimCalls).startsWith(EXECUTE_USEROP_SELECTOR)).toBe(true);
    expect(buildCallData([...claimCalls, ...claimCalls], '7579').startsWith(EXECUTE_7579_SELECTOR)).toBe(true);
  });

  test('safeOpHash with verifyingContract SAFE7579 equals Safe7579.getSafeOp (vector)', () => {
    const r = skv.rootOp;
    const op: UnpackedUserOp = {
      sender: r.sender as Address,
      nonce: BigInt(r.nonce),
      callData: r.callData as Hex,
      callGasLimit: BigInt(r.callGasLimit),
      verificationGasLimit: BigInt(r.verificationGasLimit),
      preVerificationGas: BigInt(r.preVerificationGas),
      maxFeePerGas: BigInt(r.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(r.maxPriorityFeePerGas),
      ...splitPaymasterAndData(r.paymasterAndData as Hex),
      signature: '0x',
    };
    expect(safeOpHash(op, 0, 0, SAFE7579)).toBe(r.safeOpHash7579);
    expect(safeOpHash(op, 0, 0)).not.toBe(r.safeOpHash7579);
  });

  test('sendSafeUserOp builds Safe7579 execute + 7579 SafeOp hash for a 7579 Safe', async () => {
    const net = vectorNetwork({ op: skv.rootOp, handler: SAFE7579 });
    const { signer, signOpHash } = recordingSigner(skSafe);
    await sendSafeUserOp({ signer, deployed: true, sender: skSafe, legacy: skLegacy, calls: claimCalls }, net.deps);
    expect(net.calls.some((c) => c.method === 'eth_getStorageAt')).toBe(true);
    const sent = net.sent();
    expect(sent.callData.startsWith(EXECUTE_7579_SELECTOR)).toBe(true);
    expect(sent.callData.toLowerCase()).toBe(skv.rootOp.callData);
    expect(net.body('sponsor').userOp.callData.toLowerCase()).toBe(skv.rootOp.callData);
    expect(signOpHash).toHaveBeenCalledTimes(1);
    // The fork's Safe7579.getSafeOp hash, and the same hash recomputed from the bytes actually sent.
    expect(signOpHash.mock.calls[0][0]).toBe(skv.rootOp.safeOpHash7579);
    expect(signOpHash.mock.calls[0][0]).toBe(safeOpHash(unsignedFromRpc(sent), 0, 0, SAFE7579));
  });

  test('a 4337 Safe still gets executeUserOp + module-domain hash', async () => {
    const S = getAddress(`0x${'4a'.repeat(20)}`);
    invalidateSafeLayout(S);
    const net = vectorNetwork({ op: skv.rootOp, handler: SAFE_4337_MODULE });
    const { signer, signOpHash } = recordingSigner(S);
    await sendSafeUserOp({ signer, deployed: true, sender: S, legacy: skLegacy, calls: claimCalls }, net.deps);
    const sent = net.sent();
    expect(sent.callData).toBe(buildCallData(claimCalls));
    expect(sent.callData.startsWith(EXECUTE_USEROP_SELECTOR)).toBe(true);
    expect(signOpHash.mock.calls[0][0]).toBe(safeOpHash(unsignedFromRpc(sent), 0, 0, SAFE_4337_MODULE));
  });

  test('an undeployed Safe is always 4337 (no layout read); an explicit 7579 layout is refused', async () => {
    const net = vectorNetwork({ op: { ...skv.rootOp, nonce: '0' } });
    const { signer } = recordingSigner(skSafe);
    await sendSafeUserOp({ signer, deployed: false, calls: claimCalls }, net.deps);
    expect(net.calls.some((c) => c.method === 'eth_getStorageAt')).toBe(false);
    expect(net.sent().callData).toBe(buildCallData(claimCalls));
    await expect(sendSafeUserOp({ signer, deployed: false, layout: '7579', calls: claimCalls }, net.deps)).rejects.toThrow(/4337 layout/);
  });

  test('an unknown fallback handler stops the op before anything is sponsored', async () => {
    const S = getAddress(`0x${'4b'.repeat(20)}`);
    const net = vectorNetwork({ op: skv.rootOp, handler: getAddress(`0x${'51'.repeat(20)}`) });
    const { signer } = recordingSigner(S);
    await expect(sendSafeUserOp({ signer, deployed: true, sender: S, calls: claimCalls }, net.deps)).rejects.toThrow('unknown Safe layout');
    expect(net.calls.some((c) => c.method === 'sponsor')).toBe(false);
  });

  test('signer.nonceKey is used for getNonce and hashKind userOpHash signs the EntryPoint hash', async () => {
    const so = skv.sessionOp;
    const net = vectorNetwork({ op: so });
    const { signer, signOpHash } = recordingSigner(skSafe, { nonceKey: SESSION_NONCE_KEY, hashKind: 'userOpHash' }, so.signature as Hex);
    await sendSafeUserOp({ signer, deployed: true, sender: skSafe, layout: '7579', legacy: skLegacy, callData: so.callData as Hex }, net.deps);
    const nonceCall = net.body('eth_call')!.params[0];
    const decoded = decodeFunctionData({ abi: getNonceAbiT, data: nonceCall.data });
    expect(decoded.args).toEqual([getAddress(skSafe), SESSION_NONCE_KEY]);
    expect(SESSION_NONCE_KEY).toBe(BigInt(skv.sessionNonceKey));
    const sent = net.sent();
    const expected = getUserOperationHash({
      userOperation: unsignedFromRpc(sent),
      entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
      entryPointVersion: '0.7',
      chainId: 100,
    });
    expect(signOpHash.mock.calls[0][0]).toBe(expected);
    // …and it is the fork's userOpHash that SmartSession accepted.
    expect(signOpHash.mock.calls[0][0]).toBe(so.userOpHash);
    expect(sent.signature).toBe(so.signature);
  });

  test('entryPointUserOpHash reproduces the vector session op hash', () => {
    const so = skv.sessionOp;
    expect(
      entryPointUserOpHash({
        sender: so.sender as Address,
        nonce: BigInt(so.nonce),
        callData: so.callData as Hex,
        callGasLimit: BigInt(so.callGasLimit),
        verificationGasLimit: BigInt(so.verificationGasLimit),
        preVerificationGas: BigInt(so.preVerificationGas),
        maxFeePerGas: BigInt(so.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(so.maxPriorityFeePerGas),
        ...splitPaymasterAndData(so.paymasterAndData as Hex),
        signature: '0x',
      }),
    ).toBe(so.userOpHash);
  });

  test('callData override is sent verbatim', async () => {
    const net = vectorNetwork({ op: skv.rootOp });
    const { signer } = recordingSigner(skSafe);
    const override = skv.grantInstallCallData as Hex;
    await sendSafeUserOp({ signer, deployed: true, sender: skSafe, layout: '7579', calls: claimCalls, callData: override }, net.deps);
    expect(net.sent().callData).toBe(override);
    expect(net.body('eth_estimateUserOperationGas')!.params[0].callData).toBe(override);
    expect(net.body('sponsor').userOp.callData).toBe(override);
  });

  test('maxFeePerGasCap clamps maxFeePerGas and maxPriorityFeePerGas', async () => {
    const net = vectorNetwork({ op: skv.rootOp, fees: { maxFeePerGas: 2_800_000_000n, maxPriorityFeePerGas: 2_500_000_000n } });
    const { signer } = recordingSigner(skSafe);
    await sendSafeUserOp(
      { signer, deployed: true, sender: skSafe, layout: '7579', calls: claimCalls, maxFeePerGasCap: 2_000_000_000n },
      net.deps,
    );
    for (const op of [net.body('eth_estimateUserOperationGas')!.params[0], net.body('sponsor').userOp, net.sent()]) {
      expect(BigInt(op.maxFeePerGas)).toBe(2_000_000_000n);
      expect(BigInt(op.maxPriorityFeePerGas)).toBe(2_000_000_000n);
    }
    // Without the cap the bundler price stands.
    const net2 = vectorNetwork({ op: skv.rootOp, fees: { maxFeePerGas: 2_800_000_000n, maxPriorityFeePerGas: 2_500_000_000n } });
    await sendSafeUserOp({ signer, deployed: true, sender: skSafe, layout: '7579', calls: claimCalls }, net2.deps);
    expect(BigInt(net2.sent().maxFeePerGas)).toBe(2_800_000_000n);
  });

  test('sponsorRequestBody carries deviceSession as {signer, validUntil}', async () => {
    const op = unsignedFromRpc({
      sender: skSafe,
      nonce: '0x0',
      callData: '0x',
      callGasLimit: '0x1',
      verificationGasLimit: '0x1',
      preVerificationGas: '0x1',
      maxFeePerGas: '0x1',
      maxPriorityFeePerGas: '0x1',
      paymaster: skPaymaster,
      paymasterVerificationGasLimit: '0x1',
      paymasterPostOpGasLimit: '0x1',
      paymasterData: '0x',
    } as Record<string, Hex>);
    const signerAddr = skv.inputs.signer as Address;
    const b = sponsorRequestBody(op, {
      proof: key,
      legacy: skLegacy,
      deviceSession: { signer: signerAddr, validUntil: Number(skv.inputs.validUntil) },
    });
    expect(b.deviceSession).toEqual({ signer: getAddress(signerAddr), validUntil: 1_800_000_000 });
    expect('deviceSession' in sponsorRequestBody(op, { proof: key, legacy: skLegacy })).toBe(false);
    // …and sendSafeUserOp forwards it.
    const net = vectorNetwork({ op: skv.rootOp });
    const { signer } = recordingSigner(skSafe);
    await sendSafeUserOp(
      {
        signer,
        deployed: true,
        sender: skSafe,
        layout: '7579',
        legacy: skLegacy,
        callData: skv.grantInstallCallData as Hex,
        deviceSession: { signer: signerAddr, validUntil: 1_800_000_000 },
      },
      net.deps,
    );
    expect(net.body('sponsor').deviceSession).toEqual({ signer: getAddress(signerAddr), validUntil: 1_800_000_000 });
  });

  test('a session-upgrade op drops the memoized 4337 layout', async () => {
    const S = getAddress(`0x${'4c'.repeat(20)}`);
    invalidateSafeLayout(S);
    const net = vectorNetwork({ op: skv.rootOp, handler: SAFE_4337_MODULE, reply: { mode: 'session-upgrade' } });
    const { signer } = recordingSigner(S);
    await sendSafeUserOp(
      { signer, deployed: true, sender: S, legacy: skLegacy, callData: skv.migrationCallData as Hex, deviceSession: { signer: skv.inputs.signer as Address, validUntil: 1_800_000_000 } },
      net.deps,
    );
    // The chain now reports Safe7579: a fresh read must happen (no stale '4337').
    const after = vectorNetwork({ op: skv.rootOp, handler: SAFE7579 });
    expect(await readSafeLayout(S, { fetch: after.deps.fetch, rpcUrl: 'https://rpc.example' })).toBe('7579');
    // A plain op does not invalidate.
    const T = getAddress(`0x${'4d'.repeat(20)}`);
    invalidateSafeLayout(T);
    const net2 = vectorNetwork({ op: skv.rootOp, handler: SAFE_4337_MODULE });
    await sendSafeUserOp({ signer: recordingSigner(T).signer, deployed: true, sender: T, calls: claimCalls }, net2.deps);
    const after2 = vectorNetwork({ op: skv.rootOp, handler: SAFE7579 });
    expect(await readSafeLayout(T, { fetch: after2.deps.fetch, rpcUrl: 'https://rpc.example' })).toBe('4337');
  });
});
