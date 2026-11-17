/**
 * The expert path's account flows: create an independent account whose key is 12 words, and sign
 * in with them (on this or another phone). Pure: storage, the phrase store and the chain lookups
 * are injected (words-account-runtime.ts wires the real ones).
 *
 *   createWordsAccount     new phrase → stored behind the device unlock → record + session for the
 *                          counterfactual expert Safe; the phrase is returned ONCE for the show
 *                          screen. If the app is left on that screen, the account already exists
 *                          and the stored words can be shown again from Settings.
 *   signInWithWords        typed words → the Safe they own: the one found on chain (an account
 *                          recovered to these words keeps its OLD address), else the Safe they
 *                          derive (never-used words open their own, empty account — never an
 *                          error and never someone else's account).
 *   openStoredWordsAccount the words stored on this device (one device unlock) → as above,
 *                          without storing them again.
 *   Both send the NEW words of an expert recovery still running on this device to the recovery
 *   screen instead of opening the fresh Safe that sends it (M-3).
 *
 * Rules (preflight):
 *   E4  a stored phrase of ANOTHER account that was never confirmed may be that account's only
 *       key: it is never replaced. The caller gets `reason: 'overwrite'` and may offer
 *       `phrase.discardIfUnreadable()` — only on an explicit action of the person.
 *   E5  words that are RECOVERY words of an account (plan 2's pool guardians) must not open an
 *       empty expert account: the person is sent to the words recovery with one sentence.
 *       Words that both own a Safe AND are recovery words of an account are ambiguous (support):
 *       pool addresses are public in GuardianAdded logs, so anyone can build an app-shaped Safe
 *       owned by address 0 of someone's recovery words — never a silent pick.
 *   E7  `findSafesByOwner` (recovery-lookup.ts) keeps only Safes of the app's shape (factory
 *       proxy, SafeL2, exactly the 4337 + recovery modules, 4337 fallback) with this single owner.
 *       Several owned Safes → the single one with history (legacy link or users row) wins, as on
 *       the passkey path (signin.ts), else support.
 *
 * Known residual (as recovery-lookup `findSafesByOwner`): once address 0 of expert words is public
 * (it owns a Safe), an attacker can build a fully app-shaped Safe, add that address as its single
 * owner and remove itself. The real account then usually wins by history; when neither or both
 * have history, the result is the support message, never a silent pick. For never-used words
 * address 0 is not public, so no decoy can exist.
 *
 * A failed lookup is an error, never a silent fall-back to the derived Safe (that would hide a
 * recovered account behind an empty one). Nothing here logs or returns a word except the one
 * `phrase` field of a fresh account.
 */
import { getAddress, isAddressEqual, type Address } from 'viem';
import { predictEcdsaSafeAddress } from './ecdsa-safe';
import { loadMigrationRecord, MIGRATION_STORE_KEY, type KeyValueStorage, type MigrationRecord } from './migration';
import {
  NO_BIOMETRICS_MESSAGE,
  PHRASE_OVERWRITE_MESSAGE,
  PHRASE_PROMPT,
  PhraseCancelledError,
  PhraseOverwriteError,
  PhraseUnavailableError,
  type PhraseStore,
} from './phrase-store';
import { randomBytes } from './random';
import { loadRecoveryState, type RecoveryStorage } from './recovery-flow';
import { isWordsOwner, loadPasskeySession, savePasskeySession, WORDS_KEY_PLACEHOLDER, type PasskeySession, type SessionStorage } from './session';
import { generatePhrase, phraseErrorMessage, validatePhrase, wordsFromSeed, WORDS_POOL_SIZE } from './words';
import type { WordsWallet } from './words-recovery';

export const WORDS_ALREADY_STORED_MESSAGE = 'Auf diesem Gerät liegt schon ein Konto mit 12 Wörtern. Öffne es über „Anmelden".';
export const WORDS_SEVERAL_ACCOUNTS_MESSAGE = 'Diese Wörter passen zu mehreren Konten. Bitte wende dich an den Support.';
export const WORDS_NO_CONNECTION_MESSAGE = 'Keine Verbindung. Bitte versuche es erneut.';
/** E5: the typed words are the recovery words of an existing account. */
export const WORDS_ARE_RECOVERY_WORDS_MESSAGE =
  'Das sind die Wiederherstellungswörter eines bestehenden Kontos. Hol es damit über „Konto wiederherstellen" zurück.';
