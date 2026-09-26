/**
 * Sponsorship policy for the preview-only passkey sponsor route
 * (/api/passkey/sponsor). No env, no clock (the caller passes `nowSeconds`
 * and the v3 addresses); chain reads go through an injected `ChainReader` so
 * the policy stays unit-testable.
 *
 * citizen(a) := CitizenNFTv2.hasCitizenNFT(a)
 *               OR (v3 configured AND CitizenNFTv3.hasCitizenNFT(a)).
 * (A mapping read: it holds for COUNTERFACTUAL thirdweb accounts too.)
 *
 * Every op is evaluated in exactly ONE mode, chosen from its calls:
 *
 *  A. identity via `legacy` (body names `legacy`): the op drives the citizen's
 *     thirdweb account. `legacy` is a citizen and carries the thirdweb Account
 *     proxy code, or is counterfactual and the batch STARTS with
 *     AccountFactory.createAccount(admin, 0x) where factory.getAddress(admin, 0x)
 *     == legacy. The sender is bound to it by `isAdmin(legacy, sender)` or a
 *     verified handover earlier in the batch. Budget key = legacy.
 *  B. identity = the sender Safe itself (no `legacy`, citizen(sender), e.g.
 *     after a v3 `moveTo`). Only Candide guardian management. Budget key = sender.
 *  C. recovery (no `legacy`): the op helps recover `wallet`, a citizen identity
 *     (citizen(wallet), or `recoveryLegacy` is a citizen thirdweb account with
 *     isAdmin(recoveryLegacy, wallet)) that has at least one guardian.
 *     The sender may be ANY genuine passkey Safe (family guardians and the
 *     recovering person's fresh Safe are not citizens). Budget key = wallet.
 *
 * All modes:
 *  1. Fees / gas within CAPS (maxFeePerGas <= 3 gwei, priority <= maxFee).
 *  2. The sender is a genuine passkey Safe for (x, y):
 *     - deploy op: factory == SafeProxyFactory 1.4.1, factoryData ==
 *       safeFactoryData(x, y) byte-for-byte, sender == predictSafeAddress(x, y);
 *     - deployed: SafeProxy 1.4.1 runtime, singleton Safe L2 1.4.1, fallback
 *       handler + enabled module Safe4337Module, getOwners() == [owner] where
 *       owner is the SharedSigner configured with (x, y) for this Safe or
 *       SafeWebAuthnSignerFactory.getSigner(x, y, verifiers) (recovered Safe).
 *  3. callData = Safe4337Module.executeUserOp[WithErrorString], value 0, one
 *     CALL or a DELEGATECALL into MultiSendCallOnly 1.4.1 whose inner txs are
 *     CALLs with value 0.
 *
 * Allowed calls per mode:
 *  A: legacy.setPermissionsForSigner (add the SENDER as admin, in its validity
 *     window, verified: eth_call verifySignerPermissionRequest + isAdmin(signer);
 *     for a legacy deployed in this batch, ECDSA-recovered == the createAccount
 *     admin, low-s); legacy.execute/executeBatch (inner permission changes
 *     must be add-sender; an inner `moveTo(newAccount)` only to the configured
 *     CitizenNFTv3 / AttesterNFTv3 with newAccount == sender and value 0);
 *     AccountFactory.createAccount(admin, 0x) as call #0; SRM guardian
 *     management (addGuardianWithThreshold, revokeGuardianWithThreshold,
 *     changeThreshold, cancelRecovery) and confirmRecovery.
 *  B: SRM guardian management and confirmRecovery.
 *  C: SRM.multiConfirmRecovery / executeRecovery with newOwners ==
 *     [getSigner(x, y)] and threshold 1 (the recovery hands the wallet to the
 *     SUBMITTER's key); SRM.finalizeRecovery when the pending request's owners
 *     are [getSigner(x, y)] and its delay is over; SRM.confirmRecovery when the
 *     sender is a guardian of the wallet; SafeWebAuthnSignerFactory.createSigner
 *     for exactly (x, y, verifiers). All calls name the same wallet != sender.
 *  An op that is only confirmRecovery calls is mode A with `legacy`, else B if
 *  the sender is a citizen, else C. Identity-only and recovery-only calls never
 *  mix. Any thirdweb-selector call to an address other than `legacy` is
 *  rejected: one legacy account per op.
 *
 * Registration of brand-new users (no citizenship yet) is NOT sponsored: they
 * need attesters first.
 *
 * Structural checks run first and never touch the chain. Any chain read
 * failure throws `ChainReadError`; callers must fail closed (never sponsor).
 *
 * Selectors (checked against deployed bytecode / verified sources, chain 100):
 *   executeUserOp 0x7bb37428, executeUserOpWithErrorString 0x541d63c8,
 *   multiSend 0x8d80ff0a, setPermissionsForSigner 0x5892e236,
 *   execute 0xb61d27f6, executeBatch 0x47e1da2a, isAdmin 0x24d7806c,
 *   addGuardianWithThreshold 0xbe0e54d7, revokeGuardianWithThreshold 0x936f7d86,
 *   changeThreshold 0x694e80c3, confirmRecovery 0x064e2d0e,
 *   cancelRecovery 0x0ba234d6, multiConfirmRecovery 0x0728e1e7,
 *   executeRecovery 0xb1f85f69, finalizeRecovery 0x315a7af3,
 *   createProxyWithNonce 0x1688f0b9, createAccount 0xd8fd8f44,
 *   createSigner 0x0d2f0489, moveTo 0xbd923581.
 */
