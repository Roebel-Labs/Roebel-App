import { createPublicKey, verify as nodeVerify } from 'crypto';
import { concatHex, hexToBytes, hexToString, numberToHex, size, type Hex } from 'viem';
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
import { NETIZEN_VERIFYING_PAYMASTER, SAFE_PROXY_FACTORY } from '../constants';
import { safeFactoryData } from '../safe-address';
import vector from './passkey-safe-vector.json';

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
