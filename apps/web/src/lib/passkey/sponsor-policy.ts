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
 *  B. identity = the sender Safe itself (no `legacy`). Only Candide guardian
 *     management (a confirmRecovery may ride along). Budget key = sender.
 *     - citizen(sender) (e.g. after a v3 `moveTo`): { mode "safe" }.
 *     - GUEST (a genuine passkey Safe without citizenship): the same calls,
 *       { mode "safe", guest: true } -> guest budget. checkSender always runs.
 *  D. everyday (see everyday-allowlist.ts): the op is ONLY allowlisted Röbel
 *     citizen actions (value 0). Identity = `legacy` (calls wrapped in
 *     legacy.execute / executeBatch, the sender an admin, legacy a citizen) or
 *     the sender Safe itself (direct calls). A citizen Safe may make any
 *     allowlisted call. A GUEST Safe only onboarding-tier calls
 *     (CitizenNFTv2.createAttestationRequest, Hub.registerHuman, Hub.personalMint,
 *     NameRegistry.updateMetadataDigest), optionally with its own guardian
 *     management in the same op (the sign-up batch), never with a thirdweb shape
 *     (handover, createAccount, moveTo, legacy.execute / executeBatch) ->
 *     { tier "onboarding", guest: true }. One citizen-only call in a guest op
 *     refuses the whole op. A Poll.publishMessage target must equal
 *     MACI.polls(ctx.pollId). Budget key = the identity. Everyday calls may also
 *     ride along with mode A / B shapes (the mode then stays "legacy" / "safe";
 *     for a guest it is "everyday").
 *  E. detach ("thirdweb trennen", body names `legacy`): the op is EXACTLY ONE
 *     call legacy.setPermissionsForSigner(req{isAdmin: 2}, sig) removing an
 *     admin that is NOT the sender. Only when: the sender is a genuine passkey
 *     Safe that is already admin of `legacy`; `legacy` is a deployed thirdweb
 *     Account proxy holding CitizenNFT; req.signer is a current admin; the
 *     signature verifies on chain (verifySignerPermissionRequest + isAdmin of
 *     the recovered signer); the sender Safe's SocialRecoveryModule has >= 2
 *     guardians AND threshold >= 2 (read on chain). The sender stays admin, so
 *     >= 1 admin remains. Every other isAdmin != 1 request (inside execute, in a
 *     batch, removing the sender, without guardians) is rejected. Budget key =
 *     legacy.
 *  F. miniapp (the request names `miniApp`, a reviewed version-2 mini app with
 *     declared contracts; the route passes its call rules in ctx.miniApp): EVERY
 *     call of the op is a declared contract + function of that app
 *     (findDeclaredCall, shared with the hosts' confirm sheet), value 0. Identity =
 *     the sender Safe (direct calls) or `legacy` (calls wrapped in legacy.execute /
 *     executeBatch; `legacy` a thirdweb Account proxy and isAdmin(legacy, sender)).
 *     One undeclared call refuses the whole op, including calls every other mode
 *     would accept (everyday, guardian management, recovery, handover, detach):
 *     no mixing. A declared target equal to the sender, `legacy` or any
 *     MINIAPP_FORBIDDEN_TARGETS address (Röbel's own contracts and the account
 *     infrastructure) is refused even if the rules carry it. No citizen
 *     requirement (guests too; the exposure is bounded by the app's gas budget,
 *     charged by the route to the mini-app counters, never the everyday budget).
 *     A deploy op is allowed under the factory check. Budget key = the identity.
 *     Without ctx.miniApp an op is evaluated exactly as in modes A-E.
 *  C. recovery (no `legacy`): the op helps recover `wallet`, a citizen identity
 *     (citizen(wallet), or `recoveryLegacy` is a citizen thirdweb account with
 *     isAdmin(recoveryLegacy, wallet)) that has at least one guardian.
 *     A non-citizen wallet is still recoverable as a guest when it has the
 *     deployed sovereign passkey-Safe shape (checkDeployedSafeShape) and at
 *     least one guardian -> { mode "recovery", guest: true }.
 *     The sender may be ANY genuine passkey Safe (family guardians and the
 *     recovering person's fresh Safe are not citizens). Budget key = wallet
 *     for a citizen wallet; for a GUEST wallet the budget key is the SENDER
 *     (plus the guest group): any passkey Safe may submit a recovery op for a
 *     guest Safe (it reverts on chain without the guardians' confirmations, but
 *     the paymaster still pays), so charging the wallet would let a stranger
 *     drain the victim's own daily budget and block its cancelRecovery.
 *
 * All modes:
 *  1. Fees / gas within CAPS (maxFeePerGas <= 3 gwei, priority <= maxFee).
 *  2. The sender is a genuine sovereign Safe for the request's proof. The body
 *     names EXACTLY ONE proof: the passkey key (x, y) or the expert path's
 *     ECDSA owner `ecdsaOwner` (the account key of the 12 words); both or
 *     neither is a bad request. A proof never passes for the other kind of Safe.
 *     Passkey (x, y):
 *     - deploy op: factory == SafeProxyFactory 1.4.1, factoryData ==
 *       safeFactoryData(x, y) byte-for-byte, sender == predictSafeAddress(x, y);
 *     - deployed: SafeProxy 1.4.1 runtime, singleton Safe L2 1.4.1, fallback
 *       handler + enabled modules Safe4337Module and SocialRecoveryModule,
 *       getOwners() == [owner] where
 *       owner is the SharedSigner configured with (x, y) for this Safe or
 *       SafeWebAuthnSignerFactory.getSigner(x, y, verifiers) (recovered Safe).
 *     ECDSA owner (expert path; never the zero address or the Safe sentinel 0x1):
 *     - deploy op: factory == SafeProxyFactory 1.4.1, factoryData ==
 *       ecdsaSafeFactoryData(ecdsaOwner) byte-for-byte, sender ==
 *       predictEcdsaSafeAddress(ecdsaOwner);
 *     - deployed: the same shape (checkDeployedSafeShape) AND getOwners() ==
 *       [ecdsaOwner];
 *     - both: the owner's code is empty or an EIP-7702 designator (0xef0100 ++
 *       20 bytes) - a plain key, never a contract that could sign via EIP-1271.
 *     With `ecdsaOwner`: no `legacy` (an expert-path Safe never drives a
 *     thirdweb account), no SafeWebAuthnSignerFactory.createSigner, and in
 *     mode C the "submitter's own signer" is `ecdsaOwner` itself. Modes B, D
 *     and the guest results are the same as for a passkey Safe.
 *  3. callData = Safe4337Module.executeUserOp[WithErrorString], value 0, one
 *     CALL or a DELEGATECALL into MultiSendCallOnly 1.4.1 whose inner txs are
 *     CALLs with value 0.
 *     OR (a passkey Safe migrated to Safe7579, see safe7579.ts) callData =
 *     Safe7579.execute(EXEC_SINGLE | EXEC_BATCH, canonical payload): never
 *     delegatecall, default execType only; every execution has value 0, does
 *     not target the sender itself and goes through the same call classifier.
 *     The callData layout must equal the sender's on-chain layout: a "4337"
 *     Safe (handler + module Safe4337Module) or a "7579" Safe (handler +
 *     module Safe7579, Safe4337Module NOT enabled, modules exactly {Safe7579,
 *     SRM}). Deploy ops and expert-path (ECDSA) Safes are 4337 only.
 *  4. Nonce key (nonce >> 64) == 0: root ops (the passkey / Safe owner), or
 *     SESSION_NONCE_KEY (SmartSession): ONLY the device-session claim shape.
 *
 * Device sessions (session-key-policy.ts, evaluated BEFORE the modes above): an op
 * with the SmartSession nonce key, a root op that names `deviceSession`, or a root op
 * with a call to the sender Safe itself or to SmartSession is evaluated ONLY as one of
 * "session-upgrade" | "session-grant" | "session-revoke" | "session" (every byte
 * rebuilt by the server and compared), never by the modes above.
 *
 * Allowed calls per mode:
 *  A: legacy.setPermissionsForSigner (add the SENDER as admin, in its validity
 *     window, verified: eth_call verifySignerPermissionRequest + isAdmin(signer);
 *     for a legacy deployed in this batch, ECDSA-recovered == the createAccount
 *     admin, low-s); legacy.execute/executeBatch (inner permission changes
 *     must be add-sender; an inner `moveTo(newAccount)` only to the configured
 *     CitizenNFTv3 / AttesterNFTv3 with newAccount == sender and value 0; an
 *     inner SRM.confirmRecovery with value 0 (a legacy account as guardian);
 *     every OTHER inner call must be an everyday allowlisted action - since
 *     2026-09-27 legacy.execute no longer sponsors arbitrary calls);
 *     AccountFactory.createAccount(admin, 0x) as call #0; SRM guardian
 *     management (addGuardianWithThreshold, revokeGuardianWithThreshold,
 *     changeThreshold, cancelRecovery) and confirmRecovery.
 *  B: SRM guardian management and confirmRecovery (a guest: confirmRecovery
 *     only together with guardian management).
 *  C: SRM.multiConfirmRecovery / executeRecovery with newOwners ==
 *     [getSigner(x, y)] and threshold 1 (the recovery hands the wallet to the
 *     SUBMITTER's key); SRM.finalizeRecovery when the pending request's owners
 *     are [getSigner(x, y)] and its delay is over; SRM.confirmRecovery when the
 *     sender is a guardian of the wallet; SafeWebAuthnSignerFactory.createSigner
 *     for exactly (x, y, verifiers). All calls name the same wallet != sender.
 *  An op that is only confirmRecovery calls is mode A with `legacy`, else B if
 *  the sender is a citizen, else C (budget = the wallet; the sender for a guest wallet). Identity-only and recovery-only calls never
 *  mix. Any thirdweb-selector call to an address other than `legacy` is
 *  rejected: one legacy account per op.
 *
 * Guests (no citizenship yet) are sponsored only for mode B guardian
 * management and the onboarding tier of mode D: no value transfers, no
 * arbitrary targets, no Münzen moved, no trust given. Citizenship itself still
 * needs the attesters.
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
  zeroAddress,
  type Hex,
} from "viem";
import { findDeclaredCall, type CallRule } from "@netizen-labs/miniapp-sdk/host";
import {
  FALLBACK_HANDLER_SLOT,
  PASSKEY_SAFE,
  SAFE_PROXY_RUNTIME_CODE,
  WEBAUTHN_VERIFIERS,
  ecdsaSafeFactoryData,
  predictEcdsaSafeAddress,
  predictSafeAddress,
  safeFactoryData,
} from "./safe-address";
import { packUint128Pair, type UserOperationV07 } from "./voucher";
import { SAFE7579, decodeSafe7579Execute, nonceKeyOf } from "./safe7579";
import { evaluateSessionKeyModes } from "./session-key-policy";
import {
  MULTI_SEND_CALL_ONLY,
  OWNABLE_VALIDATOR,
  SMART_SESSIONS,
  TIME_FRAME_POLICY,
  UNI_ACTION_POLICY,
} from "./session-keys-builders";
import {
  EVERYDAY_CONTRACTS,
  ORG_SAFE,
  classifyEverydayCall,
  credentialRegistryAddress,
  type EverydayTier,
  type EverydayVerdict,
} from "./everyday-allowlist";

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

/**
 * Addresses a mini app may never have sponsored calls to (mode F), lowercased: Röbel's
 * everyday contracts, the org-Safe infrastructure, every account-infrastructure address
 * (ADDRESSES, PASSKEY_SAFE), CitizenNFTv2 and the zero address. The manifest validator
 * (miniapp/contracts.ts, FORBIDDEN_CONTRACTS) uses this same list.
 */
export const MINIAPP_FORBIDDEN_TARGETS: readonly Hex[] = Array.from(
  new Set(
    [
      ...Object.values(EVERYDAY_CONTRACTS),
      ...(Object.values(ORG_SAFE) as Array<string | number>).filter((v): v is Hex => typeof v === "string"),
      ...Object.values(ADDRESSES),
      ...Object.values(PASSKEY_SAFE),
      CITIZEN_NFT,
      // Device-session stack (Safe7579 adapter, SmartSession and its validator / policies).
      SAFE7579,
      SMART_SESSIONS,
      OWNABLE_VALIDATOR,
      UNI_ACTION_POLICY,
      TIME_FRAME_POLICY,
      MULTI_SEND_CALL_ONLY,
      zeroAddress,
    ].map((a) => a.toLowerCase() as Hex),
  ),
);

/** A forbidden mini-app target, including the configured CredentialRegistry. */
export function isMiniAppForbiddenTarget(address: string): boolean {
  const a = address.toLowerCase();
  if (MINIAPP_FORBIDDEN_TARGETS.includes(a as Hex)) return true;
  const registry = credentialRegistryAddress();
  return registry !== null && registry.toLowerCase() === a;
}

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

/**
 * Who the op claims to be: EXACTLY ONE of the passkey key (x and y, 32-byte hex each) or the
 * expert path's ECDSA owner (`ecdsaOwner`), plus optional identity hints. Anything else is refused.
 */
export interface SponsorContext {
  x?: Hex;
  y?: Hex;
  /** Expert path: the single plain-key owner of the sender Safe (the account key of the 12 words). */
  ecdsaOwner?: Hex;
  /** The ONE legacy thirdweb account the op may drive (mode A). */
  legacy?: Hex;
  /** Recovery (mode C): the legacy account the recovered wallet is admin of, if the wallet itself holds no CitizenNFT. */
  recoveryLegacy?: Hex;
  /** Unix seconds, for the handover validity window and the recovery delay. */
  nowSeconds: number;
  v3?: V3Config;
  /** Everyday mode: the MACI poll id whose Poll the op votes in (MACI.polls(pollId) must equal the target). */
  pollId?: bigint;
  /** Mode F: the mini app the request names and its declared call rules (live, version 2). */
  miniApp?: { id: string; rules: CallRule[] };
  /** session-upgrade / session-grant: the device key and expiry the op's sessions must carry. */
  deviceSession?: { signer: Hex; validUntil: number };
  /**
   * Kill switch app_settings.passkey_session_keys_enabled. Anything but `true` (unset, false, a
   * failed read) = OFF: session-upgrade, session-grant and session ops are denied. Fails closed.
   */
  sessionKeysEnabled?: boolean;
}

export type SponsorMode =
  | "legacy"
  | "safe"
  | "recovery"
  | "everyday"
  | "detach"
  | "miniapp"
  | "session-upgrade"
  | "session-grant"
  | "session-revoke"
  | "session";

/** Budget key of a device-session grant / upgrade: `grant:<legacy>` (lowercased), apart from the legacy's daily budget. */
export type GrantBudgetKey = `grant:${Hex}`;

/** Detach (mode E) needs this many guardians AND this threshold on the sender Safe. */
export const DETACH_MIN_GUARDIANS = 2n;
export const DETACH_MIN_THRESHOLD = 2n;
export type PolicyResult =
  | {
      ok: true;
      mode: SponsorMode;
      budgetKey: Hex | GrantBudgetKey;
      /** everyday mode only; "onboarding" = only guest-allowed calls */
      tier?: EverydayTier;
      /** Set whenever the budget identity is a non-citizen passkey Safe (a guest): guest budget applies. */
      guest?: true;
      /** miniapp mode only: the mini app whose gas budget pays. */
      miniAppId?: string;
    }
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
  /** SocialRecoveryModule.threshold(wallet). */
  srmThreshold(wallet: Hex): Promise<bigint>;
  /** SocialRecoveryModule.isGuardian(wallet, guardian). */
  isGuardian(wallet: Hex, guardian: Hex): Promise<boolean>;
  /** MACI.polls(pollId) on the Röbel MACI core (zero address when unknown). */
  maciPoll(pollId: bigint): Promise<Hex>;
  /** Safe.getModulesPaginated(SENTINEL, 10): the first page of enabled Safe modules and the next cursor. */
  getModulesPaginated(safe: Hex): Promise<{ modules: readonly Hex[]; next: Hex }>;
  /** SmartSession.getPermissionIDs(safe): the permission ids currently enabled for the Safe. */
  getPermissionIDs(safe: Hex): Promise<readonly Hex[]>;
  /** Safe7579.isModuleInstalled(1, SmartSession, "") called on the (migrated) Safe. */
  isSmartSessionInstalled(safe: Hex): Promise<boolean>;
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
  /** The passkey key; both 0n for an expert-path (ECDSA) proof, which `ecdsa` marks. */
  x: bigint;
  y: bigint;
  ecdsa: boolean;
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
  /** Any everyday allowlisted action present. */
  everyday: boolean;
  /** Everyday actions called directly by the Safe (identity = the Safe). */
  directEveryday: boolean;
  /** Every everyday action so far is onboarding-tier. */
  onboardingOnly: boolean;
  /** Any mode A / B shape present (handover, createAccount, moveTo, SRM). */
  migration: boolean;
  /** A thirdweb-account shape present: handover, createAccount, moveTo, or any
   * legacy.execute / executeBatch. Never part of a guest op. */
  legacyShapes: boolean;
  /** SRM guardian management present (add / revoke guardian, changeThreshold, cancelRecovery). */
  guardianManagement: boolean;
  /** Poll.publishMessage targets (verified against MACI.polls(ctx.pollId)). */
  polls: Hex[];
  /** org-Safe execTransaction targets (a Safe L2 1.4.1 proxy, or created earlier in this batch). */
  orgSafes: Hex[];
  /** org Safes this batch deploys (CREATE2 addresses, in call order). */
  createdSafes: Hex[];
  /** Plain calls scanned (a detach must be the only one). */
  calls: number;
  /** Detach requests (isAdmin 2) submitted directly to `legacy` (mode E). */
  detaches: Array<{ req: SignerPermissionRequest; signature: Hex }>;
  /** Mode F: set when the request names a mini app; every call must be one of its rules. */
  miniApp?: { id: string; rules: CallRule[] };
  /** Which account layout the callData was built for (set by checkCallData); must equal the sender's on-chain layout. */
  layout?: SafeLayout;
}

