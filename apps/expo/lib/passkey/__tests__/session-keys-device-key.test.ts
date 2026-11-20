jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' }));
jest.mock('@/lib/storage/secureStorage', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

import { getAddress, type Address, type Hex } from 'viem';
import {
  DEVICE_SESSION_STORE_KEY,
  activateDeviceSession,
  deleteDeviceSession,
  loadDeviceSession,
  newDeviceKey,
  savePendingDeviceSession,
  type DeviceKeyStore,
  type DeviceSessionRecord,
} from '../session-keys/device-key';
import { permissionIdsOf } from '../session-keys/builders';
import vector from './session-keys-vector.json';

const SAFE = getAddress(vector.inputs.safe);
const LEGACY = getAddress(vector.inputs.legacy);
const PK = vector.inputs.sessionPrivateKey as Hex;
const SIGNER = getAddress(vector.inputs.signer);
const VALID_UNTIL = Number(vector.inputs.validUntil);

function memoryStore() {
  const data = new Map<string, string>();
  const calls: { op: string; key: string; options: unknown }[] = [];
  const store: DeviceKeyStore = {
    getItemAsync: jest.fn(async (key, options) => {
      calls.push({ op: 'get', key, options });
      return data.get(key) ?? null;
    }),
    setItemAsync: jest.fn(async (key, value, options) => {
      calls.push({ op: 'set', key, options });
      data.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key, options) => {
      calls.push({ op: 'delete', key, options });
      data.delete(key);
    }),
  };
  return { store, data, calls };
}

function baseRecord(): Omit<DeviceSessionRecord, 'status'> {
  return {
    v: 1,
    safe: SAFE,
    legacy: LEGACY,
    signer: SIGNER,
    validUntil: VALID_UNTIL,
    permissionIds: permissionIdsOf({ legacy: LEGACY, signer: SIGNER, validUntil: VALID_UNTIL }),
  };
}

describe('device session key store', () => {
  test('newDeviceKey returns a key and its address', () => {
    const k = newDeviceKey();
    expect(k.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
    expect(k.signer).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(newDeviceKey().privateKey).not.toBe(k.privateKey);
  });

  test('the key is stored WHEN_UNLOCKED_THIS_DEVICE_ONLY without authentication', async () => {
    const m = memoryStore();
    await savePendingDeviceSession(m.store, baseRecord(), PK);
    await activateDeviceSession(m.store, SAFE);
    await loadDeviceSession(m.store, SAFE, async () => []);
    await deleteDeviceSession(m.store, SAFE);
    expect(m.calls.length).toBeGreaterThan(4);
    for (const c of m.calls) {
      expect(c.options).toEqual({ keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY', requireAuthentication: false });
    }
  });

  test('the private key never appears in the JSON record', async () => {
    const m = memoryStore();
    await savePendingDeviceSession(m.store, baseRecord(), PK);
    const json = m.data.get(DEVICE_SESSION_STORE_KEY(SAFE))!;
    expect(JSON.parse(json).status).toBe('pending');
    expect(json.toLowerCase()).not.toContain(PK.slice(2).toLowerCase());
    expect(json.toLowerCase()).not.toContain(PK.slice(2).replace(/^0+/, '').toLowerCase());
    // The key lives under its own entry.
    expect([...m.data.values()].filter((v) => v === PK)).toHaveLength(1);
  });

  test('refuses a key that does not match the record signer', async () => {
    const m = memoryStore();
    await expect(savePendingDeviceSession(m.store, baseRecord(), newDeviceKey().privateKey)).rejects.toThrow('does not match');
    expect(m.data.size).toBe(0);
  });

  test('pending record is promoted when the chain has its permission ids', async () => {
    const m = memoryStore();
    const rec = baseRecord();
    await savePendingDeviceSession(m.store, rec, PK);
    const pids = jest.fn(async () => [rec.permissionIds.groupMint.toUpperCase().replace('0X', '0x') as Hex, rec.permissionIds.personalMint]);
    const loaded = await loadDeviceSession(m.store, SAFE, pids);
    expect(loaded?.record.status).toBe('active');
    expect(loaded?.privateKey).toBe(PK);
    expect(JSON.parse(m.data.get(DEVICE_SESSION_STORE_KEY(SAFE))!).status).toBe('active');
    // Active records do not hit the chain again.
    const again = jest.fn(async () => [] as Hex[]);
    expect((await loadDeviceSession(m.store, SAFE, again))?.record.status).toBe('active');
    expect(again).not.toHaveBeenCalled();
  });

  test('pending record whose ids are missing on chain is deleted', async () => {
    const m = memoryStore();
    const rec = baseRecord();
    await savePendingDeviceSession(m.store, rec, PK);
    expect(await loadDeviceSession(m.store, SAFE, async () => [rec.permissionIds.personalMint])).toBeNull();
    expect(m.data.size).toBe(0);
  });

  test('pending record survives a failed chain read', async () => {
    const m = memoryStore();
    await savePendingDeviceSession(m.store, baseRecord(), PK);
    expect(
      await loadDeviceSession(m.store, SAFE, async () => {
        throw new Error('rpc down');
      }),
    ).toBeNull();
    expect(m.data.size).toBe(2);
  });

  test('activateDeviceSession marks the record active', async () => {
    const m = memoryStore();
    await savePendingDeviceSession(m.store, baseRecord(), PK);
    await activateDeviceSession(m.store, SAFE);
    expect(JSON.parse(m.data.get(DEVICE_SESSION_STORE_KEY(SAFE))!).status).toBe('active');
  });

  test('a record without its key, or a corrupt record, is deleted', async () => {
    const m = memoryStore();
    await savePendingDeviceSession(m.store, baseRecord(), PK);
    await activateDeviceSession(m.store, SAFE);
    for (const k of [...m.data.keys()]) if (k !== DEVICE_SESSION_STORE_KEY(SAFE)) m.data.delete(k);
    expect(await loadDeviceSession(m.store, SAFE, async () => [])).toBeNull();
    expect(m.data.size).toBe(0);

    m.data.set(DEVICE_SESSION_STORE_KEY(SAFE), '{not json');
    expect(await loadDeviceSession(m.store, SAFE, async () => [])).toBeNull();
    expect(m.data.size).toBe(0);
  });

  test('records are keyed per Safe (lowercase)', () => {
    const s = SAFE as Address;
    expect(DEVICE_SESSION_STORE_KEY(s)).toBe(`passkey_device_session_v1_${s.toLowerCase()}`);
  });
});
