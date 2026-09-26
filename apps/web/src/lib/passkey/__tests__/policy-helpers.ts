/**
 * Calldata builders shared by the sponsor-policy tests (not a test file itself).
 */
import { concatHex, encodeFunctionData, encodePacked, parseAbi, size, type Hex } from "viem";
import { ADDRESSES, type SponsorUserOp } from "../sponsor-policy";
import { PASSKEY_SAFE, safeFactoryData, type PasskeyPublicKey } from "../safe-address";
import { GOOD_SIG, SAFE } from "./fake-chain";

export const NOW = 1_790_000_100;

export const safe4337 = parseAbi([
  "function executeUserOp(address to, uint256 value, bytes data, uint8 operation)",
  "function executeUserOpWithErrorString(address to, uint256 value, bytes data, uint8 operation)",
]);
export const account = parseAbi([
  "struct SignerPermissionRequest { address signer; uint8 isAdmin; address[] approvedTargets; uint256 nativeTokenLimitPerTransaction; uint128 permissionStartTimestamp; uint128 permissionEndTimestamp; uint128 reqValidityStartTimestamp; uint128 reqValidityEndTimestamp; bytes32 uid; }",
  "function setPermissionsForSigner(SignerPermissionRequest req, bytes signature)",
  "function execute(address target, uint256 value, bytes calldata)",
  "function executeBatch(address[] target, uint256[] value, bytes[] calldata)",
]);
export const srm = parseAbi([
  "struct SignatureData { address signer; bytes signature; }",
  "function addGuardianWithThreshold(address guardian, uint256 threshold)",
  "function revokeGuardianWithThreshold(address prevGuardian, address guardian, uint256 threshold)",
  "function changeThreshold(uint256 threshold)",
  "function confirmRecovery(address wallet, address[] newOwners, uint256 newThreshold, bool execute)",
  "function cancelRecovery()",
  "function multiConfirmRecovery(address wallet, address[] newOwners, uint256 newThreshold, SignatureData[] signatures, bool execute)",
  "function executeRecovery(address wallet, address[] newOwners, uint256 newThreshold)",
  "function finalizeRecovery(address wallet)",
]);
export const accountFactory = parseAbi(["function createAccount(address admin, bytes data)"]);
export const signerFactory = parseAbi(["function createSigner(uint256 x, uint256 y, uint176 verifiers)"]);
export const v3 = parseAbi(["function moveTo(address newAccount)"]);
const multiSendAbi = parseAbi(["function multiSend(bytes transactions)"]);

export const signerPermissionTypes = {
  SignerPermissionRequest: [
    { name: "signer", type: "address" },
    { name: "isAdmin", type: "uint8" },
    { name: "approvedTargets", type: "address[]" },
    { name: "nativeTokenLimitPerTransaction", type: "uint256" },
    { name: "permissionStartTimestamp", type: "uint128" },
    { name: "permissionEndTimestamp", type: "uint128" },
    { name: "reqValidityStartTimestamp", type: "uint128" },
    { name: "reqValidityEndTimestamp", type: "uint128" },
    { name: "uid", type: "bytes32" },
  ],
} as const;

export function permRequest(signer: Hex = SAFE, isAdmin = 1) {
  return {
    signer,
    isAdmin,
    approvedTargets: [] as Hex[],
    nativeTokenLimitPerTransaction: 0n,
    permissionStartTimestamp: 0n,
    permissionEndTimestamp: 0n,
    reqValidityStartTimestamp: BigInt(NOW - 60),
    reqValidityEndTimestamp: BigInt(NOW + 3600),
    uid: `0x${"01".repeat(32)}` as Hex,
  };
}

export const handover = (sig: Hex = GOOD_SIG, signer: Hex = SAFE) =>
  encodeFunctionData({ abi: account, functionName: "setPermissionsForSigner", args: [permRequest(signer), sig] });
export const execLegacy = (target: Hex, value: bigint, data: Hex) =>
  encodeFunctionData({ abi: account, functionName: "execute", args: [target, value, data] });
export const moveTo = (to: Hex) => encodeFunctionData({ abi: v3, functionName: "moveTo", args: [to] });
export const createAccount = (admin: Hex, data: Hex = "0x") =>
  encodeFunctionData({ abi: accountFactory, functionName: "createAccount", args: [admin, data] });
export const createSigner = (key: PasskeyPublicKey, verifiers: bigint) =>
  encodeFunctionData({ abi: signerFactory, functionName: "createSigner", args: [BigInt(key.x), BigInt(key.y), verifiers] });

export const outer = (
  to: Hex,
  data: Hex,
  operation = 0,
  value = 0n,
  fn: "executeUserOp" | "executeUserOpWithErrorString" = "executeUserOp",
) => encodeFunctionData({ abi: safe4337, functionName: fn, args: [to, value, data, operation] });

export type Inner = { operation?: number; to: Hex; value?: bigint; data: Hex };
export function packMultiSend(txs: Inner[]): Hex {
  const packed = concatHex(
    txs.map((t) =>
      encodePacked(
        ["uint8", "address", "uint256", "uint256", "bytes"],
        [t.operation ?? 0, t.to, t.value ?? 0n, BigInt(size(t.data)), t.data],
      ),
    ),
  );
  return encodeFunctionData({ abi: multiSendAbi, functionName: "multiSend", args: [packed] });
}
export const viaMultiSend = (txs: Inner[]) => outer(ADDRESSES.multiSendCallOnly, packMultiSend(txs), 1);

export function op(callData: Hex, over: Partial<SponsorUserOp> = {}): SponsorUserOp {
  return {
    sender: SAFE,
    nonce: 0n,
    callData,
    callGasLimit: 300_000n,
    verificationGasLimit: 500_000n,
    preVerificationGas: 60_000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    paymasterVerificationGasLimit: 150_000n,
    paymasterPostOpGasLimit: 50_000n,
    ...over,
  };
}

/** First op of the passkey Safe for `key` (factory + factoryData). */
export const deployOp = (key: PasskeyPublicKey, sender: Hex, callData: Hex, over: Partial<SponsorUserOp> = {}) =>
  op(callData, { sender, factory: PASSKEY_SAFE.proxyFactory, factoryData: safeFactoryData(key), ...over });