/** "4337": Safe4337Module handler + module (as deployed). "7579": migrated to the Safe7579 adapter. */
export type SafeLayout = "4337" | "7579";

/** Mode F: one call (direct, or nested in legacy.execute / executeBatch) must be declared. */
function checkMiniAppCall(to: Hex, value: bigint, data: Hex, st: ScanState): Check {
  if (value !== 0n) return deny("mini-app call value must be 0");
  if (isAddressEqual(to, st.sender)) return deny("a mini app may not call the sender account itself");
  if (st.legacy && isAddressEqual(to, st.legacy)) return deny("a mini app may not call the legacy account itself");
  if (isMiniAppForbiddenTarget(to)) return deny("a mini app may not call Röbel's own contracts or the account infrastructure");
  const match = findDeclaredCall(st.miniApp?.rules ?? [], to, data);
  if (!match) return deny("call is not a declared contract function of this mini app");
  return PASS;
}

function checkPermissionRequest(req: { signer: Hex; isAdmin: number }, sender: Hex): Check {
  if (req.isAdmin !== 1) return deny(`setPermissionsForSigner isAdmin=${req.isAdmin} not sponsorable (only 1 = add)`);
  if (!isAddressEqual(req.signer, sender)) return deny("setPermissionsForSigner req.signer must be the sender");
  return PASS;
}

