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
 *
 * Rules (preflight):
 *   E4  a stored phrase of ANOTHER account that was never confirmed may be that account's only
 *       key: it is never replaced. The caller gets `reason: 'overwrite'` and may offer
 *       `phrase.discardIfUnreadable()` — only on an explicit action of the person.
 *   E5  words that are RECOVERY words of an account (plan 2's pool guardians) must not open an
 *       empty expert account: the person is sent to the words recovery with one sentence.
 *   E7  `findSafesByOwner` (recovery-lookup.ts) keeps only Safes of the app's shape (factory
 *       proxy, SafeL2, exactly the 4337 + recovery modules, 4337 fallback) with this single owner.
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
export const WORDS_SAVE_FAILED_MESSAGE = 'Das Konto konnte nicht gespeichert werden. Bitte versuche es erneut.';
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
  random?: (n: number) => Uint8Array;
};

export type WordsResult =
  | { status: 'signedIn'; session: PasskeySession; phrase?: string }
  /** The words are recovery words of an account (E5): open the words recovery at `route`. */
  | { status: 'recoveryWords'; message: string; route: string }
  /** The device-unlock prompt was dismissed; nothing changed (the UI keeps the typed words). */
  | { status: 'cancelled' }
  /** `reason: 'overwrite'`: E4 — the caller may offer `phrase.discardIfUnreadable()` on a tap. */
  | { status: 'error'; message: string; reason?: 'overwrite' };

const isCancel = (e: unknown) => e instanceof PhraseCancelledError || /cancel/i.test(e instanceof Error ? e.message : String(e));

/** Writes the phrase (E4-guarded by the store); a failure is a result, never a throw. */
async function storePhrase(store: PhraseStore, phrase: string): Promise<WordsResult | null> {
  try {
    await store.write(phrase);
    return null;
  } catch (e) {
    if (e instanceof PhraseOverwriteError) return { status: 'error', message: PHRASE_OVERWRITE_MESSAGE, reason: 'overwrite' };
    if (isCancel(e)) return { status: 'cancelled' };
    if (e instanceof Error && e.message === NO_BIOMETRICS_MESSAGE) return { status: 'error', message: NO_BIOMETRICS_MESSAGE };
    return { status: 'error', message: WORDS_STORE_FAILED_MESSAGE };
  }
}

/** An unfinished passkey migration's record is the only pointer to its passkey: never replace it. */
async function migrationPending(storage: KeyValueStorage): Promise<boolean> {
  const rec = await loadMigrationRecord(storage).catch(() => null);
  return !!rec && !isWordsOwner(rec) && !!rec.legacy && rec.status !== 'done';
}

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
export async function createWordsAccount(deps: WordsAccountDeps): Promise<WordsResult> {
  if (!(await deps.phrase.canProtect())) return { status: 'error', message: NO_BIOMETRICS_MESSAGE };
  if (await deps.phrase.has()) return { status: 'error', message: WORDS_ALREADY_STORED_MESSAGE };
  if (await migrationPending(deps.migrationStorage)) return { status: 'error', message: WORDS_MIGRATION_PENDING_MESSAGE };
  const phrase = generatePhrase(deps.random ?? randomBytes);
  const owner = wordsFromSeed(phrase).account(0).address;
  const failed = await storePhrase(deps.phrase, phrase);
  if (failed) {
    // Nothing was stored before (checked above): drop the marker a half-done write may leave, so a
    // retry is not refused as "already stored". Best effort.
    await deps.phrase.remove().catch(() => undefined);
    return failed;
  }
  try {
    const session = await saveWordsAccount(deps, predictEcdsaSafeAddress(owner), owner);
    // Returned once for the show screen; never persisted outside the protected store.
    return { status: 'signedIn', session, phrase };
  } catch {
    // The phrase is stored (unconfirmed): "Gespeichertes Konto auf diesem Gerät öffnen" finishes this.
    return { status: 'error', message: WORDS_SAVE_FAILED_MESSAGE };
  }
}

/** The Safe these words own (lookups first: E5, then the owner scan). Errors → no-connection. */
async function resolveWordsSafe(
  pool: readonly Address[],
  deps: WordsAccountDeps,
): Promise<{ safe: Address } | Exclude<WordsResult, { status: 'signedIn' }>> {
  const owner = pool[0];
  let safes: Address[];
  let recoverable: WordsWallet[];
  try {
    // Both are full-range log scans: run them side by side.
    [safes, recoverable] = await Promise.all([deps.findSafesByOwner(owner), deps.findWalletsByWords(pool)]);
  } catch {
    return { status: 'error', message: WORDS_NO_CONNECTION_MESSAGE };
  }
  const unique: Address[] = [];
  for (const s of safes) if (!unique.some((u) => isAddressEqual(u, s))) unique.push(getAddress(s));
  if (unique.length > 1) return { status: 'error', message: WORDS_SEVERAL_ACCOUNTS_MESSAGE };
  // Words that own an app Safe are that Safe's key: open it. Only words that own nothing but are
  // recovery words of an account go to the recovery instead of an empty expert account (E5).
  if (unique.length === 1) return { safe: unique[0] };
  if (recoverable.length > 0) return { status: 'recoveryWords', message: WORDS_ARE_RECOVERY_WORDS_MESSAGE, route: WORDS_RECOVERY_ROUTE };
  return { safe: predictEcdsaSafeAddress(owner) };
}

/** "Mit 12 Wörtern anmelden": the typed words become this device's key for the account they own. */
export async function signInWithWords(input: string, deps: WordsAccountDeps): Promise<WordsResult> {
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
  const found = await resolveWordsSafe(pool, deps);
  if (!('safe' in found)) return found;
  const failed = await storePhrase(deps.phrase, check.phrase);
  if (failed) return failed;
  try {
    // The person typed exactly these words: they hold them (E3: `write` reset the flag).
    await deps.phrase.markConfirmed();
    return { status: 'signedIn', session: await saveWordsAccount(deps, found.safe, owner) };
  } catch {
    return { status: 'error', message: WORDS_SAVE_FAILED_MESSAGE };
  }
}

/**
 * "Gespeichertes Konto auf diesem Gerät öffnen": one device unlock, then as `signInWithWords`
 * without storing the words again (and without marking them confirmed: nobody typed them).
 */
export async function openStoredWordsAccount(deps: WordsAccountDeps): Promise<WordsResult> {
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
  const found = await resolveWordsSafe(pool, deps);
  if (!('safe' in found)) return found;
  try {
    return { status: 'signedIn', session: await saveWordsAccount(deps, found.safe, pool[0]) };
  } catch {
    return { status: 'error', message: WORDS_SAVE_FAILED_MESSAGE };
  }
}
