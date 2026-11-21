/**
 * Device session ops: a mint-only claim signed by the device key through SmartSession.
 *
 * nonce key = SESSION_NONCE_KEY (routes validation to SmartSession), the device key signs the raw
 * EntryPoint v0.7 userOpHash (no EIP-191 prefix), signature = 0x00 ++ permissionId ++ ECDSA.
 * The passkey is never prompted.
 *
 * Sponsor (security review fixes): every session-op sponsor request carries `deviceAuth`, the
 * device key's EIP-191 signature over deviceSessionAuthHash(100, stableFieldsHash(op), expiresAt)
 * (M-1); fees are capped at 2 gwei (the sponsor's session cap); after the receipt the app asks the
 * server to settle the budget reservation to the op's actual gas (POST /api/passkey/sponsor/settle
 * with the userOpHash only; the server reads the amount from chain) (M-2). The settle call is
 * best effort: a failure never fails the claim (the server's lazy sweep settles it later).
 */
import { getAddress, isHex, size, sliceHex, toFunctionSelector, type Address, type Hex } from 'viem';
import { privateKeyToAccount, privateKeyToAddress, sign } from 'viem/accounts';
import { PASSKEY_API_URL, PASSKEY_CHAIN_ID } from '../constants';
import {
  ECDSA_DUMMY_SIGNATURE,
  normalizeEcdsaSignature,
  sendSafeUserOp,
  type DeviceAuth,
  type SafeOpSigner,
  type UnpackedUserOp,
  type UserOpDeps,
} from '../userop';
import {
  DEVICE_AUTH_TTL_SEC,
  SESSION_NONCE_KEY,
  deviceSessionAuthHash,
  stableFieldsHash,
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

/** The sponsor's fee cap for session ops (SESSION_CAPS.sessionMaxFeePerGas on the server). */
export const SESSION_MAX_FEE_PER_GAS = 2_000_000_000n;

/** The device key's sponsor authorization for one op (security review M-1). */
export async function signDeviceAuth(
  op: UnpackedUserOp,
  privateKey: Hex,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<DeviceAuth> {
  const expiresAt = nowSec + DEVICE_AUTH_TTL_SEC;
  const hash = deviceSessionAuthHash({ chainId: PASSKEY_CHAIN_ID, stableFieldsHash: stableFieldsHash(op), expiresAt });
  const signature = await privateKeyToAccount(privateKey).signMessage({ message: { raw: hash } });
  return { expiresAt, signature };
}

/** SafeOpSigner for a device session op. */
export function deviceSessionOpSigner(
  rec: DeviceSessionRecord,
  privateKey: Hex,
  kind: MintSessionKind,
  proof: { x: Hex; y: Hex },
  now: () => number = () => Math.floor(Date.now() / 1000),
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
    sponsorAuth: (op) => signDeviceAuth(op, privateKey, now()),
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

/**
 * The CHAIN says this device's session can never sign again (expired, wrong key, permission no
 * longer installed) — only then is the local record dropped. A sponsor 403 / budget limit / network
 * error falls back to the passkey claim ONCE but keeps the key (dropping it on a transient refusal
 * stranded a working on-chain session and re-offered the grant — Pixel 2026-11-21).
 */
export function isFatalDeviceSessionRejection(e: unknown): boolean {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const err = cur as { message?: string; body?: unknown; cause?: unknown };
    const text = `${err?.message ?? ''} ${err?.body ? JSON.stringify(err.body) : ''}`.toLowerCase();
    if (
      text.includes('aa22') ||
      text.includes('aa24') ||
      text.includes('invalidpermissionid') ||
      text.includes(INVALID_PERMISSION_ID_SELECTOR.toLowerCase())
    ) {
      return true;
    }
    cur = err?.cause;
  }
  return false;
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
): Promise<{ txHash: Hex; userOpHash: Hex }> {
  const { record } = a;
  if (record.status !== 'active') throw new DeviceSessionRejectedError('device session is not active');
  if (record.validUntil <= nowSec) throw new DeviceSessionRejectedError('device session expired');
  assertInnerMatchesKind(a.kind, a.innerHubData);
  const signer = deviceSessionOpSigner(record, a.privateKey, a.kind, a.proof, () => Math.max(nowSec, Math.floor(Date.now() / 1000)));
  // A device session op never prompts the passkey: drop any passkey `sign` from the deps.
  const { sign: _passkeySign, ...rest } = deps;
  let sent: { txHash: Hex; userOpHash: Hex };
  try {
    sent = await sendSafeUserOp(
      {
        signer,
        deployed: true,
        sender: record.safe as Address,
        layout: '7579',
        legacy: record.legacy,
        callData: sessionClaimCallData(record.legacy, a.innerHubData),
        maxFeePerGasCap: SESSION_MAX_FEE_PER_GAS,
      },
      rest,
    );
  } catch (e) {
    if (isDeviceSessionRejection(e)) {
      throw new DeviceSessionRejectedError(`device session rejected: ${(e as Error)?.message ?? String(e)}`, { cause: e });
    }
    throw e;
  }
  await settleSponsorship(sent.userOpHash, deps);
  return sent;
}

/**
 * Best effort: ask the sponsor to settle this op's budget reservation to its actual gas. Only the
 * userOpHash is sent; the server reads the amount from the EntryPoint event. Never throws.
 */
export async function settleSponsorship(userOpHash: Hex, deps: UserOpDeps = {}): Promise<boolean> {
  const apiUrl = deps.apiUrl ?? PASSKEY_API_URL;
  if (!apiUrl) return false;
  const f = deps.fetch ?? (fetch as unknown as NonNullable<UserOpDeps['fetch']>);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), deps.requestTimeoutMs ?? 10_000) : null;
  try {
    const res = await f(`${apiUrl}/api/passkey/sponsor/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chainId: PASSKEY_CHAIN_ID, userOpHash }),
      ...(controller ? { signal: controller.signal } : {}),
    });
    return !!res?.ok;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
