/**
 * Secrets that a thirdweb session derives from a deterministic signature, resolved for a PASSKEY
 * session (a WebAuthn signature is randomized, so re-deriving would give a new key every time).
 *
 * Order for one slot (MACI keypair, Nostr key, commitment salt):
 *   (a) the key already persisted on this device            → use it (exactly as today)
 *   (b) a PRF-wrapped blob on this device (`passkey_wrapped_*_v1`, written by the migration's
 *       "Schlüssel schützen") or in the server backup       → unwrap with the passkey PRF,
 *       persist locally like today
 *   (c) nothing anywhere and the identity has NO legacy history (a passkey-only person)
 *                                                            → a RANDOM key, wrapped under the PRF,
 *       backed up, then persisted
 *   (d) otherwise (a migrated person on a new device, no blob) → `KeyBackupNeededError` with a
 *       German explanation. A key is NEVER derived from a passkey signature: a wrong MACI key =
 *       unusable votes.
 *
 * A transport failure of the backup service throws (retry later); it is never read as "no backup",
 * so (c) cannot mint a second key just because the network was down.
 *
 * Recovery words (words-vault.ts): when the optional `wordsVaultKey` hook yields the current words
 * vault key, a key generated in (c) and every secret "Schlüssel sichern" uploads also get a second
 * copy (`_w` slot) under it, in the SAME write as the primary blob (no extra proof). That copy is
 * best effort: its failure never fails the key.
 *
 * Pure: storage, PRF, backup and generation are injected (derived-keys-runtime.ts wires them).
 */
import type { Hex } from 'viem';
import { KEY_BACKUP_WORDS_SLOT, type KeyBackupBlobs, type KeyBackupSlot, type RemoteBackup, type RemoteRead } from './key-backup';
import { MACI_WRAP_LABEL, NOSTR_WRAP_LABEL, WRAPPED_MACI_KEY, WRAPPED_NOSTR_KEY } from './migration';

export const SALT_WRAP_LABEL = 'roebel/commitment-salt/v1';
/** Where MaciContext persists the MACI keypair JSON (unchanged since v1). */
export const MACI_KEYPAIR_STORE_KEY = 'roebel.maci.keypair.v1';
export const WRAPPED_SALT_KEY = 'passkey_wrapped_salt_v1';

/** HKDF labels per slot (the migration's MACI / Nostr labels are reused, so its blobs unwrap here). */
export const SLOT_LABEL: Record<KeyBackupSlot, string> = {
  maci: MACI_WRAP_LABEL,
  nostr: NOSTR_WRAP_LABEL,
  salt: SALT_WRAP_LABEL,
};

/** SecureStore key of the device-local PRF blob per slot. */
export const SLOT_DEVICE_BLOB: Record<KeyBackupSlot, string> = {
  maci: WRAPPED_MACI_KEY,
  nostr: WRAPPED_NOSTR_KEY,
  salt: WRAPPED_SALT_KEY,
};

const FEATURE: Record<KeyBackupSlot, string> = {
  maci: 'Abstimmen',
  nostr: 'Öffentliche Beiträge (Nostr)',
  salt: 'Die Bürger-Bestätigung',
};

export function keyBackupNeededMessage(slot: KeyBackupSlot): string {
  return (
    `${FEATURE[slot]} braucht deinen Schlüssel von deinem bisherigen Gerät oder eine Schlüssel-Sicherung. ` +
    'Öffne die App auf dem alten Gerät und tippe unter Einstellungen → Passkey & Wiederherstellung auf ' +
    '„Schlüssel sichern“. Solange deine Google-/E-Mail-Anmeldung noch verbunden ist, kannst du dich auch ' +
    'einmal damit anmelden – dann wird der Schlüssel wie bisher hergestellt.'
  );
}

export const NO_PRF_MESSAGE =
  'Dein Passkey kann auf diesem Gerät keine Schlüssel entsperren. Bitte nutze ein Gerät, dessen Passkey-Anbieter das unterstützt.';
export const UNWRAP_FAILED_MESSAGE =
  'Deine Schlüssel-Sicherung passt nicht zu diesem Passkey. Bitte melde dich mit dem Passkey an, mit dem du sie erstellt hast.';
export const BACKUP_RACE_MESSAGE =
  'Auf einem anderen Gerät wurde gerade ein Schlüssel gesichert. Bitte versuche es noch einmal.';

