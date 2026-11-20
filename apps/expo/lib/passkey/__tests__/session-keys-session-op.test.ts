jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' }));
jest.mock('@/lib/storage/secureStorage', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

import { getAddress, numberToHex, sliceHex, type Hex } from 'viem';
import { DeviceSessionRejectedError, deviceSessionOpSigner, sendDeviceSessionCall } from '../session-keys/session-op';
import { SESSION_NONCE_KEY, groupMintData, permissionIdsOf, personalMintData } from '../session-keys/builders';
import type { DeviceSessionRecord } from '../session-keys/device-key';
import vector from './session-keys-vector.json';

const op = vector.sessionOp;
const SAFE = getAddress(vector.inputs.safe);
const LEGACY = getAddress(vector.inputs.legacy);
const PK = vector.inputs.sessionPrivateKey as Hex;
const SIGNER = getAddress(vector.inputs.signer);
const VALID_UNTIL = Number(vector.inputs.validUntil);
const NOW = VALID_UNTIL - 86_400;
const PROOF = { x: `0x${'11'.repeat(32)}` as Hex, y: `0x${'22'.repeat(32)}` as Hex };
const PAYMASTER = getAddress(sliceHex(op.paymasterAndData as Hex, 0, 20));

const record: DeviceSessionRecord = {
  v: 1,
  safe: SAFE,
  legacy: LEGACY,
  signer: SIGNER,
  validUntil: VALID_UNTIL,
  permissionIds: permissionIdsOf({ legacy: LEGACY, signer: SIGNER, validUntil: VALID_UNTIL }),
  status: 'active',
};

/** Fake network answering with the vector session op's nonce, gas, fees and voucher. */
function network(o: { sponsor?: { status: number; body: unknown }; estimateError?: string } = {}) {
  const calls: { url: string; method: string; body: any }[] = [];
  const fetchMock = jest.fn(async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push({ url, method: body.method ?? 'sponsor', body });
    const ok = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result }) });
    if (url.endsWith('/api/passkey/sponsor')) {
      if (o.sponsor) return { ok: false, status: o.sponsor.status, json: async () => o.sponsor!.body };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          paymasterAndData: op.paymasterAndData,
          paymasterVerificationGasLimit: numberToHex(150_000n),
          paymasterPostOpGasLimit: numberToHex(50_000n),
          validUntil: 1,
          mode: 'session-claim',
        }),
      };
    }
    switch (body.method) {
      case 'eth_getStorageAt':
        throw new Error('unexpected layout read');
      case 'eth_call':
        return ok(numberToHex(BigInt(op.nonce), { size: 32 }));
      case 'pimlico_getUserOperationGasPrice':
        return ok({ fast: { maxFeePerGas: numberToHex(BigInt(op.maxFeePerGas)), maxPriorityFeePerGas: numberToHex(BigInt(op.maxPriorityFeePerGas)) } });
      case 'eth_estimateUserOperationGas':
        if (o.estimateError) return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, error: { message: o.estimateError } }) };
        return ok({
          callGasLimit: numberToHex(BigInt(op.callGasLimit)),
          verificationGasLimit: numberToHex(BigInt(op.verificationGasLimit)),
          preVerificationGas: numberToHex(BigInt(op.preVerificationGas)),
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
  const sign = jest.fn(async () => {
    throw new Error('the passkey must not be prompted');
  });
  const deps = {
    fetch: fetchMock as any,
    paymaster: PAYMASTER,
    apiUrl: 'https://preview.example',
    bundlerUrl: 'https://preview.example/api/bundler',
    rpcUrl: 'https://rpc.example',
    pollIntervalMs: 1,
    sign: sign as any,
  };
  const body = (m: string) => calls.find((c) => c.method === m)?.body;
  return { deps, calls, body, sign, sent: () => body('eth_sendUserOperation')?.params[0] };
}

describe('device session op', () => {
  test('session signature = 0x00 ++ pid ++ raw ECDSA over the userOpHash', async () => {
    expect(record.permissionIds.personalMint).toBe(vector.permissionIds.personalMint);
    const signer = deviceSessionOpSigner(record, PK, 'personalMint', PROOF);
    expect(signer.nonceKey).toBe(SESSION_NONCE_KEY);
    expect(signer.nonceKey!.toString()).toBe(vector.sessionNonceKey);
    expect(signer.hashKind).toBe('userOpHash');
    const sig = await signer.signOpHash(op.userOpHash as Hex);
    expect(sig).toBe(op.signature.toLowerCase());
    expect(sig.slice(-130)).toBe(op.ecdsa.slice(2).toLowerCase());
    // Dummy: same layout and size as the real one.
    expect(signer.dummySignature.length).toBe(sig.length);
    expect(signer.dummySignature.slice(0, 68)).toBe(sig.slice(0, 68));
  });

  test('the signer refuses a key that is not the record signer', () => {
    expect(() => deviceSessionOpSigner(record, `0x${'01'.padStart(64, '0')}`, 'personalMint', PROOF)).toThrow('does not match');
  });

  test('sendDeviceSessionCall uses nonce key SmartSession and never prompts the passkey', async () => {
    const net = network();
    const res = await sendDeviceSessionCall(
      { record, privateKey: PK, proof: PROOF, kind: 'personalMint', innerHubData: personalMintData() },
      net.deps,
      NOW,
    );
    expect(res.txHash).toBe(`0x${'dd'.repeat(32)}`);
    expect(net.sign).not.toHaveBeenCalled();
    // getNonce(sender, SESSION_NONCE_KEY)
    const nonceCall = net.body('eth_call')!.params[0].data as string;
    expect(nonceCall.toLowerCase()).toContain(SESSION_NONCE_KEY.toString(16));
    const sent = net.sent();
    expect(sent.sender.toLowerCase()).toBe(op.sender);
    expect(BigInt(sent.nonce).toString()).toBe(op.nonce);
    expect(sent.callData.toLowerCase()).toBe(op.callData);
    // Same op as the fork vector → byte-equal signature.
    expect(sent.signature).toBe(op.signature.toLowerCase());
    const sponsor = net.body('sponsor');
    expect(getAddress(sponsor.legacy)).toBe(LEGACY);
    expect(sponsor.x).toBe(PROOF.x);
    expect('deviceSession' in sponsor).toBe(false);
  });

  test('groupMint goes through the groupMint permission', async () => {
    const net = network();
    await sendDeviceSessionCall(
      { record, privateKey: PK, proof: PROOF, kind: 'groupMint', innerHubData: groupMintData(LEGACY, BigInt(vector.groupMintAmount)) },
      net.deps,
      NOW,
    );
    expect(net.sent().callData.toLowerCase()).toBe(vector.groupMintSessionCallData.toLowerCase());
    expect(net.sent().signature.slice(0, 68)).toBe(`0x00${vector.permissionIds.groupMint.slice(2)}`);
  });

  test('inner data must match the session kind', async () => {
    const net = network();
    await expect(
      sendDeviceSessionCall({ record, privateKey: PK, proof: PROOF, kind: 'personalMint', innerHubData: groupMintData(LEGACY, 1n) }, net.deps, NOW),
    ).rejects.toThrow('not a personalMint call');
    expect(net.calls).toHaveLength(0);
  });

  test('sponsor 403 maps to DeviceSessionRejectedError', async () => {
    const net = network({ sponsor: { status: 403, body: { error: 'device sessions are disabled' } } });
    await expect(
      sendDeviceSessionCall({ record, privateKey: PK, proof: PROOF, kind: 'personalMint', innerHubData: personalMintData() }, net.deps, NOW),
    ).rejects.toBeInstanceOf(DeviceSessionRejectedError);
    expect(net.body('eth_sendUserOperation')).toBeUndefined();
  });

  test.each(['AA22 expired or not due', 'AA24 signature error', 'execution reverted: InvalidPermissionId(0xb313)'])(
    'bundler "%s" maps to DeviceSessionRejectedError',
    async (msg) => {
      const net = network({ estimateError: msg });
      await expect(
        sendDeviceSessionCall({ record, privateKey: PK, proof: PROOF, kind: 'personalMint', innerHubData: personalMintData() }, net.deps, NOW),
      ).rejects.toBeInstanceOf(DeviceSessionRejectedError);
    },
  );

  test('other errors pass through unchanged', async () => {
    const net = network({ sponsor: { status: 500, body: { error: 'boom' } } });
    const p = sendDeviceSessionCall({ record, privateKey: PK, proof: PROOF, kind: 'personalMint', innerHubData: personalMintData() }, net.deps, NOW);
    await expect(p).rejects.toThrow('HTTP 500');
    await expect(p).rejects.not.toBeInstanceOf(DeviceSessionRejectedError);
  });

  test('an expired or pending record is rejected before any network call', async () => {
    const net = network();
    const base = { privateKey: PK, proof: PROOF, kind: 'personalMint' as const, innerHubData: personalMintData() };
    await expect(sendDeviceSessionCall({ ...base, record }, net.deps, VALID_UNTIL)).rejects.toBeInstanceOf(DeviceSessionRejectedError);
    await expect(sendDeviceSessionCall({ ...base, record: { ...record, status: 'pending' } }, net.deps, NOW)).rejects.toBeInstanceOf(
      DeviceSessionRejectedError,
    );
    expect(net.calls).toHaveLength(0);
  });
});
