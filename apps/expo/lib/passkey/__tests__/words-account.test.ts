import { getAddress, hexToBytes, type Address, type Hex } from 'viem';
import { predictEcdsaSafeAddress } from '../ecdsa-safe';
import { loadMigrationRecord, MIGRATION_STORE_KEY } from '../migration';
import {
  createPhraseStore,
  NO_BIOMETRICS_MESSAGE,
  PHRASE_OVERWRITE_MESSAGE,
  WORDS_PHRASE_KEY,
  WORDS_PHRASE_MARKER_KEY,
  type SecureStoreLike,
} from '../phrase-store';
import { loadPasskeySession, PASSKEY_SESSION_KEY, WORDS_KEY_PLACEHOLDER } from '../session';
import { deriveWordAddresses, entropyToPhrase } from '../words';
import type { WordsWallet } from '../words-recovery';
import {
  createWordsAccount,
  generateAndStorePhrase,
  openStoredWordsAccount,
  signInWithWords,
  WORDS_ALREADY_STORED_MESSAGE,
  WORDS_ARE_RECOVERY_WORDS_MESSAGE,
  WORDS_MIGRATION_PENDING_MESSAGE,
  WORDS_NOT_STORED_MESSAGE,
  WORDS_RECOVERY_ROUTE,
  WORDS_SEVERAL_ACCOUNTS_MESSAGE,
  WORDS_UNREADABLE_MESSAGE,
  type WordsAccountDeps,
} from '../words-account';

const hex = (h: string) => hexToBytes(`0x${h}` as Hex);
const LEGAL = entropyToPhrase(hex('7f'.repeat(16)));
const JUNK = 'test test test test test test test test test test test junk';
const JUNK_OWNER = getAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
const RECOVERED = getAddress('0x00000000000000000000000000000000000a11ce');
const OTHER = getAddress('0x00000000000000000000000000000000000b0b00');

type Opts = { requireAuthentication?: boolean };

/** In-memory expo-secure-store: protected reads count as prompts; `failNextProtectedSet` = a cancelled write prompt. */
function fakeSecure(canBio: boolean) {
  const m = new Map<string, string>();
  const s = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
    m,
    prompts: 0,
    readThrows: null as string | null,
    failNextProtectedSet: false,
    getItemAsync: async (key: string, o?: Opts) => {
      if (o?.requireAuthentication) {
        s.prompts += 1;
        if (s.readThrows) throw new Error(s.readThrows);
      }
      return m.get(key) ?? null;
    },
    setItemAsync: async (key: string, value: string, o?: Opts) => {
      if (o?.requireAuthentication && s.failNextProtectedSet) {
        s.failNextProtectedSet = false;
        throw new Error('Could not Authenticate the user: User canceled the authentication');
      }
      m.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      m.delete(key);
    },
    canUseBiometricAuthentication: () => canBio,
  };
  return s;
}

function memory() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: async (k: string) => m.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      m.set(k, v);
    },
    deleteItem: async (k: string) => {
      m.delete(k);
    },
  };
}

function deps(
  o: {
    canProtect?: boolean;
    random?: (n: number) => Uint8Array;
    findSafesByOwner?: (owner: Address) => Promise<Address[]>;
    findWalletsByWords?: (pool: readonly Address[]) => Promise<WordsWallet[]>;
  } = {},
) {
  const secure = fakeSecure(o.canProtect ?? true);
  const sessionStorage = memory();
  const migrationStorage = memory();
  const findSafesByOwner = jest.fn(o.findSafesByOwner ?? (async () => [] as Address[]));
  const findWalletsByWords = jest.fn(o.findWalletsByWords ?? (async () => [] as WordsWallet[]));
  const d: WordsAccountDeps & {
    secure: typeof secure;
    sessionStorage: typeof sessionStorage;
    migrationStorage: typeof migrationStorage;
    findSafesByOwner: typeof findSafesByOwner;
    findWalletsByWords: typeof findWalletsByWords;
    dump: () => Record<string, string>;
  } = {
    phrase: createPhraseStore(secure as unknown as SecureStoreLike),
    sessionStorage,
    migrationStorage,
    findSafesByOwner,
    findWalletsByWords,
    random: o.random,
    secure,
    dump: () => Object.fromEntries([...sessionStorage.m, ...migrationStorage.m]),
  };
  return d;
}

const wallet = (w: Address): WordsWallet => ({ wallet: w, wordGuardians: [], threshold: 1, recoveryLegacy: null });

