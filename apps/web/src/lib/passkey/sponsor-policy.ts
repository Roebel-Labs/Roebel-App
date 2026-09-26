/**
 * Sponsorship policy for the preview-only passkey sponsor route
 * (/api/passkey/sponsor). Pure: no env, no RPC, no clock.
 *
 * A passkey Safe (Safe 1.4.1 + Safe4337Module v0.3.0, EntryPoint v0.7) may
 * get a gasless userOp ONLY for:
 *   - driving the legacy thirdweb Account as its admin:
 *       setPermissionsForSigner(req, sig) with req.isAdmin == 1 (adds only;
 *       removals are rejected in tranche 1), execute(...), executeBatch(...)
 *   - guardian management on the Candide SocialRecoveryModule (exact address):
 *       addGuardianWithThreshold, revokeGuardianWithThreshold, changeThreshold,
 *       confirmRecovery, cancelRecovery
 * wrapped in Safe4337Module.executeUserOp / executeUserOpWithErrorString with
 * value 0 and operation 0 (call) - or operation 1 (delegatecall) ONLY into
 * MultiSendCallOnly 1.4.1 with multiSend(bytes), where every packed inner tx
 * is operation 0, value 0 and itself on the allowlist above.
 *
 * Selectors were checked against deployed bytecode on Gnosis (chain 100):
 *   executeUserOp 0x7bb37428, executeUserOpWithErrorString 0x541d63c8,
 *   multiSend 0x8d80ff0a, setPermissionsForSigner 0x5892e236,
 *   execute 0xb61d27f6, executeBatch 0x47e1da2a,
 *   addGuardianWithThreshold 0xbe0e54d7, revokeGuardianWithThreshold 0x936f7d86,
 *   changeThreshold 0x694e80c3, confirmRecovery 0x064e2d0e,
 *   cancelRecovery 0x0ba234d6, createProxyWithNonce 0x1688f0b9.
 */
import {
  concatHex,
  decodeFunctionData,
  hexToBigInt,
  isAddress,
  isAddressEqual,
  parseAbi,
  sliceHex,
  size,
  type Hex,
} from "viem";
import { packUint128Pair, type UserOperationV07 } from "./voucher";

export const ADDRESSES = {
  safe4337Module: "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226",
  multiSendCallOnly: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
  multiSend141: "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526",
  safeProxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
  safeL2Singleton: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
  socialRecoveryModule: "0x38275826E1933303E508433dD5f289315Da2541c",
  paymaster: "0x11ed03Db610c88b010FfE38B13142D3657f2E84f",
} as const satisfies Record<string, Hex>;

export const CAPS = {
  callGasLimit: 1_500_000n,
  verificationGasLimit: 1_000_000n,
  preVerificationGas: 200_000n,
  maxFeePerGas: 50_000_000_000n, // 50 gwei
  paymasterVerificationGasLimit: 300_000n,
  paymasterPostOpGasLimit: 100_000n,
} as const;

/** EntryPoint v0.7 RPC-shaped (unpacked) userOp, numerics as bigint. */
export interface SponsorUserOp {
  sender: Hex;
  nonce: bigint;
  factory?: Hex;
  factoryData?: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
}

export type PolicyResult = { ok: true } | { ok: false; reason: string };

const safe4337Abi = parseAbi([
  "function executeUserOp(address to, uint256 value, bytes data, uint8 operation)",
  "function executeUserOpWithErrorString(address to, uint256 value, bytes data, uint8 operation)",
]);
const multiSendAbi = parseAbi(["function multiSend(bytes transactions)"]);
const legacyAccountAbi = parseAbi([
  "struct SignerPermissionRequest { address signer; uint8 isAdmin; address[] approvedTargets; uint256 nativeTokenLimitPerTransaction; uint128 permissionStartTimestamp; uint128 permissionEndTimestamp; uint128 reqValidityStartTimestamp; uint128 reqValidityEndTimestamp; bytes32 uid; }",
  "function setPermissionsForSigner(SignerPermissionRequest req, bytes signature)",
  "function execute(address target, uint256 value, bytes calldata)",
  "function executeBatch(address[] target, uint256[] value, bytes[] calldata)",
]);
const srmAbi = parseAbi([
  "function addGuardianWithThreshold(address guardian, uint256 threshold)",
  "function revokeGuardianWithThreshold(address prevGuardian, address guardian, uint256 threshold)",
  "function changeThreshold(uint256 threshold)",
  "function confirmRecovery(address wallet, address[] newOwners, uint256 newThreshold, bool execute)",
  "function cancelRecovery()",
]);
const proxyFactoryAbi = parseAbi([
  "function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce)",
]);

