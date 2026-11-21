/**
 * Device sessions (passkey session keys, MINT ONLY): pure viem encoders, no I/O.
 *
 * A passkey Safe migrates from the Safe4337Module to the Safe7579 adapter and installs
 * SmartSession with two sessions (`personalMint`, Röbel `groupMint`). A device secp256k1 key
 * then signs those two claims without a fingerprint. Every encoder below reproduces the fork
 * golden vector byte for byte (contracts/passkey-accounts/test/fixtures/session-keys-vector.json,
 * written by SessionKeys.t.sol::test_writeSessionKeysVector against the real Gnosis bytecode).
 *
 * Struct layouts are copied from contracts/passkey-accounts/test/utils/SessionInterfaces.sol
 * (field order is ABI-relevant).
 */
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  isAddressEqual,
  keccak256,
  numberToHex,
  pad,
  size,
  sliceHex,
  stringToHex,
  toFunctionSelector,
  type Address,
  type Hex,
} from 'viem';
import { MULTI_SEND_CALL_ONLY, SAFE_4337_MODULE } from '../constants';

// ---------------------------------------------------------------------------
// Addresses (Gnosis, chain 100) + parameters
// ---------------------------------------------------------------------------

export const SAFE7579: Address = '0x7579EE8307284F293B1927136486880611F20002';
export const SMART_SESSIONS: Address = '0x00000000002B0eCfbD0496EE71e01257dA0E37DE';
export const OWNABLE_VALIDATOR: Address = '0x000000000013fdB5234E4E3162a810F54d9f7E98';
export const UNI_ACTION_POLICY: Address = '0x0000000000714Cf48FcF88A0bFBa70d313415032';
export const TIME_FRAME_POLICY: Address = '0x0000000000D30f611fA3bf652ac6879428586930';
export const CIRCLES_HUB: Address = '0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8';
export const ROEBEL_GROUP: Address = '0xAc2CeCdBead594F97358a0d3132454f24F3E470c';
/** Safe module linked-list sentinel. */
export const SAFE_SENTINEL: Address = '0x0000000000000000000000000000000000000001';

export const SESSION_DAYS = 30;
export const SESSION_RENEW_BEFORE_SEC = 259_200;

/** EntryPoint nonce key that routes a userOp to SmartSession: uint192(bytes24(bytes20(SMART_SESSIONS))). */
export const SESSION_NONCE_KEY: bigint = BigInt(SMART_SESSIONS) << 32n;

/** ERC-7579 modes: callType 0x00 single / 0x01 batch, execType default, rest zero. */
export const EXEC_SINGLE: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000';
export const EXEC_BATCH: Hex = '0x0100000000000000000000000000000000000000000000000000000000000000';

const MODULE_TYPE_VALIDATOR = 1n;
/** SmartSession mode byte: USE (signature prefix) and UNSAFE_ENABLE (onInstall init data). */
const MODE_USE: Hex = '0x00';
const MODE_UNSAFE_ENABLE: Hex = '0x02';

