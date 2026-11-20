/**
 * Device session key store (passkey session keys, MINT ONLY).
 *
 * v1 key: a software secp256k1 key (viem `generatePrivateKey`) kept in expo-secure-store with
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (never backed up, never migrates to another device) and
 * `requireAuthentication: false` (claims run without a biometric prompt). One device key per
 * account, keyed by the Safe address.
 *
 * Two entries per Safe: the JSON record (no secret in it) and the private key. The key is written
 * first, so a record never exists without its key. The private key is never logged.
 *
 * Crash safety: the record is saved as `pending` BEFORE the grant op is sent. On load a pending
 * record is promoted to `active` once the chain reports both of its permission ids, and deleted
 * when the chain does not (the grant never landed).
 */
import * as SecureStore from 'expo-secure-store';
import { getAddress, isAddress, isHex, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';
import * as secureStorage from '@/lib/storage/secureStorage';
import { MINT_SESSION_KINDS, type PermissionIds } from './builders';

export type DeviceKeyStoreOptions = { keychainAccessible?: SecureStore.KeychainAccessibilityConstant; requireAuthentication?: boolean };

/** The SecureStore surface this module needs (default: '@/lib/storage/secureStorage'). */
export type DeviceKeyStore = {
  getItemAsync(key: string, options?: DeviceKeyStoreOptions): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: DeviceKeyStoreOptions): Promise<void>;
  deleteItemAsync(key: string, options?: DeviceKeyStoreOptions): Promise<void>;
};

export const defaultDeviceKeyStore: DeviceKeyStore = secureStorage;

/** Options for every read / write / delete of a device session entry. */
export function deviceKeyStoreOptions(): DeviceKeyStoreOptions {
  return { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY, requireAuthentication: false };
}

export const DEVICE_SESSION_STORE_KEY = (safe: Address) => `passkey_device_session_v1_${safe.toLowerCase()}`;
const DEVICE_SESSION_PRIVATE_KEY_STORE_KEY = (safe: Address) => `passkey_device_session_key_v1_${safe.toLowerCase()}`;

export type DeviceSessionRecord = {
  v: 1;
  safe: Address;
  legacy: Address;
  signer: Address;
  validUntil: number;
  permissionIds: PermissionIds;
  status: 'pending' | 'active';
};

/** A fresh software secp256k1 device key. */
export function newDeviceKey(): { privateKey: Hex; signer: Address } {
  const privateKey = generatePrivateKey();
  return { privateKey, signer: privateKeyToAddress(privateKey) };
}

function isBytes32(v: unknown): v is Hex {
  return typeof v === 'string' && isHex(v) && v.length === 66;
}

function parseRecord(raw: string | null): DeviceSessionRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw);
    if (
      r?.v !== 1 ||
      !isAddress(r.safe) ||
      !isAddress(r.legacy) ||
      !isAddress(r.signer) ||
      typeof r.validUntil !== 'number' ||
      (r.status !== 'pending' && r.status !== 'active') ||
      !MINT_SESSION_KINDS.every((k) => isBytes32(r.permissionIds?.[k]))
    ) {
      return null;
    }
    return {
      v: 1,
      safe: getAddress(r.safe),
      legacy: getAddress(r.legacy),
      signer: getAddress(r.signer),
      validUntil: r.validUntil,
      permissionIds: { personalMint: r.permissionIds.personalMint, groupMint: r.permissionIds.groupMint },
      status: r.status,
    };
  } catch {
    return null;
  }
}

function serialize(rec: DeviceSessionRecord): string {
  return JSON.stringify({
    v: 1,
    safe: rec.safe,
    legacy: rec.legacy,
    signer: rec.signer,
    validUntil: rec.validUntil,
    permissionIds: { personalMint: rec.permissionIds.personalMint, groupMint: rec.permissionIds.groupMint },
    status: rec.status,
  });
}