/** Structural shape of a detach request (mode E): remove an admin that is not the sender. */
function checkDetachRequest(
  req: Pick<SignerPermissionRequest, "signer" | "approvedTargets" | "nativeTokenLimitPerTransaction" | "permissionStartTimestamp" | "permissionEndTimestamp" | "reqValidityStartTimestamp" | "reqValidityEndTimestamp">,
  st: ScanState,
): Check {
  if (isAddressEqual(req.signer, st.sender)) return deny("a detach must not remove the sender Safe itself");
  if (req.approvedTargets.length !== 0 || req.nativeTokenLimitPerTransaction !== 0n) {
    return deny("a detach request carries no targets and no native limit");
  }
  if (req.permissionStartTimestamp !== 0n || req.permissionEndTimestamp !== 0n) {
    return deny("a detach request carries no permission window");
  }
  const now = BigInt(st.nowSeconds);
  if (!(req.reqValidityStartTimestamp <= now && now < req.reqValidityEndTimestamp)) {
    return deny("detach request is outside its validity window");
  }
  return PASS;
}

const isV3Target = (to: Hex, v3: V3Config) =>
  (v3.citizenNft !== undefined && isAddressEqual(to, v3.citizenNft)) ||
  (v3.attesterNft !== undefined && isAddressEqual(to, v3.attesterNft));

