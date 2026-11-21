/**
 * Device sessions (MINT ONLY): grant, renew and revoke on the passkey Safe, plus the state read
 * the claim router and the Settings section use.
 *
 * Every write here is exactly ONE passkey prompt:
 *   - grant on a 4337 Safe  = sponsor mode `session-upgrade`: migrate to Safe7579 + install
 *     SmartSession with the two mint sessions, one op (migrationCallData).
 *   - grant on a 7579 Safe  = sponsor mode `session-grant`: install SmartSession, or uninstall +
 *     reinstall when it is installed (renew / second device; grantCallData replace=true).
 *   - revoke                = sponsor mode `session-revoke`: removeSession for every on-chain pid.
 *
 * All chain reads run BEFORE the prompt, so a failed read never wastes a fingerprint. The new
 * device key is saved as `pending` before the op is sent (crash safety, see device-key.ts) and
 * promoted to `active` after the receipt.
 *
 * Scope v1: legacy identities with a passkey owner, native only (see claim-route.ts).
 */
import {
  decodeFunctionResult,
  encodeFunctionData,
  encodePacked,
  keccak256,
  type Address,
  type Hex,
} from 'viem';
import { identityKind, isWordsOwner, type PasskeySession } from '../session';
import {
  invalidateSafeLayout,
  readModules as readModulesDefault,
  readSafeLayout,
  type SafeLayout,
  type SafeLayoutDeps,
} from '../safe-layout';
import { DEFAULT_GNOSIS_RPC_URL, sendPasskeyUserOp, type PasskeyUserOpArgs, type UserOpDeps } from '../userop';
import {
  MINT_SESSION_KINDS,
  SESSION_DAYS,
  SMART_SESSIONS,
  TIME_FRAME_POLICY,
  grantCallData,
  migrationCallData,
  permissionIdsOf,
  prev4337AfterEnable,
  revokeCallData,
} from './builders';
import {
  activateDeviceSession,
  defaultDeviceKeyStore,
  deleteDeviceSession,
  loadDeviceSession,
  newDeviceKey,
  savePendingDeviceSession,
  type DeviceKeyStore,
  type DeviceSessionRecord,
} from './device-key';

/** Grant ops are capped at 2 gwei (the sponsor's grant cap). */
export const GRANT_MAX_FEE_PER_GAS = 2_000_000_000n;

export type DeviceSessionState = {
  layout: SafeLayout;
  /** This device's record. An `active` record whose pids are gone from the chain is deleted (null). */
  local: DeviceSessionRecord | null;
  /** SmartSession.getPermissionIDs(safe) ([] on a 4337 Safe). */
  onChainPids: Hex[];
  /** On-chain pids that are not this device's (another device's session). */
  foreignPids: Hex[];
  /** Latest validUntil (unix sec) of the foreign sessions; null when none or unreadable. */
  otherDeviceUntil: number | null;
};

export type GrantDeps = {
  /** RPC for the reads (default Gnosis public RPC). */
  chain?: SafeLayoutDeps;
  /** sendPasskeyUserOp deps (passkey `sign`, fetch, urls …). */
  userOp?: UserOpDeps;
  store?: DeviceKeyStore;
  nowSec?: () => number;
  // Injection points (tests); defaults read the chain / send the real op.
  readLayout?: (safe: Address) => Promise<SafeLayout>;
  readModules?: (safe: Address) => Promise<Address[]>;
  readPermissionIds?: (safe: Address) => Promise<Hex[]>;
  readSmartSessionInstalled?: (safe: Address) => Promise<boolean>;
  readSessionValidUntil?: (safe: Address, pid: Hex) => Promise<number>;
  sendPasskeyOp?: (args: PasskeyUserOpArgs, deps: UserOpDeps) => Promise<{ userOpHash: Hex; txHash: Hex }>;
  newKey?: () => { privateKey: Hex; signer: Address };
};

// ---------------------------------------------------------------------------
// Chain reads
// ---------------------------------------------------------------------------

const getPermissionIdsAbi = [
  {
    type: 'function',
    name: 'getPermissionIDs',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bytes32[]' }],
  },
] as const;

