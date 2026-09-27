/**
 * NSP-14 org Safes — pure calldata builders and planners (no I/O).
 *
 * An org becomes a Safe 1.4.1 whose owners are the org's `owner` rows; the Safe
 * then registers in the OrgRegistry and carries the org's admin/member roles
 * onchain. Every Safe transaction here is executed by ONE owner as msg.sender
 * with a pre-validated signature (v=1), so the owner's own smart account (thirdweb
 * or passkey-wrapped) just sends a normal call — no off-chain Safe signatures,
 * no ERC-1271. Threshold stays 1, matching how the app lets any owner act alone.
 *
 * Contract: contracts/governor-contract/contracts/verification-system/OrgRegistry.sol
 * Design: docs/superpowers/specs/2026-09-26-org-safe-identity-design.md
 */
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getAddress,
  getContractAddress,
  keccak256,
  numberToHex,
  size,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import {
  MULTI_SEND_CALL_ONLY,
  SAFE_L2_SINGLETON,
  SAFE_PROXY_CREATION_CODE,
  SAFE_PROXY_FACTORY,
} from '../passkey/constants';

/** CompatibilityFallbackHandler 1.4.1 (Gnosis). */
export const SAFE_FALLBACK_HANDLER: Address = '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99';
/** Safe owner linked-list sentinel. */
export const SAFE_OWNERS_SENTINEL: Address = '0x0000000000000000000000000000000000000001';

/** FROZEN (NSP-14): changing this re-keys every organisation. */
export const ORG_ID_PREFIX = 'netizen:org:v1:';

export type OrgRole = 'member' | 'admin';
export type Call = { to: Address; data: Hex };

