/**
 * Setting the recovery words up, replacing them and removing them. Pure: every side effect is
 * injected (words-setup-runtime.ts wires the real ones).
 *
 * Enable / replace, in this order:
 *   (1) save the pool (5 public addresses), the vault key and the pending marker 'on' on this
 *       device, so a crash after the op loses nothing (rolled back when the op did not land);
 *   (2) ONE sponsored op from `planGuardianSet`: the people stay, the first t word addresses become
 *       guardians (t = the on-chain threshold when ≥ 1, so a stricter choice survives), and the
 *       word guardians of earlier words (the known pool) are revoked in the same op;
 *   (3) ONE `replace: true` backup write with the `_w` copy of every key on the device and the
 *       `wvk` blob (vault key + pool addresses, wrapped under the passkey PRF). Without a PRF the
 *       off marker goes into `wvk` instead, so no `wvk` of earlier words survives (fail safe).
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
 * See `knownPool` for the one deliberate exception.
 */
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, type Address, type Hex } from 'viem';
import { KEY_BACKUP_WORDS_SLOTS, type KeyBackupBlobs, type KeyBackupSlot, type RemoteBackup } from './key-backup';
import type { KeyValueStorage } from './migration';
import type { SponsoredCall } from './userop';
import { phraseErrorMessage, validatePhrase, wordsFromSeed } from './words';
import {
  clearWordsPool,
  loadWordsPool,
  planGuardianSet,
  saveWordsPool,
  splitGuardians,
  WORDS_POOL_KEY,
  type WordsPool,
} from './words-guardians';
import {
  clearVaultKey,
  isWordsOffBlob,
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
/** 'on' = copies + wvk of this phone's words still to write; 'off' = the off marker still to write. */
export type WordsPending = 'on' | 'off';
const RETRY_FAILED_MESSAGE = 'Das hat nicht geklappt. Bitte versuche es später noch einmal.';

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

/** Stored as 'on', 'off' or 'off:<sha256 of the switched-off vault key>' (for the retry check). */
export async function loadWordsPending(storage: KeyValueStorage): Promise<WordsPending | null> {
  const v = await storage.getItem(WORDS_PENDING_KEY);
  if (v === 'on') return 'on';
  return v === 'off' || v?.startsWith('off:') ? 'off' : null;
}

async function setPendingRaw(storage: RemovableStorage, v: string | null): Promise<void> {
  if (v) await storage.setItem(WORDS_PENDING_KEY, v);
  else if (storage.removeItem) await storage.removeItem(WORDS_PENDING_KEY);
  else await storage.setItem(WORDS_PENDING_KEY, '');
}

const vaultKeyHash = (key: Hex) => bytesToHex(sha256(hexToBytes(key))).slice(2);

/** Forgets this phone's words state (pool, vault key, pending). */
async function forgetLocalWords(d: WordsSetupDeps): Promise<void> {
  await setPendingRaw(d.storage, null);
  await clearWordsPool(d.storage);
  await clearVaultKey(d.vaultStorage);
}

/**
 * The pool of the words currently known for this account: this device's, else (only when there
 * are guardians that could be words) the one inside the server's `wvk`, with its vault key.
 * `prf` is the PRF learned on the way (null = this authenticator has none), reused for the new `wvk`.
 *
 * DELIBERATE EXCEPTION to "op + one fingerprint" (controller ruling I3): a phone WITHOUT the local
 * pool whose account HAS guardians must learn the old pool before planning the op, or the old
 * word guardians would be kept as "people" and the old words would stay valid. Security over
 * prompt count. It first reads with a cached session token (no prompt); only without a token
 * does it pay a signed read. Unwrapping a found `wvk` needs the PRF (from the signed read, or one
 * prompt after a token read); that PRF is reused for the new `wvk`, so the worst case is three.
 */
async function knownPool(
  guardians: readonly Address[],
  d: WordsSetupDeps,
): Promise<{ pool: WordsPool | null; prf?: Hex | null; vaultKey?: Hex }> {
  const local = await loadWordsPool(d.storage).catch(() => null);
  if (local || guardians.length === 0 || !d.unwrap) return { pool: local };
  const peeked = d.remote.readWithoutPrompt ? await d.remote.readWithoutPrompt().catch(() => null) : null;
  const read = peeked ?? (await d.remote.read());
  const readPrf = read.status !== 'disabled' ? read.prf : undefined;
  if (read.status !== 'found' || !read.blobs.wvk || isWordsOffBlob(read.blobs.wvk)) return { pool: null, prf: readPrf };
  const prf = readPrf ?? (await d.getPrf());
  if (!prf) return { pool: null, prf };
  const vault = await unwrapWordsVault(prf, read.blobs.wvk, d.unwrap);
  return {
    pool: vault?.addresses ? { addresses: vault.addresses, confirmedAt: d.now() } : null,
    prf,
    ...(vault ? { vaultKey: vault.vaultKey } : {}),
  };
}

/**
 * `_w` copies + `wvk` in ONE replace:true write (pool + vault key from this device). Without a
 * real `wvk` (no PRF on this authenticator, or the PRF prompt failed) the off marker takes its
 * place, so a `wvk` of earlier words never survives a replace. `ok` = nothing left to retry:
 * written, and either a real `wvk` or a PRF that is known to be unsupported (a retry cannot help).
 * `knownPrf`: undefined = ask `getPrf`; null = known unsupported.
 */
async function writeWordsBackup(
  vaultKey: Hex,
  addresses: Address[],
  d: WordsSetupDeps,
  knownPrf?: Hex | null,
): Promise<{ copies: { stored: KeyBackupSlot[]; failed: KeyBackupSlot[] }; wvkStored: boolean; ok: boolean }> {
  const secrets = await d.deviceSecrets().catch(() => [] as { slot: KeyBackupSlot; secret: Uint8Array }[]);
  let wvk: string | null = null;
  let unsupported = false;
  try {
    const prf = knownPrf !== undefined ? knownPrf : await d.getPrf();
    if (prf) wvk = await wrapVaultKey(prf, vaultKey, d.wrap, addresses);
    else unsupported = true;
  } catch {
    // A cancelled or failed PRF prompt: retried later (pending stays 'on').
  }
  const r = await writeWordsCopies({ vaultKey, secrets, remote: d.remote, wrap: d.wrap, replace: true, extra: { wvk: wvk ?? WORDS_OFF_BLOB } });
  const written = r.wvk === true && r.failed.length === 0;
  return {
    copies: { stored: r.stored, failed: r.failed },
    wvkStored: wvk !== null && r.wvk === true,
    ok: written && (wvk !== null || unsupported),
  };
}

/**
 * `replace` states the intent ("Neue Wörter erzeugen") for callers and logs; the result is the
 * same either way: the known earlier word guardians are always revoked in the same op, so the
 * account ends with exactly the new words.
 */
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
    // Old word guardians (known pool) and the new words are never people.
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

  // Persist BEFORE the op (public addresses + vault key + pending): a crash or a storage error
  // after the op must not lose them. The previous values come back if the op did not land.
  const prev = {
    pool: await deps.storage.getItem(WORDS_POOL_KEY).catch(() => null),
    vaultKey: await loadVaultKey(deps.vaultStorage).catch(() => null),
    pending: await deps.storage.getItem(WORDS_PENDING_KEY).catch(() => null),
  };
  try {
    await saveWordsPool(deps.storage, pool);
    await saveVaultKey(deps.vaultStorage, vaultKey);
    await setPendingRaw(deps.storage, 'on');
  } catch {
    return { status: 'error', message: WORDS_SETUP_FAILED_MESSAGE };
  }

  try {
    if (calls.length > 0) await deps.sendOp(calls);
  } catch {
    // The op may have landed although sending reported an error (e.g. a receipt timeout).
    const landed = await deps
      .readState(p.safe)
      .then((s) => splitGuardians(s.guardians, pool).words.length > 0)
      .catch(() => false);
    if (!landed) {
      await rollback(deps, prev).catch(() => undefined);
      return { status: 'error', message: WORDS_SETUP_FAILED_MESSAGE };
    }
  }

  // On chain now: the result is 'done' whatever happens next; the backup copies are best effort.
  try {
    const w = await writeWordsBackup(vaultKey, pool.addresses, deps, readPrf);
    if (w.ok) await setPendingRaw(deps.storage, null);
    return { status: 'done', wordCount, copies: w.copies, wvkStored: w.wvkStored };
  } catch {
    return { status: 'done', wordCount, copies: { stored: [], failed: [] }, wvkStored: false };
  }
}

