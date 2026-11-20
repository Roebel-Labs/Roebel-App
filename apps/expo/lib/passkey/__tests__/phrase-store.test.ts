import { getAddress } from 'viem';
import {
  createPhraseStore,
  NO_BIOMETRICS_MESSAGE,
  removeOwnPhrase,
  PHRASE_PROMPT,
  PhraseCancelledError,
  PhraseOverwriteError,
  PhraseUnavailableError,
  WORDS_BACKUP_EXPORTED_KEY,
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
  /** iOS: an invalidated item still EXISTS (SecItemAdd -> duplicate -> update under its dead access control fails). */
  const stale = new Set<string>();
  const calls: { op: 'get' | 'set' | 'del'; key: string; options?: Opts }[] = [];
  const s = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
    m,
    calls,
    authenticatedReads: 0,
    readThrows: o.readThrows,
    stale,
    /** Simulates the system invalidating the protected key: unreadable (null), still present, marker stays. */
    invalidate: () => {
      m.delete(WORDS_PHRASE_KEY);
      stale.add(WORDS_PHRASE_KEY);
    },
    /** Fails the next set of `key` (e.g. a cancelled prompt on an Android write). */
    failSetOf: null as string | null,
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
      if (s.failSetOf === key) throw new Error('Could not Authenticate the user: User canceled the authentication');
      if (stale.has(key)) {
        throw new Error('Authentication failed. Provided passphrase/PIN is incorrect or there is no user authentication method configured for this device.');
      }
      m.set(key, value);
    },
    deleteItemAsync: async (key: string, options?: Opts) => {
      calls.push({ op: 'del', key, options });
      m.delete(key);
      stale.delete(key);
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

  it('re-entering the words after a biometric change succeeds: the dead item is deleted (no prompt) before the new one is added', async () => {
    const s = fakeSecure();
    const store = createPhraseStore(s);
    await store.write(JUNK);
    s.invalidate();
    await expect(store.read(PHRASE_PROMPT)).rejects.toBeInstanceOf(PhraseUnavailableError);
    s.calls.length = 0;
    await store.write(JUNK); // the re-entry path (Review Focus 1)
    expect(await store.read(PHRASE_PROMPT)).toBe(JUNK);
    const phraseOps = s.calls.filter((c) => c.key === WORDS_PHRASE_KEY).map((c) => c.op);
    expect(phraseOps.slice(0, 2)).toEqual(['del', 'set']);
    expect(s.calls.find((c) => c.op === 'del' && c.key === WORDS_PHRASE_KEY)!.options).toMatchObject({
      requireAuthentication: true,
      keychainAccessible: s.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  });

  it('a failed phrase write never leaves the marker naming another owner than a stored phrase (M1)', async () => {
    const s = fakeSecure();
    const store = createPhraseStore(s);
    await store.write(JUNK);
    await store.markConfirmed();
    s.failSetOf = WORDS_PHRASE_KEY;
    await expect(store.write(ABOUT)).rejects.toThrow();
    // no phrase stored -> nothing can be signed with a mismatching owner; read asks for the words again
    expect(s.m.has(WORDS_PHRASE_KEY)).toBe(false);
    await expect(store.read(PHRASE_PROMPT)).rejects.toBeInstanceOf(PhraseUnavailableError);
    const s2 = fakeSecure();
    const store2 = createPhraseStore(s2);
    await store2.write(JUNK);
    await store2.markConfirmed();
    s2.failSetOf = WORDS_PHRASE_MARKER_KEY;
    await expect(store2.write(ABOUT)).rejects.toThrow();
    expect(s2.m.get(WORDS_PHRASE_MARKER_KEY)).toBe(JUNK_OWNER);
    expect(s2.m.has(WORDS_PHRASE_KEY)).toBe(false); // the old words were already deleted; the marker still names their owner
  });

  it('E4 escape (M2): unreadable unconfirmed words are discarded without a prompt; readable ones stay', async () => {
    const s = fakeSecure();
    const store = createPhraseStore(s);
    await store.write(JUNK);
    await expect(store.write(ABOUT)).rejects.toBeInstanceOf(PhraseOverwriteError);
    expect(await store.discardIfUnreadable()).toBe(false); // still readable: one prompt, nothing removed
    expect(s.m.get(WORDS_PHRASE_KEY)).toBe(JUNK);
    s.invalidate();
    expect(await store.discardIfUnreadable()).toBe(true);
    expect(await store.has()).toBe(false);
    await store.write(ABOUT);
    expect(s.m.get(WORDS_PHRASE_KEY)).toBe(ABOUT);
    expect(await createPhraseStore(fakeSecure()).discardIfUnreadable()).toBe(false);
    const c = fakeSecure();
    const cs = createPhraseStore(c);
    await cs.write(JUNK);
    c.readThrows = 'cancel';
    await expect(cs.discardIfUnreadable()).rejects.toBeInstanceOf(PhraseCancelledError);
    expect(c.m.get(WORDS_PHRASE_KEY)).toBe(JUNK);
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

  it('the exported-backup flag: plain (no prompt), device-only, reset by write and remove (E3)', async () => {
    const s = fakeSecure();
    const store = createPhraseStore(s);
    await store.write(JUNK);
    expect(await store.isBackupExported()).toBe(false);
    await store.markBackupExported();
    expect(await store.isBackupExported()).toBe(true);
    const set = s.calls.find((c) => c.op === 'set' && c.key === WORDS_BACKUP_EXPORTED_KEY);
    expect(set?.options).toEqual({ keychainAccessible: s.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    expect(s.authenticatedReads).toBe(0);
    await store.write(JUNK);
    expect(await store.isBackupExported()).toBe(false);
    await store.markBackupExported();
    await store.remove();
    expect(await store.isBackupExported()).toBe(false);
    expect(s.m.has(WORDS_BACKUP_EXPORTED_KEY)).toBe(false);
    expect(WORDS_BACKUP_EXPORTED_KEY).toBe('words_backup_exported_v1');
  });

  it('discarding unreadable words resets the exported flag too', async () => {
    const s = fakeSecure();
    const store = createPhraseStore(s);
    await store.write(JUNK);
    await store.markBackupExported();
    s.invalidate();
    expect(await store.discardIfUnreadable()).toBe(true);
    expect(await store.isBackupExported()).toBe(false);
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

  describe('removeOwnPhrase (M-2: "Wörter löschen" only removes this account\'s words)', () => {
    it('the stored words derive the owner: one unlock, removed', async () => {
      const s = fakeSecure();
      const store = createPhraseStore(s);
      await store.write(JUNK);
      expect(await removeOwnPhrase(store, JUNK_OWNER)).toBe('removed');
      expect(s.authenticatedReads).toBe(1);
      expect(await store.has()).toBe(false);
    });

    it('another account\'s words: refused, nothing removed', async () => {
      const s = fakeSecure();
      const store = createPhraseStore(s);
      await store.write(ABOUT);
      expect(await removeOwnPhrase(store, JUNK_OWNER)).toBe('otherAccount');
      expect(s.m.get(WORDS_PHRASE_KEY)).toBe(ABOUT);
      expect(await store.has()).toBe(true);
    });

    it('unreadable words go (they can never sign again); a cancelled unlock removes nothing', async () => {
      const gone = fakeSecure();
      const goneStore = createPhraseStore(gone);
      await goneStore.write(ABOUT);
      gone.invalidate();
      expect(await removeOwnPhrase(goneStore, JUNK_OWNER)).toBe('removed');
      expect(await goneStore.has()).toBe(false);

      const cancel = fakeSecure();
      const cancelStore = createPhraseStore(cancel);
      await cancelStore.write(JUNK);
      cancel.readThrows = 'cancel';
      await expect(removeOwnPhrase(cancelStore, JUNK_OWNER)).rejects.toBeInstanceOf(PhraseCancelledError);
      expect(await cancelStore.has()).toBe(true);
    });
  });
});
