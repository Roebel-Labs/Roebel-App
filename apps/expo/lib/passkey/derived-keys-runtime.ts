/**
 * Real-world wiring for derived-keys.ts: the passkey session behind the active account, the
 * server key backup, SecureStore, PRF, and a random generator per slot.
 *
 * Import this module DYNAMICALLY and only when `passkeySessionOf(account)` is non-null: it pulls
 * in react-native-passkey (native). thirdweb sessions never load it and keep their derivation
 * paths byte-for-byte.
 */
import { bytesToHex, hashMessage, type Address, type Hex } from 'viem';
import * as SecureStore from '@/lib/storage/secureStorage';
import { deriveMaciKeypairFromSeed } from '@/lib/maci';
import { deriveNostrIdentity } from '@netizen-labs/nostr';
import { loadCitizenPreimage, saltFromSignature } from '@/lib/citizen-commitment';
import { loadStoredIdentity } from '@/lib/nostr/identity';
import { passkeySessionOf } from './active';
import { PASSKEY_API_URL } from './constants';
import {
  backupDeviceSecrets,
  MACI_KEYPAIR_STORE_KEY,
  resolvePasskeySecret,
  type BackupReport,
  type ResolveResult,
} from './derived-keys';
import { lookupChain } from './guardians-runtime';
import { createKeyBackupClient, type KeyBackupSlot, type RemoteBackup } from './key-backup';
import { unwrapSecret, wrapSecret } from './prf-vault';
import { randomBytes } from './random';
import { findLinkedLegacies } from './recovery-lookup';
import { identityKind, type PasskeySession } from './session';
import { signHashAsIdentity, signHashAsIdentityWithPrf, type AdapterDeps } from './thirdweb-adapter';
import { isSafeDeployed, sendPasskeyUserOp } from './userop';
import { getPrfSecret, signWithPasskey } from './webauthn';

const adapterDeps: AdapterDeps = {
  sign: signWithPasskey,
  isSafeDeployed: (safe) => isSafeDeployed(safe),
  sendUserOp: (args) => sendPasskeyUserOp(args),
};

const storage = {
  getItem: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
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
  return createKeyBackupClient({
    apiUrl: PASSKEY_API_URL,
    identity: session.identity,
    sign: (message) => signHashAsIdentityWithPrf(session, hashMessage(message), adapterDeps),
  });
}

/** Migrated person: the identity is a legacy account, or the Safe administers one (v3 moveTo). */
export async function hasLegacyHistory(session: PasskeySession): Promise<boolean> {
  if (identityKind(session) === 'legacy') return true;
  return (await findLinkedLegacies(session.safe as Address, lookupChain)).length > 0;
}

/** Resolves one slot for a passkey session: (a) local → (b) blob → (c) random → (d) KeyBackupNeededError. */
export async function resolveSecretForAccount(
  account: unknown,
  slot: KeyBackupSlot,
  local: { load: () => Promise<Uint8Array | null>; save: (secret: Uint8Array) => Promise<void> },
): Promise<ResolveResult> {
  const session = requirePasskeySession(account);
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
        const salt = (await loadCitizenPreimage(identity))?.salt;
        return salt ? enc.encode(salt) : null;
      },
    },
  ];
}

/**
 * "Schlüssel sichern": uploads this device's MACI / Nostr / salt secrets for the passkey session's
 * identity (at most two fingerprints). Never overwrites a different server copy.
 */
export async function backupKeysForSession(session: PasskeySession): Promise<BackupReport> {
  return backupDeviceSecrets(deviceSecretSources(session.identity), {
    storage,
    getPrf: () => getPrfSecret(session.credentialId),
    remote: keyBackupFor(session),
    wrap: wrapSecret,
    unwrap: unwrapSecret,
  });
}

/** Does the server hold a backup for this identity (one fingerprint)? Used by the detach checklist. */
export async function readBackupStatus(
  session: PasskeySession,
): Promise<{ status: 'disabled' } | { status: 'ok'; slots: KeyBackupSlot[]; prf?: Hex }> {
  const r = await keyBackupFor(session).read();
  if (r.status === 'disabled') return { status: 'disabled' };
  return { status: 'ok', slots: r.status === 'found' ? (Object.keys(r.blobs) as KeyBackupSlot[]) : [], ...(r.prf ? { prf: r.prf } : {}) };
}

// ---------------------------------------------------------------------------
// XMTP (lib/xmtp/passkey-link.ts): the Safe signs as ITSELF, never the legacy envelope
// ---------------------------------------------------------------------------

/** The passkey Safe's own ERC-1271 signature over `hash` (6492-wrapped while counterfactual). */
export function signHashAsSafe(session: PasskeySession, hash: Hex): Promise<Hex> {
  return signHashAsIdentity({ ...session, identity: session.safe }, hash, adapterDeps);
}

export const isPasskeySafeDeployed = (safe: Address) => isSafeDeployed(safe);
