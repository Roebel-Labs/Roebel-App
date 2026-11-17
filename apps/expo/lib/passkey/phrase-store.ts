/**
 * The protected store of the 12 words (expert path). On a words account the phrase IS the owner
 * key of the Safe, so:
 *
 *   - it lives only in SecureStore, device-only (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`: never in a cloud
 *     keychain or a backup), protected by the device unlock (`requireAuthentication`: Face ID /
 *     fingerprint on every read). It is never sent anywhere and never logged;
 *   - `has()` / `storedOwner()` read only an unprotected marker holding the phrase's PUBLIC
 *     address 0, so restoring a session or checking for a phrase never prompts and never reads it;
 *   - when the system invalidates the protected item (fingerprints or Face ID changed: Android
 *     KeyPermanentlyInvalidatedException, iOS biometryCurrentSet — expo-secure-store then returns
 *     null) `read` throws PhraseUnavailableError: the person stays signed in and is asked for the
 *     words again; a cancelled prompt is PhraseCancelledError;
 *   - `write` and `remove` reset the confirmed flag (preflight E3), and `write` refuses to replace a
 *     phrase of ANOTHER account that was never confirmed (E4): it may be that account's only key —
 *     unless it is unreadable anyway (`discardIfUnreadable`);
 *   - `write` deletes the old item before adding the new one (iOS would otherwise update the item
 *     under its old, possibly invalidated access control).
 *
 * Every native call is injected (`createPhraseStore(secure)`); pass the expo-secure-store module.
 */
import { getAddress, isAddressEqual, type Address } from 'viem';
import { validatePhrase, wordAccount } from './words';

export const WORDS_PHRASE_KEY = 'words_phrase_v1';
export const WORDS_PHRASE_MARKER_KEY = 'words_phrase_present_v1';
export const WORDS_CONFIRMED_KEY = 'words_phrase_confirmed_v1';

export const PHRASE_PROMPT = 'Bestätige, dass du es bist';
export const NO_BIOMETRICS_MESSAGE =
  'Für ein Konto mit 12 Wörtern braucht dein Handy Fingerabdruck oder Gesichtserkennung als Gerätesperre.';
export const PHRASE_OVERWRITE_MESSAGE =
  'Auf diesem Gerät liegt ein Konto, dessen Wörter noch nicht bestätigt sind. Öffne es zuerst und bestätige die Wörter.';

/** The protected phrase is gone (invalidated by a biometric change, or never stored): enter the words again. */
export class PhraseUnavailableError extends Error {
  constructor(message = 'the 12 words are not available on this device') {
    super(message);
    this.name = 'PhraseUnavailableError';
  }
}

export const PHRASE_MISMATCH_MESSAGE =
  'Die 12 Wörter auf diesem Gerät gehören zu einem anderen Konto. Bitte gib die Wörter dieses Kontos noch einmal ein.';

/**
 * The stored phrase is readable but derives ANOTHER account than the session's owner (final review
 * I-3). For this account the words are as good as gone: a subclass of PhraseUnavailableError, so
 * every handler routes it the same way (announced on phrase-events → enter the words again).
 */
export class PhraseMismatchError extends PhraseUnavailableError {
  constructor(message = PHRASE_MISMATCH_MESSAGE) {
    super(message);
    this.name = 'PhraseMismatchError';
  }
}

/** The person dismissed the device-unlock prompt. */
export class PhraseCancelledError extends Error {
  constructor(message = 'device unlock cancelled') {
    super(message);
    this.name = 'PhraseCancelledError';
  }
}

/** `write` would replace the unconfirmed words of another account (E4). */
export class PhraseOverwriteError extends Error {
  constructor(message = PHRASE_OVERWRITE_MESSAGE) {
    super(message);
    this.name = 'PhraseOverwriteError';
  }
}

export type PhraseStore = {
  /** The device can protect an item with biometrics (else no words account on this phone). */
  canProtect(): Promise<boolean>;
  /** A phrase was stored on this device (marker only: no prompt, no phrase read). */
  has(): Promise<boolean>;
  /** Address 0 of the stored phrase (marker only: no prompt), or null. */
  storedOwner(): Promise<Address | null>;
  write(phrase: string): Promise<void>;
  /** The phrase, behind the device unlock showing `reason`. */
  read(reason: string): Promise<string>;
  remove(): Promise<void>;
  /**
   * Preflight E4 / M2 escape: the stored words of an unconfirmed account block `write` of other
   * words. When the system invalidated them (biometrics changed) they can never be read again, so
   * holding on to them protects nothing. Whether an item is still readable cannot be learned
   * without the unlock (neither platform exposes it), so this tries ONE read: an invalidated item
   * fails without a prompt and is removed (true); a readable one is left alone (false; the person
   * saw one prompt); a cancel rethrows PhraseCancelledError. T7/T9 offer it after a
   * PhraseOverwriteError ("Die Wörter auf diesem Gerät sind nicht mehr lesbar …").
   */
  discardIfUnreadable(): Promise<boolean>;
  isConfirmed(): Promise<boolean>;
  markConfirmed(): Promise<void>;
};