/** Case (d): the feature needs the old device or a backup. Carries a German, user-facing message. */
export class KeyBackupNeededError extends Error {
  readonly slot: KeyBackupSlot;
  constructor(slot: KeyBackupSlot) {
    super(keyBackupNeededMessage(slot));
    this.name = 'KeyBackupNeededError';
    this.slot = slot;
  }
}

export type DeviceStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export type ResolveDeps = {
  slot: KeyBackupSlot;
  /** (a) The secret persisted on this device the way the app stores it today, or null. */
  loadLocal: () => Promise<Uint8Array | null>;
  /** Persist like today (only called for (b) / (c)). */
  saveLocal: (secret: Uint8Array) => Promise<void>;
  storage: DeviceStorage;
  /** One PRF evaluation (a fingerprint); null when the authenticator has no PRF. */
  getPrf: () => Promise<Hex | null>;
  /** The server backup; absent = not configured. */
  remote?: RemoteBackup;
  /** true for a migrated person (legacy identity, or a Safe identity that administers a legacy account). */
  hasLegacyHistory: () => Promise<boolean>;
  /** A fresh random secret in the slot's stored format (case (c) only). */
  generate: () => Uint8Array;
  wrap: (prf: Hex, label: string, secret: Uint8Array) => Promise<string>;
  unwrap: (prf: Hex, label: string, blob: string) => Promise<Uint8Array>;
  /**
   * The CURRENT recovery-words vault key, verified against the server's `wvk` (words-vault.ts
   * `resolveVaultKey`), or null (words off / unverifiable). `ctx` = the PRF and `wvk` blob of the
   * backup read this resolution already made. Used for the `_w` copy of a generated key (c) and of
   * every secret `backupDeviceSecrets` uploads. A failure never fails the key.
   */
  wordsVaultKey?: (ctx: { prf: Hex | null; wvkBlob?: string }) => Promise<Hex | null>;
};

export type ResolveSource = 'local' | 'deviceBlob' | 'backup' | 'generated';
export type ResolveResult = { secret: Uint8Array; source: ResolveSource; backedUp?: boolean };

/**
 * Runs `fn` once per key at a time: concurrent callers share the same promise (so two screens
 * resolving the same slot cost ONE PRF prompt, not two).
 */
