/**
 * Device-session (Safe7579 + SmartSession) calldata builders — server copy.
 *
 * Pure viem encoders, no I/O. This mirrors apps/expo/lib/passkey/session-keys/builders.ts
 * (Metro cannot import server code). Both copies are pinned byte for byte by the golden
 * vector contracts/passkey-accounts/test/fixtures/session-keys-vector.json, written by
 * SessionKeys.t.sol::test_writeSessionKeysVector on a Gnosis fork. The sponsor policy
 * rebuilds these bytes and compares them byte-equal with what the app sent.
 *
 * Scope (owner decisions 2026-11-21): MINT ONLY. Two sessions, personalMint and the Röbel
 * groupMint; no send session.
 */
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getAddress,
  keccak256,
  numberToHex,
  pad,
  parseAbi,
  parseAbiParameters,
  sliceHex,
  stringToHex,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";

// ---------------------------------------------------------------------------
// Addresses (Gnosis, chain 100; verified in the spec)
// ---------------------------------------------------------------------------

export const SAFE7579: Address = "0x7579EE8307284F293B1927136486880611F20002";
export const SMART_SESSIONS: Address = "0x00000000002B0eCfbD0496EE71e01257dA0E37DE";
export const OWNABLE_VALIDATOR: Address = "0x000000000013fdB5234E4E3162a810F54d9f7E98";
export const UNI_ACTION_POLICY: Address = "0x0000000000714Cf48FcF88A0bFBa70d313415032";
export const TIME_FRAME_POLICY: Address = "0x0000000000D30f611fA3bf652ac6879428586930";
export const MULTI_SEND_CALL_ONLY: Address = "0x9641d764fc13c8B624c04430C7356C1C7C8102e2";
export const SAFE_4337_MODULE: Address = "0x75cf11467937ce3f2f357ce24ffc3dbf8fd5c226";
export const CIRCLES_HUB: Address = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
export const ROEBEL_GROUP: Address = "0xAc2CeCdBead594F97358a0d3132454f24F3E470c";
export const SENTINEL: Address = "0x0000000000000000000000000000000000000001";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SESSION_DAYS = 30;
export const SESSION_RENEW_BEFORE_SEC = 259_200;
/** Server bound: now < validUntil <= now + DEVICE_SESSION_MAX_SEC (30 days + 10 min slack). */
export const DEVICE_SESSION_MAX_SEC = 30 * 86_400 + 600;

/** EntryPoint v0.7 nonce key that routes validation to SmartSession: uint192(bytes24(bytes20(SMART_SESSIONS))). */
export const SESSION_NONCE_KEY: bigint = BigInt(SMART_SESSIONS) << 32n;

export const MODULE_TYPE_VALIDATOR = 1n;
/** SmartSession signature modes. */
export const MODE_USE = 0x00;
export const MODE_UNSAFE_ENABLE = 0x02;
/** ERC-7579 execution modes (callType in the first byte, everything else 0). */
export const EXEC_SINGLE: Hex = pad("0x00", { size: 32 });
export const EXEC_BATCH: Hex = pad("0x01", { size: 32, dir: "right" });

/** legacy (thirdweb account) execute(address,uint256,bytes) selector. */
export const LEGACY_EXECUTE_SELECTOR: Hex = "0xb61d27f6";