import {
  concatHex,
  decodeFunctionData,
  hexToBigInt,
  isAddress,
  isAddressEqual,
  parseAbi,
  recoverTypedDataAddress,
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
  signerFactory: PASSKEY_SAFE.signerFactory,
  legacyAccountImpl: "0xf22175c80c6e074c171811c59c6c0087e2a6a346",
  /** thirdweb AccountFactory (the one every legacy account comes from). */
  legacyAccountFactory: "0x85e23b94e7F5E9cC1fF78BCe78cfb15B81f0DF00",
} as const satisfies Record<string, Hex>;

/** CitizenNFTv2 on Gnosis (ERC-721, `hasCitizenNFT` mapping). */
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

/** secp256k1 n / 2: thirdweb's OZ ECDSA rejects high-s signatures. */
const SECP256K1_HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;

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

/** v3 identity contracts (env PASSKEY_CITIZEN_NFT_V3 / PASSKEY_ATTESTER_NFT_V3); unset = v3 off. */
export interface V3Config {
  citizenNft?: Hex;
  attesterNft?: Hex;
}

/** Who the op claims to be: passkey key (32-byte hex each) + optional identity hints. */
export interface SponsorContext {
  x: Hex;
  y: Hex;
  /** The ONE legacy thirdweb account the op may drive (mode A). */
  legacy?: Hex;
  /** Recovery (mode C): the legacy account the recovered wallet is admin of, if the wallet itself holds no CitizenNFT. */
  recoveryLegacy?: Hex;
  /** Unix seconds, for the handover validity window and the recovery delay. */
  nowSeconds: number;
  v3?: V3Config;
}

export type SponsorMode = "legacy" | "safe" | "recovery";
export type PolicyResult =
  | { ok: true; mode: SponsorMode; budgetKey: Hex }
  | { ok: false; reason: string };

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
  /** `nft.hasCitizenNFT(account)` (CitizenNFTv2 / v3). */
  hasCitizenNFT(nft: Hex, account: Hex): Promise<boolean>;
  /** thirdweb AccountFactory.getAddress(admin, 0x). */
  getLegacyAccountAddress(admin: Hex): Promise<Hex>;
  /** SocialRecoveryModule.guardiansCount(wallet). */
  guardiansCount(wallet: Hex): Promise<bigint>;
  /** SocialRecoveryModule.isGuardian(wallet, guardian). */
  isGuardian(wallet: Hex, guardian: Hex): Promise<boolean>;
  /** SocialRecoveryModule.getRecoveryRequest(wallet). */
  getRecoveryRequest(wallet: Hex): Promise<{ executeAfter: bigint; newThreshold: bigint; newOwners: readonly Hex[] }>;
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
const accountFactoryAbi = parseAbi(["function createAccount(address admin, bytes data)"]);
const signerFactoryAbi = parseAbi(["function createSigner(uint256 x, uint256 y, uint176 verifiers)"]);
const v3Abi = parseAbi(["function moveTo(address newAccount)"]);

