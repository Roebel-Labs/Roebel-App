/**
 * Sponsorship policy for the preview-only passkey sponsor route
 * (/api/passkey/sponsor). No env, no clock; chain reads go through an
 * injected `ChainReader` so the policy stays unit-testable.
 *
 * A passkey Safe (Safe 1.4.1 + Safe4337Module v0.3.0, EntryPoint v0.7) may
 * get a gasless userOp ONLY for:
 *   - driving the SENDER'S OWN legacy thirdweb Account:
 *       setPermissionsForSigner(req, sig) with req.isAdmin == 1 (adds only;
 *       removals and isAdmin 0 are rejected in tranche 1) AND
 *       req.signer == userOp.sender (the handover makes the Safe itself admin);
 *       execute(...) / executeBatch(...) only where the sender is already an
 *       admin of that account (eth_call isAdmin), or where an EARLIER call in
 *       the same multiSend batch is a valid handover of that account to the
 *       sender. Every such target must carry exactly the EIP-1167 proxy code
 *       of the live thirdweb Account impl (LEGACY_ACCOUNT_PROXY_CODE).
 *   - guardian management on the Candide SocialRecoveryModule (exact address):
 *       addGuardianWithThreshold, revokeGuardianWithThreshold, changeThreshold,
 *       confirmRecovery, cancelRecovery
 * wrapped in Safe4337Module.executeUserOp / executeUserOpWithErrorString with
 * value 0 and operation 0 (call) - or operation 1 (delegatecall) ONLY into
 * MultiSendCallOnly 1.4.1 with multiSend(bytes), where every packed inner tx
 * is operation 0, value 0 and itself on the allowlist above.
 *
 * Structural checks run first and never touch the chain. Any chain read
 * failure throws `ChainReadError` - callers must fail closed (never sponsor).
 *
 * Selectors were checked against deployed bytecode on Gnosis (chain 100):
 *   executeUserOp 0x7bb37428, executeUserOpWithErrorString 0x541d63c8,
 *   multiSend 0x8d80ff0a, setPermissionsForSigner 0x5892e236,
 *   execute 0xb61d27f6, executeBatch 0x47e1da2a, isAdmin 0x24d7806c,
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
  legacyAccountImpl: "0xf22175c80c6e074c171811c59c6c0087e2a6a346",
} as const satisfies Record<string, Hex>;

/** EIP-1167 minimal proxy to the thirdweb Account impl. Verified 2026-09-26
 * against live accounts from AccountFactory 0x85e2…DF00 getAccounts(0,3). */
export const LEGACY_ACCOUNT_PROXY_CODE: Hex = `0x363d3d373d3d3d363d73${ADDRESSES.legacyAccountImpl.slice(2)}5af43d82803e903d91602b57fd5bf3`;

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

/** The two chain reads the policy needs. Implementations must throw (not
 * return a default) on RPC failure. */
export interface ChainReader {
  getCode(address: Hex): Promise<Hex | undefined>;
  isAdmin(account: Hex, signer: Hex): Promise<boolean>;
}

/** A chain read failed; the request must NOT be sponsored. */
export class ChainReadError extends Error {
  constructor(cause: unknown) {
    super("chain read failed");
    this.name = "ChainReadError";
    this.cause = cause;
  }
}

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

/** Chain facts the structural pass needs verified, in call order. */
interface ScanState {
  sender: Hex;
  /** Every thirdweb-selector target: must have LEGACY_ACCOUNT_PROXY_CODE. */
  legacyTargets: Set<string>;
  /** Targets already handed over to the sender earlier in this op. */
  handedOver: Set<string>;
  /** execute/executeBatch targets not covered by an earlier handover: sender must be admin. */
  needsAdmin: Set<string>;
}

function checkPermissionRequest(req: { signer: Hex; isAdmin: number }, sender: Hex): PolicyResult {
  if (req.isAdmin !== 1) return deny(`setPermissionsForSigner isAdmin=${req.isAdmin} not sponsorable (only 1 = add)`);
  if (!isAddressEqual(req.signer, sender)) return deny("setPermissionsForSigner req.signer must be the sender");
  return OK;
}