export function singleFlight<T>(inFlight: Map<string, Promise<T>>, key: string, fn: () => Promise<T>): Promise<T> {
  let pending = inFlight.get(key);
  if (!pending) {
    pending = fn().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}

type WordsBlobs = Partial<Record<(typeof KEY_BACKUP_WORDS_SLOT)[KeyBackupSlot], string>>;

/**
 * `_w` blobs for `secrets` under the current words vault key; empty when words are off or the key
 * cannot be verified. Never throws.
 */
async function wordsBlobsFor(
  d: Pick<ResolveDeps, 'wordsVaultKey' | 'wrap'>,
  read: RemoteRead,
  prf: Hex | null,
  secrets: { slot: KeyBackupSlot; secret: Uint8Array }[],
): Promise<{ blobs: WordsBlobs; on: boolean }> {
  if (!d.wordsVaultKey || read.status === 'disabled' || secrets.length === 0) return { blobs: {}, on: false };
  try {
    const vaultKey = await d.wordsVaultKey({ prf, wvkBlob: read.status === 'found' ? read.blobs.wvk : undefined });
    if (!vaultKey) return { blobs: {}, on: false };
    const blobs: WordsBlobs = {};
    for (const { slot, secret } of secrets) blobs[KEY_BACKUP_WORDS_SLOT[slot]] = await d.wrap(vaultKey, SLOT_LABEL[slot], secret);
    return { blobs, on: true };
  } catch {
    return { blobs: {}, on: false };
  }
}

/**
 * Writes primary blobs together with their `_w` copies in ONE write (no `replace`: the primary
 * slots keep the server's 409 guard; the session token applies, so no extra proof). A `_w` slot
 * the read already showed (a stale copy from earlier words) goes into a separate `replace: true`
 * write of the `_w` slots alone (rare; one proof).
 * A 409 on the combined write is retried with the primary alone; if that succeeds, a `_w` slot
 * appeared AFTER our read (likely words enabled / regenerated on another phone under a new vault
 * key), so our copies are NOT forced: they are reported as not copied and the next run, reading
 * the new `_w` together with the current `wvk`, handles them.
 * Returns the primary write's answer and which slots got their words copy.
 */
async function writeWithWordsCopies(
  remote: RemoteBackup,
  read: RemoteRead,
  primary: Partial<Record<KeyBackupSlot, string>>,
  words: WordsBlobs,
): Promise<{ w: Awaited<ReturnType<RemoteBackup['write']>>; copied: KeyBackupSlot[] }> {
  const existing: KeyBackupBlobs = read.status === 'found' ? read.blobs : {};
  const slots = Object.keys(primary) as KeyBackupSlot[];
  const fresh: WordsBlobs = {};
  const stale: WordsBlobs = {};
  for (const slot of slots) {
    const ws = KEY_BACKUP_WORDS_SLOT[slot];
    if (words[ws] === undefined) continue;
    (existing[ws] === undefined ? fresh : stale)[ws] = words[ws];
  }
  let w = await remote.write({ ...primary, ...fresh });
  if (w === 'exists' && Object.keys(fresh).length > 0) {
    // Either a primary slot was written meanwhile (race) or a `_w` slot was: retry the primary alone.
    // The fresh copies are dropped, never replaced: they may be under a vault key that is no longer current.
    w = await remote.write(primary);
    for (const k of Object.keys(fresh)) delete fresh[k as keyof WordsBlobs];
  }
  const copied = slots.filter((s) => w === 'stored' && fresh[KEY_BACKUP_WORDS_SLOT[s]] !== undefined);
  if (w === 'stored' && Object.keys(stale).length > 0) {
    // Narrow race window (accepted): if the words are rotated on another phone between our read and
    // this write, this replace puts copies under the old vault key over the new ones. The window is
    // one round trip, and it only exists when the read already showed a stale `_w`.
    try {
      if ((await remote.write(stale, true)) === 'stored') {
        copied.push(...slots.filter((s) => stale[KEY_BACKUP_WORDS_SLOT[s]] !== undefined));
      }
    } catch {
      // Best effort: the primary blobs are stored.
    }
  }
  return { w, copied };
}

export async function resolvePasskeySecret(d: ResolveDeps): Promise<ResolveResult> {
  const local = await d.loadLocal();
  if (local && local.length > 0) return { secret: local, source: 'local' }; // (a)

  let prf: Hex | null | undefined;
  const prfOnce = async (): Promise<Hex> => {
    if (prf === undefined) prf = await d.getPrf();
    if (!prf) throw new Error(NO_PRF_MESSAGE);
    return prf;
  };
  const unwrapWith = async (blob: string): Promise<Uint8Array> => {
    const key = await prfOnce();
    try {
      return await d.unwrap(key, SLOT_LABEL[d.slot], blob);
    } catch {
      throw new Error(UNWRAP_FAILED_MESSAGE);
    }
  };

  // (b) device blob
  const deviceBlob = await d.storage.getItem(SLOT_DEVICE_BLOB[d.slot]);
  if (deviceBlob) {
    const secret = await unwrapWith(deviceBlob);
    await d.saveLocal(secret);
    return { secret, source: 'deviceBlob' };
  }

  // (b') server backup — a failure throws (never "no backup")
  const read: RemoteRead = d.remote ? await d.remote.read() : { status: 'disabled' };
  if (read.status !== 'disabled' && read.prf) prf = read.prf;
  const remoteBlob = read.status === 'found' ? read.blobs[d.slot] : undefined;
  if (remoteBlob) {
    const secret = await unwrapWith(remoteBlob);
    await d.storage.setItem(SLOT_DEVICE_BLOB[d.slot], remoteBlob);
    await d.saveLocal(secret);
    return { secret, source: 'backup' };
  }

  // (d) a migrated person must never get a fresh key silently
  if (await d.hasLegacyHistory()) throw new KeyBackupNeededError(d.slot);

  // (c) passkey-only: random key, wrapped + backed up BEFORE it is used
  const secret = d.generate();
  if (prf === undefined) prf = await d.getPrf();
  if (!prf) {
    // No PRF: usable on this device only. Still never derived from a signature.
    await d.saveLocal(secret);
    return { secret, source: 'generated', backedUp: false };
  }
  const blob = await d.wrap(prf, SLOT_LABEL[d.slot], secret);
  let backedUp = false;
  if (d.remote && read.status !== 'disabled') {
    const words = await wordsBlobsFor(d, read, prf, [{ slot: d.slot, secret }]);
    const { w } = await writeWithWordsCopies(d.remote, read, { [d.slot]: blob }, words.blobs);
    if (w === 'exists') throw new Error(BACKUP_RACE_MESSAGE);
    backedUp = w === 'stored';
  }
  await d.storage.setItem(SLOT_DEVICE_BLOB[d.slot], blob);
  await d.saveLocal(secret);
  return { secret, source: 'generated', backedUp };
}

// ---------------------------------------------------------------------------
// "Schlüssel sichern": upload what this device holds
// ---------------------------------------------------------------------------

export type BackupSource = { slot: KeyBackupSlot; loadLocal: () => Promise<Uint8Array | null> };

export type BackupReport = {
  /** Slots now in the server backup (newly stored or already there with the same secret). */
  saved: KeyBackupSlot[];
  /** Slots the server already holds with a DIFFERENT secret (left untouched). */
  conflicts: KeyBackupSlot[];
  /** Slots this device has no secret for. */
  missing: KeyBackupSlot[];
  status: 'done' | 'disabled';
  /** Second copies under the recovery words for this run's uploads (empty when the words are off). */
  wordsCopies: { stored: KeyBackupSlot[]; failed: KeyBackupSlot[] };
};

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Uploads the device's secrets (reusing its device blobs, wrapping the rest under the PRF).
 * Never overwrites a server blob: a slot the server already has is compared by PLAINTEXT
 * (blobs differ per wrap because of the random IV) and reported as saved or as a conflict.
 * Costs at most two fingerprints (read + write): the `_w` copies under the recovery words ride in
 * the same write. Only a stale `_w` copy from earlier words needs one more (`replace`) proof.
 */
export async function backupDeviceSecrets(
  sources: BackupSource[],
  d: Pick<ResolveDeps, 'storage' | 'getPrf' | 'remote' | 'wrap' | 'unwrap' | 'wordsVaultKey'>,
): Promise<BackupReport> {
  const off = (): BackupReport => ({ saved: [], conflicts: [], missing: [], status: 'disabled', wordsCopies: { stored: [], failed: [] } });
  if (!d.remote) return off();
  const read = await d.remote.read();
  if (read.status === 'disabled') return off();
  let prf: Hex | null | undefined = read.prf;
  const prfOnce = async (): Promise<Hex> => {
    if (prf === undefined) prf = await d.getPrf();
    if (!prf) throw new Error(NO_PRF_MESSAGE);
    return prf;
  };

  const report: BackupReport = { saved: [], conflicts: [], missing: [], status: 'done', wordsCopies: { stored: [], failed: [] } };
  const upload: Partial<Record<KeyBackupSlot, string>> = {};
  const uploaded: { slot: KeyBackupSlot; secret: Uint8Array }[] = [];
  for (const { slot, loadLocal } of sources) {
    const secret = await loadLocal();
    if (!secret || secret.length === 0) {
      report.missing.push(slot);
      continue;
    }
    const existing = read.status === 'found' ? read.blobs[slot] : undefined;
    if (existing) {
      let same = false;
      try {
        same = sameBytes(await d.unwrap(await prfOnce(), SLOT_LABEL[slot], existing), secret);
      } catch (e) {
        if (e instanceof Error && e.message === NO_PRF_MESSAGE) throw e;
        same = false;
      }
      (same ? report.saved : report.conflicts).push(slot);
      continue;
    }
    let blob = await d.storage.getItem(SLOT_DEVICE_BLOB[slot]);
    if (blob) {
      // A device blob must hold THIS secret (it could predate a key change on this device).
      let ok = false;
      try {
        ok = sameBytes(await d.unwrap(await prfOnce(), SLOT_LABEL[slot], blob), secret);
      } catch (e) {
        if (e instanceof Error && e.message === NO_PRF_MESSAGE) throw e;
      }
      if (!ok) blob = null;
    }
    if (!blob) {
      blob = await d.wrap(await prfOnce(), SLOT_LABEL[slot], secret);
      await d.storage.setItem(SLOT_DEVICE_BLOB[slot], blob);
    }
    upload[slot] = blob;
    uploaded.push({ slot, secret });
  }
  if (Object.keys(upload).length > 0) {
    // No PRF yet (token read, device blobs reused) → the vault key cannot be verified: no copy.
    const words = await wordsBlobsFor(d, read, prf ?? null, uploaded);
    const { w, copied } = await writeWithWordsCopies(d.remote, read, upload, words.blobs);
    if (w === 'disabled') return { ...report, status: 'disabled' };
    if (w === 'exists') throw new Error(BACKUP_RACE_MESSAGE);
    report.saved.push(...(Object.keys(upload) as KeyBackupSlot[]));
    if (words.on) {
      report.wordsCopies.stored.push(...copied);
      report.wordsCopies.failed.push(...uploaded.map((u) => u.slot).filter((s) => !copied.includes(s)));
    }
  }
  return report;
}