/** thirdweb Account EIP-712 SignerPermissionRequest (domain Account / 1 / 100 / account). */
const signerPermissionTypes = {
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

const deny = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
type Check = { ok: true } | { ok: false; reason: string };
const PASS: Check = { ok: true };

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
  x: bigint;
  y: bigint;
  legacy?: Hex;
  v3: V3Config;
  nowSeconds: number;
  /** Index of the call being scanned (0 = first call of the op). */
  index: number;
  /** Handovers of `legacy` to the sender, in batch order (each needs a verify). */
  handovers: Array<{ req: SignerPermissionRequest; signature: Hex }>;
  /** An execute/executeBatch ran before any handover: sender must already be admin. */
  executeNeedsAdmin: boolean;
  /** An SRM call that needs the sender bound to the identity (mode A / B). */
  srm: boolean;
  /** Admin of the createAccount call #0, if any. */
  createAccountAdmin?: Hex;
  /** Calls only allowed in identity modes (A / B). */
  identityOnly: boolean;
  /** Calls only allowed in recovery mode (C). */
  recoveryOnly: boolean;
  /** Wallets named by SRM recovery calls (confirm / multiConfirm / execute / finalize). */
  recoveryWallets: Hex[];
  /** confirmRecovery present (needs isGuardian(wallet, sender) in mode C). */
  confirms: boolean;
  /** multiConfirm / executeRecovery present (newOwners must be the submitter's signer). */
  ownerBound: boolean;
  /** finalizeRecovery present. */
  finalize: boolean;
}

function checkPermissionRequest(req: { signer: Hex; isAdmin: number }, sender: Hex): Check {
  if (req.isAdmin !== 1) return deny(`setPermissionsForSigner isAdmin=${req.isAdmin} not sponsorable (only 1 = add)`);
  if (!isAddressEqual(req.signer, sender)) return deny("setPermissionsForSigner req.signer must be the sender");
  return PASS;
}

const isV3Target = (to: Hex, v3: V3Config) =>
  (v3.citizenNft !== undefined && isAddressEqual(to, v3.citizenNft)) ||
  (v3.attesterNft !== undefined && isAddressEqual(to, v3.attesterNft));

/** Nested call the legacy account makes via execute/executeBatch: anything goes
 * (the sender is an admin of that account) EXCEPT a signer permission change
 * that is not "add the sender as admin", and a v3 `moveTo` that does not move
 * the identity to the sender itself on a configured v3 contract. */
function checkLegacyInnerCall(target: Hex, value: bigint, data: Hex, st: ScanState): Check {
  if (size(data) < 4) return PASS;
  const perm = tryDecode(() => decodeFunctionData({ abi: legacyAccountAbi, data }));
  if (perm?.functionName === "setPermissionsForSigner") return checkPermissionRequest(perm.args[0], st.sender);
  const move = tryDecode(() => decodeFunctionData({ abi: v3Abi, data }));
  if (move) {
    if (!st.v3.citizenNft && !st.v3.attesterNft) return deny("v3 moveTo is not enabled (PASSKEY_*_NFT_V3 unset)");
    if (!isV3Target(target, st.v3)) return deny("moveTo target is not the configured CitizenNFTv3 / AttesterNFTv3");
    if (!isAddressEqual(move.args[0], st.sender)) return deny("moveTo must move the identity to the sender Safe");
    if (value !== 0n) return deny("moveTo value must be 0");
  }
  return PASS;
}

function checkRecoveryOwners(newOwners: readonly Hex[], threshold: bigint): Check {
  if (newOwners.length !== 1 || threshold !== 1n) return deny("recovery must set exactly one new owner, threshold 1");
  return PASS;
}

function checkSrmCall(data: Hex, st: ScanState): Check {
  const d = tryDecode(() => decodeFunctionData({ abi: srmAbi, data }));
  if (!d) return deny("SocialRecoveryModule function not allowlisted");
  switch (d.functionName) {
    case "addGuardianWithThreshold":
    case "revokeGuardianWithThreshold":
    case "changeThreshold":
    case "cancelRecovery":
      st.identityOnly = true;
      st.srm = true;
      return PASS;
    case "confirmRecovery": {
      const [wallet, newOwners, threshold] = d.args;
      if (newOwners.length === 0 || threshold === 0n || threshold > BigInt(newOwners.length)) {
        return deny("confirmRecovery with an invalid owner set");
      }
      st.recoveryWallets.push(wallet);
      st.confirms = true;
      st.srm = true;
      return PASS;
    }
    case "multiConfirmRecovery": {
      const [wallet, newOwners, threshold, signatures] = d.args;
      if (signatures.length === 0) return deny("multiConfirmRecovery without signatures");
      const r = checkRecoveryOwners(newOwners, threshold);
      if (!r.ok) return r;
      st.recoveryWallets.push(wallet);
      st.recoveryOnly = true;
      st.ownerBound = true;
      return PASS;
    }
    case "executeRecovery": {
      const [wallet, newOwners, threshold] = d.args;
      const r = checkRecoveryOwners(newOwners, threshold);
      if (!r.ok) return r;
      st.recoveryWallets.push(wallet);
      st.recoveryOnly = true;
      st.ownerBound = true;
      return PASS;
    }
    case "finalizeRecovery":
      st.recoveryWallets.push(d.args[0]);
      st.recoveryOnly = true;
      st.finalize = true;
      return PASS;
  }
}

