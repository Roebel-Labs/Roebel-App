/**
 * Device session ops: a mint-only claim signed by the device key through SmartSession.
 *
 * nonce key = SESSION_NONCE_KEY (routes validation to SmartSession), the device key signs the raw
 * EntryPoint v0.7 userOpHash (no EIP-191 prefix), signature = 0x00 ++ permissionId ++ ECDSA.
 * The passkey is never prompted.
 */
import { getAddress, isHex, size, sliceHex, toFunctionSelector, type Address, type Hex } from 'viem';
import { privateKeyToAddress, sign } from 'viem/accounts';
import {
  ECDSA_DUMMY_SIGNATURE,
  normalizeEcdsaSignature,
  sendSafeUserOp,
  type SafeOpSigner,
  type UserOpDeps,
} from '../userop';
import {
  SESSION_NONCE_KEY,
  encodeSessionSignature,
  personalMintData,
  sessionClaimCallData,
  type MintSessionKind,
} from './builders';
import type { DeviceSessionRecord } from './device-key';

/** The device session cannot be used (sponsor refusal, expired, unknown permission, wrong key). */
export class DeviceSessionRejectedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'DeviceSessionRejectedError';
    if (options && 'cause' in options) (this as { cause?: unknown }).cause = options.cause;
  }
}

const GROUP_MINT_SELECTOR = toFunctionSelector('groupMint(address,address[],uint256[],bytes)');
/** SmartSession `InvalidPermissionId(bytes32)`: the session was removed or replaced (other device). */
const INVALID_PERMISSION_ID_SELECTOR = toFunctionSelector('InvalidPermissionId(bytes32)');

/** SafeOpSigner for a device session op. */
export function deviceSessionOpSigner(
  rec: DeviceSessionRecord,
  privateKey: Hex,
  kind: MintSessionKind,
  proof: { x: Hex; y: Hex },
): SafeOpSigner {
  if (getAddress(privateKeyToAddress(privateKey)) !== getAddress(rec.signer)) {
    throw new Error('device session key does not match the record signer');
  }
  const pid = rec.permissionIds[kind];
  return {
    proof,
    predicted: rec.safe,
    factoryData: '0x',
    dummySignature: encodeSessionSignature(pid, ECDSA_DUMMY_SIGNATURE),
    nonceKey: SESSION_NONCE_KEY,
    hashKind: 'userOpHash',
    signOpHash: async (hash) => encodeSessionSignature(pid, normalizeEcdsaSignature(await sign({ hash, privateKey, to: 'hex' }))),
  };
}

/** True when an error means the device session itself is unusable (caller falls back to the passkey). */
export function isDeviceSessionRejection(e: unknown): boolean {
  if (e instanceof DeviceSessionRejectedError) return true;
  const err = e as { status?: number; message?: string; body?: unknown } | null;
  if (err?.status === 403) return true;
  const text = `${err?.message ?? ''} ${err?.body ? JSON.stringify(err.body) : ''}`.toLowerCase();
  return (
    text.includes('aa22') ||
    text.includes('aa24') ||
    text.includes('invalidpermissionid') ||
    text.includes(INVALID_PERMISSION_ID_SELECTOR.toLowerCase())
  );
}

function assertInnerMatchesKind(kind: MintSessionKind, innerHubData: Hex): void {
  if (!isHex(innerHubData)) throw new Error('innerHubData must be hex');
  const ok =
    kind === 'personalMint'
      ? innerHubData.toLowerCase() === personalMintData().toLowerCase()
      : size(innerHubData) >= 4 && sliceHex(innerHubData, 0, 4).toLowerCase() === GROUP_MINT_SELECTOR.toLowerCase();
  if (!ok) throw new Error(`innerHubData is not a ${kind} call`);
}

/**
 * One sponsored session op: Safe7579.execute(EXEC_SINGLE, legacy.execute(Hub, 0, innerHubData)).
 * Throws DeviceSessionRejectedError when the session is unusable (sponsor 403, AA22 expired,
 * AA24 wrong key, InvalidPermissionId), any other error as is.
 */
export async function sendDeviceSessionCall(
  a: { record: DeviceSessionRecord; privateKey: Hex; proof: { x: Hex; y: Hex }; kind: MintSessionKind; innerHubData: Hex },
  deps: UserOpDeps = {},
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<{ txHash: Hex }> {
  const { record } = a;
  if (record.status !== 'active') throw new DeviceSessionRejectedError('device session is not active');
  if (record.validUntil <= nowSec) throw new DeviceSessionRejectedError('device session expired');
  assertInnerMatchesKind(a.kind, a.innerHubData);
  const signer = deviceSessionOpSigner(record, a.privateKey, a.kind, a.proof);
  // A device session op never prompts the passkey: drop any passkey `sign` from the deps.
  const { sign: _passkeySign, ...rest } = deps;
  try {
    const { txHash } = await sendSafeUserOp(
      {
        signer,
        deployed: true,
        sender: record.safe as Address,
        layout: '7579',
        legacy: record.legacy,
        callData: sessionClaimCallData(record.legacy, a.innerHubData),
      },
      rest,
    );
    return { txHash };
  } catch (e) {
    if (isDeviceSessionRejection(e)) {
      throw new DeviceSessionRejectedError(`device session rejected: ${(e as Error)?.message ?? String(e)}`, { cause: e });
    }
    throw e;
  }
}