/** Where `status: 'recoveryWords'` leads (restore.tsx, "Mit 12 Wörtern"). */
export const WORDS_RECOVERY_ROUTE = '/passkey/restore';
export const WORDS_NOT_STORED_MESSAGE = 'Auf diesem Gerät sind keine 12 Wörter gespeichert. Gib deine Wörter ein.';
export const WORDS_UNREADABLE_MESSAGE =
  'Dein Handy hat die gespeicherten Wörter gesperrt, weil sich Fingerabdruck oder Gesicht geändert haben. Gib deine 12 Wörter noch einmal ein.';
export const WORDS_STORE_FAILED_MESSAGE = 'Die Wörter konnten nicht sicher gespeichert werden. Bitte versuche es erneut.';
export const WORDS_FAILED_MESSAGE = 'Das hat nicht geklappt. Bitte versuche es erneut.';
export const WORDS_SAVE_FAILED_MESSAGE = 'Das Konto konnte nicht gespeichert werden. Bitte versuche es erneut.';
/** The words are the NEW words of a guardian recovery still running on this device (M-3). */
export const WORDS_IN_RECOVERY_MESSAGE =
  'Diese Wörter gehören zu einer Wiederherstellung, die auf diesem Gerät noch läuft. Mach unter „Konto wiederherstellen" weiter.';
/** A passkey migration on this device is not finished: its record must not be replaced. */
export const WORDS_MIGRATION_PENDING_MESSAGE =
  'Auf diesem Gerät ist die Einrichtung deines Passkeys noch nicht abgeschlossen. Schließe sie zuerst unter Einstellungen → Passkey ab.';

export type WordsAccountDeps = {
  phrase: PhraseStore;
  sessionStorage: SessionStorage;
  migrationStorage: KeyValueStorage;
  /** recovery-lookup `findSafesByOwner` (shape- and owner-checked; RPC errors propagate). */
  findSafesByOwner: (owner: Address) => Promise<Address[]>;
  /** words-recovery `findWalletsByWords` over the words' pool (E5; errors propagate). */
  findWalletsByWords: (pool: readonly Address[]) => Promise<WordsWallet[]>;
  /** A Safe with history (legacy link or users row): the tie-break among several owned Safes. */
  hasHistory?: (safe: Address) => Promise<boolean>;
  /** Where restore.tsx keeps a running guardian recovery (M-3); default `migrationStorage`. */
  recoveryStorage?: RecoveryStorage;
  random?: (n: number) => Uint8Array;
};

export type WordsResult =
  | { status: 'signedIn'; session: PasskeySession; phrase?: string }
  /** The words are recovery words of an account (E5): open the words recovery at `route`. */
  | { status: 'recoveryWords'; message: string; route: string }
  /**
   * The device-unlock prompt was dismissed. No account was opened and no record or session was
   * written; the screen keeps the typed words. Words of another account stored before may be gone
   * (the store deletes them before writing; it only allows that for confirmed words).
   */
  | { status: 'cancelled' }
  /**
   * `reason: 'overwrite'`: E4 — the caller may offer `phrase.discardIfUnreadable()` on a tap.
   * `phrase`: create stored the words but could not save the account; show them anyway.
   */
  | { status: 'error'; message: string; reason?: 'overwrite'; phrase?: string };

const isCancel = (e: unknown) => e instanceof PhraseCancelledError || /cancel/i.test(e instanceof Error ? e.message : String(e));

/**
 * Maps a failed `PhraseStore.write`. E4 and missing biometrics are refused before the store touches
 * anything; any other failure happened mid-write and may leave the marker of the NEW words without
 * a phrase, which would block re-entering the previous (confirmed, already deleted) words. That
 * marker is removed (best effort).
 */
async function writeFailure(store: PhraseStore, e: unknown): Promise<Exclude<WordsResult, { status: 'signedIn' }>> {
  if (e instanceof PhraseOverwriteError) return { status: 'error', message: PHRASE_OVERWRITE_MESSAGE, reason: 'overwrite' };
  if (e instanceof Error && e.message === NO_BIOMETRICS_MESSAGE) return { status: 'error', message: NO_BIOMETRICS_MESSAGE };
  await store.remove().catch(() => undefined);
  if (isCancel(e)) return { status: 'cancelled' };
  return { status: 'error', message: WORDS_STORE_FAILED_MESSAGE };
}

/** An unfinished passkey migration's record is the only pointer to its passkey: never replace it. */
async function migrationPending(storage: KeyValueStorage): Promise<boolean> {
  const rec = await loadMigrationRecord(storage).catch(() => null);
  return !!rec && !isWordsOwner(rec) && !!rec.legacy && rec.status !== 'done';
}

/**
 * M-3: words that are the new owner of an expert recovery still running on this device (not
 * cancelled) must not open an account of their own — that would be the fresh, empty Safe that
 * sends the recovery, not the account being recovered. The recovery screen finishes it.
 */