type StoreOptions = { requireAuthentication?: boolean; authenticationPrompt?: string; keychainAccessible?: number };

/** The subset of expo-secure-store this module uses (the module namespace satisfies it). */
export type SecureStoreLike = {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: number;
  getItemAsync: (key: string, options?: StoreOptions) => Promise<string | null>;
  setItemAsync: (key: string, value: string, options?: StoreOptions) => Promise<void>;
  deleteItemAsync: (key: string, options?: StoreOptions) => Promise<void>;
  canUseBiometricAuthentication: () => boolean;
};

const CANCEL = /cancel/i;
const GONE = /invalidated|could not be found|not found/i;

export function createPhraseStore(secure: SecureStoreLike): PhraseStore {
  const plain: StoreOptions = { keychainAccessible: secure.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  const protectedOpts = (reason: string): StoreOptions => ({
    requireAuthentication: true,
    authenticationPrompt: reason,
    keychainAccessible: secure.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

  const canProtect = async () => {
    try {
      return secure.canUseBiometricAuthentication() === true;
    } catch {
      return false;
    }
  };

  const storedOwner = async (): Promise<Address | null> => {
    const v = await secure.getItemAsync(WORDS_PHRASE_MARKER_KEY, plain);
    if (!v) return null;
    try {
      return getAddress(v);
    } catch {
      return null;
    }
  };

  const isConfirmed = async () => (await secure.getItemAsync(WORDS_CONFIRMED_KEY, plain)) === '1';

  const readPhrase = async (reason: string): Promise<string> => {
    let phrase: string | null;
    try {
      phrase = await secure.getItemAsync(WORDS_PHRASE_KEY, protectedOpts(reason));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (CANCEL.test(msg)) throw new PhraseCancelledError();
      if (GONE.test(msg)) throw new PhraseUnavailableError();
      throw e;
    }
    if (!phrase) throw new PhraseUnavailableError();
    return phrase;
  };

  const removeAll = async () => {
    await secure.deleteItemAsync(WORDS_PHRASE_KEY, protectedOpts(PHRASE_PROMPT));
    await secure.deleteItemAsync(WORDS_PHRASE_MARKER_KEY, plain);
    await secure.deleteItemAsync(WORDS_CONFIRMED_KEY, plain);
  };

  return {
    canProtect,
    has: async () => (await secure.getItemAsync(WORDS_PHRASE_MARKER_KEY, plain)) !== null,
    storedOwner,
    write: async (input) => {
      const check = validatePhrase(input);
      if (!check.ok) throw new Error('invalid 12-word phrase');
      if (!(await canProtect())) throw new Error(NO_BIOMETRICS_MESSAGE);
      const owner = wordAccount(check.phrase, 0).address;
      const current = await storedOwner();
      if (current && !isAddressEqual(current, owner) && !(await isConfirmed())) throw new PhraseOverwriteError();
      // Delete first (no prompt): on iOS a set on an existing item becomes SecItemUpdate under the
      // OLD access control, which fails for an item invalidated by a Face ID change (exactly the
      // re-entry path) and costs an extra prompt otherwise. E4 above guards what is deleted.
      await secure.deleteItemAsync(WORDS_PHRASE_KEY, protectedOpts(PHRASE_PROMPT));
      // Invariant (M1): whenever a phrase is stored, the marker names ITS owner. The marker is
      // written while no phrase exists, so a failure at any step leaves at worst a marker without
      // a phrase (read -> PhraseUnavailableError -> enter the words again), never a wrong owner.
      await secure.setItemAsync(WORDS_PHRASE_MARKER_KEY, owner, plain);
      await secure.deleteItemAsync(WORDS_CONFIRMED_KEY, plain);
      await secure.setItemAsync(WORDS_PHRASE_KEY, check.phrase, protectedOpts(PHRASE_PROMPT));
    },
    read: (reason) => readPhrase(reason),
    remove: () => removeAll(),
    discardIfUnreadable: async () => {
      if (!(await storedOwner())) return false;
      try {
        await readPhrase(PHRASE_PROMPT);
        return false;
      } catch (e) {
        if (!(e instanceof PhraseUnavailableError)) throw e;
      }
      await removeAll();
      return true;
    },
    isConfirmed,
    // E3 invariant: the flag belongs to the phrase stored NOW. `write` and `remove` clear it, so
    // call this only after the person proved they hold exactly the stored words (confirm step,
    // sign-in or re-entry with the words typed in).
    markConfirmed: async () => {
      await secure.setItemAsync(WORDS_CONFIRMED_KEY, '1', plain);
    },
  };
}