export const SESSION_SALTS = {
  personalMint: keccak256(stringToHex('roebel/muenzen/personalMint')),
  groupMint: keccak256(stringToHex('roebel/muenzen/groupMint')),
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MintSessionKind = 'personalMint' | 'groupMint';
export const MINT_SESSION_KINDS: readonly MintSessionKind[] = ['personalMint', 'groupMint'];

export type DeviceSessionParams = { legacy: Address; signer: Address; validUntil: number };
export type PermissionIds = Record<MintSessionKind, Hex>;

type PolicyData = { policy: Address; initData: Hex };
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

export type ExecutionCall = { to: Address; value?: bigint; data: Hex };

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------

const policyDataComponents = [
  { name: 'policy', type: 'address' },
  { name: 'initData', type: 'bytes' },
] as const;

const sessionComponents = [
  { name: 'sessionValidator', type: 'address' },
  { name: 'sessionValidatorInitData', type: 'bytes' },
  { name: 'salt', type: 'bytes32' },
  { name: 'userOpPolicies', type: 'tuple[]', components: policyDataComponents },
  {
    name: 'erc7739Policies',
    type: 'tuple',
    components: [
      {
        name: 'allowedERC7739Content',
        type: 'tuple[]',
        components: [
          { name: 'appDomainSeparator', type: 'bytes32' },
          { name: 'contentNames', type: 'string[]' },
        ],
      },
      { name: 'erc1271Policies', type: 'tuple[]', components: policyDataComponents },
    ],
  },
  {
    name: 'actions',
    type: 'tuple[]',
    components: [
      { name: 'actionTargetSelector', type: 'bytes4' },
      { name: 'actionTarget', type: 'address' },
      { name: 'actionPolicies', type: 'tuple[]', components: policyDataComponents },
    ],
  },
  { name: 'permitERC4337Paymaster', type: 'bool' },
] as const;

const actionConfigParam = {
  type: 'tuple',
  components: [
    { name: 'valueLimitPerUse', type: 'uint256' },
    {
      name: 'paramRules',
      type: 'tuple',
      components: [
        { name: 'length', type: 'uint256' },
        {
          name: 'rules',
          type: 'tuple[16]',
          components: [
            { name: 'condition', type: 'uint8' },
            { name: 'offset', type: 'uint64' },
            { name: 'isLimited', type: 'bool' },
            { name: 'ref', type: 'bytes32' },
            {
              name: 'usage',
              type: 'tuple',
              components: [
                { name: 'limit', type: 'uint256' },
                { name: 'used', type: 'uint256' },
              ],
            },
          ],
        },
      ],
    },
  ],
} as const;

const moduleInitComponents = [
  { name: 'module', type: 'address' },
  { name: 'initData', type: 'bytes' },
] as const;

const safe7579Abi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'mode', type: 'bytes32' },
      { name: 'executionCalldata', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'installModule',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'moduleType', type: 'uint256' },
      { name: 'module', type: 'address' },
      { name: 'initData', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'uninstallModule',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'moduleType', type: 'uint256' },
      { name: 'module', type: 'address' },
      { name: 'deInitData', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'initializeAccount',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'validators', type: 'tuple[]', components: moduleInitComponents },
      { name: 'executors', type: 'tuple[]', components: moduleInitComponents },
      { name: 'fallbacks', type: 'tuple[]', components: moduleInitComponents },
      { name: 'hooks', type: 'tuple[]', components: moduleInitComponents },
      {
        name: 'registryInit',
        type: 'tuple',
        components: [
          { name: 'registry', type: 'address' },
          { name: 'attesters', type: 'address[]' },
          { name: 'threshold', type: 'uint8' },
        ],
      },
    ],
    outputs: [],
  },
] as const;

const safeAdminAbi = [
  { type: 'function', name: 'enableModule', stateMutability: 'nonpayable', inputs: [{ name: 'module', type: 'address' }], outputs: [] },
  {
    type: 'function',
    name: 'setFallbackHandler',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'handler', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'disableModule',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'prevModule', type: 'address' },
      { name: 'module', type: 'address' },
    ],
    outputs: [],
  },
] as const;

const safe4337ModuleAbi = [
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

const multiSendAbi = [
  { type: 'function', name: 'multiSend', stateMutability: 'payable', inputs: [{ name: 'transactions', type: 'bytes' }], outputs: [] },
] as const;

const smartSessionAbi = [
  {
    type: 'function',
    name: 'removeSession',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'permissionId', type: 'bytes32' }],
    outputs: [],
  },
] as const;

const legacyAccountAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeBatch',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target', type: 'address[]' },
      { name: 'value', type: 'uint256[]' },
      { name: 'data', type: 'bytes[]' },
    ],
    outputs: [],
  },
] as const;

