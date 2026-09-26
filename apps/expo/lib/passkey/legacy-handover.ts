/**
 * Legacy thirdweb `Account` handover: the thirdweb admin EOA signs an EIP-712
 * `SignerPermissionRequest{signer: passkeySafe, isAdmin: 1}` and the passkey
 * Safe submits it via `setPermissionsForSigner` in its first sponsored userOp.
 *
 * Tranche 1 NEVER builds an `isAdmin: 2` (remove) request — there is
 * deliberately no helper for it here.
 */
import { bytesToHex, encodeFunctionData, type Address, type Hex, type TypedDataDefinition } from 'viem';
import { PASSKEY_CHAIN_ID } from './constants';
import { randomBytes } from './random';

export type SignerPermissionRequest = {
  signer: Address;
  isAdmin: 1;
  approvedTargets: Address[];
  nativeTokenLimitPerTransaction: bigint;
  permissionStartTimestamp: bigint;
  permissionEndTimestamp: bigint;
  reqValidityStartTimestamp: bigint;
  reqValidityEndTimestamp: bigint;
  uid: Hex;
};

export const signerPermissionTypes = {
  SignerPermissionRequest: [
    { name: 'signer', type: 'address' },
    { name: 'isAdmin', type: 'uint8' },
    { name: 'approvedTargets', type: 'address[]' },
    { name: 'nativeTokenLimitPerTransaction', type: 'uint256' },
    { name: 'permissionStartTimestamp', type: 'uint128' },
    { name: 'permissionEndTimestamp', type: 'uint128' },
    { name: 'reqValidityStartTimestamp', type: 'uint128' },
    { name: 'reqValidityEndTimestamp', type: 'uint128' },
    { name: 'uid', type: 'bytes32' },
  ],
} as const;

const setPermissionsForSignerAbi = [
  {
    type: 'function',
    name: 'setPermissionsForSigner',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: '_req',
        type: 'tuple',
        components: signerPermissionTypes.SignerPermissionRequest,
      },
      { name: '_signature', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

const executeUserOpAbi = [
  {
    type: 'function',
    name: 'executeUserOp',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
    ],
    outputs: [],
  },
] as const;

export const legacyAccountReadAbi = [
  {
    type: 'function',
    name: 'isAdmin',
    stateMutability: 'view',
    inputs: [{ name: '_account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/** Request validity: starts 5 min in the past (device clock skew), valid for 1 h. */
const VALIDITY_BACKDATE_SEC = 300;
const VALIDITY_WINDOW_SEC = 3600;

export function buildAddAdminRequest(safe: Address, nowSec: number): SignerPermissionRequest {
  const now = BigInt(Math.floor(nowSec));
  return {
    signer: safe,
    isAdmin: 1,
    approvedTargets: [],
    nativeTokenLimitPerTransaction: 0n,
    permissionStartTimestamp: 0n,
    permissionEndTimestamp: 0n,
    reqValidityStartTimestamp: now - BigInt(VALIDITY_BACKDATE_SEC),
    reqValidityEndTimestamp: now + BigInt(VALIDITY_WINDOW_SEC),
    uid: bytesToHex(randomBytes(32)),
  };
}

/** EIP-712 definition (domain `Account`/`1`/100/legacy) for thirdweb's `signTypedData`. */
export function signerPermissionTypedData(
  legacy: Address,
  req: SignerPermissionRequest,
): TypedDataDefinition<typeof signerPermissionTypes, 'SignerPermissionRequest'> {
  return {
    domain: { name: 'Account', version: '1', chainId: PASSKEY_CHAIN_ID, verifyingContract: legacy },
    types: signerPermissionTypes,
    primaryType: 'SignerPermissionRequest',
    message: req,
  };
}

/** `Account.setPermissionsForSigner(req, sig)` calldata. */
export function encodeSetPermissions(req: SignerPermissionRequest, sig: Hex): Hex {
  return encodeFunctionData({ abi: setPermissionsForSignerAbi, functionName: 'setPermissionsForSigner', args: [req, sig] });
}

/** `Safe4337Module.executeUserOp(to, value, data, 0)` (operation 0 = CALL) — the userOp callData for one call. */
export function encodeExecuteUserOp(to: Address, value: bigint, data: Hex): Hex {
  return encodeFunctionData({ abi: executeUserOpAbi, functionName: 'executeUserOp', args: [to, value, data, 0] });
}

/** Handover userOp callData = executeUserOp(legacy, 0, setPermissionsForSigner(...), 0). */
export function encodeHandoverUserOpCallData(legacy: Address, setPermissionsCallData: Hex): Hex {
  return encodeExecuteUserOp(legacy, 0n, setPermissionsCallData);
}
