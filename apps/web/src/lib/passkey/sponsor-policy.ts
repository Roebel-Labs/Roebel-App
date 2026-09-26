/**
 * Sponsorship policy for the preview-only passkey sponsor route
 * (/api/passkey/sponsor). No env, no clock (the caller passes `nowSeconds`);
 * chain reads go through an injected `ChainReader` so the policy stays
 * unit-testable.
 *
 * The request names the passkey public key (x, y) and ONE legacy thirdweb
 * account (`legacy`, the citizen's account). A userOp is sponsored only if ALL
 * of the following hold:
 *
 *  1. Fees / gas within CAPS (maxFeePerGas <= 3 gwei, priority <= maxFee).
 *  2. The sender is a genuine passkey Safe for (x, y):
 *     - deploy op: factory == SafeProxyFactory 1.4.1, factoryData ==
 *       safeFactoryData(x, y) byte-for-byte, sender == predictSafeAddress(x, y)
 *       (the initializer fixes owner, modules and fallback handler);
 *     - deployed: code == SafeProxy 1.4.1 runtime, slot 0 == Safe L2 1.4.1
 *       singleton, fallback-handler slot == Safe4337Module,
 *       isModuleEnabled(Safe4337Module), getOwners() == [owner] where owner is
 *       either SafeWebAuthnSharedSigner configured with (x, y, verifiers) for
 *       this Safe, or a contract equal to
 *       SafeWebAuthnSignerFactory.getSigner(x, y, verifiers) (a Safe recovered
 *       to a new passkey).
 *  3. `legacy` carries the thirdweb Account proxy code and holds a CitizenNFTv2.
 *  4. callData = Safe4337Module.executeUserOp[WithErrorString] with value 0 and
 *     either one CALL or a DELEGATECALL into MultiSendCallOnly 1.4.1
 *     multiSend(bytes) whose inner txs are all CALLs with value 0. Every call
 *     is one of:
 *     - legacy.setPermissionsForSigner(req, sig) with req.signer == sender,
 *       req.isAdmin == 1, inside its validity window, AND an eth_call of
 *       legacy.verifySignerPermissionRequest(req, sig) returning
 *       (true, signer) with legacy.isAdmin(signer);
 *     - legacy.execute / executeBatch, if the sender is already admin of
 *       legacy (eth_call isAdmin) or a verified handover precedes it in the
 *       same batch; nested setPermissionsForSigner must also be add-sender;
 *     - Candide SocialRecoveryModule guardian management
 *       (addGuardianWithThreshold, revokeGuardianWithThreshold,
 *       changeThreshold, confirmRecovery, cancelRecovery), if the sender is
 *       admin of legacy or a verified handover of legacy is in the batch.
 *     Any thirdweb-selector call to an address other than `legacy` is
 *     rejected: one legacy account per op.
 *
 * Structural checks (1, the deploy half of 2, 4 without the reads) run first
 * and never touch the chain. Any chain read failure throws `ChainReadError`,
 * and callers must fail closed (never sponsor).
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
import {
  FALLBACK_HANDLER_SLOT,
  PASSKEY_SAFE,
  SAFE_PROXY_RUNTIME_CODE,
  WEBAUTHN_VERIFIERS,
  predictSafeAddress,
  safeFactoryData,
} from "./safe-address";
import { packUint128Pair, type UserOperationV07 } from "./voucher";

export const ADDRESSES = {
  safe4337Module: PASSKEY_SAFE.safe4337Module,
  multiSendCallOnly: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
  multiSend141: "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526",
  safeProxyFactory: PASSKEY_SAFE.proxyFactory,
  safeL2Singleton: PASSKEY_SAFE.singletonL2,
  socialRecoveryModule: PASSKEY_SAFE.socialRecoveryModule,
  legacyAccountImpl: "0xf22175c80c6e074c171811c59c6c0087e2a6a346",
} as const satisfies Record<string, Hex>;

/** CitizenNFTv2 on Gnosis (ERC-721). */
export const CITIZEN_NFT: Hex = "0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5";

/** EIP-1167 minimal proxy to the thirdweb Account impl. Verified 2026-09-26
 * against live accounts from AccountFactory 0x85e2…DF00 getAccounts(0,3). */
export const LEGACY_ACCOUNT_PROXY_CODE: Hex = `0x363d3d373d3d3d363d73${ADDRESSES.legacyAccountImpl.slice(2)}5af43d82803e903d91602b57fd5bf3`;