const OK: PolicyResult = { ok: true };
const deny = (reason: string): PolicyResult => ({ ok: false, reason });

function tryDecode<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/** Nested data handed to the legacy account's execute/executeBatch: anything
 * goes (the Safe is a full admin of the legacy account) EXCEPT a signer
 * permission change that is not an add. */
function checkLegacyInnerData(data: Hex): PolicyResult {
  if (size(data) < 4) return OK;
  const perm = tryDecode(() => decodeFunctionData({ abi: legacyAccountAbi, data }));
  if (perm?.functionName === "setPermissionsForSigner") return checkPermissionRequest(perm.args[0].isAdmin);
  return OK;
}

function checkPermissionRequest(isAdmin: number): PolicyResult {
  return isAdmin === 1 ? OK : deny(`setPermissionsForSigner isAdmin=${isAdmin} not sponsorable (only 1 = add)`);
}

/** A single plain call (operation 0, value 0) the Safe makes. */
function checkAllowedCall(to: Hex, data: Hex): PolicyResult {
  if (size(data) < 4) return deny("call without a function selector");

  if (isAddressEqual(to, ADDRESSES.socialRecoveryModule)) {
    const d = tryDecode(() => decodeFunctionData({ abi: srmAbi, data }));
    return d ? OK : deny("SocialRecoveryModule function not allowlisted");
  }

  const d = tryDecode(() => decodeFunctionData({ abi: legacyAccountAbi, data }));
  if (!d) return deny("call target/selector not allowlisted");
  switch (d.functionName) {
    case "setPermissionsForSigner":
      return checkPermissionRequest(d.args[0].isAdmin);
    case "execute":
      return checkLegacyInnerData(d.args[2]);
    case "executeBatch": {
      const [targets, values, datas] = d.args;
      if (targets.length !== values.length || targets.length !== datas.length) {
        return deny("executeBatch array length mismatch");
      }
      for (const inner of datas) {
        const r = checkLegacyInnerData(inner);
        if (!r.ok) return r;
      }
      return OK;
    }
  }
}

/** Safe MultiSend packed encoding: uint8 op ++ address to ++ uint256 value ++ uint256 len ++ bytes data. */
export function decodeMultiSendPacked(
  packed: Hex,
): Array<{ operation: number; to: Hex; value: bigint; data: Hex }> | null {
  const total = size(packed);
  const txs: Array<{ operation: number; to: Hex; value: bigint; data: Hex }> = [];
  let i = 0;
  while (i < total) {
    if (i + 85 > total) return null;
    const operation = Number(hexToBigInt(sliceHex(packed, i, i + 1)));
    const to = sliceHex(packed, i + 1, i + 21);
    const value = hexToBigInt(sliceHex(packed, i + 21, i + 53));
    const len = hexToBigInt(sliceHex(packed, i + 53, i + 85));
    if (len > BigInt(total - i - 85)) return null;
    const end = i + 85 + Number(len);
    const data = len === 0n ? ("0x" as Hex) : sliceHex(packed, i + 85, end);
    txs.push({ operation, to, value, data });
    i = end;
  }
  return txs;
}

function checkCallData(callData: Hex): PolicyResult {
  const outer = tryDecode(() => decodeFunctionData({ abi: safe4337Abi, data: callData }));
  if (!outer) return deny("callData is not Safe4337Module.executeUserOp[WithErrorString]");
  const [to, value, data, operation] = outer.args;
  if (value !== 0n) return deny("outer value must be 0");

  if (operation === 0) {
    if (isAddressEqual(to, ADDRESSES.multiSendCallOnly)) {
      return deny("MultiSendCallOnly must be reached via delegatecall");
    }
    return checkAllowedCall(to, data);
  }
  if (operation !== 1) return deny(`unknown operation ${operation}`);
  if (!isAddressEqual(to, ADDRESSES.multiSendCallOnly)) {
    return deny("delegatecall only allowed into MultiSendCallOnly");
  }
  const ms = tryDecode(() => decodeFunctionData({ abi: multiSendAbi, data }));
  if (!ms) return deny("delegatecall into MultiSendCallOnly must be multiSend(bytes)");
  const txs = decodeMultiSendPacked(ms.args[0]);
  if (!txs) return deny("malformed multiSend payload");
  if (txs.length === 0) return deny("empty multiSend");
  for (const tx of txs) {
    if (tx.operation !== 0) return deny("inner multiSend tx must be a call (operation 0)");
    if (tx.value !== 0n) return deny("inner multiSend value must be 0");
    const r = checkAllowedCall(tx.to, tx.data);
    if (!r.ok) return r;
  }
  return OK;
}

