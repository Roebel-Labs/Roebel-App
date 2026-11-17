/**
 * Setting the recovery words up, replacing them and removing them. Pure: every side effect is
 * injected (words-setup-runtime.ts wires the real ones).
 *
 * Enable / replace, in this order:
 *   (1) ONE sponsored op from `planGuardianSet`: the people stay, the first t word addresses become
 *       guardians (t = the on-chain threshold when ≥ 1, so a stricter choice survives), and the
 *       word guardians of earlier words (the known pool) are revoked in the same op;
 *   (2) save the pool (5 public addresses) and (3) the vault key on this device;
 *   (4) ONE `replace: true` backup write with the `_w` copy of every key on the device and the
 *       `wvk` blob (vault key + pool addresses, wrapped under the passkey PRF; no PRF → skipped).
 * The phrase is never stored and never returned.
 *
 * Remove: one op revoking the word guardians, then the off marker (`WORDS_OFF_BLOB`) into `wvk`
 * and every `_w` slot (one `replace: true` write; the backup API has no delete), then the pool
 * and the vault key are forgotten. Other phones read the marker as "words off".
 *
 * A failed backup write after a successful op leaves a pending marker (`WORDS_PENDING_KEY`):
 * `retryWordsBackup` finishes it later from the stored vault key and pool (no phrase needed), and
 * the runtime's words hook stays out of the way until then (it would follow the stale server `wvk`).
 *
 * Fingerprints: the op (whose assertion also yields the PRF in the runtime) + the write's proof.
 * Only a phone without the pool and with guardians on chain reads the backup first to learn the
 * old pool (its signed read's PRF is reused).
 */
import type { Address, Hex } from 'viem';
import { KEY_BACKUP_WORDS_SLOTS, type KeyBackupBlobs, type KeyBackupSlot, type RemoteBackup } from './key-backup';
import type { KeyValueStorage } from './migration';
import type { SponsoredCall } from './userop';
import { phraseErrorMessage, validatePhrase, wordsFromSeed } from './words';
import { clearWordsPool, loadWordsPool, planGuardianSet, saveWordsPool, splitGuardians, type WordsPool } from './words-guardians';
import {
  clearVaultKey,
  loadVaultKey,
  saveVaultKey,
  unwrapWordsVault,
  WORDS_OFF_BLOB,
  wrapVaultKey,
  writeWordsCopies,
  type VaultKeyStorage,
} from './words-vault';
import type { wrapSecret, unwrapSecret } from './prf-vault';

export const WORDS_PENDING_KEY = 'passkey_words_backup_pending_v1';
export type WordsPending = 'on' | 'off';

export const WORDS_SETUP_FAILED_MESSAGE = 'Das hat nicht geklappt. Deine Wiederherstellungswörter wurden nicht eingerichtet.';
export const WORDS_REMOVE_FAILED_MESSAGE = 'Das hat nicht geklappt. Die Wiederherstellungswörter sind noch eingerichtet.';
export const WORDS_NOT_FOUND_MESSAGE = 'Auf diesem Gerät sind keine Wiederherstellungswörter bekannt.';

type RemovableStorage = KeyValueStorage & { removeItem?: (key: string) => Promise<void> };

export type WordsSetupDeps = {
  storage: RemovableStorage;
  vaultStorage: VaultKeyStorage;
  readState: (safe: Address) => Promise<{ guardians: Address[]; threshold: number }>;
  sendOp: (calls: SponsoredCall[]) => Promise<Hex>;
  deviceSecrets: () => Promise<{ slot: KeyBackupSlot; secret: Uint8Array }[]>;
  remote: RemoteBackup;
  getPrf: () => Promise<Hex | null>;
  wrap: typeof wrapSecret;
  /** Only for a phone without the pool: reads the old pool out of the server's `wvk`. */
  unwrap?: typeof unwrapSecret;
  now: () => number;
};

export type EnableResult =
  | {
      status: 'done';
      wordCount: number;
      copies: { stored: KeyBackupSlot[]; failed: KeyBackupSlot[] };
      /** The `wvk` blob was stored (false: no PRF, or the write failed). */
      wvkStored: boolean;
    }
  | { status: 'error'; message: string };