const isModuleInstalledAbi = [
  {
    type: 'function',
    name: 'isModuleInstalled',
    stateMutability: 'view',
    inputs: [
      { name: 'moduleType', type: 'uint256' },
      { name: 'module', type: 'address' },
      { name: 'additionalContext', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const getTimeFrameConfigAbi = [
  {
    type: 'function',
    name: 'getTimeFrameConfig',
    stateMutability: 'view',
    inputs: [
      { name: 'id', type: 'bytes32' },
      { name: 'multiplexer', type: 'address' },
      { name: 'smartAccount', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

type FetchLike = NonNullable<SafeLayoutDeps['fetch']>;

let rpcId = 1;
/** eth_call with an AbortController deadline (RN fetch never times out on its own). */
async function ethCall(deps: SafeLayoutDeps, to: Address, data: Hex): Promise<Hex> {
  const f = deps.fetch ?? (fetch as unknown as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.requestTimeoutMs ?? 15_000);
  try {
    const res = await f(deps.rpcUrl ?? DEFAULT_GNOSIS_RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method: 'eth_call', params: [{ to, data }, 'latest'] }),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`eth_call: HTTP ${res.status}`);
    if (json?.error) throw new Error(`eth_call: ${json.error.message ?? JSON.stringify(json.error)}`);
    if (typeof json?.result !== 'string') throw new Error('eth_call: no result');
    return json.result as Hex;
  } finally {
    clearTimeout(timer);
  }
}

/** SmartSession.getPermissionIDs(safe). */
export async function readOnChainPermissionIds(safe: Address, deps: SafeLayoutDeps = {}): Promise<Hex[]> {
  const ret = await ethCall(deps, SMART_SESSIONS, encodeFunctionData({ abi: getPermissionIdsAbi, functionName: 'getPermissionIDs', args: [safe] }));
  return [...decodeFunctionResult({ abi: getPermissionIdsAbi, functionName: 'getPermissionIDs', data: ret })];
}

/** Safe7579.isModuleInstalled(VALIDATOR, SmartSession, "") on a migrated Safe. */
export async function readSmartSessionInstalled(safe: Address, deps: SafeLayoutDeps = {}): Promise<boolean> {
  const ret = await ethCall(
    deps,
    safe,
    encodeFunctionData({ abi: isModuleInstalledAbi, functionName: 'isModuleInstalled', args: [1n, SMART_SESSIONS, '0x'] }),
  );
  return decodeFunctionResult({ abi: isModuleInstalledAbi, functionName: 'isModuleInstalled', data: ret });
}

/**
 * A session's validUntil from TimeFramePolicy: config id = keccak256(abi.encodePacked(safe, pid)),
 * multiplexer = SmartSession, config word = validUntil << 48 | validAfter (uint48 each).
 * Verified on the Gnosis fork 2026-11-21 against a freshly granted session.
 */
export async function readSessionValidUntil(safe: Address, pid: Hex, deps: SafeLayoutDeps = {}): Promise<number> {
  const id = keccak256(encodePacked(['address', 'bytes32'], [safe, pid]));
  const ret = await ethCall(
    deps,
    TIME_FRAME_POLICY,
    encodeFunctionData({ abi: getTimeFrameConfigAbi, functionName: 'getTimeFrameConfig', args: [id, SMART_SESSIONS, safe] }),
  );
  const word = decodeFunctionResult({ abi: getTimeFrameConfigAbi, functionName: 'getTimeFrameConfig', data: ret });
  return Number((word >> 48n) & 0xffffffffffffn);
}

function resolved(deps: GrantDeps) {
  const chain = deps.chain ?? {};
  return {
    chain,
    store: deps.store ?? defaultDeviceKeyStore,
    now: deps.nowSec ?? (() => Math.floor(Date.now() / 1000)),
    readLayout: deps.readLayout ?? ((s: Address) => readSafeLayout(s, chain)),
    readModules: deps.readModules ?? ((s: Address) => readModulesDefault(s, chain)),
    readPermissionIds: deps.readPermissionIds ?? ((s: Address) => readOnChainPermissionIds(s, chain)),
    readSmartSessionInstalled: deps.readSmartSessionInstalled ?? ((s: Address) => readSmartSessionInstalled(s, chain)),
    readSessionValidUntil: deps.readSessionValidUntil ?? ((s: Address, pid: Hex) => readSessionValidUntil(s, pid, chain)),
    sendPasskeyOp: deps.sendPasskeyOp ?? sendPasskeyUserOp,
    newKey: deps.newKey ?? newDeviceKey,
    userOp: deps.userOp ?? {},
  };
}

/** Device sessions are for legacy identities with a passkey owner (never words, never Safe identity). */
export function assertDeviceSessionAccount(session: PasskeySession): void {
  if (isWordsOwner(session) || !session.credentialId) throw new Error('device sessions need a passkey owner');
  if (identityKind(session) !== 'legacy') throw new Error('device sessions need a legacy identity');
}

function hasBothPids(rec: DeviceSessionRecord, onChainPids: readonly Hex[]): boolean {
  const onChain = new Set(onChainPids.map((p) => p.toLowerCase()));
  return MINT_SESSION_KINDS.every((k) => onChain.has(rec.permissionIds[k].toLowerCase()));
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * The Safe's device-session state. Throws when a read fails (callers treat that as "use the
 * passkey"). An undeployed Safe has no known layout and throws too.
 */
export async function readDeviceSessionState(session: PasskeySession, deps: GrantDeps = {}): Promise<DeviceSessionState> {
  const d = resolved(deps);
  const safe = session.safe;
  const layout = await d.readLayout(safe);
  const onChainPids = layout === '7579' ? await d.readPermissionIds(safe) : [];
  let loaded = await loadDeviceSession(d.store, safe, async () => onChainPids);
  // loadDeviceSession only re-checks pending records: an active record whose pids left the chain
  // (another device granted, or a revoke elsewhere) can never sign again.
  if (loaded && loaded.record.status === 'active' && !hasBothPids(loaded.record, onChainPids)) {
    await deleteDeviceSession(d.store, safe);
    loaded = null;
  }
  const local = loaded?.record ?? null;
  const mine = new Set(local ? MINT_SESSION_KINDS.map((k) => local.permissionIds[k].toLowerCase()) : []);
  const foreignPids = onChainPids.filter((p) => !mine.has(p.toLowerCase()));
  let otherDeviceUntil: number | null = null;
  if (foreignPids.length > 0) {
    try {
      const untils = await Promise.all(foreignPids.map((p) => d.readSessionValidUntil(safe, p)));
      const max = Math.max(...untils);
      otherDeviceUntil = max > 0 ? max : null;
    } catch {
      otherDeviceUntil = null;
    }
  }
  return { layout, local, onChainPids, foreignPids, otherDeviceUntil };
}

// ---------------------------------------------------------------------------
// Grant / renew
// ---------------------------------------------------------------------------

/**
 * Grants (or renews) this device's mint-only session: ONE passkey prompt. A 4337 Safe is
 * migrated in the same op. Replaces any previous session (this device's or another's: one
 * device per account). Resolves with the active record.
 */
export async function grantDeviceSession(session: PasskeySession, deps: GrantDeps = {}): Promise<DeviceSessionRecord> {
  assertDeviceSessionAccount(session);
  const d = resolved(deps);
  const safe = session.safe;
  const legacy = session.identity;

  // Fresh layout: another device may have migrated the Safe since the memo was filled.
  invalidateSafeLayout(safe);
  const layout = await d.readLayout(safe);
  const { privateKey, signer } = d.newKey();
  const validUntil = d.now() + SESSION_DAYS * 86_400;
  const params = { legacy, signer, validUntil };

  let callData: Hex;
  if (layout === '4337') {
    const prev4337 = prev4337AfterEnable(await d.readModules(safe));
    callData = migrationCallData({ ...params, safe, prev4337 });
  } else {
    const replace = await d.readSmartSessionInstalled(safe);
    callData = grantCallData({ ...params, safe, replace });
  }

  const record: Omit<DeviceSessionRecord, 'status'> = {
    v: 1,
    safe,
    legacy,
    signer,
    validUntil,
    permissionIds: permissionIdsOf(params),
  };
  await savePendingDeviceSession(d.store, record, privateKey);

  await d.sendPasskeyOp(
    {
      credentialId: session.credentialId,
      x: session.x,
      y: session.y,
      owner: session.owner,
      sender: safe,
      legacy,
      deployed: true,
      layout,
      calls: [],
      callData,
      maxFeePerGasCap: GRANT_MAX_FEE_PER_GAS,
      deviceSession: { signer, validUntil },
    },
    d.userOp,
  );
  // The migration moved the Safe to Safe7579 (ERC-1271 prefix + root ops depend on the layout).
  if (layout === '4337') invalidateSafeLayout(safe);
  await activateDeviceSession(d.store, safe);
  return { ...record, status: 'active' };
}

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

/**
 * Ends every device session of the Safe (this device's and any other): ONE passkey prompt when
 * the chain has sessions, none otherwise. The local record is deleted afterwards.
 */
export async function revokeDeviceSessions(session: PasskeySession, deps: GrantDeps = {}): Promise<void> {
  assertDeviceSessionAccount(session);
  const d = resolved(deps);
  const safe = session.safe;
  const layout = await d.readLayout(safe);
  if (layout === '7579') {
    const seen = new Set<string>();
    const pids = (await d.readPermissionIds(safe)).filter((p) => {
      const k = p.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (pids.length > 0) {
      await d.sendPasskeyOp(
        {
          credentialId: session.credentialId,
          x: session.x,
          y: session.y,
          owner: session.owner,
          sender: safe,
          legacy: session.identity,
          deployed: true,
          layout: '7579',
          calls: [],
          callData: revokeCallData(pids),
        },
        d.userOp,
      );
    }
  }
  await deleteDeviceSession(d.store, safe);
}