const hubAbi = [
  { type: 'function', name: 'personalMint', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'groupMint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'group', type: 'address' },
      { name: 'collateralAvatars', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

/** legacy.execute(address,uint256,bytes) = 0xb61d27f6 (the only action a session may call). */
export const LEGACY_EXECUTE_SELECTOR: Hex = toFunctionSelector('execute(address,uint256,bytes)');
const PERSONAL_MINT_SELECTOR: Hex = toFunctionSelector('personalMint()');
const GROUP_MINT_SELECTOR: Hex = toFunctionSelector('groupMint(address,address[],uint256[],bytes)');

// ---------------------------------------------------------------------------
// Session definitions (UniActionPolicy over legacy.execute calldata)
// ---------------------------------------------------------------------------
//
// Offsets are counted from the byte AFTER the 4-byte legacy.execute selector:
//   0x00 target | 0x20 value | 0x40 offset of `data` (pinned 0x60) | 0x60 data.length
//   0x80 inner selector (+28 bytes) | 0x84 inner arg0 | ...

const EQUAL = 0;
type ParamRule = { condition: number; offset: bigint; ref: Hex };

const word = (v: bigint | Address): Hex => pad(typeof v === 'bigint' ? numberToHex(v) : v, { size: 32 });
const rule = (offset: number, ref: Hex): ParamRule => ({ condition: EQUAL, offset: BigInt(offset), ref });

function legacyRules(): ParamRule[] {
  return [rule(0x00, word(CIRCLES_HUB)), rule(0x20, word(0n)), rule(0x40, word(0x60n))];
}

function mintRules(): ParamRule[] {
  return [
    ...legacyRules(),
    rule(0x60, word(4n)), // data = exactly personalMint()
    rule(0x80, pad(PERSONAL_MINT_SELECTOR, { size: 32, dir: 'right' })),
  ];
}

function groupMintRules(): ParamRule[] {
  // first 32 bytes of `groupMint.selector ++ abi.encode(ROEBEL_GROUP)`: pins the selector + group prefix
  const selWindow = sliceHex(concatHex([GROUP_MINT_SELECTOR, word(ROEBEL_GROUP)]), 0, 32);
  return [...legacyRules(), rule(0x80, selWindow), rule(0x84, word(ROEBEL_GROUP))];
}

function encodeActionConfig(rules: ParamRule[]): Hex {
  if (rules.length > 16) throw new Error('too many param rules');
  const zero = { condition: 0, offset: 0n, isLimited: false, ref: word(0n), usage: { limit: 0n, used: 0n } };
  const padded = Array.from({ length: 16 }, (_, i) =>
    i < rules.length ? { ...zero, condition: rules[i].condition, offset: rules[i].offset, ref: rules[i].ref } : zero,
  );
  return encodeAbiParameters(
    [actionConfigParam],
    [{ valueLimitPerUse: 0n, paramRules: { length: BigInt(rules.length), rules: padded as any } }],
  );
}

function validatorInitData(signer: Address): Hex {
  return encodeAbiParameters([{ type: 'uint256' }, { type: 'address[]' }], [1n, [signer]]);
}

function session(kind: MintSessionKind, p: DeviceSessionParams): SessionStruct {
  const rules = kind === 'personalMint' ? mintRules() : groupMintRules();
  return {
    sessionValidator: OWNABLE_VALIDATOR,
    sessionValidatorInitData: validatorInitData(p.signer),
    salt: SESSION_SALTS[kind],
    userOpPolicies: [{ policy: TIME_FRAME_POLICY, initData: encodePacked(['uint48', 'uint48'], [p.validUntil, 0]) }],
    erc7739Policies: { allowedERC7739Content: [], erc1271Policies: [] },
    actions: [
      {
        actionTargetSelector: LEGACY_EXECUTE_SELECTOR,
        actionTarget: p.legacy,
        actionPolicies: [{ policy: UNI_ACTION_POLICY, initData: encodeActionConfig(rules) }],
      },
    ],
    permitERC4337Paymaster: true,
  };
}

/** The two mint-only sessions, in grant order: [personalMint, groupMint]. */
export function mintSessions(p: DeviceSessionParams): SessionStruct[] {
  return MINT_SESSION_KINDS.map((k) => session(k, p));
}

/** SmartSession.getPermissionId = keccak256(abi.encode(validator, validatorInitData, salt)). */
export function permissionIdsOf(p: DeviceSessionParams): PermissionIds {
  const init = validatorInitData(p.signer);
  const pid = (kind: MintSessionKind) =>
    keccak256(
      encodeAbiParameters([{ type: 'address' }, { type: 'bytes' }, { type: 'bytes32' }], [OWNABLE_VALIDATOR, init, SESSION_SALTS[kind]]),
    );
  return { personalMint: pid('personalMint'), groupMint: pid('groupMint') };
}

/** SmartSession onInstall data: UNSAFE_ENABLE ++ abi.encode(Session[]). */
export function smartSessionInitData(p: DeviceSessionParams): Hex {
  const encoded = encodeAbiParameters([{ type: 'tuple[]', components: sessionComponents }], [mintSessions(p) as any]);
  return concatHex([MODE_UNSAFE_ENABLE, encoded]);
}

// ---------------------------------------------------------------------------
// Migration (one passkey op through the CURRENT Safe4337Module path)
// ---------------------------------------------------------------------------

/**
 * `prevModule` for `disableModule(prev, Safe4337Module)` AFTER `enableModule(SAFE7579)` ran in the
 * same batch: Safe7579 lands at the head of the module list.
 */
export function prev4337AfterEnable(modulesBefore: readonly Address[]): Address {
  const i = modulesBefore.findIndex((m) => isAddressEqual(m, SAFE_4337_MODULE));
  if (i < 0) throw new Error('Safe4337Module is not enabled');
  return i === 0 ? SAFE7579 : modulesBefore[i - 1];
}

function multiSendTx(to: Address, data: Hex): Hex {
  return encodePacked(['uint8', 'address', 'uint256', 'uint256', 'bytes'], [0, to, 0n, BigInt(size(data)), data]);
}

/**
 * Safe4337Module.executeUserOp(MultiSendCallOnly, 0, multiSend([enableModule(7579),
 * setFallbackHandler(7579), initializeAccount([SmartSession + sessions]), disableModule(prev, 4337)]), DELEGATECALL).
 */
export function migrationCallData(p: DeviceSessionParams & { safe: Address; prev4337: Address }): Hex {
  const init = encodeFunctionData({
    abi: safe7579Abi,
    functionName: 'initializeAccount',
    args: [
      [{ module: SMART_SESSIONS, initData: smartSessionInitData(p) }],
      [],
      [],
      [],
      { registry: '0x0000000000000000000000000000000000000000', attesters: [], threshold: 0 },
    ],
  });
  const txs = concatHex([
    multiSendTx(p.safe, encodeFunctionData({ abi: safeAdminAbi, functionName: 'enableModule', args: [SAFE7579] })),
    multiSendTx(p.safe, encodeFunctionData({ abi: safeAdminAbi, functionName: 'setFallbackHandler', args: [SAFE7579] })),
    multiSendTx(p.safe, init),
    multiSendTx(
      p.safe,
      encodeFunctionData({ abi: safeAdminAbi, functionName: 'disableModule', args: [p.prev4337, SAFE_4337_MODULE] }),
    ),
  ]);
  return encodeFunctionData({
    abi: safe4337ModuleAbi,
    functionName: 'executeUserOp',
    args: [MULTI_SEND_CALL_ONLY, 0n, encodeFunctionData({ abi: multiSendAbi, functionName: 'multiSend', args: [txs] }), 1],
  });
}

// ---------------------------------------------------------------------------
// Root ops on a migrated Safe (Safe7579.execute)
// ---------------------------------------------------------------------------

/** Safe7579.execute: one call = EXEC_SINGLE (target ++ value ++ data), more = EXEC_BATCH (abi.encode(Execution[])). */
export function encode7579Execute(calls: readonly ExecutionCall[]): Hex {
  if (calls.length === 0) throw new Error('encode7579Execute: no calls');
  if (calls.length === 1) {
    const c = calls[0];
    return encodeFunctionData({
      abi: safe7579Abi,
      functionName: 'execute',
      args: [EXEC_SINGLE, encodePacked(['address', 'uint256', 'bytes'], [c.to, c.value ?? 0n, c.data])],
    });
  }
  const executions = encodeAbiParameters(
    [
      {
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    [calls.map((c) => ({ target: c.to, value: c.value ?? 0n, callData: c.data }))],
  );
  return encodeFunctionData({ abi: safe7579Abi, functionName: 'execute', args: [EXEC_BATCH, executions] });
}

/**
 * Grant (or renew) on a migrated Safe. replace=false: EXEC_SINGLE self.installModule(SmartSession, init).
 * replace=true (SmartSession installed): EXEC_BATCH [self.uninstallModule(SmartSession, (SENTINEL, "")), self.installModule(...)].
 */
export function grantCallData(p: DeviceSessionParams & { safe: Address; replace: boolean }): Hex {
  const install = encodeFunctionData({
    abi: safe7579Abi,
    functionName: 'installModule',
    args: [MODULE_TYPE_VALIDATOR, SMART_SESSIONS, smartSessionInitData(p)],
  });
  if (!p.replace) return encode7579Execute([{ to: p.safe, data: install }]);
  const uninstall = encodeFunctionData({
    abi: safe7579Abi,
    functionName: 'uninstallModule',
    args: [MODULE_TYPE_VALIDATOR, SMART_SESSIONS, encodeAbiParameters([{ type: 'address' }, { type: 'bytes' }], [SAFE_SENTINEL, '0x'])],
  });
  return encode7579Execute([
    { to: p.safe, data: uninstall },
    { to: p.safe, data: install },
  ]);
}

/** Revoke: SmartSession.removeSession(pid) per id (EXEC_SINGLE for one id, EXEC_BATCH for more). */
export function revokeCallData(pids: readonly Hex[]): Hex {
  return encode7579Execute(
    pids.map((pid) => ({ to: SMART_SESSIONS, data: encodeFunctionData({ abi: smartSessionAbi, functionName: 'removeSession', args: [pid] }) })),
  );
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

/** Hub.personalMint() calldata. */
export function personalMintData(): Hex {
  return encodeFunctionData({ abi: hubAbi, functionName: 'personalMint' });
}

/** Hub.groupMint(Röbel, [legacy], [amount], "") calldata. */
export function groupMintData(legacy: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: hubAbi, functionName: 'groupMint', args: [ROEBEL_GROUP, [legacy], [amount], '0x'] });
}

/** Session-op callData: Safe7579.execute(EXEC_SINGLE, legacy ++ 0 ++ legacy.execute(Hub, 0, inner)). */
export function sessionClaimCallData(legacy: Address, innerHubData: Hex): Hex {
  const viaLegacy = encodeFunctionData({ abi: legacyAccountAbi, functionName: 'execute', args: [CIRCLES_HUB, 0n, innerHubData] });
  return encode7579Execute([{ to: legacy, data: viaLegacy }]);
}

/** legacy.executeBatch([Hub, Hub], [0, 0], [personalMint(), groupMint(Röbel, [legacy], [amount], "")]). */
export function legacyClaimBatchData(legacy: Address, amount: bigint): Hex {
  return encodeFunctionData({
    abi: legacyAccountAbi,
    functionName: 'executeBatch',
    args: [[CIRCLES_HUB, CIRCLES_HUB], [0n, 0n], [personalMintData(), groupMintData(legacy, amount)]],
  });
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

/** Session userOp signature: USE (0x00) ++ permissionId ++ ECDSA(sessionKey, userOpHash) (65 bytes r‖s‖v). */
export function encodeSessionSignature(pid: Hex, ecdsa65: Hex): Hex {
  if (size(pid) !== 32) throw new Error('permissionId must be 32 bytes');
  if (size(ecdsa65) !== 65) throw new Error('session ECDSA signature must be 65 bytes');
  return concatHex([MODE_USE, pid, ecdsa65]).toLowerCase() as Hex;
}

/** ERC-1271 on a migrated Safe: Safe7579 needs a validator prefix; address(0) = Safe owners (checkSignatures). */
export function withValidatorPrefix(safeSignature: Hex): Hex {
  return concatHex([`0x${'00'.repeat(20)}`, safeSignature]).toLowerCase() as Hex;
}

// ---------------------------------------------------------------------------
// Device authorization of a session-op sponsor request (security review M-1)
// ---------------------------------------------------------------------------

/** Domain tag of the device-session sponsor authorization (v1). Mirrors the web copy. */
export const DEVICE_AUTH_TAG: Hex = keccak256(stringToHex('roebel/passkey-sponsor/device-session-op/v1'));
/** The sponsor accepts expiresAt <= its now + 300 s; the app asks for 120 s. */
export const DEVICE_AUTH_MAX_TTL_SEC = 300;
export const DEVICE_AUTH_TTL_SEC = 120;

/** The op fields the sponsor's voucher covers (paymaster gas limits included). */
export type StableUserOpFields = {
  sender: Address;
  nonce: bigint;
  factory?: Address;
  factoryData?: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
};

const u128 = (v: bigint): Hex => numberToHex(v, { size: 16 });

/** Byte-identical to NetizenVerifyingPaymaster.hashStableFields (apps/web voucher.ts). */
export function stableFieldsHash(op: StableUserOpFields): Hex {
  const initCode = op.factory ? concatHex([op.factory, op.factoryData ?? '0x']) : '0x';
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'uint256' },
      ],
      [
        op.sender,
        op.nonce,
        keccak256(initCode),
        keccak256(op.callData),
        concatHex([u128(op.verificationGasLimit), u128(op.callGasLimit)]),
        op.preVerificationGas,
        concatHex([u128(op.maxPriorityFeePerGas), u128(op.maxFeePerGas)]),
        op.paymasterVerificationGasLimit ?? 0n,
        op.paymasterPostOpGasLimit ?? 0n,
      ],
    ),
  );
}

/**
 * What the device session key signs (EIP-191 personal message over these 32 raw bytes) so the
 * sponsor issues a session-op voucher:
 *   keccak256(abi.encode(bytes32 DEVICE_AUTH_TAG, uint256 chainId, bytes32 stableFieldsHash, uint256 expiresAt))
 * Mirrors apps/web/src/lib/passkey/session-keys-builders.ts `deviceSessionAuthHash`.
 */
export function deviceSessionAuthHash(p: { chainId: number; stableFieldsHash: Hex; expiresAt: number }): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'bytes32' }, { type: 'uint256' }],
      [DEVICE_AUTH_TAG, BigInt(p.chainId), p.stableFieldsHash, BigInt(p.expiresAt)],
    ),
  );
}