describe('createWordsAccount', () => {
  it('the fixed entropy gives the LEGAL phrase used below (it contains "winner")', () => {
    expect(LEGAL.split(' ')).toHaveLength(12);
    expect(LEGAL).toContain('winner');
  });

  it('create: session and record for the predicted Safe, phrase stored, returned once, not yet confirmed', async () => {
    const d = deps({ random: () => hex('7f'.repeat(16)) });
    const r = await createWordsAccount(d);
    const owner = deriveWordAddresses(LEGAL, 1)[0];
    expect(r).toMatchObject({
      status: 'signedIn',
      phrase: LEGAL,
      session: { ownerType: 'ecdsa', owner, safe: predictEcdsaSafeAddress(owner), identity: predictEcdsaSafeAddress(owner) },
    });
    expect(await d.phrase.has()).toBe(true);
    expect(await d.phrase.isConfirmed()).toBe(false);
    expect(JSON.stringify(d.dump())).not.toContain('winner'); // session + record hold no word
  });

  it('Review Focus 5: after create the account exists and the words can be read again later', async () => {
    const d = deps({ random: () => hex('7f'.repeat(16)) });
    await createWordsAccount(d);
    const owner = deriveWordAddresses(LEGAL, 1)[0];
    // What the next app start restores (no prompt, no phrase read) …
    expect(await loadPasskeySession(d.sessionStorage)).toMatchObject({ ownerType: 'ecdsa', owner, safe: predictEcdsaSafeAddress(owner) });
    expect(await loadMigrationRecord(d.migrationStorage)).toMatchObject({
      ownerType: 'ecdsa',
      owner,
      safe: predictEcdsaSafeAddress(owner),
      credentialId: '',
      x: WORDS_KEY_PLACEHOLDER,
      status: 'done',
    });
    expect(d.secure.prompts).toBe(0);
    // … and Settings can show the words after the device unlock.
    expect(await d.phrase.read('Wörter anzeigen')).toBe(LEGAL);
    expect(await d.phrase.storedOwner()).toBe(owner);
  });

  it('create on a phone without biometrics is refused before anything is generated', async () => {
    const random = jest.fn(() => hex('7f'.repeat(16)));
    const d = deps({ canProtect: false, random });
    expect(await createWordsAccount(d)).toEqual({ status: 'error', message: NO_BIOMETRICS_MESSAGE });
    expect(await d.phrase.has()).toBe(false);
    expect(random).not.toHaveBeenCalled();
    expect(d.dump()).toEqual({});
  });

  it('create refuses when words are already stored on this device, and keeps them', async () => {
    const d = deps({ random: () => hex('7f'.repeat(16)) });
    await d.phrase.write(JUNK);
    expect(await createWordsAccount(d)).toEqual({ status: 'error', message: WORDS_ALREADY_STORED_MESSAGE });
    expect(await d.phrase.storedOwner()).toBe(JUNK_OWNER);
    expect(d.dump()).toEqual({});
  });

  it('a cancelled write prompt is "cancelled" and writes no record or session', async () => {
    const d = deps({ random: () => hex('7f'.repeat(16)) });
    d.secure.failNextProtectedSet = true;
    expect(await createWordsAccount(d)).toEqual({ status: 'cancelled' });
    expect(d.dump()).toEqual({});
    // No stale marker: trying again creates the account instead of "already stored".
    expect(await d.phrase.has()).toBe(false);
    expect(await createWordsAccount(d)).toMatchObject({ status: 'signedIn', phrase: LEGAL });
  });

  it('never replaces the record of an unfinished passkey migration', async () => {
    const d = deps({ random: () => hex('7f'.repeat(16)) });
    const pending = { credentialId: 'cred', x: `0x${'11'.repeat(32)}`, y: `0x${'22'.repeat(32)}`, safe: OTHER, ownerType: 'webauthnSigner', owner: OTHER, legacy: RECOVERED, status: 'passkeyCreated' };
    await d.migrationStorage.setItem(MIGRATION_STORE_KEY, JSON.stringify(pending));
    expect(await createWordsAccount(d)).toEqual({ status: 'error', message: WORDS_MIGRATION_PENDING_MESSAGE });
    expect(JSON.parse(d.migrationStorage.m.get(MIGRATION_STORE_KEY)!)).toEqual(pending);
    expect(await d.phrase.has()).toBe(false);
  });

  it('generateAndStorePhrase (shared with the guardian recovery) stores the phrase and returns its address 0', async () => {
    const d = deps();
    const r = await generateAndStorePhrase(d.phrase, () => hex('7f'.repeat(16)));
    expect(r).toEqual({ phrase: LEGAL, owner: deriveWordAddresses(LEGAL, 1)[0] });
    expect(await d.phrase.storedOwner()).toBe(r.owner);
  });
});