/** Records an everyday verdict in the scan state. */
function recordEveryday(v: EverydayVerdict, st: ScanState): Check {
  if (!v.ok) return v;
  st.everyday = true;
  st.identityOnly = true;
  if (v.tier !== "onboarding") st.onboardingOnly = false;
  if (v.poll) st.polls.push(v.poll);
  if (v.createdSafe) st.createdSafes.push(v.createdSafe);
  if (v.orgSafe) {
    // Created earlier in THIS batch counts as verified (it has no code at validation time).
    if (!st.createdSafes.some((c) => isAddressEqual(c, v.orgSafe as Hex))) st.orgSafes.push(v.orgSafe);
  }
  return PASS;
}

/** Nested call the legacy account makes via execute/executeBatch. Allowed:
 * a signer permission change that is "add the sender as admin"; a v3 `moveTo`
 * that moves the identity to the sender itself on a configured v3 contract;
 * SRM.confirmRecovery (the legacy account is a guardian); an everyday
 * allowlisted action (everyday-allowlist.ts). Everything else is refused. */
function checkLegacyInnerCall(target: Hex, value: bigint, data: Hex, st: ScanState): Check {
  if (st.miniApp) return checkMiniAppCall(target, value, data, st);
  if (size(data) >= 4) {
    const perm = tryDecode(() => decodeFunctionData({ abi: legacyAccountAbi, data }));
    if (perm?.functionName === "setPermissionsForSigner") {
      st.migration = true;
      st.legacyShapes = true;
      return checkPermissionRequest(perm.args[0], st.sender);
    }
    const move = tryDecode(() => decodeFunctionData({ abi: v3Abi, data }));
    if (move) {
      if (!st.v3.citizenNft && !st.v3.attesterNft) return deny("v3 moveTo is not enabled (PASSKEY_*_NFT_V3 unset)");
      if (!isV3Target(target, st.v3)) return deny("moveTo target is not the configured CitizenNFTv3 / AttesterNFTv3");
      if (!isAddressEqual(move.args[0], st.sender)) return deny("moveTo must move the identity to the sender Safe");
      if (value !== 0n) return deny("moveTo value must be 0");
      st.migration = true;
      st.legacyShapes = true;
      return PASS;
    }
    if (isAddressEqual(target, ADDRESSES.socialRecoveryModule)) {
      const d = tryDecode(() => decodeFunctionData({ abi: srmAbi, data }));
      if (d?.functionName !== "confirmRecovery") return deny("only confirmRecovery may be sent to the SRM through legacy.execute");
      if (value !== 0n) return deny("confirmRecovery value must be 0");
      st.migration = true;
      return PASS;
    }
  }
  // st.legacy is set: thirdweb-account calls are only accepted for the request's legacy.
  return recordEveryday(classifyEverydayCall(target, value, data, st.legacy as Hex), st);
}

function checkRecoveryOwners(newOwners: readonly Hex[], threshold: bigint): Check {
  if (newOwners.length !== 1 || threshold !== 1n) return deny("recovery must set exactly one new owner, threshold 1");
  return PASS;
}

