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
 * slot. A second phone that has only the (synced) passkey unwraps `wvk` with the PRF of the read
 * it already paid for, saves the key, and can then make `_w` copies of keys created there.
 *
 * Pure: storage, backup and wrapping are injected (derived-keys-runtime.ts wires them).
 */
import { bytesToHex, hexToBytes, isHex, type Hex } from 'viem';
import { SLOT_LABEL } from './derived-keys';
import type { KeyBackupBlobs, KeyBackupSlot, RemoteBackup } from './key-backup';

export const WORDS_VAULT_KEY_STORE = 'passkey_words_vault_key_v1';
/** HKDF label of the `wvk` blob (the vault key wrapped under the passkey PRF). */
export const WORDS_VAULT_KEY_LABEL = 'roebel/words-vault-key/v1';

const WORDS_SLOT: Record<KeyBackupSlot, 'maci_w' | 'nostr_w' | 'salt_w'> = {
  maci: 'maci_w',
  nostr: 'nostr_w',
  salt: 'salt_w',
};

export function wordsSlot(slot: KeyBackupSlot): 'maci_w' | 'nostr_w' | 'salt_w' {
  return WORDS_SLOT[slot];
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
 * The vault key: the device copy, else the `wvk` blob unwrapped with the PRF (then saved on this
 * device), else null (words not set up, or no PRF / a blob for another passkey). Never throws on
 * a bad blob: no vault key only means no second copy.
 */
export async function resolveVaultKey(d: {
  storage: VaultKeyStorage;
  wvkBlob?: string;
  prf?: Hex | null;
  unwrap: Unwrap;
}): Promise<Hex | null> {
  const local = await loadVaultKey(d.storage);
  if (local) return local;
  if (!d.wvkBlob || !d.prf) return null;
  let key: Hex;
  try {
    const bytes = await d.unwrap(d.prf, WORDS_VAULT_KEY_LABEL, d.wvkBlob);
    if (bytes.length !== 32) return null;
    key = bytesToHex(bytes);
  } catch {
    return null;
  }
  await saveVaultKey(d.storage, key);
  return key;
}

/** The `wvk` blob for a vault key (T5 passes it to `writeWordsCopies` via `extra`). */
export function wrapVaultKey(prf: Hex, vaultKey: Hex, wrap: Wrap): Promise<string> {
  return wrap(prf, WORDS_VAULT_KEY_LABEL, hexToBytes(vaultKey));
}

export type WordsCopyResult = { stored: KeyBackupSlot[]; failed: KeyBackupSlot[] };

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
  if (slots.length === 0 && !d.extra?.wvk) return { stored: [], failed: [] };
  try {
    const blobs: KeyBackupBlobs = {};
    for (const { slot, secret } of d.secrets) blobs[wordsSlot(slot)] = await d.wrap(d.vaultKey, SLOT_LABEL[slot], secret);
    if (d.extra?.wvk) blobs.wvk = d.extra.wvk;
    const w = await d.remote.write(blobs, d.replace ?? false);
    return w === 'stored' ? { stored: slots, failed: [] } : { stored: [], failed: slots };
  } catch {
    return { stored: [], failed: slots };
  }
}

export const WORDS_COPY_FAILED_MESSAGE = 'Die zweite Sicherung unter deinen Wiederherstellungswörtern ist fehlgeschlagen.';

type CopyCtx = { prf: Hex | null; wvkBlob?: string };

/**
 * The `ResolveDeps.wordsCopy` hook: resolves the vault key, then writes the `_w` copies with
 * `replace: true`. Calls made in the same tick (backupDeviceSecrets issues one per uploaded slot
 * before awaiting) are coalesced into ONE write, so a "Schlüssel sichern" costs one extra proof,
 * not three. No vault key (words not set up) → nothing is written and the call resolves.
 * A failed copy rejects (the caller reports it; it never fails the key itself).
 */
export function createWordsCopier(d: {
  storage: VaultKeyStorage;
  remote: () => RemoteBackup;
  wrap: Wrap;
  unwrap: Unwrap;
}): (slot: KeyBackupSlot, secret: Uint8Array, ctx: CopyCtx) => Promise<void> {
  type Item = { slot: KeyBackupSlot; secret: Uint8Array; resolve: () => void; reject: (e: Error) => void };
  let pending: { items: Item[]; ctx: CopyCtx } | null = null;

  const flush = async (b: { items: Item[]; ctx: CopyCtx }) => {
    try {
      const vaultKey = await resolveVaultKey({ storage: d.storage, wvkBlob: b.ctx.wvkBlob, prf: b.ctx.prf, unwrap: d.unwrap });
      if (!vaultKey) {
        for (const i of b.items) i.resolve();
        return;
      }
      // One entry per slot (a later call for the same slot wins).
      const bySlot = new Map<KeyBackupSlot, Uint8Array>();
      for (const i of b.items) bySlot.set(i.slot, i.secret);
      const r = await writeWordsCopies({
        vaultKey,
        secrets: [...bySlot].map(([slot, secret]) => ({ slot, secret })),
        remote: d.remote(),
        wrap: d.wrap,
        replace: true,
      });
      for (const i of b.items) {
        if (r.failed.includes(i.slot)) i.reject(new Error(WORDS_COPY_FAILED_MESSAGE));
        else i.resolve();
      }
    } catch {
      for (const i of b.items) i.reject(new Error(WORDS_COPY_FAILED_MESSAGE));
    }
  };

  return (slot, secret, ctx) =>
    new Promise<void>((resolve, reject) => {
      if (!pending) {
        const batch: { items: Item[]; ctx: CopyCtx } = { items: [], ctx: { prf: null } };
        pending = batch;
        queueMicrotask(() => {
          pending = null;
          void flush(batch);
        });
      }
      const b = pending;
      if (!b.ctx.prf && ctx.prf) b.ctx.prf = ctx.prf;
      if (!b.ctx.wvkBlob && ctx.wvkBlob) b.ctx.wvkBlob = ctx.wvkBlob;
      b.items.push({ slot, secret, resolve, reject });
    });
}
