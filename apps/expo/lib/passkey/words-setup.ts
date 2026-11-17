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
 *       no-wvk marker (`WORDS_NO_WVK_BLOB`) goes into `wvk` instead, so no `wvk` of earlier words
 *       survives (fail safe).
 * The phrase is never stored and never returned.
 *
 * Which pool is current (controller ruling I1): this device's pool counts only while at least one
 * of its addresses is a guardian on chain (`validLocalPool`); otherwise the server's `wvk` decides.
 * `currentWordsPool` is the promptless view for the guardian list and the status;
 * `syncWordsPool` is the user-started load (one fingerprint) a phone without the pool needs.
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
import { bytesToHex, hexToBytes, isAddressEqual, type Address, type Hex } from 'viem';
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
  isWordsMarkerBlob,
  isWordsNoWvkBlob,
  isWordsOffBlob,
  loadVaultKey,
  saveVaultKey,
  unwrapWordsVault,
  WORDS_NO_WVK_BLOB,
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
/** Guardian changes on a phone that cannot tell word guardians from people (ruling I1). */
export const WORDS_NOT_LOADED_MESSAGE =
  'Auf diesem Gerät fehlen die Angaben zu deinen Wiederherstellungswörtern. Öffne einmal „Wiederherstellungswörter“, dann geht es weiter.';
/** Words set up on a passkey without PRF: this phone cannot read which guardians they are. */
export const WORDS_ELSEWHERE_MESSAGE =
  'Deine Wiederherstellungswörter wurden auf einem anderen Gerät eingerichtet, und dieses Gerät kann ihre Angaben nicht lesen. Bitte ändere sie auf dem anderen Gerät.';
/** The op reported an error and the follow-up read failed too: neither "done" nor "failed" is known. */
export const WORDS_STATUS_CHECKING_MESSAGE = 'Status wird geprüft. Ob deine Wiederherstellungswörter eingerichtet sind, siehst du gleich hier.';
const WORDS_LOAD_FAILED_MESSAGE = 'Die Angaben zu deinen Wiederherstellungswörtern konnten nicht geladen werden. Bitte versuche es erneut.';

/** Guardians this phone confirmed as "no words" (server: words off), so the list needs no prompt. */
export const WORDS_NONE_KEY = 'passkey_words_none_v1';

/** A German refusal the screens show as is. */
export class WordsRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WordsRefusal';
  }
}

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
  | { status: 'error'; message: string }
  /** The op reported an error and the check read failed: the new words stay pending 'on' (the retry settles it). */
  | { status: 'checking'; message: string };

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
async function forgetLocalWords(d: Pick<WordsSetupDeps, 'storage' | 'vaultStorage'>): Promise<void> {
  await setPendingRaw(d.storage, null);
  await clearWordsPool(d.storage);
  await clearVaultKey(d.vaultStorage);
}

/** This device's pool, but only while at least one of its addresses is a guardian on chain. */
export async function validLocalPool(storage: KeyValueStorage, guardians: readonly Address[]): Promise<WordsPool | null> {
  const local = await loadWordsPool(storage).catch(() => null);
  return local && splitGuardians(guardians, local).words.length > 0 ? local : null;
}

