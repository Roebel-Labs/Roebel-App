/**
 * Real-world wiring for derived-keys.ts: the passkey session behind the active account, the
 * server key backup, SecureStore, PRF, and a random generator per slot.
 *
 * Import this module DYNAMICALLY and only when `passkeySessionOf(account)` is non-null: it pulls
 * in react-native-passkey (native). thirdweb sessions never load it and keep their derivation
 * paths byte-for-byte.
 */
import { bytesToHex, hashMessage, type Address, type Hex } from 'viem';
import { WHEN_UNLOCKED_THIS_DEVICE_ONLY } from 'expo-secure-store';
import * as SecureStore from '@/lib/storage/secureStorage';
import { deriveMaciKeypairFromSeed } from '@/lib/maci';
import { deriveNostrIdentity } from '@netizen-labs/nostr';
import { loadCitizenPreimage, passkeySaltKey, saltFromSignature } from '@/lib/citizen-commitment';
import { loadStoredIdentity } from '@/lib/nostr/identity';
import { passkeySessionOf } from './active';
import { passkeyApiSession } from './api-session-runtime';
import { PASSKEY_API_URL } from './constants';
import {
  backupDeviceSecrets,
  MACI_KEYPAIR_STORE_KEY,
  resolvePasskeySecret,
  singleFlight,
  type BackupReport,
  type ResolveDeps,
  type ResolveResult,
} from './derived-keys';
import { lookupChain } from './guardians-runtime';
import { createKeyBackupClient, KEY_BACKUP_SLOTS, type KeyBackupSlot, type RemoteBackup } from './key-backup';
import { unwrapSecret, wrapSecret } from './prf-vault';
import { randomBytes } from './random';
import { findLinkedLegacies } from './recovery-lookup';
import { identityKind, type PasskeySession } from './session';
import { signHashAsIdentity, signHashAsIdentityWithPrf, type AdapterDeps } from './thirdweb-adapter';
import { isSafeDeployed, sendPasskeyUserOp } from './userop';
import { getPrfSecret, signWithPasskey } from './webauthn';
import { resolveVaultKey, type VaultKeyStorage } from './words-vault';
import { loadWordsPool, saveWordsPool } from './words-guardians';
import { loadWordsPending } from './words-setup';
import { secureKeyValueStorage } from './migration-runtime';

const adapterDeps: AdapterDeps = {
  sign: signWithPasskey,
  isSafeDeployed: (safe) => isSafeDeployed(safe),
  sendUserOp: (args) => sendPasskeyUserOp(args),
};

const storage = {
  getItem: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
};