export const CAPS = {
  callGasLimit: 1_500_000n,
  verificationGasLimit: 1_000_000n,
  preVerificationGas: 200_000n,
  maxFeePerGas: 3_000_000_000n, // 3 gwei (Gnosis bundler floor is 1.5 gwei)
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

/** Who the op claims to be: passkey key (32-byte hex each) + the ONE legacy account it may drive. */
export interface SponsorContext {
  x: Hex;
  y: Hex;
  legacy: Hex;
  /** Unix seconds, for the handover validity window. */
  nowSeconds: number;
}

export type PolicyResult = { ok: true } | { ok: false; reason: string };

export interface SignerPermissionRequest {
  signer: Hex;
  isAdmin: number;
  approvedTargets: readonly Hex[];
  nativeTokenLimitPerTransaction: bigint;
  permissionStartTimestamp: bigint;
  permissionEndTimestamp: bigint;
  reqValidityStartTimestamp: bigint;
  reqValidityEndTimestamp: bigint;
  uid: Hex;
}

/** Chain reads the policy needs. Implementations must THROW (never return a
 * default) on transport / RPC failure. */
export interface ChainReader {
  getCode(address: Hex): Promise<Hex | undefined>;
  getStorageAt(address: Hex, slot: Hex): Promise<Hex | undefined>;
  isAdmin(account: Hex, signer: Hex): Promise<boolean>;
  isModuleEnabled(safe: Hex, module: Hex): Promise<boolean>;
  getOwners(safe: Hex): Promise<readonly Hex[]>;
  /** SafeWebAuthnSharedSigner.getConfiguration(safe). */
  getSharedSignerConfiguration(safe: Hex): Promise<{ x: bigint; y: bigint; verifiers: bigint }>;
  /** SafeWebAuthnSignerFactory.getSigner(x, y, verifiers). */
  getWebAuthnSigner(x: bigint, y: bigint, verifiers: bigint): Promise<Hex>;
  balanceOf(token: Hex, owner: Hex): Promise<bigint>;
  /** legacy.verifySignerPermissionRequest(req, sig); null when the CALL REVERTS (e.g. a malformed
   * signature makes ECDSA.recover revert). Transport failures must still throw. */
  verifySignerPermissionRequest(
    account: Hex,
    req: SignerPermissionRequest,
    signature: Hex,
  ): Promise<{ success: boolean; signer: Hex } | null>;
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

const OK: PolicyResult = { ok: true };
const deny = (reason: string): PolicyResult => ({ ok: false, reason });

function tryDecode<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/** Facts collected by the structural pass, verified against the chain afterwards. */
interface ScanState {
  sender: Hex;
  legacy: Hex;
  nowSeconds: number;
  /** Handovers of `legacy` to the sender, in batch order (each needs an eth_call verify). */
  handovers: Array<{ req: SignerPermissionRequest; signature: Hex }>;
  /** An execute/executeBatch ran before any handover: sender must already be admin. */
  executeNeedsAdmin: boolean;
  /** An SRM call is present. */
  srm: boolean;
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
    if (!d) return deny("SocialRecoveryModule function not allowlisted");
    st.srm = true;
    return OK;
  }

  const d = tryDecode(() => decodeFunctionData({ abi: legacyAccountAbi, data }));
  if (!d) return deny("call target/selector not allowlisted");
  if (!isAddressEqual(to, st.legacy)) return deny("thirdweb account call must target the request's legacy account");

  if (d.functionName === "setPermissionsForSigner") {
    const [req, signature] = d.args;
    const r = checkPermissionRequest(req, st.sender);
    if (!r.ok) return r;
    const now = BigInt(st.nowSeconds);
    if (!(req.reqValidityStartTimestamp <= now && now < req.reqValidityEndTimestamp)) {
      return deny("handover request is outside its validity window");
    }
    st.handovers.push({ req, signature });
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
  if (st.handovers.length === 0) st.executeNeedsAdmin = true;
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

/** Deploy ops: the factory call must be EXACTLY the passkey Safe for (x, y). */
function checkFactory(op: SponsorUserOp, ctx: SponsorContext): PolicyResult {
  const hasFactoryData = op.factoryData !== undefined && size(op.factoryData) > 0;
  if (!op.factory) return hasFactoryData ? deny("factoryData without factory") : OK;
  if (!isAddressEqual(op.factory, ADDRESSES.safeProxyFactory)) return deny("factory is not SafeProxyFactory 1.4.1");
  const key = { x: ctx.x, y: ctx.y };
  if ((op.factoryData ?? "0x").toLowerCase() !== safeFactoryData(key).toLowerCase()) {
    return deny("factoryData is not the passkey Safe deployment for (x, y)");
  }
  if (!isAddressEqual(op.sender, predictSafeAddress(key))) return deny("sender is not the predicted passkey Safe for (x, y)");
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

const SLOT_0: Hex = `0x${"0".repeat(64)}`;

/** Storage word holds exactly `addr` (left-padded). */
function wordIsAddress(word: Hex | undefined, addr: Hex): boolean {
  if (!word || !/^0x[0-9a-fA-F]{1,64}$/.test(word)) return false;
  return BigInt(word) === BigInt(addr);
}

/** Deployed sender: prove it is a passkey Safe whose single owner is bound to (x, y). */
async function checkDeployedPasskeySafe(sender: Hex, ctx: SponsorContext, chain: ChainReader): Promise<PolicyResult> {
  const code = await read(() => chain.getCode(sender));
  if ((code ?? "0x").toLowerCase() !== SAFE_PROXY_RUNTIME_CODE.toLowerCase()) {
    return deny("sender is not a passkey Safe (not a SafeProxy 1.4.1)");
  }
  const [singleton, handler, moduleOn, owners] = await Promise.all([
    read(() => chain.getStorageAt(sender, SLOT_0)),
    read(() => chain.getStorageAt(sender, FALLBACK_HANDLER_SLOT)),
    read(() => chain.isModuleEnabled(sender, PASSKEY_SAFE.safe4337Module)),
    read(() => chain.getOwners(sender)),
  ]);
  if (!wordIsAddress(singleton, PASSKEY_SAFE.singletonL2)) return deny("sender singleton is not Safe L2 1.4.1");
  if (!wordIsAddress(handler, PASSKEY_SAFE.safe4337Module)) return deny("sender fallback handler is not Safe4337Module");
  if (moduleOn !== true) return deny("Safe4337Module is not an enabled module of the sender");
  if (owners.length !== 1) return deny("sender must have exactly one owner");
  const owner = owners[0];
  const x = BigInt(ctx.x);
  const y = BigInt(ctx.y);

  if (isAddressEqual(owner, PASSKEY_SAFE.sharedSigner)) {
    const cfg = await read(() => chain.getSharedSignerConfiguration(sender));
    if (cfg.x !== x || cfg.y !== y || cfg.verifiers !== WEBAUTHN_VERIFIERS) {
      return deny("sender owner (shared signer) is not configured with (x, y)");
    }
    return OK;
  }
  const [ownerCode, signer] = await Promise.all([
    read(() => chain.getCode(owner)),
    read(() => chain.getWebAuthnSigner(x, y, WEBAUTHN_VERIFIERS)),
  ]);
  if (!ownerCode || ownerCode === "0x") return deny("sender owner is not a contract signer");
  if (!isAddressEqual(signer, owner)) return deny("sender owner is not the WebAuthn signer for (x, y)");
  return OK;
}

/**
 * Resolves to { ok } or { ok: false, reason }. Throws ChainReadError when a
 * chain read fails - the caller must treat that as "do not sponsor".
 */
export async function evaluateSponsorPolicy(
  op: SponsorUserOp,
  ctx: SponsorContext,
  chain: ChainReader,
): Promise<PolicyResult> {
  // ---- structural: zero chain reads ----
  const gas = checkGas(op);
  if (!gas.ok) return gas;
  const factory = checkFactory(op, ctx);
  if (!factory.ok) return factory;
  const st: ScanState = {
    sender: op.sender,
    legacy: ctx.legacy,
    nowSeconds: ctx.nowSeconds,
    handovers: [],
    executeNeedsAdmin: false,
    srm: false,
  };
  const structural = checkCallData(op.callData, st);
  if (!structural.ok) return structural;

  // ---- chain: who is the sender, who is the citizen ----
  const [legacyCode, citizenBalance] = await Promise.all([
    read(() => chain.getCode(ctx.legacy)),
    read(() => chain.balanceOf(CITIZEN_NFT, ctx.legacy)),
  ]);
  if ((legacyCode ?? "0x").toLowerCase() !== LEGACY_ACCOUNT_PROXY_CODE.toLowerCase()) {
    return deny(`${ctx.legacy} is not a legacy thirdweb account`);
  }
  if (citizenBalance <= 0n) return deny("legacy account holds no CitizenNFT");

  if (!op.factory) {
    const r = await checkDeployedPasskeySafe(op.sender, ctx, chain);
    if (!r.ok) return r;
  }

  // ---- chain: every handover must be a valid admin-signed request ----
  for (const h of st.handovers) {
    const v = await read(() => chain.verifySignerPermissionRequest(ctx.legacy, h.req, h.signature));
    if (!v || v.success !== true) return deny("handover signature is not a valid admin signature");
    const signerIsAdmin = await read(() => chain.isAdmin(ctx.legacy, v.signer));
    if (!signerIsAdmin) return deny("handover signature is not a valid admin signature");
  }

  // ---- chain: execute before any handover / SRM without a handover need an existing admin ----
  const needsAdmin = st.executeNeedsAdmin || (st.srm && st.handovers.length === 0);
  if (needsAdmin) {
    const admin = await read(() => chain.isAdmin(ctx.legacy, op.sender));
    if (admin !== true) return deny(`sender is not an admin of ${ctx.legacy}`);
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

const HEX_WORD = /^0x[0-9a-fA-F]{64}$/;

function word32(obj: Record<string, unknown>, key: string): Hex {
  const v = field(obj, key);
  if (typeof v !== "string" || !HEX_WORD.test(v)) throw new Error(`${key} must be 32 bytes of 0x hex`);
  return v as Hex;
}

/** The full request body: { chainId, userOp, x, y, legacy }. Throws on malformed input. */
export function parseSponsorRequest(input: unknown): {
  chainId: unknown;
  userOp: SponsorUserOp;
  x: Hex;
  y: Hex;
  legacy: Hex;
} {
  if (!input || typeof input !== "object") throw new Error("body must be an object");
  const o = input as Record<string, unknown>;
  return {
    chainId: o.chainId,
    userOp: parseSponsorUserOp(o.userOp),
    x: word32(o, "x"),
    y: word32(o, "y"),
    legacy: address(o, "legacy"),
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