describe('signInWithWords', () => {
  it('sign in with never-used words opens the account they derive (Review Focus 2)', async () => {
    const d = deps();
    const r = await signInWithWords(JUNK, d);
    const owner = deriveWordAddresses(JUNK, 1)[0];
    expect(r).toMatchObject({
      status: 'signedIn',
      session: { safe: predictEcdsaSafeAddress(owner), identity: predictEcdsaSafeAddress(owner), owner, ownerType: 'ecdsa' },
    });
    expect(r).not.toHaveProperty('phrase');
    expect(d.findSafesByOwner).toHaveBeenCalledWith(owner);
    expect(d.findWalletsByWords).toHaveBeenCalledWith(deriveWordAddresses(JUNK));
    expect(await d.phrase.storedOwner()).toBe(owner);
    expect(await d.phrase.isConfirmed()).toBe(true);
    expect(await loadPasskeySession(d.sessionStorage)).toMatchObject({ safe: predictEcdsaSafeAddress(owner) });
    expect(JSON.stringify(d.dump())).not.toContain('junk');
  });

  it('sign in after a guardian recovery finds the recovered Safe, not the fresh one (Review Focus 3)', async () => {
    const r = await signInWithWords(JUNK, deps({ findSafesByOwner: async () => [RECOVERED] }));
    expect(r).toMatchObject({ status: 'signedIn', session: { safe: RECOVERED, identity: RECOVERED, owner: deriveWordAddresses(JUNK, 1)[0] } });
  });

  it('a recovered Safe also wins over a recovery-words hit (the words own it)', async () => {
    const r = await signInWithWords(JUNK, deps({ findSafesByOwner: async () => [RECOVERED], findWalletsByWords: async () => [wallet(OTHER)] }));
    expect(r).toMatchObject({ status: 'signedIn', session: { safe: RECOVERED } });
  });

  it('several Safes owned by the words → support, nothing stored', async () => {
    const d = deps({ findSafesByOwner: async () => [RECOVERED, OTHER] });
    expect(await signInWithWords(JUNK, d)).toEqual({ status: 'error', message: WORDS_SEVERAL_ACCOUNTS_MESSAGE });
    expect(await d.phrase.has()).toBe(false);
    expect(d.dump()).toEqual({});
  });

  it('E5: recovery words of an account route to the words recovery; no empty account is opened', async () => {
    const d = deps({ findWalletsByWords: async () => [wallet(OTHER)] });
    expect(await signInWithWords(JUNK, d)).toEqual({ status: 'recoveryWords', message: WORDS_ARE_RECOVERY_WORDS_MESSAGE, route: WORDS_RECOVERY_ROUTE });
    expect(await d.phrase.has()).toBe(false);
    expect(d.dump()).toEqual({});
  });

  it('a typo is explained and nothing is stored', async () => {
    const d = deps();
    expect(await signInWithWords('abandon '.repeat(11) + 'abuot', d)).toEqual({ status: 'error', message: 'Dieses Wort kennen wir nicht: abuot' });
    expect(await d.phrase.has()).toBe(false);
    expect(d.findSafesByOwner).not.toHaveBeenCalled();
  });

  it('a failed lookup is an error, not the predicted Safe', async () => {
    const d = deps({ findSafesByOwner: async () => { throw new Error('rpc'); } });
    const r = await signInWithWords(JUNK, d);
    expect(r).toEqual({ status: 'error', message: 'Keine Verbindung. Bitte versuche es erneut.' });
    expect(d.dump()).toEqual({});
  });

  it('a failed recovery-words lookup is an error too', async () => {
    const r = await signInWithWords(JUNK, deps({ findWalletsByWords: async () => { throw new Error('rpc'); } }));
    expect(r).toEqual({ status: 'error', message: 'Keine Verbindung. Bitte versuche es erneut.' });
  });

  it('E4: never replaces the unconfirmed words of another account; says so before any lookup', async () => {
    const d = deps();
    await d.phrase.write(LEGAL); // a fresh account whose words were never confirmed
    const r = await signInWithWords(JUNK, d);
    expect(r).toEqual({ status: 'error', message: PHRASE_OVERWRITE_MESSAGE, reason: 'overwrite' });
    expect(d.findSafesByOwner).not.toHaveBeenCalled();
    expect(await d.phrase.storedOwner()).toBe(deriveWordAddresses(LEGAL, 1)[0]);
    expect(d.secure.prompts).toBe(0); // discardIfUnreadable is the caller's, on a tap only
  });

  it('replaces confirmed words of another account, and re-enters the same words after a biometric change', async () => {
    const d = deps();
    await d.phrase.write(LEGAL);
    await d.phrase.markConfirmed();
    expect(await signInWithWords(JUNK, d)).toMatchObject({ status: 'signedIn' });
    expect(await d.phrase.storedOwner()).toBe(JUNK_OWNER);
    // Biometrics changed: the protected item is gone, the marker stays → typing the words again works.
    d.secure.m.delete(WORDS_PHRASE_KEY);
    expect(await signInWithWords(JUNK, d)).toMatchObject({ status: 'signedIn', session: { owner: JUNK_OWNER } });
    expect(await d.phrase.read('x')).toBe(JUNK);
  });

  it('a cancelled write prompt is "cancelled": no record, no session (the screen keeps the typed words)', async () => {
    const d = deps();
    d.secure.failNextProtectedSet = true;
    expect(await signInWithWords(JUNK, d)).toEqual({ status: 'cancelled' });
    expect(d.dump()).toEqual({});
  });

  it('refused on a phone without biometrics', async () => {
    const d = deps({ canProtect: false });
    expect(await signInWithWords(JUNK, d)).toEqual({ status: 'error', message: NO_BIOMETRICS_MESSAGE });
    expect(d.findSafesByOwner).not.toHaveBeenCalled();
  });
});

