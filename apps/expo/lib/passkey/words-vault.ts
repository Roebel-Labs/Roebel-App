/**
 * Second wrapped copy of the derived keys (MACI, Nostr, salt) under the recovery words.
 *
 * The words give a vault key (words.ts `wordsVaultKey`, used wherever prf-vault takes a PRF
 * output). Each secret is wrapped under it once more and stored in the server backup in its
 * `_w` slot, so the words alone can bring the keys back when every passkey is gone. The server
 * only ever holds ciphertext.
 *
 * The app forgets the words after setup; it keeps the vault key on the device
 * (`WORDS_VAULT_KEY_STORE`, this device only) and, wrapped under the passkey PRF, in the `wvk`
 * slot. The server's `wvk` is the truth (`resolveVaultKey`): a second phone that has only the
 * (synced) passkey unwraps it with the PRF of the read it already paid for, and a phone with a
 * stale device copy follows words replaced or switched off elsewhere.
 *
 * New keys (derived-keys.ts, case (c) and "Schlüssel sichern") carry their `_w` blob in the SAME
 * write as the primary blob, so a words copy costs no extra proof.
 *
 * Pure: storage, backup and wrapping are injected (derived-keys-runtime.ts wires them).
 */
import { bytesToHex, getAddress, hexToBytes, isHex, type Address, type Hex } from 'viem';
import { SLOT_LABEL } from './derived-keys';
import { KEY_BACKUP_WORDS_SLOT, type KeyBackupBlobs, type KeyBackupSlot, type RemoteBackup } from './key-backup';
import { WORDS_POOL_SIZE } from './words';

export const WORDS_VAULT_KEY_STORE = 'passkey_words_vault_key_v1';
/** HKDF label of the `wvk` blob (the vault key wrapped under the passkey PRF). */
export const WORDS_VAULT_KEY_LABEL = 'roebel/words-vault-key/v1';

/**
 * "Words switched off": written into `wvk` and every `_w` slot when the words are removed (the
 * backup API has no delete). It matches the server's blob format but is not ciphertext, so it
 * never unwraps; `resolveVaultKey` reads it exactly like "no wvk" (the device copy is cleared).
 */
export const WORDS_OFF_BLOB = `pkv1:words-off-${'0'.repeat(32)}`;
export const isWordsOffBlob = (blob: string | undefined | null): boolean => blob === WORDS_OFF_BLOB;

const ADDRESS_BYTES = 20;

/**
 * Plaintext of the `wvk` blob: the 32-byte vault key, optionally followed by the 5 public word
 * addresses (pool order), so a second phone that unwraps `wvk` also knows which guardians are
 * the words (never shown as people). Ciphertext on the server like everything else.
 */
export function encodeWordsVault(vaultKey: Hex, addresses?: readonly Address[]): Uint8Array {
  const key = hexToBytes(vaultKey);
  if (key.length !== 32) throw new Error('a words vault key is 32 bytes');
  if (!addresses) return key;
  if (addresses.length !== WORDS_POOL_SIZE) throw new Error(`a words pool has exactly ${WORDS_POOL_SIZE} addresses`);
  const out = new Uint8Array(32 + ADDRESS_BYTES * WORDS_POOL_SIZE);
  out.set(key, 0);
  addresses.forEach((a, i) => out.set(hexToBytes(getAddress(a)), 32 + i * ADDRESS_BYTES));
  return out;
}

export function decodeWordsVault(bytes: Uint8Array): { vaultKey: Hex; addresses: Address[] | null } | null {
  if (bytes.length === 32) return { vaultKey: bytesToHex(bytes), addresses: null };
  if (bytes.length !== 32 + ADDRESS_BYTES * WORDS_POOL_SIZE) return null;
  const addresses: Address[] = [];
  for (let i = 0; i < WORDS_POOL_SIZE; i++) {
    addresses.push(getAddress(bytesToHex(bytes.slice(32 + i * ADDRESS_BYTES, 32 + (i + 1) * ADDRESS_BYTES))));
  }
  return { vaultKey: bytesToHex(bytes.slice(0, 32)), addresses };
}

export function wordsSlot(slot: KeyBackupSlot): 'maci_w' | 'nostr_w' | 'salt_w' {
  return KEY_BACKUP_WORDS_SLOT[slot];
}

export type VaultKeyStorage = {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
  deleteItem(k: string): Promise<void>;
};

const isVaultKey = (v: unknown): v is Hex => typeof v === 'string' && isHex(v, { strict: true }) && v.length === 66;

export async function loadVaultKey(storage: VaultKeyStorage): Promise<Hex | null> {
  const v = await storage.getItem(WORDS_VAULT_KEY_STORE);
  return isVaultKey(v) ? (v.toLowerCase() as Hex) : null;
}

export async function saveVaultKey(storage: VaultKeyStorage, key: Hex): Promise<void> {
  if (!isVaultKey(key)) throw new Error('a words vault key is 32 bytes');
  await storage.setItem(WORDS_VAULT_KEY_STORE, key.toLowerCase());
}