/** The words vault key: this device only, readable only while unlocked (never in a backup). */
const VAULT_KEY_OPTIONS = { keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const wordsVaultKeyStorage: VaultKeyStorage = {
  getItem: (k) => SecureStore.getItemAsync(k, VAULT_KEY_OPTIONS),
  setItem: (k, v) => SecureStore.setItemAsync(k, v, VAULT_KEY_OPTIONS),
  deleteItem: (k) => SecureStore.deleteItemAsync(k, VAULT_KEY_OPTIONS),
};

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Random secret in each slot's STORED format (case (c) only). */
export const SLOT_GENERATORS: Record<KeyBackupSlot, () => Uint8Array> = {
  // MaciContext stores the serialized keypair JSON; the seed is reduced mod the SNARK field.
  maci: () => enc.encode(JSON.stringify(deriveMaciKeypairFromSeed(BigInt(bytesToHex(randomBytes(32)))))),
  // A valid secp256k1 scalar in [1, n-1] (deriveNostrIdentity reduces keccak(input)).
  nostr: () => deriveNostrIdentity(bytesToHex(randomBytes(32))).secretKey,
  // Decimal field element, the same shape the signature-derived salt has.
  salt: () => enc.encode(saltFromSignature(bytesToHex(randomBytes(32)))),
};

export function requirePasskeySession(account: unknown): PasskeySession {
  const s = passkeySessionOf<PasskeySession>(account);
  if (!s) throw new Error('not a passkey session');
  return s;
}

export function keyBackupFor(session: PasskeySession): RemoteBackup {
  // The identity as a message signer (the adapter's signMessage) for the API session token.
  const signer = {
    address: session.identity,
    signMessage: ({ message }: { message: string }) => signHashAsIdentity(session, hashMessage(message), adapterDeps),
  };
  return createKeyBackupClient({
    apiUrl: PASSKEY_API_URL,
    identity: session.identity,
    sign: (message) => signHashAsIdentityWithPrf(session, hashMessage(message), adapterDeps),
    session: {
      peek: () => passkeyApiSession.peek(session.identity),
      get: () => passkeyApiSession.get(signer),
      invalidate: (token) => passkeyApiSession.invalidate(token),
    },
  });
}

/** The words pool from a `wvk` blob (a second phone): saved when this device lacks it or holds another. */
async function syncWordsPool(addresses: Address[]): Promise<void> {
  const local = await loadWordsPool(secureKeyValueStorage).catch(() => null);
  if (local && local.addresses.every((a, i) => a.toLowerCase() === addresses[i]?.toLowerCase())) return;
  await saveWordsPool(secureKeyValueStorage, { addresses, confirmedAt: Date.now() });
}

/**
 * The `wordsVaultKey` hook: the current words vault key, verified against the server's `wvk`
 * (words-vault.ts `resolveVaultKey`; it also syncs or clears this device's copy and syncs the
 * words pool). Stays out of the way (null, nothing touched) while this device has a words backup
 * write pending (words-setup.ts): the server's `wvk` is stale until that write lands. Never throws.
 */
export const resolveWordsVaultKey: NonNullable<ResolveDeps['wordsVaultKey']> = async (ctx) => {
  try {
    if (await loadWordsPending(secureKeyValueStorage)) return null;
    return await resolveVaultKey({ storage: wordsVaultKeyStorage, wvkBlob: ctx.wvkBlob, prf: ctx.prf, unwrap: unwrapSecret, savePool: syncWordsPool });
  } catch {
    return null;
  }
};

/** Migrated person: the identity is a legacy account, or the Safe administers one (v3 moveTo). */
export async function hasLegacyHistory(session: PasskeySession): Promise<boolean> {
  if (identityKind(session) === 'legacy') return true;
  return (await findLinkedLegacies(session.safe as Address, lookupChain)).length > 0;
}

const resolving = new Map<string, Promise<ResolveResult>>();

/**
 * Resolves one slot for a passkey session: (a) local → (b) blob → (c) random → (d) KeyBackupNeededError.
 * Concurrent callers for the same identity + slot share ONE resolution (one PRF prompt at most);
 * after it the key is persisted locally, so later calls need no prompt at all.
 */
export function resolveSecretForAccount(
  account: unknown,
  slot: KeyBackupSlot,
  local: { load: () => Promise<Uint8Array | null>; save: (secret: Uint8Array) => Promise<void> },
): Promise<ResolveResult> {
  const session = requirePasskeySession(account);
  return singleFlight(resolving, `${session.identity.toLowerCase()}:${slot}`, () => resolveOnce(session, slot, local));
}

function resolveOnce(
  session: PasskeySession,
  slot: KeyBackupSlot,
  local: { load: () => Promise<Uint8Array | null>; save: (secret: Uint8Array) => Promise<void> },
): Promise<ResolveResult> {
  return resolvePasskeySecret({
    slot,
    loadLocal: local.load,
    saveLocal: local.save,
    storage,
    getPrf: () => getPrfSecret(session.credentialId),
    remote: keyBackupFor(session),
    hasLegacyHistory: () => hasLegacyHistory(session),
    generate: SLOT_GENERATORS[slot],
    wrap: wrapSecret,
    unwrap: unwrapSecret,
    wordsVaultKey: resolveWordsVaultKey,
  });
}

/** Decoders for the bytes a slot resolves to. */
export const decodeMaciSecret = (b: Uint8Array) => dec.decode(b);
export const decodeSaltSecret = (b: Uint8Array) => dec.decode(b);

/** Device secrets as stored today, per slot (for "Schlüssel sichern"). */
export function deviceSecretSources(identity: string) {
  return [
    {
      slot: 'maci' as const,
      loadLocal: async () => {
        const raw = await SecureStore.getItemAsync(MACI_KEYPAIR_STORE_KEY);
        return raw ? enc.encode(raw) : null;
      },
    },
    { slot: 'nostr' as const, loadLocal: async () => (await loadStoredIdentity())?.secretKey ?? null },
    {
      slot: 'salt' as const,
      loadLocal: async () => {
        const salt = (await loadCitizenPreimage(identity))?.salt ?? (await SecureStore.getItemAsync(passkeySaltKey(identity)));
        return salt ? enc.encode(salt) : null;
      },
    },
  ];
}

/**
 * "Schlüssel sichern": uploads this device's MACI / Nostr / salt secrets for the passkey session's
 * identity (at most two fingerprints; the words copies ride in the same write). Never overwrites a
 * different server copy.
 */
export async function backupKeysForSession(session: PasskeySession): Promise<BackupReport> {
  return backupDeviceSecrets(deviceSecretSources(session.identity), {
    storage,
    getPrf: () => getPrfSecret(session.credentialId),
    remote: keyBackupFor(session),
    wrap: wrapSecret,
    unwrap: unwrapSecret,
    wordsVaultKey: resolveWordsVaultKey,
  });
}

/** Does the server hold a backup for this identity (one fingerprint)? Used by the detach checklist. */
export async function readBackupStatus(
  session: PasskeySession,
): Promise<{ status: 'disabled' } | { status: 'ok'; slots: KeyBackupSlot[]; prf?: Hex }> {
  const r = await keyBackupFor(session).read();
  if (r.status === 'disabled') return { status: 'disabled' };
  return { status: 'ok', slots: r.status === 'found' ? KEY_BACKUP_SLOTS.filter((s) => r.blobs[s] !== undefined) : [], ...(r.prf ? { prf: r.prf } : {}) };
}

// ---------------------------------------------------------------------------
// XMTP (lib/xmtp/passkey-link.ts): the Safe signs as ITSELF, never the legacy envelope
// ---------------------------------------------------------------------------

/** The passkey Safe's own ERC-1271 signature over `hash` (6492-wrapped while counterfactual). */
export function signHashAsSafe(session: PasskeySession, hash: Hex): Promise<Hex> {
  return signHashAsIdentity({ ...session, identity: session.safe }, hash, adapterDeps);
}

export const isPasskeySafeDeployed = (safe: Address) => isSafeDeployed(safe);