/** A single plain call (operation 0, value 0) the Safe makes. */
function checkAllowedCall(to: Hex, data: Hex, st: ScanState): Check {
  if (size(data) < 4) return deny("call without a function selector");

  if (isAddressEqual(to, ADDRESSES.socialRecoveryModule)) return checkSrmCall(data, st);

  if (isAddressEqual(to, ADDRESSES.signerFactory)) {
    const d = tryDecode(() => decodeFunctionData({ abi: signerFactoryAbi, data }));
    if (!d) return deny("SafeWebAuthnSignerFactory function not allowlisted");
    const [x, y, verifiers] = d.args;
    if (x !== st.x || y !== st.y || verifiers !== WEBAUTHN_VERIFIERS) {
      return deny("createSigner must be for the request's own passkey (x, y)");
    }
    st.recoveryOnly = true;
    return PASS;
  }

  if (isAddressEqual(to, ADDRESSES.legacyAccountFactory)) {
    const d = tryDecode(() => decodeFunctionData({ abi: accountFactoryAbi, data }));
    if (!d) return deny("AccountFactory function not allowlisted");
    if (st.index !== 0) return deny("createAccount is only allowed as the first call of the op");
    if (!st.legacy) return deny("createAccount needs the request's legacy account");
    if (d.args[1] !== "0x") return deny("createAccount data must be empty");
    st.createAccountAdmin = d.args[0];
    st.identityOnly = true;
    return PASS;
  }

  const d = tryDecode(() => decodeFunctionData({ abi: legacyAccountAbi, data }));
  if (!d) return deny("call target/selector not allowlisted");
  if (!st.legacy || !isAddressEqual(to, st.legacy)) {
    return deny("thirdweb account call must target the request's legacy account");
  }
  st.identityOnly = true;

  if (d.functionName === "setPermissionsForSigner") {
    const [req, signature] = d.args;
    const r = checkPermissionRequest(req, st.sender);
    if (!r.ok) return r;
    const now = BigInt(st.nowSeconds);
    if (!(req.reqValidityStartTimestamp <= now && now < req.reqValidityEndTimestamp)) {
      return deny("handover request is outside its validity window");
    }
    st.handovers.push({ req, signature });
    return PASS;
  }

  if (d.functionName === "execute") {
    const r = checkLegacyInnerCall(d.args[0], d.args[1], d.args[2], st);
    if (!r.ok) return r;
  } else {
    const [targets, values, datas] = d.args;
    if (targets.length !== values.length || targets.length !== datas.length) {
      return deny("executeBatch array length mismatch");
    }
    for (let i = 0; i < datas.length; i++) {
      const r = checkLegacyInnerCall(targets[i], values[i], datas[i], st);
      if (!r.ok) return r;
    }
  }
  if (st.handovers.length === 0) st.executeNeedsAdmin = true;
  return PASS;
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

function checkCallData(callData: Hex, st: ScanState): Check {
  const outer = tryDecode(() => decodeFunctionData({ abi: safe4337Abi, data: callData }));
  if (!outer) return deny("callData is not Safe4337Module.executeUserOp[WithErrorString]");
  const [to, value, data, operation] = outer.args;
  if (value !== 0n) return deny("outer value must be 0");

  if (operation === 0) {
    if (isAddressEqual(to, ADDRESSES.multiSendCallOnly)) {
      return deny("MultiSendCallOnly must be reached via delegatecall");
    }
    st.index = 0;
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
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    if (tx.operation !== 0) return deny("inner multiSend tx must be a call (operation 0)");
    if (tx.value !== 0n) return deny("inner multiSend value must be 0");
    st.index = i;
    const r = checkAllowedCall(tx.to, tx.data, st);
    if (!r.ok) return r;
  }
  return PASS;
}

/** Deploy ops: the factory call must be EXACTLY the passkey Safe for (x, y). */
function checkFactory(op: SponsorUserOp, ctx: SponsorContext): Check {
  const hasFactoryData = op.factoryData !== undefined && size(op.factoryData) > 0;
  if (!op.factory) return hasFactoryData ? deny("factoryData without factory") : PASS;
  if (!isAddressEqual(op.factory, ADDRESSES.safeProxyFactory)) return deny("factory is not SafeProxyFactory 1.4.1");
  const key = { x: ctx.x, y: ctx.y };
  if ((op.factoryData ?? "0x").toLowerCase() !== safeFactoryData(key).toLowerCase()) {
    return deny("factoryData is not the passkey Safe deployment for (x, y)");
  }
  if (!isAddressEqual(op.sender, predictSafeAddress(key))) return deny("sender is not the predicted passkey Safe for (x, y)");
  return PASS;
}

function checkGas(op: SponsorUserOp): Check {
  for (const key of Object.keys(CAPS) as Array<keyof typeof CAPS>) {
    if (op[key] > CAPS[key]) return deny(`${key} over cap`);
  }
  if (op.maxPriorityFeePerGas > op.maxFeePerGas) return deny("maxPriorityFeePerGas exceeds maxFeePerGas");
  return PASS;
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

const isLegacyProxyCode = (code: Hex | undefined) =>
  (code ?? "0x").toLowerCase() === LEGACY_ACCOUNT_PROXY_CODE.toLowerCase();
const hasNoCode = (code: Hex | undefined) => !code || code === "0x";

/** citizen(a) := CitizenNFTv2.hasCitizenNFT(a) OR (v3 configured AND v3.hasCitizenNFT(a)). */
async function isCitizen(account: Hex, v3: V3Config, chain: ChainReader): Promise<boolean> {
  if (await read(() => chain.hasCitizenNFT(CITIZEN_NFT, account))) return true;
  const citizenV3 = v3.citizenNft;
  if (!citizenV3) return false;
  return read(() => chain.hasCitizenNFT(citizenV3, account));
}

/** Deployed sender: prove it is a passkey Safe whose single owner is bound to (x, y). */
async function checkDeployedPasskeySafe(sender: Hex, ctx: SponsorContext, chain: ChainReader): Promise<Check> {
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
    return PASS;
  }
  const [ownerCode, signer] = await Promise.all([
    read(() => chain.getCode(owner)),
    read(() => chain.getWebAuthnSigner(x, y, WEBAUTHN_VERIFIERS)),
  ]);
  if (!ownerCode || ownerCode === "0x") return deny("sender owner is not a contract signer");
  if (!isAddressEqual(signer, owner)) return deny("sender owner is not the WebAuthn signer for (x, y)");
  return PASS;
}

async function checkSender(op: SponsorUserOp, ctx: SponsorContext, chain: ChainReader): Promise<Check> {
  // Deploy ops were proven structurally (checkFactory).
  return op.factory ? PASS : checkDeployedPasskeySafe(op.sender, ctx, chain);
}

/** A handover for a legacy account deployed in THIS op: its only admin is the
 * createAccount admin, so verifySignerPermissionRequest(req, sig) would succeed
 * iff the EIP-712 signature recovers to that admin (low-s, as OZ ECDSA demands). */
async function handoverSignedByAdmin(legacy: Hex, admin: Hex, req: SignerPermissionRequest, signature: Hex): Promise<boolean> {
  if (size(signature) !== 65) return false;
  const s = hexToBigInt(sliceHex(signature, 32, 64));
  const v = Number(hexToBigInt(sliceHex(signature, 64, 65)));
  if (s > SECP256K1_HALF_N || (v !== 27 && v !== 28)) return false;
  try {
    const recovered = await recoverTypedDataAddress({
      domain: { name: "Account", version: "1", chainId: 100, verifyingContract: legacy },
      types: signerPermissionTypes,
      primaryType: "SignerPermissionRequest",
      message: { ...req, approvedTargets: [...req.approvedTargets] },
      signature,
    });
    return isAddressEqual(recovered, admin);
  } catch {
    return false;
  }
}

/** Mode A: the op drives `legacy`, a citizen thirdweb account bound to the sender. */
async function evaluateLegacyMode(
  op: SponsorUserOp,
  ctx: SponsorContext,
  legacy: Hex,
  st: ScanState,
  chain: ChainReader,
): Promise<PolicyResult> {
  const admin = st.createAccountAdmin;
  const needsAdmin = st.executeNeedsAdmin || (st.srm && st.handovers.length === 0);
  if (admin && needsAdmin) return deny("a legacy account deployed in this op needs the handover before any other call");

  const [legacyCode, citizen] = await Promise.all([
    read(() => chain.getCode(legacy)),
    isCitizen(legacy, ctx.v3 ?? {}, chain),
  ]);
  if (admin) {
    if (!hasNoCode(legacyCode)) return deny("legacy account is already deployed; drop createAccount");
    const predicted = await read(() => chain.getLegacyAccountAddress(admin));
    if (!isAddressEqual(predicted, legacy)) return deny("createAccount does not deploy the request's legacy account");
  } else if (!isLegacyProxyCode(legacyCode)) {
    return deny(`${legacy} is not a legacy thirdweb account`);
  }
  if (!citizen) return deny("legacy account holds no CitizenNFT");

  const sender = await checkSender(op, ctx, chain);
  if (!sender.ok) return sender;

  for (const h of st.handovers) {
    if (admin) {
      if (!(await handoverSignedByAdmin(legacy, admin, h.req, h.signature))) {
        return deny("handover signature is not a valid admin signature");
      }
      continue;
    }
    const v = await read(() => chain.verifySignerPermissionRequest(legacy, h.req, h.signature));
    if (!v || v.success !== true) return deny("handover signature is not a valid admin signature");
    const signerIsAdmin = await read(() => chain.isAdmin(legacy, v.signer));
    if (!signerIsAdmin) return deny("handover signature is not a valid admin signature");
  }

  if (needsAdmin) {
    const isAdmin = await read(() => chain.isAdmin(legacy, op.sender));
    if (isAdmin !== true) return deny(`sender is not an admin of ${legacy}`);
  }
  return { ok: true, mode: "legacy", budgetKey: legacy };
}

/** Mode C: help recover `wallet`, a citizen identity with guardians. */
async function evaluateRecoveryMode(
  op: SponsorUserOp,
  ctx: SponsorContext,
  st: ScanState,
  chain: ChainReader,
): Promise<PolicyResult> {
  const wallet = st.recoveryWallets[0];
  if (!wallet) return deny("recovery op names no wallet");
  if (st.recoveryWallets.some((w) => !isAddressEqual(w, wallet))) return deny("all recovery calls must name the same wallet");
  if (isAddressEqual(wallet, op.sender)) return deny("a Safe cannot sponsor its own recovery");

  const sender = await checkSender(op, ctx, chain);
  if (!sender.ok) return sender;

  // The wallet is a citizen identity: directly, or via the legacy account it administers.
  let walletIsCitizen = await isCitizen(wallet, ctx.v3 ?? {}, chain);
  if (!walletIsCitizen && ctx.recoveryLegacy) {
    const rl = ctx.recoveryLegacy;
    const code = await read(() => chain.getCode(rl));
    if (isLegacyProxyCode(code)) {
      const [linked, citizen] = await Promise.all([
        read(() => chain.isAdmin(rl, wallet)),
        isCitizen(rl, ctx.v3 ?? {}, chain),
      ]);
      walletIsCitizen = linked === true && citizen;
    }
  }
  if (!walletIsCitizen) return deny("the wallet being recovered is not a citizen identity");
  const guardians = await read(() => chain.guardiansCount(wallet));
  if (guardians <= 0n) return deny("the wallet being recovered has no guardians");

  if (st.ownerBound || st.finalize) {
    const signer = await read(() => chain.getWebAuthnSigner(BigInt(ctx.x), BigInt(ctx.y), WEBAUTHN_VERIFIERS));
    if (st.ownerBound && !recoveryOwnersAre(op.callData, wallet, signer)) {
      return deny("recovery must hand the wallet to the submitter's own passkey signer");
    }
    if (st.finalize) {
      const rq = await read(() => chain.getRecoveryRequest(wallet));
      if (rq.executeAfter === 0n) return deny("the wallet has no pending recovery");
      if (rq.executeAfter > BigInt(ctx.nowSeconds)) return deny("the recovery period is still pending");
      if (rq.newOwners.length !== 1 || !isAddressEqual(rq.newOwners[0], signer)) {
        return deny("the pending recovery does not hand the wallet to the submitter's passkey signer");
      }
    }
  }
  if (st.confirms) {
    const guardian = await read(() => chain.isGuardian(wallet, op.sender));
    if (!guardian) return deny("sender is not a guardian of the wallet");
  }
  return { ok: true, mode: "recovery", budgetKey: wallet };
}

/** Every multiConfirmRecovery / executeRecovery in the op sets newOwners == [signer]. */
function recoveryOwnersAre(callData: Hex, wallet: Hex, signer: Hex): boolean {
  let ok = true;
  forEachCall(callData, (to, data) => {
    if (!isAddressEqual(to, ADDRESSES.socialRecoveryModule)) return;
    const d = tryDecode(() => decodeFunctionData({ abi: srmAbi, data }));
    if (d?.functionName === "multiConfirmRecovery" || d?.functionName === "executeRecovery") {
      const newOwners = d.args[1];
      if (!isAddressEqual(d.args[0], wallet) || newOwners.length !== 1 || !isAddressEqual(newOwners[0], signer)) ok = false;
    }
  });
  return ok;
}

/** Visits the plain calls of an (already structurally validated) callData. */
function forEachCall(callData: Hex, visit: (to: Hex, data: Hex) => void): void {
  const outer = decodeFunctionData({ abi: safe4337Abi, data: callData });
  const [to, , data, operation] = outer.args;
  if (operation === 0) return visit(to, data);
  const ms = decodeFunctionData({ abi: multiSendAbi, data });
  for (const tx of decodeMultiSendPacked(ms.args[0]) ?? []) visit(tx.to, tx.data);
}

/**
 * Resolves to { ok, mode, budgetKey } or { ok: false, reason }. Throws
 * ChainReadError when a chain read fails - the caller must treat that as
 * "do not sponsor".
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
    x: BigInt(ctx.x),
    y: BigInt(ctx.y),
    legacy: ctx.legacy,
    v3: ctx.v3 ?? {},
    nowSeconds: ctx.nowSeconds,
    index: 0,
    handovers: [],
    executeNeedsAdmin: false,
    srm: false,
    identityOnly: false,
    recoveryOnly: false,
    recoveryWallets: [],
    confirms: false,
    ownerBound: false,
    finalize: false,
  };
  const structural = checkCallData(op.callData, st);
  if (!structural.ok) return structural;
  if (st.identityOnly && st.recoveryOnly) return deny("identity calls and recovery calls cannot be mixed in one op");

  // ---- mode ----
  if (st.recoveryOnly) {
    if (ctx.legacy) return deny("recovery ops must not name a legacy account");
    return evaluateRecoveryMode(op, ctx, st, chain);
  }
  if (ctx.legacy) return evaluateLegacyMode(op, ctx, ctx.legacy, st, chain);

  // No legacy: identity = the sender Safe itself (mode B), or - for an op that
  // is only confirmRecovery calls - a guardian helping a citizen (mode C).
  if (await isCitizen(op.sender, ctx.v3 ?? {}, chain)) {
    const sender = await checkSender(op, ctx, chain);
    if (!sender.ok) return sender;
    return { ok: true, mode: "safe", budgetKey: op.sender };
  }
  if (!st.identityOnly && st.confirms) return evaluateRecoveryMode(op, ctx, st, chain);
  return deny("sender holds no CitizenNFT and the request names no legacy account");
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

function optionalAddress(obj: Record<string, unknown>, key: string): Hex | undefined {
  const v = field(obj, key);
  return v === undefined || v === null ? undefined : address(obj, key);
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

/** The full request body: { chainId, userOp, x, y, legacy?, recoveryLegacy? }. Throws on malformed input. */
export function parseSponsorRequest(input: unknown): {
  chainId: unknown;
  userOp: SponsorUserOp;
  x: Hex;
  y: Hex;
  legacy?: Hex;
  recoveryLegacy?: Hex;
} {
  if (!input || typeof input !== "object") throw new Error("body must be an object");
  const o = input as Record<string, unknown>;
  return {
    chainId: o.chainId,
    userOp: parseSponsorUserOp(o.userOp),
    x: word32(o, "x"),
    y: word32(o, "y"),
    legacy: optionalAddress(o, "legacy"),
    recoveryLegacy: optionalAddress(o, "recoveryLegacy"),
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