export async function loadWordsPending(storage: KeyValueStorage): Promise<WordsPending | null> {
  const v = await storage.getItem(WORDS_PENDING_KEY);
  return v === 'on' || v === 'off' ? v : null;
}

async function setPending(storage: RemovableStorage, v: WordsPending | null): Promise<void> {
  if (v) await storage.setItem(WORDS_PENDING_KEY, v);
  else if (storage.removeItem) await storage.removeItem(WORDS_PENDING_KEY);
  else await storage.setItem(WORDS_PENDING_KEY, '');
}

/**
 * The pool of the words currently known for this account: this device's, else (only when there
 * are guardians that could be words) the one inside the server's `wvk`. `prf` is the PRF of the
 * signed read, reused later for the new `wvk`.
 */
async function knownPool(guardians: readonly Address[], d: WordsSetupDeps): Promise<{ pool: WordsPool | null; prf?: Hex | null }> {
  const local = await loadWordsPool(d.storage).catch(() => null);
  if (local || guardians.length === 0 || !d.unwrap) return { pool: local };
  const read = await d.remote.read();
  if (read.status !== 'found' || !read.blobs.wvk) return { pool: null, ...(read.status !== 'disabled' && read.prf ? { prf: read.prf } : {}) };
  const prf = read.prf ?? (await d.getPrf());
  if (!prf) return { pool: null, prf };
  const vault = await unwrapWordsVault(prf, read.blobs.wvk, d.unwrap);
  return { pool: vault?.addresses ? { addresses: vault.addresses, confirmedAt: d.now() } : null, prf };
}

/** `_w` copies + `wvk` in ONE replace:true write (pool + vault key from this device). */
async function writeWordsBackup(
  vaultKey: Hex,
  addresses: Address[],
  d: WordsSetupDeps,
  knownPrf?: Hex | null,
): Promise<{ copies: { stored: KeyBackupSlot[]; failed: KeyBackupSlot[] }; wvkStored: boolean; ok: boolean }> {
  let secrets: { slot: KeyBackupSlot; secret: Uint8Array }[] = [];
  let wvk: string | undefined;
  try {
    secrets = await d.deviceSecrets();
    const prf = knownPrf ?? (await d.getPrf());
    if (prf) wvk = await wrapVaultKey(prf, vaultKey, d.wrap, addresses);
  } catch {
    // No PRF (cancelled sheet) only means no `wvk`; the copies can still go.
  }
  const r = await writeWordsCopies({ vaultKey, secrets, remote: d.remote, wrap: d.wrap, replace: true, ...(wvk ? { extra: { wvk } } : {}) });
  const wvkStored = r.wvk === true;
  return { copies: { stored: r.stored, failed: r.failed }, wvkStored, ok: r.failed.length === 0 && (wvk === undefined || wvkStored) };
}

export async function enableRecoveryWords(p: { safe: Address; phrase: string; replace?: boolean }, deps: WordsSetupDeps): Promise<EnableResult> {
  const check = validatePhrase(p.phrase);
  if (!check.ok) return { status: 'error', message: phraseErrorMessage(check) };
  const kit = wordsFromSeed(check.phrase);
  const pool: WordsPool = { addresses: kit.addresses(), confirmedAt: deps.now() };
  const vaultKey = kit.vaultKey();

  let calls: SponsoredCall[];
  let wordCount: number;
  let readPrf: Hex | null | undefined;
  try {
    const state = await deps.readState(p.safe);
    const known = await knownPool(state.guardians, deps);
    readPrf = known.prf;
    // Old word guardians (known pool) and the new words are never people; with or without
    // `replace`, the result holds exactly the new words.
    const people = splitGuardians(splitGuardians(state.guardians, known.pool).people, pool).people;
    const plan = planGuardianSet({
      wallet: p.safe,
      current: state.guardians,
      pool,
      people,
      words: true,
      ...(state.threshold >= 1 ? { threshold: state.threshold } : {}),
      currentThreshold: state.threshold,
    });
    calls = plan.calls;
    wordCount = plan.wordCount;
  } catch (e) {
    return { status: 'error', message: e instanceof Error && /Wiederherstellungswörtern/.test(e.message) ? e.message : WORDS_SETUP_FAILED_MESSAGE };
  }

  try {
    if (calls.length > 0) await deps.sendOp(calls);
  } catch {
    return { status: 'error', message: WORDS_SETUP_FAILED_MESSAGE };
  }

  // On chain now: from here on the result is 'done'; the backup copies are best effort.
  await saveWordsPool(deps.storage, pool);
  await saveVaultKey(deps.vaultStorage, vaultKey);
  await setPending(deps.storage, 'on');
  const w = await writeWordsBackup(vaultKey, pool.addresses, deps, readPrf);
  if (w.ok) await setPending(deps.storage, null);
  return { status: 'done', wordCount, copies: w.copies, wvkStored: w.wvkStored };
}