export async function clearVaultKey(storage: VaultKeyStorage): Promise<void> {
  await storage.deleteItem(WORDS_VAULT_KEY_STORE);
}

type Unwrap = (prf: Hex, label: string, blob: string) => Promise<Uint8Array>;
type Wrap = (prf: Hex, label: string, secret: Uint8Array) => Promise<string>;

/**
 * The vault key of the CURRENT words, verified against the server. `wvkBlob` is the `wvk` slot of
 * a fresh backup read (undefined = the server has none) and `prf` the PRF of that read's assertion.
 *
 * The server's `wvk` is the truth: words replaced or switched off on another phone must never be
 * overwritten by a stale device copy.
 *   - server has no `wvk`, or the off marker (`WORDS_OFF_BLOB`) → words are off: the device copy
 *     is cleared, null
 *   - `wvk` + PRF                    → unwrap it; the device copy is overwritten when it differs
 *   - `wvk` but no PRF, or a `wvk` for another passkey → null (the device copy alone is not
 *     trusted, and it is kept: it cannot be checked)
 * Never throws on a bad blob: no vault key only means no second copy.
 */
export async function resolveVaultKey(d: {
  storage: VaultKeyStorage;
  wvkBlob?: string;
  prf?: Hex | null;
  unwrap: Unwrap;
  /** Called with the pool addresses when the `wvk` blob carries them (best effort, never fails the key). */
  savePool?: (addresses: Address[]) => Promise<void>;
}): Promise<Hex | null> {
  if (!d.wvkBlob || isWordsOffBlob(d.wvkBlob)) {
    if ((await d.storage.getItem(WORDS_VAULT_KEY_STORE)) !== null) await clearVaultKey(d.storage);
    return null;
  }
  if (!d.prf) return null;
  const vault = await unwrapWordsVault(d.prf, d.wvkBlob, d.unwrap);
  if (!vault) return null;
  const key = vault.vaultKey;
  if ((await loadVaultKey(d.storage)) !== key) await saveVaultKey(d.storage, key);
  if (vault.addresses && d.savePool) {
    try {
      await d.savePool(vault.addresses);
    } catch {
      // The pool is a display aid; the key is what matters here.
    }
  }
  return key;
}

/** Unwraps a `wvk` blob: null for the off marker, a wrong passkey or a malformed payload. Never throws. */
export async function unwrapWordsVault(
  prf: Hex,
  blob: string,
  unwrap: Unwrap,
): Promise<{ vaultKey: Hex; addresses: Address[] | null } | null> {
  if (isWordsOffBlob(blob)) return null;
  try {
    return decodeWordsVault(await unwrap(prf, WORDS_VAULT_KEY_LABEL, blob));
  } catch {
    return null;
  }
}

/** The `wvk` blob for a vault key (and, from setup, the 5 public pool addresses). */
export function wrapVaultKey(prf: Hex, vaultKey: Hex, wrap: Wrap, addresses?: readonly Address[]): Promise<string> {
  return wrap(prf, WORDS_VAULT_KEY_LABEL, encodeWordsVault(vaultKey, addresses));
}

/** `wvk` is present only when `extra.wvk` was given: whether that blob was stored. */
export type WordsCopyResult = { stored: KeyBackupSlot[]; failed: KeyBackupSlot[]; wvk?: boolean };

/**
 * Wraps every secret under the vault key into its `_w` slot and stores them (plus `extra.wvk`) in
 * ONE backup write, so one write costs one proof. Never throws: a failure is reported per slot.
 * Callers pass `replace: true` (the `_w` copies belong to the current words; stale ones from
 * earlier words must be overwritten, not refused).
 */
export async function writeWordsCopies(d: {
  vaultKey: Hex;
  secrets: { slot: KeyBackupSlot; secret: Uint8Array }[];
  remote: RemoteBackup;
  wrap: Wrap;
  replace?: boolean;
  extra?: { wvk?: string };
}): Promise<WordsCopyResult> {
  const slots = d.secrets.map((s) => s.slot);
  const withWvk = (ok: boolean) => (d.extra?.wvk ? { wvk: ok } : {});
  if (slots.length === 0 && !d.extra?.wvk) return { stored: [], failed: [] };
  try {
    const blobs: KeyBackupBlobs = {};
    for (const { slot, secret } of d.secrets) blobs[wordsSlot(slot)] = await d.wrap(d.vaultKey, SLOT_LABEL[slot], secret);
    if (d.extra?.wvk) blobs.wvk = d.extra.wvk;
    const w = await d.remote.write(blobs, d.replace ?? false);
    return w === 'stored' ? { stored: slots, failed: [], ...withWvk(true) } : { stored: [], failed: slots, ...withWvk(false) };
  } catch {
    return { stored: [], failed: slots, ...withWvk(false) };
  }
}