function checkFactory(op: SponsorUserOp): PolicyResult {
  const hasFactoryData = op.factoryData !== undefined && size(op.factoryData) > 0;
  if (!op.factory) return hasFactoryData ? deny("factoryData without factory") : OK;
  if (!isAddressEqual(op.factory, ADDRESSES.safeProxyFactory)) return deny("factory is not SafeProxyFactory 1.4.1");
  const d = tryDecode(() => decodeFunctionData({ abi: proxyFactoryAbi, data: op.factoryData ?? "0x" }));
  if (!d) return deny("factoryData is not createProxyWithNonce");
  if (!isAddressEqual(d.args[0], ADDRESSES.safeL2Singleton)) return deny("singleton is not Safe L2 1.4.1");
  return OK;
}

function checkGas(op: SponsorUserOp): PolicyResult {
  for (const key of Object.keys(CAPS) as Array<keyof typeof CAPS>) {
    if (op[key] > CAPS[key]) return deny(`${key} over cap`);
  }
  if (op.maxPriorityFeePerGas > op.maxFeePerGas) return deny("maxPriorityFeePerGas exceeds maxFeePerGas");
  return OK;
}

export function evaluateSponsorPolicy(op: SponsorUserOp): PolicyResult {
  for (const check of [checkGas, checkFactory]) {
    const r = check(op);
    if (!r.ok) return r;
  }
  return checkCallData(op.callData);
}

// ---- request parsing / packing ----

const HEX_BYTES = /^0x([0-9a-fA-F]{2})*$/;
const HEX_QUANTITY = /^0x[0-9a-fA-F]{1,64}$/;
const UINT128_MAX = (1n << 128n) - 1n;

function field(obj: Record<string, unknown>, key: string): unknown {
  return obj[key];
}

function quantity(obj: Record<string, unknown>, key: string, max = UINT128_MAX): bigint {
  const v = field(obj, key);
  if (typeof v !== "string" || !HEX_QUANTITY.test(v)) throw new Error(`${key} must be a 0x hex quantity`);
  const n = BigInt(v);
  if (n > max) throw new Error(`${key} out of range`);
  return n;
}

function bytes(obj: Record<string, unknown>, key: string): Hex {
  const v = field(obj, key);
  if (typeof v !== "string" || !HEX_BYTES.test(v)) throw new Error(`${key} must be 0x hex bytes`);
  return v as Hex;
}

function address(obj: Record<string, unknown>, key: string): Hex {
  const v = field(obj, key);
  if (typeof v !== "string" || !isAddress(v, { strict: false })) throw new Error(`${key} must be an address`);
  return v as Hex;
}

/** Parses the JSON userOp body (all numerics as 0x hex strings). Throws on malformed input. */
export function parseSponsorUserOp(input: unknown): SponsorUserOp {
  if (!input || typeof input !== "object") throw new Error("userOp must be an object");
  const o = input as Record<string, unknown>;
  const hasFactory = o.factory !== undefined && o.factory !== null && o.factory !== "0x";
  return {
    sender: address(o, "sender"),
    nonce: quantity(o, "nonce", (1n << 256n) - 1n),
    factory: hasFactory ? address(o, "factory") : undefined,
    factoryData: o.factoryData !== undefined && o.factoryData !== null ? bytes(o, "factoryData") : undefined,
    callData: bytes(o, "callData"),
    callGasLimit: quantity(o, "callGasLimit"),
    verificationGasLimit: quantity(o, "verificationGasLimit"),
    preVerificationGas: quantity(o, "preVerificationGas", (1n << 256n) - 1n),
    maxFeePerGas: quantity(o, "maxFeePerGas"),
    maxPriorityFeePerGas: quantity(o, "maxPriorityFeePerGas"),
    paymasterVerificationGasLimit: quantity(o, "paymasterVerificationGasLimit"),
    paymasterPostOpGasLimit: quantity(o, "paymasterPostOpGasLimit"),
  };
}

/** Packs the RPC-shaped op into the fields `hashStableFields` covers. */
export function toPackedUserOperation(op: SponsorUserOp): UserOperationV07 {
  return {
    sender: op.sender,
    nonce: op.nonce,
    initCode: op.factory ? concatHex([op.factory, op.factoryData ?? "0x"]) : "0x",
    callData: op.callData,
    accountGasLimits: packUint128Pair(op.verificationGasLimit, op.callGasLimit),
    preVerificationGas: op.preVerificationGas,
    gasFees: packUint128Pair(op.maxPriorityFeePerGas, op.maxFeePerGas),
    paymasterVerificationGasLimit: op.paymasterVerificationGasLimit,
    paymasterPostOpGasLimit: op.paymasterPostOpGasLimit,
  };
}