const OFF_BLOBS: KeyBackupBlobs = Object.fromEntries([...KEY_BACKUP_WORDS_SLOTS, 'wvk'].map((s) => [s, WORDS_OFF_BLOB]));

async function writeOffMarker(d: WordsSetupDeps): Promise<boolean> {
  try {
    return (await d.remote.write(OFF_BLOBS, true)) === 'stored';
  } catch {
    return false;
  }
}

export async function disableRecoveryWords(
  p: { safe: Address },
  deps: WordsSetupDeps,
): Promise<{ status: 'done'; backupCleared: boolean } | { status: 'error'; message: string }> {
  let calls: SponsoredCall[];
  try {
    const state = await deps.readState(p.safe);
    const { pool } = await knownPool(state.guardians, deps);
    const split = splitGuardians(state.guardians, pool);
    if (split.words.length === 0) return { status: 'error', message: WORDS_NOT_FOUND_MESSAGE };
    calls = planGuardianSet({
      wallet: p.safe,
      current: state.guardians,
      pool,
      people: split.people,
      words: false,
      ...(state.threshold >= 1 ? { threshold: state.threshold } : {}),
      currentThreshold: state.threshold,
    }).calls;
  } catch {
    return { status: 'error', message: WORDS_REMOVE_FAILED_MESSAGE };
  }
  try {
    await deps.sendOp(calls);
  } catch {
    return { status: 'error', message: WORDS_REMOVE_FAILED_MESSAGE };
  }
  await setPending(deps.storage, 'off');
  const backupCleared = await writeOffMarker(deps);
  if (backupCleared) await setPending(deps.storage, null);
  await clearWordsPool(deps.storage);
  await clearVaultKey(deps.vaultStorage);
  return { status: 'done', backupCleared };
}

/** Finishes a backup write that failed after the op (see the header). */
export async function retryWordsBackup(deps: WordsSetupDeps): Promise<{ status: 'done' } | { status: 'error'; message: string }> {
  const pending = await loadWordsPending(deps.storage);
  if (!pending) return { status: 'done' };
  if (pending === 'off') {
    if (!(await writeOffMarker(deps))) return { status: 'error', message: 'Das hat nicht geklappt. Bitte versuche es später noch einmal.' };
    await setPending(deps.storage, null);
    return { status: 'done' };
  }
  const [vaultKey, pool] = await Promise.all([loadVaultKey(deps.vaultStorage), loadWordsPool(deps.storage)]);
  if (!vaultKey || !pool) {
    // Nothing left to finish with on this device.
    await setPending(deps.storage, null);
    return { status: 'done' };
  }
  const w = await writeWordsBackup(vaultKey, pool.addresses, deps);
  if (!w.ok) return { status: 'error', message: 'Das hat nicht geklappt. Bitte versuche es später noch einmal.' };
  await setPending(deps.storage, null);
  return { status: 'done' };
}

/** Words on = a word address of this device's pool is a guardian on chain (no prompt). */
export async function readWordsStatus(
  safe: Address,
  deps: Pick<WordsSetupDeps, 'storage' | 'readState'>,
): Promise<{ on: boolean; pending: WordsPending | null }> {
  const [state, pool, pending] = await Promise.all([
    deps.readState(safe),
    loadWordsPool(deps.storage).catch(() => null),
    loadWordsPending(deps.storage).catch(() => null),
  ]);
  return { on: splitGuardians(state.guardians, pool).words.length > 0, pending };
}
