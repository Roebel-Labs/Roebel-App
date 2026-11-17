import { getAddress } from 'viem';
import {
  createPhraseStore,
  NO_BIOMETRICS_MESSAGE,
  PHRASE_PROMPT,
  PhraseCancelledError,
  PhraseOverwriteError,
  PhraseUnavailableError,
  WORDS_CONFIRMED_KEY,
  WORDS_PHRASE_KEY,
  WORDS_PHRASE_MARKER_KEY,
} from '../phrase-store';
import { onPhraseUnavailable } from '../phrase-events';

const JUNK = 'test test test test test test test test test test test junk';
const JUNK_OWNER = getAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
const ABOUT = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

type Opts = { requireAuthentication?: boolean; authenticationPrompt?: string; keychainAccessible?: number };

/**
 * expo-secure-store as the native module behaves: an item protected with `requireAuthentication`
 * whose key the system invalidated (fingerprints / Face ID changed) reads back as null (Android:
 * KeyPermanentlyInvalidatedException -> null; iOS: biometryCurrentSet -> errSecItemNotFound -> null).
 */
function fakeSecure(
  o: { readThrows?: 'invalidated' | 'cancel' | 'other'; canBio?: boolean | 'throws' } = {},
) {
  const m = new Map<string, string>();
  const calls: { op: 'get' | 'set' | 'del'; key: string; options?: Opts }[] = [];
  const s = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
    m,
    calls,
    authenticatedReads: 0,
    readThrows: o.readThrows,
    /** Simulates the system invalidating the protected key (the item is gone, the marker stays). */
    invalidate: () => void m.delete(WORDS_PHRASE_KEY),
    getItemAsync: async (key: string, options?: Opts) => {
      calls.push({ op: 'get', key, options });
      if (options?.requireAuthentication) {
        s.authenticatedReads += 1;
        if (s.readThrows === 'cancel') throw new Error('Could not Authenticate the user: User canceled the authentication. Abbrechen');
        if (s.readThrows === 'invalidated') {
          throw new Error("Could not decrypt the value for key 'words_phrase_v1'. Caused by: Key permanently invalidated");
        }
        if (s.readThrows === 'other') throw new Error('Could not Authenticate the user: Lockout');
      }
      return m.get(key) ?? null;
    },
    setItemAsync: async (key: string, value: string, options?: Opts) => {
      calls.push({ op: 'set', key, options });
      m.set(key, value);
    },
    deleteItemAsync: async (key: string, options?: Opts) => {
      calls.push({ op: 'del', key, options });
      m.delete(key);
    },
    canUseBiometricAuthentication: () => {
      if (o.canBio === 'throws') throw new Error('native module missing');
      return o.canBio ?? true;
    },
  };
  return s;
}