export const ROLE_INDEX: Record<OrgRole | 'none', number> = { none: 0, member: 1, admin: 2 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function orgIdFromUuid(uuid: string): Hex {
  const u = uuid.trim().toLowerCase();
  if (!UUID.test(u)) throw new Error(`not a uuid: ${uuid}`);
  return keccak256(stringToHex(ORG_ID_PREFIX + u));
}

// ---------------------------------------------------------------------------
// ABIs (only what we encode)
// ---------------------------------------------------------------------------

const safeAbi = [
  {
    type: 'function',
    name: 'setup',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_owners', type: 'address[]' },
      { name: '_threshold', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'data', type: 'bytes' },
      { name: 'fallbackHandler', type: 'address' },
      { name: 'paymentToken', type: 'address' },
      { name: 'payment', type: 'uint256' },
      { name: 'paymentReceiver', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'execTransaction',
    stateMutability: 'payable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
      { name: 'safeTxGas', type: 'uint256' },
      { name: 'baseGas', type: 'uint256' },
      { name: 'gasPrice', type: 'uint256' },
      { name: 'gasToken', type: 'address' },
      { name: 'refundReceiver', type: 'address' },
      { name: 'signatures', type: 'bytes' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'addOwnerWithThreshold',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: '_threshold', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'removeOwner',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'prevOwner', type: 'address' },
      { name: 'owner', type: 'address' },
      { name: '_threshold', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const factoryAbi = [
  {
    type: 'function',
    name: 'createProxyWithNonce',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_singleton', type: 'address' },
      { name: 'initializer', type: 'bytes' },
      { name: 'saltNonce', type: 'uint256' },
    ],
    outputs: [{ name: 'proxy', type: 'address' }],
  },
] as const;

const multiSendAbi = [
  {
    type: 'function',
    name: 'multiSend',
    stateMutability: 'payable',
    inputs: [{ name: 'transactions', type: 'bytes' }],
    outputs: [],
  },
] as const;

export const orgRegistryWriteAbi = [
  {
    type: 'function',
    name: 'requestRegistration',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'orgId', type: 'bytes32' },
      { name: 'metadataURI', type: 'string' },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'setRole',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'orgId', type: 'bytes32' },
      { name: 'account', type: 'address' },
      { name: 'role', type: 'uint8' },
    ],
    outputs: [],
  },
] as const;

// ---------------------------------------------------------------------------
// Safe creation
// ---------------------------------------------------------------------------

/** Owners are checksummed, de-duplicated and sorted so the address is reproducible. */
export function normalizeOwners(owners: readonly string[]): Address[] {
  const set = new Map<string, Address>();
  for (const o of owners) set.set(o.toLowerCase(), getAddress(o));
  return [...set.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

export function buildOrgSafeInitializer(owners: readonly string[]): Hex {
  const list = normalizeOwners(owners);
  if (list.length === 0) throw new Error('an org Safe needs at least one owner');
  return encodeFunctionData({
    abi: safeAbi,
    functionName: 'setup',
    args: [list, 1n, zeroAddress, '0x', SAFE_FALLBACK_HANDLER, zeroAddress, 0n, zeroAddress],
  });
}

/** One Safe per (org, owner set): the salt is the org id itself. */
export function orgSafeSaltNonce(orgId: Hex): bigint {
  return BigInt(orgId);
}

export function predictOrgSafeAddress(orgId: Hex, owners: readonly string[]): Address {
  const initializer = buildOrgSafeInitializer(owners);
  const salt = keccak256(concatHex([keccak256(initializer), numberToHex(orgSafeSaltNonce(orgId), { size: 32 })]));
  const bytecode = concatHex([
    SAFE_PROXY_CREATION_CODE,
    encodeAbiParameters([{ type: 'address' }], [SAFE_L2_SINGLETON]),
  ]);
  return getContractAddress({ opcode: 'CREATE2', from: SAFE_PROXY_FACTORY, salt, bytecode });
}

export function createOrgSafeCall(orgId: Hex, owners: readonly string[]): Call {
  return {
    to: SAFE_PROXY_FACTORY,
    data: encodeFunctionData({
      abi: factoryAbi,
      functionName: 'createProxyWithNonce',
      args: [SAFE_L2_SINGLETON, buildOrgSafeInitializer(owners), orgSafeSaltNonce(orgId)],
    }),
  };
}

// ---------------------------------------------------------------------------
// Safe execution by one owner (pre-validated signature)
// ---------------------------------------------------------------------------

/** v=1 "approved by msg.sender": r = owner, s = 0. Valid only when `executor` sends the tx. */
export function preValidatedSignature(executor: string): Hex {
  return concatHex([
    encodeAbiParameters([{ type: 'address' }], [getAddress(executor)]),
    numberToHex(0, { size: 32 }),
    '0x01',
  ]);
}

export function safeExecCall(safe: Address, executor: string, to: Address, data: Hex, operation: 0 | 1 = 0): Call {
  return {
    to: safe,
    data: encodeFunctionData({
      abi: safeAbi,
      functionName: 'execTransaction',
      args: [to, 0n, data, operation, 0n, 0n, 0n, zeroAddress, zeroAddress, preValidatedSignature(executor)],
    }),
  };
}

/**
 * Step 1 as ONE batch from the executor's account: deploy the Safe, then have it
 * file its registration request. The Safe address is deterministic, so the second
 * call can target it before it exists.
 */
export function createAndRequestCalls(p: {
  orgUuid: string;
  owners: readonly string[];
  executor: string;
  registry: Address;
  metadataURI?: string;
  alreadyDeployed?: boolean;
}): { safe: Address; orgId: Hex; calls: Call[] } {
  const orgId = orgIdFromUuid(p.orgUuid);
  const owners = normalizeOwners(p.owners);
  if (!owners.some((o) => o.toLowerCase() === p.executor.toLowerCase())) {
    throw new Error('the executor must be one of the Safe owners');
  }
  const safe = predictOrgSafeAddress(orgId, owners);
  const request = encodeFunctionData({
    abi: orgRegistryWriteAbi,
    functionName: 'requestRegistration',
    args: [orgId, p.metadataURI ?? ''],
  });
  const calls: Call[] = [];
  if (!p.alreadyDeployed) calls.push(createOrgSafeCall(orgId, owners));
  calls.push(safeExecCall(safe, p.executor, p.registry, request));
  return { safe, orgId, calls };
}

// ---------------------------------------------------------------------------
// Sync: bring the Safe + registry in line with the org's members
// ---------------------------------------------------------------------------

export type DbMember = { wallet_address: string; role: 'owner' | 'admin' | 'member' | string };

export type OrgChainState = {
  safe: Address;
  owners: Address[];
  threshold: number;
  /** onchain role per checked account (lowercased keys) */
  roles: Record<string, OrgRole | 'none'>;
};

export type SyncPlan = {
  addOwners: Address[];
  setRoles: { account: Address; role: OrgRole | 'none' }[];
};

/**
 * Database → chain. Owners in the database become Safe owners; admins/members
 * become registry roles; a role left on an owner or on someone no longer in the
 * org is cleared. Safe owners are never REMOVED here — that only happens when a
 * person leaves (see leaveSafeCall), so a sync can never lock anyone out.
 */
export function planSync(state: OrgChainState, members: readonly DbMember[]): SyncPlan {
  const chainOwners = new Set(state.owners.map((o) => o.toLowerCase()));
  const dbOwners = new Set(members.filter((m) => m.role === 'owner').map((m) => m.wallet_address.toLowerCase()));
  const addOwners = normalizeOwners([...dbOwners].filter((o) => !chainOwners.has(o)));

  const want = new Map<string, OrgRole | 'none'>();
  for (const m of members) {
    const w = m.wallet_address.toLowerCase();
    if (m.role === 'admin' || m.role === 'member') want.set(w, m.role);
  }
  const setRoles: SyncPlan['setRoles'] = [];
  const accounts = new Set([...Object.keys(state.roles), ...want.keys()]);
  for (const a of [...accounts].sort()) {
    const desired = dbOwners.has(a) || chainOwners.has(a) ? 'none' : (want.get(a) ?? 'none');
    const current = state.roles[a] ?? 'none';
    if (desired !== current) setRoles.push({ account: getAddress(a), role: desired });
  }
  return { addOwners, setRoles };
}

export function isInSync(plan: SyncPlan): boolean {
  return plan.addOwners.length === 0 && plan.setRoles.length === 0;
}

function encodeMultiSendTx(to: Address, data: Hex): Hex {
  return encodePacked(['uint8', 'address', 'uint256', 'uint256', 'bytes'], [0, to, 0n, BigInt(size(data)), data]);
}

/** The whole sync as ONE Safe transaction (DELEGATECALL into MultiSendCallOnly). */
export function syncCall(p: {
  safe: Address;
  executor: string;
  registry: Address;
  orgId: Hex;
  plan: SyncPlan;
}): Call | null {
  const inner: Hex[] = [];
  for (const owner of p.plan.addOwners) {
    inner.push(
      encodeMultiSendTx(
        p.safe,
        encodeFunctionData({ abi: safeAbi, functionName: 'addOwnerWithThreshold', args: [owner, 1n] }),
      ),
    );
  }
  for (const r of p.plan.setRoles) {
    inner.push(
      encodeMultiSendTx(
        p.registry,
        encodeFunctionData({
          abi: orgRegistryWriteAbi,
          functionName: 'setRole',
          args: [p.orgId, r.account, ROLE_INDEX[r.role]],
        }),
      ),
    );
  }
  if (inner.length === 0) return null;
  const batch = encodeFunctionData({ abi: multiSendAbi, functionName: 'multiSend', args: [concatHex(inner)] });
  return safeExecCall(p.safe, p.executor, MULTI_SEND_CALL_ONLY, batch, 1);
}

// ---------------------------------------------------------------------------
// Leave: the executor removes themself from the Safe
// ---------------------------------------------------------------------------

export type LeaveBlocker = 'not_an_owner' | 'no_other_owner' | 'not_in_sync';

/**
 * Leaving is safe only when someone else keeps control: another Safe owner who is
 * also an owner in the database, and nothing left to sync (otherwise the people
 * the leaver meant to hand over to may not be in the Safe yet).
 */
export function leaveBlocker(state: OrgChainState, members: readonly DbMember[], executor: string): LeaveBlocker | null {
  const me = executor.toLowerCase();
  if (!state.owners.some((o) => o.toLowerCase() === me)) return 'not_an_owner';
  const dbOwners = new Set(members.filter((m) => m.role === 'owner').map((m) => m.wallet_address.toLowerCase()));
  const others = state.owners.filter((o) => o.toLowerCase() !== me && dbOwners.has(o.toLowerCase()));
  if (others.length === 0) return 'no_other_owner';
  if (!isInSync(planSync(state, members))) return 'not_in_sync';
  return null;
}

export function leaveSafeCall(state: OrgChainState, executor: string): Call {
  const me = executor.toLowerCase();
  const idx = state.owners.findIndex((o) => o.toLowerCase() === me);
  if (idx < 0) throw new Error('executor is not a Safe owner');
  if (state.owners.length < 2) throw new Error('cannot remove the last Safe owner');
  // Safe's owner list is a linked list in getOwners() order; prev of the first is the sentinel.
  const prev = idx === 0 ? SAFE_OWNERS_SENTINEL : state.owners[idx - 1];
  const threshold = BigInt(Math.max(1, Math.min(state.threshold, state.owners.length - 1)));
  const data = encodeFunctionData({
    abi: safeAbi,
    functionName: 'removeOwner',
    args: [prev, getAddress(executor), threshold],
  });
  return safeExecCall(state.safe, executor, state.safe, data);
}
