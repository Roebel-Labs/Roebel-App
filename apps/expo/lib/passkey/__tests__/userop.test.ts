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
        calls: [{ to: vector.handover.legacyAccount as Hex, data: vector.handover.setPermissionsForSignerCallData as Hex }],
      },
      {
        fetch: fetchMock as any,
        sign,
        apiUrl: 'https://preview.example',
        bundlerUrl: 'https://preview.example/api/bundler',
        rpcUrl: 'https://rpc.example',
        pollIntervalMs: 1,
      },
    );

    expect(result).toEqual({ userOpHash: `0x${'ee'.repeat(32)}`, txHash: `0x${'dd'.repeat(32)}` });
    const order = calls.map((c) => c.method).filter((m) => m !== 'eth_call' && m !== 'eth_getBlockByNumber' && m !== 'eth_maxPriorityFeePerGas');
    expect(order).toEqual(['eth_estimateUserOperationGas', 'sponsor', 'eth_sendUserOperation', 'eth_getUserOperationReceipt']);

    const est = calls.find((c) => c.method === 'eth_estimateUserOperationGas')!.body.params[0];
    expect(est.paymaster).toBe(NETIZEN_VERIFYING_PAYMASTER);
    expect(size(est.paymasterData)).toBe(320);
    expect(size(est.signature)).toBeGreaterThanOrEqual(size(w.userOpSignature as Hex));

    const sponsorBody = calls.find((c) => c.method === 'sponsor')!.body;
    expect(sponsorBody.chainId).toBe(100);
    expect(sponsorBody.userOp.sender).toBe(u.sender);
    expect(sponsorBody.userOp.callData).toBe(u.callData);
    expect(sponsorBody.userOp.factory).toBe(SAFE_PROXY_FACTORY);

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
        { credentialId: 'c', x: key.x, y: key.y, deployed: true, calls: [] },
        { apiUrl: '', fetch: jest.fn() as any },
      ),
    ).rejects.toThrow();
  });
});