async function inRunningRecovery(deps: WordsAccountDeps, owner: Address): Promise<boolean> {
  const s = await loadRecoveryState(deps.recoveryStorage ?? deps.migrationStorage).catch(() => null);
  return !!s && s.ownerKind === 'ecdsa' && !!s.signer && s.step !== 'cancelled' && isAddressEqual(s.signer, owner);
}

const IN_RECOVERY: WordsResult = { status: 'recoveryWords', message: WORDS_IN_RECOVERY_MESSAGE, route: WORDS_RECOVERY_ROUTE };

/** The words session + record for `safe` (identity = the Safe: an expert account has no legacy account). */
async function saveWordsAccount(deps: WordsAccountDeps, safe: Address, owner: Address): Promise<PasskeySession> {
  const session: PasskeySession = {
    credentialId: '',
    x: WORDS_KEY_PLACEHOLDER,
    y: WORDS_KEY_PLACEHOLDER,
    safe,
    identity: safe,
    ownerType: 'ecdsa',
    owner,
  };
  const rec: MigrationRecord = {
    credentialId: '',
    x: WORDS_KEY_PLACEHOLDER,
    y: WORDS_KEY_PLACEHOLDER,
    safe,
    ownerType: 'ecdsa',
    owner,
    status: 'done',
    txHash: null,
  };
  await deps.migrationStorage.setItem(MIGRATION_STORE_KEY, JSON.stringify(rec));
  await savePasskeySession(deps.sessionStorage, session);
  return session;
}

/** Every flow returns a WordsResult: an unexpected throw (a store read) becomes a generic error. */
async function guarded(run: () => Promise<WordsResult>): Promise<WordsResult> {
  try {
    return await run();
  } catch {
    return { status: 'error', message: WORDS_FAILED_MESSAGE };
  }
}

/**
 * A new phrase, stored behind the device unlock. Shared with the guardian recovery of an expert
 * account (Task 9). Throws what `PhraseStore.write` throws.
 */
export async function generateAndStorePhrase(
  store: PhraseStore,
  random: (n: number) => Uint8Array = randomBytes,
): Promise<{ phrase: string; owner: Address }> {
  const phrase = generatePhrase(random);
  const owner = wordsFromSeed(phrase).account(0).address;
  await store.write(phrase);
  return { phrase, owner };
}

/** "Konto erstellen" on the expert path. */
export function createWordsAccount(deps: WordsAccountDeps): Promise<WordsResult> {
  return guarded(async () => {
    if (!(await deps.phrase.canProtect())) return { status: 'error', message: NO_BIOMETRICS_MESSAGE };
    if (await deps.phrase.has()) return { status: 'error', message: WORDS_ALREADY_STORED_MESSAGE };
    if (await migrationPending(deps.migrationStorage)) return { status: 'error', message: WORDS_MIGRATION_PENDING_MESSAGE };
    let created: { phrase: string; owner: Address };
    try {
      created = await generateAndStorePhrase(deps.phrase, deps.random ?? randomBytes);
    } catch (e) {
      // Nothing was stored before (checked above), so dropping a half-written marker loses nothing.
      return writeFailure(deps.phrase, e);
    }
    const { phrase, owner } = created;
    try {
      const session = await saveWordsAccount(deps, predictEcdsaSafeAddress(owner), owner);
      // Returned once for the show screen; never persisted outside the protected store.
      return { status: 'signedIn', session, phrase };
    } catch {
      // The phrase is stored (unconfirmed): show it anyway; "Gespeichertes Konto auf diesem Gerät
      // öffnen" finishes the account.
      return { status: 'error', message: WORDS_SAVE_FAILED_MESSAGE, phrase };
    }
  });
}