function checkSrmCall(data: Hex, st: ScanState): Check {
  const d = tryDecode(() => decodeFunctionData({ abi: srmAbi, data }));
  if (!d) return deny("SocialRecoveryModule function not allowlisted");
  st.migration = true;
  switch (d.functionName) {
    case "addGuardianWithThreshold":
    case "revokeGuardianWithThreshold":
    case "changeThreshold":
    case "cancelRecovery":
      st.identityOnly = true;
      st.srm = true;
      st.guardianManagement = true;
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
  st.calls += 1;
  if (size(data) < 4) return deny("call without a function selector");

  if (st.miniApp) {
    if (!st.legacy) return checkMiniAppCall(to, 0n, data, st);
    // Legacy identity: only legacy.execute / executeBatch on the request's legacy, every inner call declared.
    if (!isAddressEqual(to, st.legacy)) return deny("with a legacy identity, mini-app calls must go through legacy.execute");
    const d = tryDecode(() => decodeFunctionData({ abi: legacyAccountAbi, data }));
    if (d?.functionName === "execute") {
      const r = checkMiniAppCall(d.args[0], d.args[1], d.args[2], st);
      if (!r.ok) return r;
    } else if (d?.functionName === "executeBatch") {
      const [targets, values, datas] = d.args;
      if (targets.length === 0 || targets.length !== values.length || targets.length !== datas.length) {
        return deny("executeBatch array length mismatch");
      }
      for (let i = 0; i < datas.length; i++) {
        const r = checkMiniAppCall(targets[i], values[i], datas[i], st);
        if (!r.ok) return r;
      }
    } else {
      return deny("in miniapp mode only legacy.execute / executeBatch may reach the legacy account");
    }
    st.executeNeedsAdmin = true;
    return PASS;
  }

  if (isAddressEqual(to, ADDRESSES.socialRecoveryModule)) return checkSrmCall(data, st);

  if (isAddressEqual(to, ADDRESSES.signerFactory)) {
    const d = tryDecode(() => decodeFunctionData({ abi: signerFactoryAbi, data }));
    if (!d) return deny("SafeWebAuthnSignerFactory function not allowlisted");
    if (st.ecdsa) return deny("an expert-path Safe cannot create a passkey signer");
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
    st.migration = true;
    st.legacyShapes = true;
    return PASS;
  }

  const d = tryDecode(() => decodeFunctionData({ abi: legacyAccountAbi, data }));
  if (!d) {
    // Everyday action called by the Safe itself: identity = the Safe.
    const v = classifyEverydayCall(to, 0n, data, st.sender);
    if (!v.ok) return v;
    if (st.legacy) return deny("with a legacy identity, citizen actions must go through legacy.execute");
    st.directEveryday = true;
    return recordEveryday(v, st);
  }
  if (!st.legacy || !isAddressEqual(to, st.legacy)) {
    return deny("thirdweb account call must target the request's legacy account");
  }
  st.identityOnly = true;
  st.legacyShapes = true;

  if (d.functionName === "setPermissionsForSigner") {
    st.migration = true;
    const [req, signature] = d.args;
    if (req.isAdmin === 2) {
      const r = checkDetachRequest(req, st);
      if (!r.ok) return r;
      st.detaches.push({ req, signature });
      return PASS;
    }
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

/** Safe7579.execute root op: every execution a plain call with value 0, never to the sender itself. */
function check7579CallData(executions: ReadonlyArray<{ target: Hex; value: bigint; data: Hex }>, st: ScanState): Check {
  for (let i = 0; i < executions.length; i++) {
    const e = executions[i];
    if (e.value !== 0n) return deny("7579 execution value must be 0");
    if (isAddressEqual(e.target, st.sender)) return deny("a 7579 execution may not target the sender Safe itself");
    st.index = i;
    const r = checkAllowedCall(e.target, e.data, st);
    if (!r.ok) return r;
  }
  return PASS;
}

function checkCallData(callData: Hex, st: ScanState): Check {
  const exec7579 = decodeSafe7579Execute(callData);
  if (exec7579) {
    st.layout = "7579";
    return check7579CallData(exec7579.executions, st);
  }
  const outer = tryDecode(() => decodeFunctionData({ abi: safe4337Abi, data: callData }));
  if (!outer) {
    return deny("callData is not Safe4337Module.executeUserOp[WithErrorString] nor Safe7579.execute (single / batch, default execType)");
  }
  st.layout = "4337";
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

/** The sender proof the request names: the passkey key or the expert path's ECDSA owner. */
export type SenderProof = { kind: "passkey"; x: Hex; y: Hex } | { kind: "ecdsa"; owner: Hex };

const PROOF_QUANTITY = /^0x[0-9a-fA-F]{1,64}$/;
/** Safe's owner-list sentinel; never a real owner. */
const SAFE_SENTINEL_OWNER: Hex = "0x0000000000000000000000000000000000000001";

/** Exactly one of (x and y) or `ecdsaOwner`; null for both, neither, half a key or a malformed value. */
export function senderProof(ctx: SponsorContext): SenderProof | null {
  const hasKey = ctx.x !== undefined || ctx.y !== undefined;
  if (ctx.ecdsaOwner !== undefined) {
    if (hasKey) return null;
    const owner = ctx.ecdsaOwner;
    if (typeof owner !== "string" || !isAddress(owner, { strict: false })) return null;
    if (BigInt(owner) === 0n || isAddressEqual(owner, SAFE_SENTINEL_OWNER)) return null;
    return { kind: "ecdsa", owner };
  }
  if (typeof ctx.x !== "string" || typeof ctx.y !== "string") return null;
  if (!PROOF_QUANTITY.test(ctx.x) || !PROOF_QUANTITY.test(ctx.y)) return null;
  return { kind: "passkey", x: ctx.x, y: ctx.y };
}

/** For callers past the top of evaluateSponsorPolicy, which already refused an invalid proof. */
function proofOf(ctx: SponsorContext): SenderProof {
  const p = senderProof(ctx);
  if (!p) throw new Error("sponsor context without a valid sender proof");
  return p;
}

/** Deploy ops: the factory call must be EXACTLY the sovereign Safe for the request's proof. */
function checkFactory(op: SponsorUserOp, proof: SenderProof): Check {
  const hasFactoryData = op.factoryData !== undefined && size(op.factoryData) > 0;
  if (!op.factory) return hasFactoryData ? deny("factoryData without factory") : PASS;
  if (!isAddressEqual(op.factory, ADDRESSES.safeProxyFactory)) return deny("factory is not SafeProxyFactory 1.4.1");
  const factoryData = (op.factoryData ?? "0x").toLowerCase();
  if (proof.kind === "ecdsa") {
    if (factoryData !== ecdsaSafeFactoryData(proof.owner).toLowerCase()) {
      return deny("factoryData is not the expert Safe deployment for ecdsaOwner");
    }
    if (!isAddressEqual(op.sender, predictEcdsaSafeAddress(proof.owner))) {
      return deny("sender is not the predicted expert Safe for ecdsaOwner");
    }
    return PASS;
  }
  const key = { x: proof.x, y: proof.y };
  if (factoryData !== safeFactoryData(key).toLowerCase()) {
    return deny("factoryData is not the passkey Safe deployment for (x, y)");
  }
  if (!isAddressEqual(op.sender, predictSafeAddress(key))) return deny("sender is not the predicted passkey Safe for (x, y)");
  return PASS;
}

export type GasCaps = { readonly [K in keyof typeof CAPS]: bigint };

/** Gas / fee caps; `caps` defaults to CAPS (device-session modes pass their own). */
export function checkGas(op: SponsorUserOp, caps: GasCaps = CAPS): Check {
  for (const key of Object.keys(CAPS) as Array<keyof typeof CAPS>) {
    const cap = caps[key];
    if (typeof cap !== "bigint") return deny(`${key} has no cap`); // fail closed on a malformed caps table
    if (op[key] > cap) return deny(`${key} over cap`);
  }
  if (op.maxPriorityFeePerGas > op.maxFeePerGas) return deny("maxPriorityFeePerGas exceeds maxFeePerGas");
  return PASS;
}

export async function read<T>(fn: () => Promise<T>): Promise<T> {
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

export const isLegacyProxyCode = (code: Hex | undefined) =>
  (code ?? "0x").toLowerCase() === LEGACY_ACCOUNT_PROXY_CODE.toLowerCase();
const hasNoCode = (code: Hex | undefined) => !code || code === "0x";

/** citizen(a) := CitizenNFTv2.hasCitizenNFT(a) OR (v3 configured AND v3.hasCitizenNFT(a)). */
export async function isCitizen(account: Hex, v3: V3Config, chain: ChainReader): Promise<boolean> {
  if (await read(() => chain.hasCitizenNFT(CITIZEN_NFT, account))) return true;
  const citizenV3 = v3.citizenNft;
  if (!citizenV3) return false;
  return read(() => chain.hasCitizenNFT(citizenV3, account));
}

/** Safe module-list sentinel (start / end of the linked list). */
const SAFE_MODULES_SENTINEL: Hex = "0x0000000000000000000000000000000000000001";

/**
 * The deployed Safe has the sovereign passkey-Safe shape; on success also yields its single
 * owner and its layout:
 *  - "4337": fallback handler Safe4337Module, Safe4337Module + SRM enabled (as deployed);
 *  - "7579": fallback handler Safe7579, Safe7579 + SRM enabled, Safe4337Module NOT enabled,
 *    and the enabled modules are exactly {Safe7579, SRM} (one page, next == SENTINEL).
 */
async function deployedSafeShape(
  safe: Hex,
  chain: ChainReader,
): Promise<{ ok: true; owner: Hex; layout: SafeLayout } | { ok: false; reason: string }> {
  const code = await read(() => chain.getCode(safe));
  if ((code ?? "0x").toLowerCase() !== SAFE_PROXY_RUNTIME_CODE.toLowerCase()) {
    return deny("sender is not a passkey Safe (not a SafeProxy 1.4.1)");
  }
  const [singleton, handler, moduleOn, srmOn, owners] = await Promise.all([
    read(() => chain.getStorageAt(safe, SLOT_0)),
    read(() => chain.getStorageAt(safe, FALLBACK_HANDLER_SLOT)),
    read(() => chain.isModuleEnabled(safe, PASSKEY_SAFE.safe4337Module)),
    read(() => chain.isModuleEnabled(safe, PASSKEY_SAFE.socialRecoveryModule)),
    read(() => chain.getOwners(safe)),
  ]);
  if (!wordIsAddress(singleton, PASSKEY_SAFE.singletonL2)) return deny("sender singleton is not Safe L2 1.4.1");
  let layout: SafeLayout;
  if (wordIsAddress(handler, PASSKEY_SAFE.safe4337Module)) {
    if (moduleOn !== true) return deny("Safe4337Module is not an enabled module of the sender");
    layout = "4337";
  } else if (wordIsAddress(handler, SAFE7579)) {
    if (moduleOn !== false) return deny("a Safe7579 sender must not have Safe4337Module enabled");
    const [adapterOn, page] = await Promise.all([
      read(() => chain.isModuleEnabled(safe, SAFE7579)),
      read(() => chain.getModulesPaginated(safe)),
    ]);
    if (adapterOn !== true) return deny("Safe7579 is not an enabled module of the sender");
    const expected = [SAFE7579, PASSKEY_SAFE.socialRecoveryModule];
    const exact =
      isAddressEqual(page.next, SAFE_MODULES_SENTINEL) &&
      page.modules.length === expected.length &&
      expected.every((m) => page.modules.filter((x) => isAddressEqual(x, m)).length === 1);
    if (!exact) return deny("a Safe7579 sender must have exactly the modules Safe7579 and SocialRecoveryModule");
    layout = "7579";
  } else {
    return deny("sender fallback handler is not Safe4337Module or Safe7579");
  }
  if (srmOn !== true) return deny("SocialRecoveryModule is not an enabled module of the sender");
  if (owners.length !== 1) return deny("sender must have exactly one owner");
  return { ok: true, owner: owners[0], layout };
}

/**
 * A deployed sovereign passkey Safe: SafeProxy 1.4.1 runtime, singleton Safe L2 1.4.1,
 * fallback handler + module Safe4337Module (or, migrated, Safe7579 with Safe4337Module
 * disabled and modules exactly {Safe7579, SRM}), SocialRecoveryModule enabled,
 * exactly one owner. Says nothing about WHICH key owns it.
 */
export async function checkDeployedSafeShape(safe: Hex, chain: ChainReader): Promise<Check> {
  const shape = await deployedSafeShape(safe, chain);
  return shape.ok ? PASS : shape;
}

/** EIP-7702 delegation designator: 0xef0100 ++ 20-byte delegate (23 bytes). */
const EIP7702_DESIGNATOR = /^0xef0100[0-9a-fA-F]{40}$/;

/** The expert owner is a plain key: no code, or only an EIP-7702 designator (still ECDSA-signing). */
async function checkEcdsaOwnerIsKey(owner: Hex, chain: ChainReader): Promise<Check> {
  const code = await read(() => chain.getCode(owner));
  if (hasNoCode(code) || EIP7702_DESIGNATOR.test(code as string)) return PASS;
  return deny("ecdsaOwner is a contract, not a plain key");
}

/** Deployed expert Safe: the sovereign 4337 shape AND getOwners() == [ecdsaOwner], a plain key. */
async function checkDeployedEcdsaSafe(sender: Hex, owner: Hex, layout: SafeLayout, chain: ChainReader): Promise<Check> {
  if (layout !== "4337") return deny("an expert-path Safe only has the Safe4337Module layout");
  const shape = await deployedSafeShape(sender, chain);
  if (!shape.ok) return shape;
  if (shape.layout !== "4337") return deny("an expert-path Safe only has the Safe4337Module layout");
  if (!isAddressEqual(shape.owner, owner)) return deny("sender owner is not ecdsaOwner");
  return checkEcdsaOwnerIsKey(owner, chain);
}

/** Deployed sender: prove it is a passkey Safe whose single owner is bound to (x, y), in the callData's layout. */
export async function checkDeployedPasskeySafe(
  sender: Hex,
  key: { x: Hex; y: Hex },
  layout: SafeLayout,
  chain: ChainReader,
): Promise<Check> {
  const shape = await deployedSafeShape(sender, chain);
  if (!shape.ok) return shape;
  if (shape.layout !== layout) {
    return deny(`callData layout ${layout} does not match the sender's on-chain layout ${shape.layout}`);
  }
  const owner = shape.owner;
  const x = BigInt(key.x);
  const y = BigInt(key.y);

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

async function checkSender(op: SponsorUserOp, ctx: SponsorContext, st: ScanState, chain: ChainReader): Promise<Check> {
  const proof = proofOf(ctx);
  const layout = st.layout;
  if (!layout) return deny("callData layout unknown");
  // A freshly deployed Safe is always the Safe4337Module layout (checkFactory pins its setup).
  if (op.factory && layout !== "4337") return deny("a deploy op must use the Safe4337Module layout");
  if (proof.kind === "ecdsa") {
    // Deploy ops were proven structurally (checkFactory); the owner must still be a plain key.
    return op.factory ? checkEcdsaOwnerIsKey(proof.owner, chain) : checkDeployedEcdsaSafe(op.sender, proof.owner, layout, chain);
  }
  // Deploy ops were proven structurally (checkFactory).
  return op.factory ? PASS : checkDeployedPasskeySafe(op.sender, proof, layout, chain);
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
  if (st.detaches.length > 0) return evaluateDetachMode(op, ctx, legacy, st, chain);
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

  const sender = await checkSender(op, ctx, st, chain);
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
  const polls = await checkPolls(st, ctx, chain);
  if (!polls.ok) return polls;
  const orgSafes = await checkOrgSafes(st, chain);
  if (!orgSafes.ok) return orgSafes;
  if (st.everyday && !st.migration) return { ok: true, mode: "everyday", budgetKey: legacy, tier: "citizen" };
  return { ok: true, mode: "legacy", budgetKey: legacy };
}

/** Mode E: remove the thirdweb admin EOA, leaving the passkey Safe (with >= 2 guardians, threshold >= 2) in control. */
async function evaluateDetachMode(
  op: SponsorUserOp,
  ctx: SponsorContext,
  legacy: Hex,
  st: ScanState,
  chain: ChainReader,
): Promise<PolicyResult> {
  // Structural: exactly one call, the detach itself (no batch, no deploy, nothing riding along).
  if (st.calls !== 1 || st.detaches.length !== 1) return deny("a detach must be the only call of the op");
  if (op.factory) return deny("a detach needs an already deployed passkey Safe");
  const { req, signature } = st.detaches[0];

  const [legacyCode, citizen] = await Promise.all([read(() => chain.getCode(legacy)), isCitizen(legacy, ctx.v3 ?? {}, chain)]);
  if (!isLegacyProxyCode(legacyCode)) return deny(`${legacy} is not a legacy thirdweb account`);
  if (!citizen) return deny("legacy account holds no CitizenNFT");

  const sender = await checkSender(op, ctx, st, chain);
  if (!sender.ok) return sender;

  const [senderIsAdmin, signerIsAdmin, guardians, threshold] = await Promise.all([
    read(() => chain.isAdmin(legacy, op.sender)),
    read(() => chain.isAdmin(legacy, req.signer)),
    read(() => chain.guardiansCount(op.sender)),
    read(() => chain.srmThreshold(op.sender)),
  ]);
  // The sender stays admin after the removal, so at least one admin (the Safe) remains.
  if (senderIsAdmin !== true) return deny(`sender is not an admin of ${legacy}`);
  if (signerIsAdmin !== true) return deny("the admin to remove is not an admin of the legacy account");
  if (guardians < DETACH_MIN_GUARDIANS) return deny("detach needs at least 2 guardians on the passkey Safe");
  if (threshold < DETACH_MIN_THRESHOLD) return deny("detach needs a guardian threshold of at least 2");

  const v = await read(() => chain.verifySignerPermissionRequest(legacy, req, signature));
  if (!v || v.success !== true) return deny("detach signature is not a valid admin signature");
  const recoveredIsAdmin = await read(() => chain.isAdmin(legacy, v.signer));
  if (!recoveredIsAdmin) return deny("detach signature is not a valid admin signature");
  return { ok: true, mode: "detach", budgetKey: legacy };
}

/** Every org-Safe target not created in this batch is a deployed Safe L2 1.4.1 proxy. */
async function checkOrgSafes(st: ScanState, chain: ChainReader): Promise<Check> {
  for (const safe of st.orgSafes) {
    const code = await read(() => chain.getCode(safe));
    if ((code ?? "0x").toLowerCase() !== SAFE_PROXY_RUNTIME_CODE.toLowerCase()) {
      return deny("org Safe target is not a SafeProxy 1.4.1");
    }
    const singleton = await read(() => chain.getStorageAt(safe, SLOT_0));
    if (!wordIsAddress(singleton, PASSKEY_SAFE.singletonL2)) return deny("org Safe singleton is not Safe L2 1.4.1");
  }
  return PASS;
}

/** Every Poll.publishMessage target is MACI.polls(ctx.pollId). */
async function checkPolls(st: ScanState, ctx: SponsorContext, chain: ChainReader): Promise<Check> {
  if (st.polls.length === 0) return PASS;
  const pollId = ctx.pollId;
  if (pollId === undefined) return deny("a Poll vote needs the request's pollId");
  const poll = await read(() => chain.maciPoll(pollId));
  if (st.polls.some((p) => !isAddressEqual(p, poll))) return deny("vote target is not the MACI poll for pollId");
  return PASS;
}

/** Everyday actions called directly by the sender Safe (identity = the Safe). */
async function evaluateSafeEveryday(
  op: SponsorUserOp,
  ctx: SponsorContext,
  st: ScanState,
  chain: ChainReader,
): Promise<PolicyResult> {
  const sender = await checkSender(op, ctx, st, chain);
  if (!sender.ok) return sender;
  const citizen = await isCitizen(op.sender, ctx.v3 ?? {}, chain);
  if (!citizen) {
    // Guest: only onboarding-tier everyday calls plus (optionally) guardian management.
    if (st.legacyShapes || !st.onboardingOnly) {
      return deny("this action requires a citizen identity (the sender Safe holds no CitizenNFT)");
    }
    if (st.confirms && !st.guardianManagement) {
      return deny("a guest op may carry confirmRecovery only together with guardian management");
    }
    return { ok: true, mode: "everyday", budgetKey: op.sender, tier: "onboarding", guest: true };
  }
  const polls = await checkPolls(st, ctx, chain);
  if (!polls.ok) return polls;
  const orgSafes = await checkOrgSafes(st, chain);
  if (!orgSafes.ok) return orgSafes;
  if (st.migration) return { ok: true, mode: "safe", budgetKey: op.sender };
  return { ok: true, mode: "everyday", budgetKey: op.sender, tier: "citizen" };
}

/** Mode C: help recover `wallet`, a citizen identity (or, as a guest, a sovereign passkey Safe) with guardians. */
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

  const sender = await checkSender(op, ctx, st, chain);
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
  // Not a citizen: still recoverable as a guest when the wallet is a sovereign passkey Safe.
  let guest = false;
  if (!walletIsCitizen) {
    const shape = await checkDeployedSafeShape(wallet, chain);
    if (!shape.ok) return deny(`the wallet being recovered is not a citizen identity nor a sovereign Safe (${shape.reason})`);
    guest = true;
  }
  const guardians = await read(() => chain.guardiansCount(wallet));
  if (guardians <= 0n) return deny("the wallet being recovered has no guardians");

  if (st.ownerBound || st.finalize) {
    // The submitter's own signer: the expert path's ECDSA owner itself, or the WebAuthn signer
    // contract for (x, y) - read only on the passkey branch.
    const proof = proofOf(ctx);
    const signer =
      proof.kind === "ecdsa"
        ? proof.owner
        : await read(() => chain.getWebAuthnSigner(BigInt(proof.x), BigInt(proof.y), WEBAUTHN_VERIFIERS));
    if (st.ownerBound && !recoveryOwnersAre(op.callData, wallet, signer)) {
      return deny(
        proof.kind === "ecdsa"
          ? "recovery must hand the wallet to the submitter's own key (ecdsaOwner)"
          : "recovery must hand the wallet to the submitter's own passkey signer",
      );
    }
    if (st.finalize) {
      const rq = await read(() => chain.getRecoveryRequest(wallet));
      if (rq.executeAfter === 0n) return deny("the wallet has no pending recovery");
      if (rq.executeAfter > BigInt(ctx.nowSeconds)) return deny("the recovery period is still pending");
      if (rq.newOwners.length !== 1 || !isAddressEqual(rq.newOwners[0], signer)) {
        return deny(
          proof.kind === "ecdsa"
            ? "the pending recovery does not hand the wallet to the submitter's own key (ecdsaOwner)"
            : "the pending recovery does not hand the wallet to the submitter's passkey signer",
        );
      }
    }
  }
  if (st.confirms) {
    const guardian = await read(() => chain.isGuardian(wallet, op.sender));
    if (!guardian) return deny("sender is not a guardian of the wallet");
  }
  // A guest wallet's recovery is charged to the SENDER (see the header, mode C): a stranger's
  // recovery op must never spend the budget the wallet needs for its own cancelRecovery.
  return guest ? { ok: true, mode: "recovery", budgetKey: op.sender, guest: true } : { ok: true, mode: "recovery", budgetKey: wallet };
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

/** Visits the plain calls of an (already structurally validated) callData, in either layout. */
function forEachCall(callData: Hex, visit: (to: Hex, data: Hex) => void): void {
  const exec7579 = decodeSafe7579Execute(callData);
  if (exec7579) {
    for (const e of exec7579.executions) visit(e.target, e.data);
    return;
  }
  const outer = decodeFunctionData({ abi: safe4337Abi, data: callData });
  const [to, , data, operation] = outer.args;
  if (operation === 0) return visit(to, data);
  const ms = decodeFunctionData({ abi: multiSendAbi, data });
  for (const tx of decodeMultiSendPacked(ms.args[0]) ?? []) visit(tx.to, tx.data);
}

/** Mode F: every call was declared (structural pass); bind the sender to the identity. */
async function evaluateMiniAppMode(
  op: SponsorUserOp,
  ctx: SponsorContext,
  app: { id: string; rules: CallRule[] },
  st: ScanState,
  chain: ChainReader,
): Promise<PolicyResult> {
  if (st.calls === 0) return deny("a mini-app op needs at least one call");
  const legacy = ctx.legacy;
  if (legacy) {
    const code = await read(() => chain.getCode(legacy));
    if (!isLegacyProxyCode(code)) return deny(`${legacy} is not a legacy thirdweb account`);
    const sender = await checkSender(op, ctx, st, chain);
    if (!sender.ok) return sender;
    const isAdmin = await read(() => chain.isAdmin(legacy, op.sender));
    if (isAdmin !== true) return deny(`sender is not an admin of ${legacy}`);
    return { ok: true, mode: "miniapp", budgetKey: legacy, miniAppId: app.id };
  }
  const sender = await checkSender(op, ctx, st, chain);
  if (!sender.ok) return sender;
  return { ok: true, mode: "miniapp", budgetKey: op.sender, miniAppId: app.id };
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
  const proof = senderProof(ctx);
  if (!proof) return deny("the request must name exactly one sender proof: (x, y) or ecdsaOwner");
  if (proof.kind === "ecdsa" && ctx.legacy) return deny("an expert-path Safe cannot drive a legacy account");
  const factory = checkFactory(op, proof);
  if (!factory.ok) return factory;
  // Device sessions: the SmartSession nonce key, a `deviceSession` request, or a root op touching
  // the Safe itself / SmartSession is decided there and ONLY there (its own gas caps, structural
  // checks before any chain read). null = not a device-session shape.
  const session = await evaluateSessionKeyModes(op, ctx, chain);
  if (session) return session;
  const gas = checkGas(op);
  if (!gas.ok) return gas;
  // Root ops only (nonce key 0 = the Safe owner); the session key was handled above.
  if (nonceKeyOf(op.nonce) !== 0n) return deny("nonce key not allowed (only key 0, the root / passkey path)");
  const st: ScanState = {
    sender: op.sender,
    x: proof.kind === "passkey" ? BigInt(proof.x) : 0n,
    y: proof.kind === "passkey" ? BigInt(proof.y) : 0n,
    ecdsa: proof.kind === "ecdsa",
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
    everyday: false,
    directEveryday: false,
    onboardingOnly: true,
    migration: false,
    legacyShapes: false,
    guardianManagement: false,
    polls: [],
    orgSafes: [],
    createdSafes: [],
    calls: 0,
    detaches: [],
    miniApp: ctx.miniApp,
  };
  const structural = checkCallData(op.callData, st);
  if (!structural.ok) return structural;
  // Mode F is decided by the request alone: no other mode is ever tried for it.
  if (ctx.miniApp) return evaluateMiniAppMode(op, ctx, ctx.miniApp, st, chain);
  if (st.identityOnly && st.recoveryOnly) return deny("identity calls and recovery calls cannot be mixed in one op");
  if (st.detaches.length > 0 && !ctx.legacy) return deny("a detach must name its legacy account");

  // ---- mode ----
  if (st.recoveryOnly) {
    if (ctx.legacy) return deny("recovery ops must not name a legacy account");
    return evaluateRecoveryMode(op, ctx, st, chain);
  }
  if (ctx.legacy) return evaluateLegacyMode(op, ctx, ctx.legacy, st, chain);
  if (st.directEveryday) return evaluateSafeEveryday(op, ctx, st, chain);

  // No legacy: identity = the sender Safe itself (mode B), or - for an op that
  // is only confirmRecovery calls - a guardian helping a citizen (mode C).
  if (await isCitizen(op.sender, ctx.v3 ?? {}, chain)) {
    const sender = await checkSender(op, ctx, st, chain);
    if (!sender.ok) return sender;
    return { ok: true, mode: "safe", budgetKey: op.sender };
  }
  if (!st.identityOnly && st.confirms) return evaluateRecoveryMode(op, ctx, st, chain);
  // Guest (non-citizen Safe): its own guardian management, a confirmRecovery may ride along.
  if (st.guardianManagement && !st.legacyShapes && !st.everyday) {
    const sender = await checkSender(op, ctx, st, chain);
    if (!sender.ok) return sender;
    return { ok: true, mode: "safe", budgetKey: op.sender, guest: true };
  }
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

/**
 * The full request body: { chainId, userOp, (x, y) | ecdsaOwner, legacy?, recoveryLegacy?, pollId?, miniApp? }.
 * `miniApp` is a mini app's uuid (returned lowercased); anything else is refused.
 * Exactly one sender proof: the passkey key (both x and y) or the expert path's `ecdsaOwner`.
 * Throws on malformed input, on both proofs and on neither (the route answers 400).
 */
export function parseSponsorRequest(input: unknown): {
  chainId: unknown;
  userOp: SponsorUserOp;
  x?: Hex;
  y?: Hex;
  ecdsaOwner?: Hex;
  legacy?: Hex;
  recoveryLegacy?: Hex;
  pollId?: bigint;
  miniApp?: string;
  deviceSession?: { signer: Hex; validUntil: number };
} {
  if (!input || typeof input !== "object") throw new Error("body must be an object");
  const o = input as Record<string, unknown>;
  const present = (key: string) => o[key] !== undefined && o[key] !== null;
  const hasKey = present("x") || present("y");
  const hasOwner = present("ecdsaOwner");
  if (hasKey && hasOwner) throw new Error("name either (x, y) or ecdsaOwner, not both");
  if (!hasKey && !hasOwner) throw new Error("a sender proof is required: (x, y) or ecdsaOwner");
  const proof = hasOwner ? { ecdsaOwner: address(o, "ecdsaOwner") } : { x: word32(o, "x"), y: word32(o, "y") };
  return {
    chainId: o.chainId,
    userOp: parseSponsorUserOp(o.userOp),
    ...proof,
    legacy: optionalAddress(o, "legacy"),
    recoveryLegacy: optionalAddress(o, "recoveryLegacy"),
    pollId: o.pollId === undefined || o.pollId === null ? undefined : quantity(o, "pollId", (1n << 256n) - 1n),
    ...(present("miniApp") ? { miniApp: miniAppId(o.miniApp) } : {}),
    ...(present("deviceSession") ? { deviceSession: deviceSessionField(o.deviceSession) } : {}),
  };
}

/** `deviceSession: { signer: address, validUntil: unix seconds (safe integer) }`; the bounds are the policy's job. */
function deviceSessionField(v: unknown): { signer: Hex; validUntil: number } {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("deviceSession must be an object");
  const o = v as Record<string, unknown>;
  const validUntil = o.validUntil;
  if (typeof validUntil !== "number" || !Number.isSafeInteger(validUntil) || validUntil <= 0) {
    throw new Error("deviceSession.validUntil must be a positive integer (unix seconds)");
  }
  return { signer: address(o, "signer"), validUntil };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function miniAppId(v: unknown): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new Error("miniApp must be a mini app id (uuid)");
  return v.toLowerCase();
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