async function rollback(d: WordsSetupDeps, prev: { pool: string | null; vaultKey: Hex | null; pending: string | null }): Promise<void> {
  if (prev.pool) await d.storage.setItem(WORDS_POOL_KEY, prev.pool);
  else await clearWordsPool(d.storage);
  if (prev.vaultKey) await saveVaultKey(d.vaultStorage, prev.vaultKey);
  else await clearVaultKey(d.vaultStorage);
  await setPendingRaw(d.storage, prev.pending || null);
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
  let offKey: Hex | null = null;
  try {
    const state = await deps.readState(p.safe);
    const known = await knownPool(state.guardians, deps);
    const split = splitGuardians(state.guardians, known.pool);
    if (split.words.length === 0) return { status: 'error', message: WORDS_NOT_FOUND_MESSAGE };
    offKey = known.vaultKey ?? (await loadVaultKey(deps.vaultStorage).catch(() => null));
    calls = planGuardianSet({
      wallet: p.safe,
      current: state.guardians,
      pool: known.pool,
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
  let backupCleared = false;
  try {
    // The hash lets a later retry check that the server still holds THESE words (retryWordsBackup).
    await setPendingRaw(deps.storage, offKey ? `off:${vaultKeyHash(offKey)}` : 'off');
    backupCleared = await writeOffMarker(deps);
    if (backupCleared) await setPendingRaw(deps.storage, null);
    await clearWordsPool(deps.storage);
    await clearVaultKey(deps.vaultStorage);
  } catch {
    // Off on chain; a storage hiccup here only leaves local leftovers.
  }
  return { status: 'done', backupCleared };
}

/**
 * Finishes a backup write that failed after the op (see the header), but only while this phone's
 * view is still current: words replaced or re-enabled on another phone are never overwritten.
 *   'on'  → only if a word address of the local pool is still a guardian on chain; otherwise the
 *           marker, the pool and the vault key are dropped.
 *   'off' → only if the server's `wvk` is absent, already the off marker, or unwraps to the vault
 *           key that was switched off (hash stored with the marker); otherwise the marker is dropped.
 */
export async function retryWordsBackup(
  p: { safe: Address },
  deps: WordsSetupDeps,
): Promise<{ status: 'done' } | { status: 'error'; message: string }> {
  const raw = await deps.storage.getItem(WORDS_PENDING_KEY);
  if (raw === 'on') {
    const [state, vaultKey, pool] = await Promise.all([
      deps.readState(p.safe),
      loadVaultKey(deps.vaultStorage),
      loadWordsPool(deps.storage),
    ]);
    if (!vaultKey || !pool || splitGuardians(state.guardians, pool).words.length === 0) {
      await forgetLocalWords(deps);
      return { status: 'done' };
    }
    const w = await writeWordsBackup(vaultKey, pool.addresses, deps);
    if (!w.ok) return { status: 'error', message: RETRY_FAILED_MESSAGE };
    await setPendingRaw(deps.storage, null);
    return { status: 'done' };
  }
  if (raw === 'off' || raw?.startsWith('off:')) {
    const hash = raw.startsWith('off:') ? raw.slice(4) : null;
    const peeked = deps.remote.readWithoutPrompt ? await deps.remote.readWithoutPrompt().catch(() => null) : null;
    const read = peeked ?? (await deps.remote.read());
    if (read.status === 'disabled') return { status: 'error', message: RETRY_FAILED_MESSAGE };
    const wvk = read.status === 'found' ? read.blobs.wvk : undefined;
    let ours = !wvk || isWordsOffBlob(wvk);
    if (!ours && hash && deps.unwrap) {
      const prf = read.prf ?? (await deps.getPrf());
      const vault = prf ? await unwrapWordsVault(prf, wvk!, deps.unwrap) : null;
      ours = !!vault && vaultKeyHash(vault.vaultKey) === hash;
    }
    if (!ours) {
      await setPendingRaw(deps.storage, null);
      return { status: 'done' };
    }
    if (!(await writeOffMarker(deps))) return { status: 'error', message: RETRY_FAILED_MESSAGE };
    await setPendingRaw(deps.storage, null);
    return { status: 'done' };
  }
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