/**
 * Persist a new device key + its record as `pending` (before the grant op is sent). Replaces any
 * previous device session of this Safe.
 */
export async function savePendingDeviceSession(
  store: DeviceKeyStore,
  rec: Omit<DeviceSessionRecord, 'status'>,
  privateKey: Hex,
): Promise<void> {
  if (!isBytes32(privateKey)) throw new Error('device session key must be 32 bytes');
  if (getAddress(privateKeyToAddress(privateKey)) !== getAddress(rec.signer)) {
    throw new Error('device session key does not match the record signer');
  }
  const opts = deviceKeyStoreOptions();
  const record: DeviceSessionRecord = { ...rec, v: 1, status: 'pending' };
  await store.setItemAsync(DEVICE_SESSION_PRIVATE_KEY_STORE_KEY(rec.safe), privateKey, opts);
  await store.setItemAsync(DEVICE_SESSION_STORE_KEY(rec.safe), serialize(record), opts);
}

/** Mark the Safe's pending device session active (after the grant receipt). No-op without a record. */
export async function activateDeviceSession(store: DeviceKeyStore, safe: Address): Promise<void> {
  const opts = deviceKeyStoreOptions();
  const rec = parseRecord(await store.getItemAsync(DEVICE_SESSION_STORE_KEY(safe), opts));
  if (!rec || rec.status === 'active') return;
  await store.setItemAsync(DEVICE_SESSION_STORE_KEY(safe), serialize({ ...rec, status: 'active' }), opts);
}

/** Remove the Safe's device session (record + key). */
export async function deleteDeviceSession(store: DeviceKeyStore, safe: Address): Promise<void> {
  const opts = deviceKeyStoreOptions();
  // Record first: a stray key without a record is never used.
  await store.deleteItemAsync(DEVICE_SESSION_STORE_KEY(safe), opts);
  await store.deleteItemAsync(DEVICE_SESSION_PRIVATE_KEY_STORE_KEY(safe), opts);
}

/**
 * The Safe's device session, or null.
 * - corrupt record, missing key or a key that does not match the signer → deleted, null
 * - `pending` + chain has both permission ids → promoted to `active`
 * - `pending` + chain lacks them → deleted, null
 * - `pending` + the chain read fails → kept (the grant may have landed), null
 * `onChainPids` is only called for a pending record.
 */
export async function loadDeviceSession(
  store: DeviceKeyStore,
  safe: Address,
  onChainPids: () => Promise<Hex[]>,
): Promise<{ record: DeviceSessionRecord; privateKey: Hex } | null> {
  const opts = deviceKeyStoreOptions();
  const raw = await store.getItemAsync(DEVICE_SESSION_STORE_KEY(safe), opts);
  if (raw === null) return null;
  const record = parseRecord(raw);
  const privateKey = (await store.getItemAsync(DEVICE_SESSION_PRIVATE_KEY_STORE_KEY(safe), opts)) as Hex | null;
  if (
    !record ||
    getAddress(record.safe) !== getAddress(safe) ||
    !privateKey ||
    !isBytes32(privateKey) ||
    getAddress(privateKeyToAddress(privateKey)) !== record.signer
  ) {
    await deleteDeviceSession(store, safe);
    return null;
  }
  if (record.status === 'active') return { record, privateKey };

  let pids: Hex[];
  try {
    pids = await onChainPids();
  } catch {
    return null;
  }
  const onChain = new Set(pids.map((p) => p.toLowerCase()));
  const landed = MINT_SESSION_KINDS.every((k) => onChain.has(record.permissionIds[k].toLowerCase()));
  if (!landed) {
    await deleteDeviceSession(store, safe);
    return null;
  }
  const active: DeviceSessionRecord = { ...record, status: 'active' };
  await store.setItemAsync(DEVICE_SESSION_STORE_KEY(safe), serialize(active), opts);
  return { record: active, privateKey };
}