async function loadNoneRecord(storage: KeyValueStorage): Promise<Address[] | null> {
  try {
    const raw = await storage.getItem(WORDS_NONE_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(v) ? (v.filter((a) => typeof a === 'string') as Address[]) : null;
  } catch {
    return null;
  }
}

async function saveNoneRecord(storage: KeyValueStorage, guardians: readonly Address[]): Promise<void> {
  await storage.setItem(WORDS_NONE_KEY, JSON.stringify(guardians.map((g) => g.toLowerCase())));
}

export type WordsPoolView = {
  pool: WordsPool | null;
  /**
   * local   = this device's pool, valid on chain
   * none    = no words among the guardians (no guardians, words confirmed off, or the server says off)
   * unknown = guardians this phone cannot classify (no valid pool, and no promptless answer)
   */
  state: 'local' | 'none' | 'unknown';
};

/**
 * The words pool for `guardians` WITHOUT a prompt: the valid local pool; else "none" when there
 * are no guardians, when every guardian was confirmed "no words" by this phone (`WORDS_NONE_KEY`),
 * or when a token read shows no `wvk` / the off marker; else "unknown" (a real `wvk` needs the
 * PRF, i.e. a prompt, which only `syncWordsPool` and the setup flows pay for).
 */
export async function currentWordsPool(
  guardians: readonly Address[],
  d: { storage: KeyValueStorage; remote?: RemoteBackup },
): Promise<WordsPoolView> {
  const local = await validLocalPool(d.storage, guardians);
  if (local) return { pool: local, state: 'local' };
  if (guardians.length === 0) return { pool: null, state: 'none' };
  const none = await loadNoneRecord(d.storage);
  if (none && guardians.every((g) => none.some((x) => isAddressEqual(x as Address, g)))) return { pool: null, state: 'none' };
  const read = d.remote?.readWithoutPrompt ? await d.remote.readWithoutPrompt().catch(() => null) : null;
  if (read && read.status !== 'disabled') {
    const wvk = read.status === 'found' ? read.blobs.wvk : undefined;
    if (!wvk || isWordsOffBlob(wvk)) return { pool: null, state: 'none' };
  }
  return { pool: null, state: 'unknown' };
}

/**
 * "Angaben laden" (Settings → Wiederherstellungswörter, user-started): learns the current words
 * pool and vault key from the server's `wvk` so this phone can tell word guardians from people.
 * One fingerprint at most: a token read + the PRF, or a signed read (its PRF unwraps). A phone
 * with an unfinished words write keeps its own state (the server is stale until that write lands).
 */
export async function syncWordsPool(
  safe: Address,
  deps: Pick<WordsSetupDeps, 'storage' | 'vaultStorage' | 'readState' | 'remote' | 'getPrf' | 'unwrap' | 'now'>,
): Promise<{ status: 'done'; on: boolean } | { status: 'error'; message: string }> {
  try {
    const state = await deps.readState(safe);
    if (await validLocalPool(deps.storage, state.guardians)) return { status: 'done', on: true };
    if (await loadWordsPending(deps.storage)) return { status: 'done', on: false };
    if (state.guardians.length === 0) return { status: 'done', on: false };
    const peeked = deps.remote.readWithoutPrompt ? await deps.remote.readWithoutPrompt().catch(() => null) : null;
    const read = peeked ?? (await deps.remote.read());
    if (read.status === 'disabled') return { status: 'error', message: WORDS_LOAD_FAILED_MESSAGE };
    const wvk = read.status === 'found' ? read.blobs.wvk : undefined;
    if (isWordsNoWvkBlob(wvk)) return { status: 'error', message: WORDS_ELSEWHERE_MESSAGE };
    const off = async () => {
      await clearWordsPool(deps.storage);
      await clearVaultKey(deps.vaultStorage);
      await saveNoneRecord(deps.storage, state.guardians);
      return { status: 'done' as const, on: false };
    };
    if (!wvk || isWordsOffBlob(wvk)) return await off();
    const prf = read.prf ?? (await deps.getPrf());
    const vault = prf && deps.unwrap ? await unwrapWordsVault(prf, wvk, deps.unwrap) : null;
    if (!vault?.addresses) return { status: 'error', message: WORDS_LOAD_FAILED_MESSAGE };
    const pool: WordsPool = { addresses: vault.addresses, confirmedAt: deps.now() };
    // A `wvk` whose words are no longer guardians is stale: no words on this account.
    if (splitGuardians(state.guardians, pool).words.length === 0) return await off();
    await saveWordsPool(deps.storage, pool);
    await saveVaultKey(deps.vaultStorage, vault.vaultKey);
    return { status: 'done', on: true };
  } catch {
    return { status: 'error', message: WORDS_LOAD_FAILED_MESSAGE };
  }
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
  // A local pool none of whose addresses is a guardian is outdated (replaced elsewhere): the server decides.
  const local = await validLocalPool(d.storage, guardians);
  if (local || guardians.length === 0 || !d.unwrap) return { pool: local };
  const peeked = d.remote.readWithoutPrompt ? await d.remote.readWithoutPrompt().catch(() => null) : null;
  const read = peeked ?? (await d.remote.read());
  const readPrf = read.status !== 'disabled' ? read.prf : undefined;
  // Words are on, but set up without a readable `wvk`: planning here would keep them as "people".
  if (read.status === 'found' && isWordsNoWvkBlob(read.blobs.wvk)) throw new WordsRefusal(WORDS_ELSEWHERE_MESSAGE);
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
 * real `wvk` (no PRF on this authenticator, or the PRF prompt failed) the no-wvk marker takes its
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
  const r = await writeWordsCopies({ vaultKey, secrets, remote: d.remote, wrap: d.wrap, replace: true, extra: { wvk: wvk ?? WORDS_NO_WVK_BLOB } });
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
    const shown = e instanceof WordsRefusal || (e instanceof Error && /Wiederherstellungswörtern/.test(e.message));
    return { status: 'error', message: shown ? (e as Error).message : WORDS_SETUP_FAILED_MESSAGE };
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
    // A partial save must not cost the old pool / vault key: no op was sent.
    await rollback(deps, prev).catch(() => undefined);
    return { status: 'error', message: WORDS_SETUP_FAILED_MESSAGE };
  }

  try {
    if (calls.length > 0) await deps.sendOp(calls);
  } catch {
    // The op may have landed although sending reported an error (e.g. a receipt timeout). Roll
    // back only when a fresh read positively shows it did not; an unreadable chain keeps the new
    // pool, vault key and pending 'on' (the retry checks the chain and settles it).
    const landed = await deps
      .readState(p.safe)
      .then((s) => splitGuardians(s.guardians, pool).words.length > 0)
      .catch(() => null);
    if (landed === null) return { status: 'checking', message: WORDS_STATUS_CHECKING_MESSAGE };
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
  let people: Address[] = [];
  try {
    const state = await deps.readState(p.safe);
    const known = await knownPool(state.guardians, deps);
    const split = splitGuardians(state.guardians, known.pool);
    people = split.people;
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
  } catch (e) {
    return { status: 'error', message: e instanceof WordsRefusal ? e.message : WORDS_REMOVE_FAILED_MESSAGE };
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
    // The remaining guardians are people: the guardian list needs no prompt to know that.
    await saveNoneRecord(deps.storage, people);
  } catch {
    // Off on chain; a storage hiccup here only leaves local leftovers.
  }
  return { status: 'done', backupCleared };
}

/**
 * Finishes a backup write that failed after the op (see the header), but only while this phone's
 * view is still current: words replaced or re-enabled on another phone are never overwritten.
 *   'on'  → only if a word address of the local pool is still a guardian on chain AND the server's
 *           `wvk` is absent, a marker, or unwraps to this phone's vault key; otherwise the
 *           marker, the pool and the vault key are dropped.
 *   'off' → only if the server's `wvk` is absent, already the off marker, or unwraps to the vault
 *           key that was switched off (hash stored with the marker); otherwise the marker is dropped.
 *           The no-wvk marker is never "ours" here (words set up again elsewhere, without a PRF).
 * Fingerprints: a token read is free; a real server `wvk` costs the PRF (reused for the write).
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
    const peeked = deps.remote.readWithoutPrompt ? await deps.remote.readWithoutPrompt().catch(() => null) : null;
    const read = peeked ?? (await deps.remote.read());
    if (read.status === 'disabled') return { status: 'error', message: RETRY_FAILED_MESSAGE };
    const wvk = read.status === 'found' ? read.blobs.wvk : undefined;
    let prf: Hex | null | undefined = read.prf;
    if (wvk && !isWordsMarkerBlob(wvk)) {
      if (prf === undefined) prf = await deps.getPrf();
      const vault = prf && deps.unwrap ? await unwrapWordsVault(prf, wvk, deps.unwrap) : null;
      if (!vault || vault.vaultKey !== vaultKey) {
        // Another phone's newer words backup (or one this phone cannot read): never overwritten.
        await forgetLocalWords(deps);
        return { status: 'done' };
      }
    }
    const w = await writeWordsBackup(vaultKey, pool.addresses, deps, prf);
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
    if (!ours && hash && deps.unwrap && !isWordsNoWvkBlob(wvk)) {
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

/**
 * Words on = a word address of this device's pool is a guardian on chain (no prompt).
 * `unknown` = this phone cannot tell whether some guardians are words (`currentWordsPool`): the
 * screen offers "Angaben laden" (`syncWordsPool`). `remote` is optional (no token read without it).
 */
export async function readWordsStatus(
  safe: Address,
  deps: Pick<WordsSetupDeps, 'storage' | 'readState'> & { remote?: RemoteBackup },
): Promise<{ on: boolean; pending: WordsPending | null; unknown: boolean }> {
  const [state, pending] = await Promise.all([deps.readState(safe), loadWordsPending(deps.storage).catch(() => null)]);
  const view = await currentWordsPool(state.guardians, deps);
  return { on: view.state === 'local', pending, unknown: view.state === 'unknown' };
}
