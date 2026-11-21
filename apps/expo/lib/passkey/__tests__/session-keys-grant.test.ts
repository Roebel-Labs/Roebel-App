jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' }));
jest.mock('@/lib/storage/secureStorage', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

import { getAddress, numberToHex, type Address, type Hex } from 'viem';
import {
  GRANT_MAX_FEE_PER_GAS,
  grantDeviceSession,
  readDeviceSessionState,
  readSessionValidUntil,
  revokeDeviceSessions,
  type GrantDeps,
} from '../session-keys/grant';
import { SESSION_DAYS, permissionIdsOf, revokeCallData } from '../session-keys/builders';
import {
  DEVICE_SESSION_STORE_KEY,
  loadDeviceSession,
  savePendingDeviceSession,
  activateDeviceSession,
  type DeviceKeyStore,
} from '../session-keys/device-key';
import type { PasskeySession } from '../session';
import type { PasskeyUserOpArgs, UserOpDeps } from '../userop';
import vector from './session-keys-vector.json';

const SAFE = getAddress(vector.inputs.safe);
const LEGACY = getAddress(vector.inputs.legacy);
const PK = vector.inputs.sessionPrivateKey as Hex;
const SIGNER = getAddress(vector.inputs.signer);
const VALID_UNTIL = Number(vector.inputs.validUntil);
const NOW = VALID_UNTIL - SESSION_DAYS * 86_400; // grant at NOW reproduces the vector
const MODULES = vector.inputs.modulesBefore.map((m) => getAddress(m));
const PIDS = permissionIdsOf({ legacy: LEGACY, signer: SIGNER, validUntil: VALID_UNTIL });

const session: PasskeySession = {
  credentialId: 'cred-1',
  x: `0x${'11'.repeat(32)}`,
  y: `0x${'22'.repeat(32)}`,
  safe: SAFE,
  identity: LEGACY,
  ownerType: 'passkey' as PasskeySession['ownerType'],
  owner: '0x94a4F6affBd8975951142c3999aEAB7ecee555c2',
};

function memoryStore() {
  const data = new Map<string, string>();
  const store: DeviceKeyStore = {
    getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => {
      data.set(k, v);
    },
    deleteItemAsync: async (k) => {
      data.delete(k);
    },
  };
  return { store, data };
}

/** A fake chain + a sendPasskeyOp that prompts the (counted) passkey exactly like sendPasskeyUserOp. */
function harness(o: { layout: '4337' | '7579'; pids?: Hex[]; installed?: boolean; sendFails?: boolean }) {
  const { store, data } = memoryStore();
  const sign = jest.fn(async () => ({}) as any);
  const sent: PasskeyUserOpArgs[] = [];
  let pendingAtSend: string | null = null;
  const deps: GrantDeps = {
    store,
    nowSec: () => NOW,
    userOp: { sign } as UserOpDeps,
    readLayout: jest.fn(async () => o.layout),
    readModules: jest.fn(async () => MODULES),
    readPermissionIds: jest.fn(async () => o.pids ?? []),
    readSmartSessionInstalled: jest.fn(async () => o.installed ?? false),
    readSessionValidUntil: jest.fn(async () => VALID_UNTIL + 5),
    newKey: () => ({ privateKey: PK, signer: SIGNER }),
    sendPasskeyOp: jest.fn(async (args: PasskeyUserOpArgs, d: UserOpDeps) => {
      pendingAtSend = data.get(DEVICE_SESSION_STORE_KEY(SAFE)) ?? null;
      sent.push(args);
      await d.sign!(args.credentialId, '0x00');
      if (o.sendFails) throw new Error('HTTP 403: device sessions are switched off');
      return { userOpHash: '0x01' as Hex, txHash: '0x02' as Hex };
    }),
  };
  return { deps, store, data, sign, sent, pendingAtSend: () => pendingAtSend };
}

describe('grantDeviceSession', () => {
  test('grant on a 4337 Safe sends the session-upgrade op with deviceSession and one prompt', async () => {
    const h = harness({ layout: '4337' });
    const rec = await grantDeviceSession(session, h.deps);
    expect(h.sign).toHaveBeenCalledTimes(1);
    expect(h.sent).toHaveLength(1);
    const a = h.sent[0];
    expect(a.callData?.toLowerCase()).toBe(vector.migrationCallData);
    expect(a.layout).toBe('4337');
    expect(a.deployed).toBe(true);
    expect(a.sender).toBe(SAFE);
    expect(a.legacy).toBe(LEGACY);
    expect(a.owner).toBe(session.owner);
    expect(a.deviceSession).toEqual({ signer: SIGNER, validUntil: VALID_UNTIL });
    expect(a.maxFeePerGasCap).toBe(GRANT_MAX_FEE_PER_GAS);
    // saved as pending BEFORE sending, active after
    expect(JSON.parse(h.pendingAtSend()!).status).toBe('pending');
    expect(rec).toMatchObject({ status: 'active', signer: SIGNER, validUntil: VALID_UNTIL, permissionIds: PIDS });
    expect(JSON.parse(h.data.get(DEVICE_SESSION_STORE_KEY(SAFE))!).status).toBe('active');
  });

  test('grant on a 7579 Safe without SmartSession installs (replace=false)', async () => {
    const h = harness({ layout: '7579', installed: false });
    await grantDeviceSession(session, h.deps);
    expect(h.sent[0].callData?.toLowerCase()).toBe(vector.grantInstallCallData);
    expect(h.sent[0].layout).toBe('7579');
  });

  test('grant on a 7579 Safe with SmartSession installed uses replace=true', async () => {
    const h = harness({ layout: '7579', installed: true });
    await grantDeviceSession(session, h.deps);
    expect(h.sign).toHaveBeenCalledTimes(1);
    expect(h.sent[0].callData?.toLowerCase()).toBe(vector.grantReplaceCallData);
    expect(h.sent[0].deviceSession).toEqual({ signer: SIGNER, validUntil: VALID_UNTIL });
  });

  test('a failed grant leaves the record pending (resolved against the chain on the next load)', async () => {
    const h = harness({ layout: '7579', installed: true, sendFails: true });
    await expect(grantDeviceSession(session, h.deps)).rejects.toThrow('403');
    expect(JSON.parse(h.data.get(DEVICE_SESSION_STORE_KEY(SAFE))!).status).toBe('pending');
    expect(await loadDeviceSession(h.store, SAFE, async () => [])).toBeNull();
    expect(h.data.size).toBe(0);
  });

  test('words owners and Safe identities are refused before any read', async () => {
    const h = harness({ layout: '4337' });
    await expect(grantDeviceSession({ ...session, ownerType: 'ecdsa' as any, credentialId: '' }, h.deps)).rejects.toThrow();
    await expect(grantDeviceSession({ ...session, identity: SAFE }, h.deps)).rejects.toThrow();
    expect(h.deps.readLayout).not.toHaveBeenCalled();
    expect(h.sign).not.toHaveBeenCalled();
  });
});

describe('revokeDeviceSessions', () => {
  test('revoke removes every on-chain pid and deletes the local key', async () => {
    const other = `0x${'ab'.repeat(32)}` as Hex;
    const h = harness({ layout: '7579', pids: [PIDS.personalMint, PIDS.groupMint, other, other] });
    await savePendingDeviceSession(h.store, { v: 1, safe: SAFE, legacy: LEGACY, signer: SIGNER, validUntil: VALID_UNTIL, permissionIds: PIDS }, PK);
    await activateDeviceSession(h.store, SAFE);
    await revokeDeviceSessions(session, h.deps);
    expect(h.sign).toHaveBeenCalledTimes(1);
    expect(h.sent[0].callData?.toLowerCase()).toBe(revokeCallData([PIDS.personalMint, PIDS.groupMint, other]).toLowerCase());
    expect(h.sent[0].layout).toBe('7579');
    expect(h.sent[0].deviceSession).toBeUndefined();
    expect(h.data.size).toBe(0);
  });

  test('nothing on chain: no prompt, local record still deleted', async () => {
    const h = harness({ layout: '4337' });
    await savePendingDeviceSession(h.store, { v: 1, safe: SAFE, legacy: LEGACY, signer: SIGNER, validUntil: VALID_UNTIL, permissionIds: PIDS }, PK);
    await revokeDeviceSessions(session, h.deps);
    expect(h.sign).not.toHaveBeenCalled();
    expect(h.data.size).toBe(0);
  });
});

describe('readDeviceSessionState', () => {
  async function withActive(h: ReturnType<typeof harness>) {
    await savePendingDeviceSession(h.store, { v: 1, safe: SAFE, legacy: LEGACY, signer: SIGNER, validUntil: VALID_UNTIL, permissionIds: PIDS }, PK);
    await activateDeviceSession(h.store, SAFE);
  }

  test('active record with both pids on chain', async () => {
    const h = harness({ layout: '7579', pids: [PIDS.personalMint, PIDS.groupMint] });
    await withActive(h);
    const s = await readDeviceSessionState(session, h.deps);
    expect(s.local?.status).toBe('active');
    expect(s.foreignPids).toEqual([]);
    expect(s.otherDeviceUntil).toBeNull();
  });

  test('active record whose pids left the chain is deleted; foreign pids = other device', async () => {
    const other = [`0x${'ab'.repeat(32)}`, `0x${'cd'.repeat(32)}`] as Hex[];
    const h = harness({ layout: '7579', pids: other });
    await withActive(h);
    const s = await readDeviceSessionState(session, h.deps);
    expect(s.local).toBeNull();
    expect(h.data.size).toBe(0);
    expect(s.foreignPids).toEqual(other);
    expect(s.otherDeviceUntil).toBe(VALID_UNTIL + 5);
  });

  test('a 4337 Safe never reads SmartSession', async () => {
    const h = harness({ layout: '4337' });
    const s = await readDeviceSessionState(session, h.deps);
    expect(s).toEqual({ layout: '4337', local: null, onChainPids: [], foreignPids: [], otherDeviceUntil: null });
    expect(h.deps.readPermissionIds).not.toHaveBeenCalled();
  });
});

test('readSessionValidUntil decodes TimeFramePolicy (validUntil << 48 | validAfter)', async () => {
  const word = (1797810750n << 48n) | 7n;
  const fetchMock = jest.fn(async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result: numberToHex(word, { size: 32 }) }) };
  });
  expect(await readSessionValidUntil(SAFE as Address, PIDS.personalMint, { fetch: fetchMock as any })).toBe(1797810750);
  const call = JSON.parse((fetchMock.mock.calls[0] as any)[1].body).params[0];
  expect(getAddress(call.to)).toBe('0x0000000000D30f611fA3bf652ac6879428586930');
});
