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
 *     phrase of ANOTHER account that was never confirmed (E4): it may be that account's only key.
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
      await secure.setItemAsync(WORDS_PHRASE_KEY, check.phrase, protectedOpts(PHRASE_PROMPT));
      await secure.setItemAsync(WORDS_PHRASE_MARKER_KEY, owner, plain);
      await secure.deleteItemAsync(WORDS_CONFIRMED_KEY, plain);
    },
    read: async (reason) => {
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
    },
    remove: async () => {
      await secure.deleteItemAsync(WORDS_PHRASE_KEY, protectedOpts(PHRASE_PROMPT));
      await secure.deleteItemAsync(WORDS_PHRASE_MARKER_KEY, plain);
      await secure.deleteItemAsync(WORDS_CONFIRMED_KEY, plain);
    },
    isConfirmed,
    markConfirmed: async () => {
      await secure.setItemAsync(WORDS_CONFIRMED_KEY, '1', plain);
    },
  };
}