/** Nested data handed to the legacy account's execute/executeBatch: anything
 * goes (the sender is an admin of that account) EXCEPT a signer permission
 * change that is not "add the sender as admin". */
function checkLegacyInnerData(data: Hex, sender: Hex): PolicyResult {
  if (size(data) < 4) return OK;
  const perm = tryDecode(() => decodeFunctionData({ abi: legacyAccountAbi, data }));
  if (perm?.functionName === "setPermissionsForSigner") return checkPermissionRequest(perm.args[0], sender);
  return OK;
}

/** A single plain call (operation 0, value 0) the Safe makes. */
function checkAllowedCall(to: Hex, data: Hex, st: ScanState): PolicyResult {
  if (size(data) < 4) return deny("call without a function selector");

  if (isAddressEqual(to, ADDRESSES.socialRecoveryModule)) {
    const d = tryDecode(() => decodeFunctionData({ abi: srmAbi, data }));
    return d ? OK : deny("SocialRecoveryModule function not allowlisted");
  }

  const d = tryDecode(() => decodeFunctionData({ abi: legacyAccountAbi, data }));
  if (!d) return deny("call target/selector not allowlisted");
  const key = to.toLowerCase();

  if (d.functionName === "setPermissionsForSigner") {
    const r = checkPermissionRequest(d.args[0], st.sender);
    if (!r.ok) return r;
    st.legacyTargets.add(key);
    st.handedOver.add(key);
    return OK;
  }

  if (d.functionName === "execute") {
    const r = checkLegacyInnerData(d.args[2], st.sender);
    if (!r.ok) return r;
  } else {
    const [targets, values, datas] = d.args;
    if (targets.length !== values.length || targets.length !== datas.length) {
      return deny("executeBatch array length mismatch");
    }
    for (const inner of datas) {
      const r = checkLegacyInnerData(inner, st.sender);
      if (!r.ok) return r;
    }
  }
  st.legacyTargets.add(key);
  if (!st.handedOver.has(key)) st.needsAdmin.add(key);
  return OK;
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

function checkCallData(callData: Hex, st: ScanState): PolicyResult {
  const outer = tryDecode(() => decodeFunctionData({ abi: safe4337Abi, data: callData }));
  if (!outer) return deny("callData is not Safe4337Module.executeUserOp[WithErrorString]");
  const [to, value, data, operation] = outer.args;
  if (value !== 0n) return deny("outer value must be 0");

  if (operation === 0) {
    if (isAddressEqual(to, ADDRESSES.multiSendCallOnly)) {
      return deny("MultiSendCallOnly must be reached via delegatecall");
    }
    return checkAllowedCall(to, data, st);
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
    const r = checkAllowedCall(tx.to, tx.data, st);
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

async function read<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new ChainReadError(err);
  }
}

/**
 * Resolves to { ok } or { ok: false, reason }. Throws ChainReadError when a
 * chain read fails - the caller must treat that as "do not sponsor".
 */
export async function evaluateSponsorPolicy(op: SponsorUserOp, chain: ChainReader): Promise<PolicyResult> {
  for (const check of [checkGas, checkFactory]) {
    const r = check(op);
    if (!r.ok) return r;
  }
  const st: ScanState = {
    sender: op.sender,
    legacyTargets: new Set(),
    handedOver: new Set(),
    needsAdmin: new Set(),
  };
  const structural = checkCallData(op.callData, st);
  if (!structural.ok) return structural;

  const targets = [...st.legacyTargets];
  const codes = await Promise.all(targets.map((t) => read(() => chain.getCode(t as Hex))));
  for (let i = 0; i < targets.length; i++) {
    if ((codes[i] ?? "0x").toLowerCase() !== LEGACY_ACCOUNT_PROXY_CODE.toLowerCase()) {
      return deny(`target ${targets[i]} is not a legacy thirdweb account`);
    }
  }

  const needAdmin = [...st.needsAdmin];
  const admins = await Promise.all(needAdmin.map((t) => read(() => chain.isAdmin(t as Hex, op.sender))));
  for (let i = 0; i < needAdmin.length; i++) {
    if (admins[i] !== true) return deny(`sender is not an admin of ${needAdmin[i]}`);
  }
  return OK;
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