/** The Safe these words own. Lookup errors → no-connection, never the derived Safe. */
async function resolveWordsSafe(
  pool: readonly Address[],
  deps: WordsAccountDeps,
): Promise<{ safe: Address } | Exclude<WordsResult, { status: 'signedIn' }>> {
  const owner = pool[0];
  let unique: Address[] = [];
  let recoverable: WordsWallet[];
  try {
    // Both are full-range log scans: run them side by side.
    const [safes, wallets] = await Promise.all([deps.findSafesByOwner(owner), deps.findWalletsByWords(pool)]);
    recoverable = wallets;
    for (const s of safes) if (!unique.some((u) => isAddressEqual(u, s))) unique.push(getAddress(s));
    if (unique.length > 1 && deps.hasHistory) {
      const withHistory: Address[] = [];
      for (const s of unique) if (await deps.hasHistory(s)) withHistory.push(s);
      if (withHistory.length === 1) unique = withHistory;
    }
  } catch {
    return { status: 'error', message: WORDS_NO_CONNECTION_MESSAGE };
  }
  if (unique.length > 1) return { status: 'error', message: WORDS_SEVERAL_ACCOUNTS_MESSAGE };
  // Owner AND recovery words: one of them may be a decoy built on the public pool address (E5).
  if (unique.length === 1 && recoverable.length > 0) return { status: 'error', message: WORDS_SEVERAL_ACCOUNTS_MESSAGE };
  if (unique.length === 1) return { safe: unique[0] };
  // Recovery words that own nothing go to the recovery instead of an empty expert account (E5).
  if (recoverable.length > 0) return { status: 'recoveryWords', message: WORDS_ARE_RECOVERY_WORDS_MESSAGE, route: WORDS_RECOVERY_ROUTE };
  return { safe: predictEcdsaSafeAddress(owner) };
}

/** "Mit 12 Wörtern anmelden": the typed words become this device's key for the account they own. */
export function signInWithWords(input: string, deps: WordsAccountDeps): Promise<WordsResult> {
  return guarded(async () => {
    const check = validatePhrase(input);
    if (!check.ok) return { status: 'error', message: phraseErrorMessage(check) };
    if (!(await deps.phrase.canProtect())) return { status: 'error', message: NO_BIOMETRICS_MESSAGE };
    const pool = wordsFromSeed(check.phrase).addresses(WORDS_POOL_SIZE);
    const owner = pool[0];
    // E4 before any network: the store refuses this too, but the person learns it at once.
    const stored = await deps.phrase.storedOwner();
    if (stored && !isAddressEqual(stored, owner) && !(await deps.phrase.isConfirmed())) {
      return { status: 'error', message: PHRASE_OVERWRITE_MESSAGE, reason: 'overwrite' };
    }
    if (await migrationPending(deps.migrationStorage)) return { status: 'error', message: WORDS_MIGRATION_PENDING_MESSAGE };
    if (await inRunningRecovery(deps, owner)) return IN_RECOVERY;
    const found = await resolveWordsSafe(pool, deps);
    if (!('safe' in found)) return found;
    try {
      await deps.phrase.write(check.phrase);
    } catch (e) {
      return writeFailure(deps.phrase, e);
    }
    try {
      // The person typed exactly these words: they hold them (E3: `write` reset the flag).
      await deps.phrase.markConfirmed();
      return { status: 'signedIn', session: await saveWordsAccount(deps, found.safe, owner) };
    } catch {
      return { status: 'error', message: WORDS_SAVE_FAILED_MESSAGE };
    }
  });
}

/**
 * "Gespeichertes Konto auf diesem Gerät öffnen": one device unlock, then as `signInWithWords`
 * without storing the words again (and without marking them confirmed: nobody typed them).
 */
export function openStoredWordsAccount(deps: WordsAccountDeps): Promise<WordsResult> {
  return guarded(async () => {
    if (!(await deps.phrase.has())) {
      // No marker while a words session is active: the store was wiped under it → re-entry, not "no account".
      const session = await loadPasskeySession(deps.sessionStorage).catch(() => null);
      return { status: 'error', message: isWordsOwner(session) ? WORDS_UNREADABLE_MESSAGE : WORDS_NOT_STORED_MESSAGE };
    }
    let phrase: string;
    try {
      phrase = await deps.phrase.read(PHRASE_PROMPT);
    } catch (e) {
      if (e instanceof PhraseUnavailableError) return { status: 'error', message: WORDS_UNREADABLE_MESSAGE };
      if (isCancel(e)) return { status: 'cancelled' };
      return { status: 'error', message: WORDS_STORE_FAILED_MESSAGE };
    }
    const check = validatePhrase(phrase);
    if (!check.ok) return { status: 'error', message: WORDS_UNREADABLE_MESSAGE };
    if (await migrationPending(deps.migrationStorage)) return { status: 'error', message: WORDS_MIGRATION_PENDING_MESSAGE };
    const pool = wordsFromSeed(check.phrase).addresses(WORDS_POOL_SIZE);
    if (await inRunningRecovery(deps, pool[0])) return IN_RECOVERY;
    const found = await resolveWordsSafe(pool, deps);
    if (!('safe' in found)) return found;
    try {
      return { status: 'signedIn', session: await saveWordsAccount(deps, found.safe, pool[0]) };
    } catch {
      return { status: 'error', message: WORDS_SAVE_FAILED_MESSAGE };
    }
  });
}