describe('openStoredWordsAccount', () => {
  it('one device unlock, then the account the stored words own; not marked confirmed, not re-stored', async () => {
    const d = deps({ findSafesByOwner: async () => [RECOVERED] });
    await d.phrase.write(JUNK);
    const writes = jest.spyOn(d.phrase, 'write');
    const r = await openStoredWordsAccount(d);
    expect(r).toMatchObject({ status: 'signedIn', session: { safe: RECOVERED, owner: JUNK_OWNER, ownerType: 'ecdsa' } });
    expect(r).not.toHaveProperty('phrase');
    expect(d.secure.prompts).toBe(1);
    expect(writes).not.toHaveBeenCalled();
    expect(await d.phrase.isConfirmed()).toBe(false);
  });

  it('never-used stored words open the account they derive', async () => {
    const d = deps();
    await d.phrase.write(JUNK);
    expect(await openStoredWordsAccount(d)).toMatchObject({ status: 'signedIn', session: { safe: predictEcdsaSafeAddress(JUNK_OWNER) } });
  });

  it('nothing stored → no prompt; with an active words session that means re-entry, not "no account"', async () => {
    const d = deps();
    expect(await openStoredWordsAccount(d)).toEqual({ status: 'error', message: WORDS_NOT_STORED_MESSAGE });
    await d.sessionStorage.setItem(
      PASSKEY_SESSION_KEY,
      JSON.stringify({ credentialId: '', x: WORDS_KEY_PLACEHOLDER, y: WORDS_KEY_PLACEHOLDER, safe: RECOVERED, identity: RECOVERED, ownerType: 'ecdsa', owner: JUNK_OWNER }),
    );
    expect(await openStoredWordsAccount(d)).toEqual({ status: 'error', message: WORDS_UNREADABLE_MESSAGE });
    expect(d.secure.prompts).toBe(0);
  });

  it('invalidated words (biometrics changed) ask to type them again; a cancelled unlock is "cancelled"', async () => {
    const d = deps();
    await d.phrase.write(JUNK);
    d.secure.m.delete(WORDS_PHRASE_KEY);
    expect(d.secure.m.has(WORDS_PHRASE_MARKER_KEY)).toBe(true);
    expect(await openStoredWordsAccount(d)).toEqual({ status: 'error', message: WORDS_UNREADABLE_MESSAGE });
    await d.phrase.write(JUNK);
    d.secure.readThrows = 'User canceled the authentication';
    expect(await openStoredWordsAccount(d)).toEqual({ status: 'cancelled' });
    expect(d.findSafesByOwner).not.toHaveBeenCalled();
  });

  it('a failed lookup is an error here too', async () => {
    const d = deps({ findSafesByOwner: async () => { throw new Error('rpc'); } });
    await d.phrase.write(JUNK);
    expect(await openStoredWordsAccount(d)).toEqual({ status: 'error', message: 'Keine Verbindung. Bitte versuche es erneut.' });
    expect(await loadPasskeySession(d.sessionStorage)).toBeNull();
  });
});