describe('phrase store', () => {
  it('write protects the phrase, device-only, and sets the marker; has() never prompts', async () => {
    const s = fakeSecure();
    const store = createPhraseStore(s);
    await store.write(JUNK);
    expect(s.calls.find((c) => c.key === WORDS_PHRASE_KEY)!.options).toMatchObject({
      requireAuthentication: true,
      keychainAccessible: s.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      authenticationPrompt: PHRASE_PROMPT,
    });
    expect(await store.has()).toBe(true);
    expect(s.authenticatedReads).toBe(0);
  });

  it('the marker is the PUBLIC address 0, device-only and unprotected; never the phrase', async () => {
    const s = fakeSecure();
    const store = createPhraseStore(s);
    await store.write(JUNK);
    expect(s.m.get(WORDS_PHRASE_MARKER_KEY)).toBe(JUNK_OWNER);
    const markerWrite = s.calls.find((c) => c.op === 'set' && c.key === WORDS_PHRASE_MARKER_KEY)!;
    expect(markerWrite.options).toEqual({ keychainAccessible: s.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    expect(await store.storedOwner()).toBe(JUNK_OWNER);
    for (const [k, v] of s.m) if (k !== WORDS_PHRASE_KEY) expect(v).not.toContain('junk');
    expect(s.authenticatedReads).toBe(0);
  });

  it('read asks for the device unlock with the given reason and returns the normalised phrase', async () => {
    const s = fakeSecure();
    const store = createPhraseStore(s);
    await store.write(`  ${JUNK.toUpperCase()} `);
    expect(await store.read('Zum Signieren')).toBe(JUNK);
    const read = s.calls.find((c) => c.op === 'get' && c.key === WORDS_PHRASE_KEY)!;
    expect(read.options).toMatchObject({ requireAuthentication: true, authenticationPrompt: 'Zum Signieren' });
    expect(s.authenticatedReads).toBe(1);
  });

  it('an invalidated item is PhraseUnavailableError, a cancelled prompt PhraseCancelledError', async () => {
    await expect(createPhraseStore(fakeSecure({ readThrows: 'invalidated' })).read('x')).rejects.toBeInstanceOf(PhraseUnavailableError);
    await expect(createPhraseStore(fakeSecure({ readThrows: 'cancel' })).read('x')).rejects.toBeInstanceOf(PhraseCancelledError);
  });

  it('fingerprints changed (native: the protected item reads back as null) -> PhraseUnavailableError; has() still true', async () => {
    const s = fakeSecure();
    const store = createPhraseStore(s);
    await store.write(JUNK);
    s.invalidate();
    await expect(store.read(PHRASE_PROMPT)).rejects.toBeInstanceOf(PhraseUnavailableError);
    expect(await store.has()).toBe(true);
    expect(await store.storedOwner()).toBe(JUNK_OWNER);
  });

  it('no phrase at all is PhraseUnavailableError; other native errors pass through unchanged', async () => {
    await expect(createPhraseStore(fakeSecure()).read('x')).rejects.toBeInstanceOf(PhraseUnavailableError);
    const err = createPhraseStore(fakeSecure({ readThrows: 'other' })).read('x');
    await expect(err).rejects.toThrow('Lockout');
    await expect(createPhraseStore(fakeSecure({ readThrows: 'other' })).read('x')).rejects.not.toBeInstanceOf(PhraseUnavailableError);
  });

  it('the store itself emits nothing (the session signer owns the re-entry event)', async () => {
    const seen = jest.fn();
    const off = onPhraseUnavailable(seen);
    await expect(createPhraseStore(fakeSecure({ readThrows: 'invalidated' })).read('x')).rejects.toBeInstanceOf(PhraseUnavailableError);
    off();
    expect(seen).not.toHaveBeenCalled();
  });

  it('write and remove reset the confirmed flag (E3)', async () => {
    const s = fakeSecure();
    const store = createPhraseStore(s);
    await store.write(JUNK);
    expect(await store.isConfirmed()).toBe(false);
    await store.markConfirmed();
    expect(await store.isConfirmed()).toBe(true);
    await store.write(JUNK);
    expect(await store.isConfirmed()).toBe(false);
    await store.markConfirmed();
    await store.remove();
    expect(await store.isConfirmed()).toBe(false);
    expect(await store.has()).toBe(false);
    expect(s.m.has(WORDS_PHRASE_KEY)).toBe(false);
    expect(s.m.has(WORDS_CONFIRMED_KEY)).toBe(false);
  });

  it('refuses to overwrite an unconfirmed phrase of another account; same words or a confirmed one may be replaced (E4)', async () => {
    const s = fakeSecure();
    const store = createPhraseStore(s);
    await store.write(JUNK);
    await expect(store.write(ABOUT)).rejects.toBeInstanceOf(PhraseOverwriteError);
    expect(s.m.get(WORDS_PHRASE_KEY)).toBe(JUNK);
    await store.write(JUNK); // re-entering the same words (e.g. after fingerprints changed) is fine
    await store.markConfirmed();
    await store.write(ABOUT);
    expect(await store.storedOwner()).not.toBe(JUNK_OWNER);
    expect(s.m.get(WORDS_PHRASE_KEY)).toBe(ABOUT);
  });

  it('refuses an invalid phrase without touching the store', async () => {
    const s = fakeSecure();
    await expect(createPhraseStore(s).write('abandon abandon')).rejects.toThrow();
    expect(s.calls.filter((c) => c.op === 'set')).toHaveLength(0);
  });

  it('canProtect follows the biometric check and is false when the native module is missing', async () => {
    expect(await createPhraseStore(fakeSecure()).canProtect()).toBe(true);
    expect(await createPhraseStore(fakeSecure({ canBio: false })).canProtect()).toBe(false);
    expect(await createPhraseStore(fakeSecure({ canBio: 'throws' })).canProtect()).toBe(false);
    expect(NO_BIOMETRICS_MESSAGE).toBe(
      'Für ein Konto mit 12 Wörtern braucht dein Handy Fingerabdruck oder Gesichtserkennung als Gerätesperre.',
    );
  });

  it('write refuses on a phone without biometrics, before storing anything', async () => {
    const s = fakeSecure({ canBio: false });
    await expect(createPhraseStore(s).write(JUNK)).rejects.toThrow(NO_BIOMETRICS_MESSAGE);
    expect(s.calls.filter((c) => c.op === 'set')).toHaveLength(0);
  });
});