export const SESSION_SALTS = {
  personalMint: keccak256(stringToHex("roebel/muenzen/personalMint")),
  groupMint: keccak256(stringToHex("roebel/muenzen/groupMint")),
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MintSessionKind = "personalMint" | "groupMint";
export type DeviceSessionParams = { legacy: Address; signer: Address; validUntil: number };
export type PermissionIds = Record<MintSessionKind, Hex>;

export type PolicyData = { policy: Address; initData: Hex };
export type SessionStruct = {
  sessionValidator: Address;
  sessionValidatorInitData: Hex;
  salt: Hex;
  userOpPolicies: PolicyData[];
  erc7739Policies: {
    allowedERC7739Content: { appDomainSeparator: Hex; contentNames: string[] }[];
    erc1271Policies: PolicyData[];
  };
  actions: { actionTargetSelector: Hex; actionTarget: Address; actionPolicies: PolicyData[] }[];
  permitERC4337Paymaster: boolean;
};

type ParamRule = {
  condition: number;
  offset: bigint;
  isLimited: boolean;
  ref: Hex;
  usage: { limit: bigint; used: bigint };
};

export type Call7579 = { to: Address; value?: bigint; data: Hex };

// ---------------------------------------------------------------------------
// ABIs (struct order is ABI-relevant; copied from SessionInterfaces.sol)
// ---------------------------------------------------------------------------

const POLICY_DATA = "(address policy, bytes initData)";
const SESSION_TUPLE =
  `(address sessionValidator, bytes sessionValidatorInitData, bytes32 salt, ${POLICY_DATA}[] userOpPolicies, ` +
  `((bytes32 appDomainSeparator, string[] contentNames)[] allowedERC7739Content, ${POLICY_DATA}[] erc1271Policies) erc7739Policies, ` +
  `(bytes4 actionTargetSelector, address actionTarget, ${POLICY_DATA}[] actionPolicies)[] actions, bool permitERC4337Paymaster)`;
const SESSION_ARRAY_PARAMS = parseAbiParameters(`${SESSION_TUPLE}[]`);

const ACTION_CONFIG_PARAMS = parseAbiParameters(
  "(uint256 valueLimitPerUse, (uint256 length, (uint8 condition, uint64 offset, bool isLimited, bytes32 ref, (uint256 limit, uint256 used) usage)[16] rules) paramRules)",
);

const EXECUTIONS_PARAMS = parseAbiParameters("(address target, uint256 value, bytes callData)[]");

export const safe7579Abi = parseAbi([
  "function execute(bytes32 mode, bytes executionCalldata)",
  "function installModule(uint256 moduleType, address module, bytes initData)",
  "function uninstallModule(uint256 moduleType, address module, bytes deInitData)",
  "struct ModuleInit { address module; bytes initData; }",
  "struct RegistryInit { address registry; address[] attesters; uint8 threshold; }",
  "function initializeAccount(ModuleInit[] validators, ModuleInit[] executors, ModuleInit[] fallbacks, ModuleInit[] hooks, RegistryInit registryInit)",
]);

const safeAdminAbi = parseAbi([
  "function enableModule(address module)",
  "function disableModule(address prevModule, address module)",
  "function setFallbackHandler(address handler)",
]);

const safe4337ModuleAbi = parseAbi([
  "function executeUserOp(address to, uint256 value, bytes data, uint8 operation)",
]);

const multiSendAbi = parseAbi(["function multiSend(bytes transactions)"]);

export const smartSessionAbi = parseAbi(["function removeSession(bytes32 permissionId)"]);

export const legacyAccountAbi = parseAbi([
  "function execute(address target, uint256 value, bytes data)",
  "function executeBatch(address[] targets, uint256[] values, bytes[] data)",
]);

export const circlesHubMintAbi = parseAbi([
  "function personalMint()",
  "function groupMint(address group, address[] collateralAvatars, uint256[] amounts, bytes data)",
]);

const PERSONAL_MINT_SELECTOR = toFunctionSelector("function personalMint()");
const GROUP_MINT_SELECTOR = toFunctionSelector(
  "function groupMint(address,address[],uint256[],bytes)",
);

// ---------------------------------------------------------------------------
// UniActionPolicy configs (exactly _mintConfig / _groupMintConfig of the fork test)
// ---------------------------------------------------------------------------
// Offsets count from the byte after legacy.execute's selector:
//   0x00 target | 0x20 value | 0x40 data offset | 0x60 data.length | 0x80 inner selector | 0x84 inner arg0

const EQUAL = 0;
const ZERO32: Hex = pad("0x00", { size: 32 });

function rule(offset: number, ref: Hex): ParamRule {
  return { condition: EQUAL, offset: BigInt(offset), isLimited: false, ref, usage: { limit: 0n, used: 0n } };
}

function word(v: bigint | Address): Hex {
  return typeof v === "bigint" ? numberToHex(v, { size: 32 }) : pad(v.toLowerCase() as Hex, { size: 32 });
}

/** First 32 bytes of `selector ++ abi.encode(arg0)`. */
function selWindow(selector: Hex, arg0: Address): Hex {
  return sliceHex(concatHex([selector, pad(arg0.toLowerCase() as Hex, { size: 32 })]), 0, 32);
}

function legacyRules(): ParamRule[] {
  return [rule(0x00, word(CIRCLES_HUB)), rule(0x20, ZERO32), rule(0x40, word(0x60n))];
}

function actionConfig(rules: ParamRule[]): Hex {
  const padded: ParamRule[] = [...rules];
  while (padded.length < 16) padded.push(rule(0, ZERO32));
  return encodeAbiParameters(ACTION_CONFIG_PARAMS, [
    {
      valueLimitPerUse: 0n,
      paramRules: { length: BigInt(rules.length), rules: padded as unknown as readonly ParamRule[] & { length: 16 } },
    },
  ] as never);
}

function mintActionConfig(): Hex {
  return actionConfig([
    ...legacyRules(),
    rule(0x60, word(4n)), // data = exactly personalMint()
    rule(0x80, pad(PERSONAL_MINT_SELECTOR, { size: 32, dir: "right" })),
  ]);
}

function groupMintActionConfig(): Hex {
  return actionConfig([
    ...legacyRules(),
    rule(0x80, selWindow(GROUP_MINT_SELECTOR, ROEBEL_GROUP)),
    rule(0x84, word(ROEBEL_GROUP)),
  ]);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function validatorInitData(signer: Address): Hex {
  return encodeAbiParameters(parseAbiParameters("uint256, address[]"), [1n, [getAddress(signer)]]);
}

function session(salt: Hex, cfg: Hex, p: DeviceSessionParams): SessionStruct {
  return {
    sessionValidator: OWNABLE_VALIDATOR,
    sessionValidatorInitData: validatorInitData(p.signer),
    salt,
    userOpPolicies: [
      { policy: TIME_FRAME_POLICY, initData: encodePacked(["uint48", "uint48"], [p.validUntil, 0]) },
    ],
    erc7739Policies: { allowedERC7739Content: [], erc1271Policies: [] },
    actions: [
      {
        actionTargetSelector: LEGACY_EXECUTE_SELECTOR,
        actionTarget: getAddress(p.legacy),
        actionPolicies: [{ policy: UNI_ACTION_POLICY, initData: cfg }],
      },
    ],
    permitERC4337Paymaster: true,
  };
}

/** The two mint-only sessions, in this order: [personalMint, groupMint]. */
export function mintSessions(p: DeviceSessionParams): SessionStruct[] {
  return [
    session(SESSION_SALTS.personalMint, mintActionConfig(), p),
    session(SESSION_SALTS.groupMint, groupMintActionConfig(), p),
  ];
}

/** permissionId = keccak256(abi.encode(sessionValidator, sessionValidatorInitData, salt)). */
export function permissionIdsOf(p: DeviceSessionParams): PermissionIds {
  const init = validatorInitData(p.signer);
  const pid = (salt: Hex) =>
    keccak256(encodeAbiParameters(parseAbiParameters("address, bytes, bytes32"), [OWNABLE_VALIDATOR, init, salt]));
  return { personalMint: pid(SESSION_SALTS.personalMint), groupMint: pid(SESSION_SALTS.groupMint) };
}

/** SmartSession onInstall data: 0x02 (UNSAFE_ENABLE) ++ abi.encode(Session[]). */
export function smartSessionInitData(p: DeviceSessionParams): Hex {
  return concatHex([
    numberToHex(MODE_UNSAFE_ENABLE, { size: 1 }),
    encodeAbiParameters(SESSION_ARRAY_PARAMS, [mintSessions(p)] as never),
  ]);
}

// ---------------------------------------------------------------------------
// Migration (Safe4337Module root op) and 7579 root ops
// ---------------------------------------------------------------------------

/**
 * `prevModule` for disableModule(prev, Safe4337Module) AFTER enableModule(Safe7579) in the same
 * batch: Safe enables at the head of the linked list, so if 4337 was first, Safe7579 precedes it.
 */
export function prev4337AfterEnable(modulesBefore: readonly Address[]): Address {
  const i = modulesBefore.findIndex((m) => m.toLowerCase() === SAFE_4337_MODULE.toLowerCase());
  if (i < 0) throw new Error("Safe4337Module not enabled on this Safe");
  return i === 0 ? SAFE7579 : getAddress(modulesBefore[i - 1]);
}

function multiSendTx(to: Address, data: Hex): Hex {
  return encodePacked(
    ["uint8", "address", "uint256", "uint256", "bytes"],
    [0, to, 0n, BigInt((data.length - 2) / 2), data],
  );
}

/**
 * Safe4337Module.executeUserOp(MultiSendCallOnly, 0, multiSend(txs), DELEGATECALL) with txs =
 * [enableModule(7579), setFallbackHandler(7579), initializeAccount([SmartSession, init], …, registry off),
 *  disableModule(prev4337, Safe4337Module)].
 */
export function migrationCallData(p: DeviceSessionParams & { safe: Address; prev4337: Address }): Hex {
  const safe = getAddress(p.safe);
  const txs = concatHex([
    multiSendTx(safe, encodeFunctionData({ abi: safeAdminAbi, functionName: "enableModule", args: [SAFE7579] })),
    multiSendTx(
      safe,
      encodeFunctionData({ abi: safeAdminAbi, functionName: "setFallbackHandler", args: [SAFE7579] }),
    ),
    multiSendTx(
      safe,
      encodeFunctionData({
        abi: safe7579Abi,
        functionName: "initializeAccount",
        args: [
          [{ module: SMART_SESSIONS, initData: smartSessionInitData(p) }],
          [],
          [],
          [],
          { registry: "0x0000000000000000000000000000000000000000", attesters: [], threshold: 0 },
        ],
      }),
    ),
    multiSendTx(
      safe,
      encodeFunctionData({
        abi: safeAdminAbi,
        functionName: "disableModule",
        args: [getAddress(p.prev4337), getAddress(SAFE_4337_MODULE)],
      }),
    ),
  ]);
  return encodeFunctionData({
    abi: safe4337ModuleAbi,
    functionName: "executeUserOp",
    args: [MULTI_SEND_CALL_ONLY, 0n, encodeFunctionData({ abi: multiSendAbi, functionName: "multiSend", args: [txs] }), 1],
  });
}

/**
 * Safe7579.execute: one call → EXEC_SINGLE (target ++ uint256 value ++ data), n calls →
 * EXEC_BATCH (abi.encode(Execution[])). Never emits callType 0xff (delegatecall).
 */
export function encode7579Execute(calls: readonly Call7579[]): Hex {
  if (calls.length === 0) throw new Error("encode7579Execute: no calls");
  if (calls.length === 1) {
    const c = calls[0];
    return encodeFunctionData({
      abi: safe7579Abi,
      functionName: "execute",
      args: [EXEC_SINGLE, encodePacked(["address", "uint256", "bytes"], [c.to, c.value ?? 0n, c.data])],
    });
  }
  const executions = calls.map((c) => ({ target: c.to, value: c.value ?? 0n, callData: c.data }));
  return encodeFunctionData({
    abi: safe7579Abi,
    functionName: "execute",
    args: [EXEC_BATCH, encodeAbiParameters(EXECUTIONS_PARAMS, [executions])],
  });
}

/**
 * Grant on a migrated Safe (7579 root op). replace=false: EXEC_SINGLE self.installModule(SmartSession, init).
 * replace=true (SmartSession already installed): EXEC_BATCH [self.uninstallModule(SmartSession,
 * abi.encode(SENTINEL, "")), self.installModule(SmartSession, init)].
 */
export function grantCallData(p: DeviceSessionParams & { safe: Address; replace: boolean }): Hex {
  const safe = getAddress(p.safe);
  const install = encodeFunctionData({
    abi: safe7579Abi,
    functionName: "installModule",
    args: [MODULE_TYPE_VALIDATOR, SMART_SESSIONS, smartSessionInitData(p)],
  });
  if (!p.replace) return encode7579Execute([{ to: safe, data: install }]);
  const uninstall = encodeFunctionData({
    abi: safe7579Abi,
    functionName: "uninstallModule",
    args: [
      MODULE_TYPE_VALIDATOR,
      SMART_SESSIONS,
      encodeAbiParameters(parseAbiParameters("address, bytes"), [SENTINEL, "0x"]),
    ],
  });
  return encode7579Execute([
    { to: safe, data: uninstall },
    { to: safe, data: install },
  ]);
}

/** Revoke = SmartSession.removeSession(pid) per pid (EXEC_SINGLE for one, EXEC_BATCH for more). */
export function revokeCallData(pids: readonly Hex[]): Hex {
  return encode7579Execute(
    pids.map((pid) => ({
      to: SMART_SESSIONS,
      data: encodeFunctionData({ abi: smartSessionAbi, functionName: "removeSession", args: [pid] }),
    })),
  );
}

// ---------------------------------------------------------------------------
// Claim calldata
// ---------------------------------------------------------------------------

export function personalMintData(): Hex {
  return encodeFunctionData({ abi: circlesHubMintAbi, functionName: "personalMint" });
}

/** Hub.groupMint(Röbel group, [legacy], [amount], ""). */
export function groupMintData(legacy: Address, amount: bigint): Hex {
  return encodeFunctionData({
    abi: circlesHubMintAbi,
    functionName: "groupMint",
    args: [ROEBEL_GROUP, [getAddress(legacy)], [amount], "0x"],
  });
}

/** Session-op callData: Safe7579.execute(EXEC_SINGLE, legacy ++ 0 ++ legacy.execute(Hub, 0, inner)). */
export function sessionClaimCallData(legacy: Address, innerHubData: Hex): Hex {
  return encode7579Execute([
    {
      to: getAddress(legacy),
      data: encodeFunctionData({
        abi: legacyAccountAbi,
        functionName: "execute",
        args: [CIRCLES_HUB, 0n, innerHubData],
      }),
    },
  ]);
}

/**
 * Kill-switch fallback (passkey root op on a migrated Safe):
 * Safe7579.execute(EXEC_SINGLE, legacy ++ 0 ++ legacy.executeBatch([Hub, Hub], [0, 0], [personalMint, groupMint])).
 */
export function rootClaimCallData(legacy: Address, groupMintAmount: bigint): Hex {
  const batch = encodeFunctionData({
    abi: legacyAccountAbi,
    functionName: "executeBatch",
    args: [
      [CIRCLES_HUB, CIRCLES_HUB],
      [0n, 0n],
      [personalMintData(), groupMintData(legacy, groupMintAmount)],
    ],
  });
  return encode7579Execute([{ to: getAddress(legacy), data: batch }]);
}

/** Session signature: 0x00 (USE) ++ permissionId ++ ECDSA(sessionKey, userOpHash) (65 bytes r‖s‖v). */
export function encodeSessionSignature(pid: Hex, ecdsa65: Hex): Hex {
  if ((pid.length - 2) / 2 !== 32) throw new Error("permissionId must be 32 bytes");
  if ((ecdsa65.length - 2) / 2 !== 65) throw new Error("session ECDSA signature must be 65 bytes");
  return concatHex([numberToHex(MODE_USE, { size: 1 }), pid, ecdsa65]);
}

// ---------------------------------------------------------------------------
// Device authorization of a session-op sponsor request (security review M-1)
// ---------------------------------------------------------------------------

/** Domain tag of the device-session sponsor authorization (v1). */
export const DEVICE_AUTH_TAG: Hex = keccak256(stringToHex("roebel/passkey-sponsor/device-session-op/v1"));
/** A device authorization is valid for at most this long (seconds after the server's now). */
export const DEVICE_AUTH_MAX_TTL_SEC = 300;

/**
 * What the device session key signs (EIP-191 personal message over these 32 raw bytes, i.e.
 * `signMessage({ message: { raw } })`) before the app asks the sponsor for a session-op voucher:
 *
 *   keccak256(abi.encode(bytes32 DEVICE_AUTH_TAG, uint256 chainId, bytes32 stableFieldsHash, uint256 expiresAt))
 *
 * stableFieldsHash = NetizenVerifyingPaymaster.hashStableFields(op) (voucher.ts `hashStableFields`):
 * sender, nonce, initCode, callData, accountGasLimits, preVerificationGas, gasFees and both
 * paymaster gas limits, i.e. every field the voucher covers. The EIP-191 prefix keeps this
 * signature structurally apart from the raw userOpHash signatures the same key makes for SmartSession.
 * Mirrored byte for byte by apps/expo/lib/passkey/session-keys/builders.ts.
 */
export function deviceSessionAuthHash(p: { chainId: number; stableFieldsHash: Hex; expiresAt: number }): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, uint256, bytes32, uint256"), [
      DEVICE_AUTH_TAG,
      BigInt(p.chainId),
      p.stableFieldsHash,
      BigInt(p.expiresAt),
    ]),
  );
}
