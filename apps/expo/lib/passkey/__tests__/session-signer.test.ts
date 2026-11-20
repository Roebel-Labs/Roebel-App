jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { getAddress, hexToString, size, type Hex } from 'viem';
import { SAFE_WEBAUTHN_SHARED_SIGNER } from '../constants';
import { ecdsaSafeFactoryData, predictEcdsaSafeAddress } from '../ecdsa-safe';
import { emitPhraseUnavailable, onPhraseUnavailable, PHRASE_REENTRY_ROUTE, REENTRY_COOLDOWN_MS, routeOnPhraseUnavailable } from '../phrase-events';
import { PHRASE_MISMATCH_MESSAGE, PHRASE_PROMPT, PhraseCancelledError, PhraseMismatchError, PhraseUnavailableError } from '../phrase-store';
import { predictSafeAddress, safeFactoryData } from '../safe-address';
import { WORDS_KEY_PLACEHOLDER, type PasskeySession } from '../session';
import { sessionSignerFor } from '../session-signer';
import { safeSignatureFromAssertion } from '../userop';
import { wordsVaultKey } from '../words';
import vector from './ecdsa-safe-vector.json';
import rv from './recovery-vector.json';

const v = vector;
const JUNK = v.phrase;
const ABOUT = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const OWNER = getAddress(v.owner);
const SAFE = getAddress(v.safeAddress);

const WORDS_SESSION: PasskeySession = {
  credentialId: '',
  x: WORDS_KEY_PLACEHOLDER,
  y: WORDS_KEY_PLACEHOLDER,
  safe: SAFE,
  identity: SAFE,
  ownerType: 'ecdsa',
  owner: OWNER,
};

const never = jest.fn(async () => {
  throw new Error('the passkey must never be asked for a words session');
});

describe('session signer — words (ecdsa)', () => {
  it('ecdsa: ERC-1271 signature and userOp signature match the fork vector, one phrase read each', async () => {
    const reads = jest.fn(async (_reason: string) => JUNK);
    const signer = sessionSignerFor(WORDS_SESSION, { signPasskey: never, getPrf: never, phrase: { read: reads } });
    expect((await signer.signDigest(v.erc1271.safeMessageHash as Hex)).safeSignature).toBe(v.erc1271.signature);
    expect(await signer.opSigner.signOpHash(v.userOp.safeOpHash as Hex)).toBe(v.userOp.userOpSignature);
    expect(reads).toHaveBeenCalledTimes(2);
    expect(reads).toHaveBeenCalledWith(PHRASE_PROMPT);
    expect(never).not.toHaveBeenCalled();
  });

  it('ecdsa: the same prompt yields the vault key; the wrong phrase is refused', async () => {
    const reads = jest.fn(async () => JUNK);
    const signer = sessionSignerFor(WORDS_SESSION, { signPasskey: never, getPrf: never, phrase: { read: reads } });
    expect((await signer.signDigest(v.erc1271.safeMessageHash as Hex)).vaultKey).toBe(wordsVaultKey(JUNK));
    expect(reads).toHaveBeenCalledTimes(1);
    expect(await signer.vaultKey()).toBe(wordsVaultKey(JUNK));
    const wrong = sessionSignerFor(WORDS_SESSION, { signPasskey: never, getPrf: never, phrase: { read: async () => ABOUT } });
    await expect(wrong.signDigest(v.erc1271.safeMessageHash as Hex)).rejects.toThrow();
    await expect(wrong.opSigner.signOpHash(v.userOp.safeOpHash as Hex)).rejects.toThrow();
    await expect(wrong.vaultKey()).rejects.toThrow();
  });

  it('ecdsa: proof, counterfactual Safe and dummy follow the ECDSA owner, without reading the phrase', () => {
    const reads = jest.fn(async () => JUNK);
    const signer = sessionSignerFor(WORDS_SESSION, { signPasskey: never, getPrf: never, phrase: { read: reads } });
    expect(signer.opSigner.proof).toEqual({ ecdsaOwner: OWNER });
    expect(signer.opSigner.predicted).toBe(predictEcdsaSafeAddress(OWNER));
    expect(signer.counterfactual).toEqual({ predicted: SAFE, factoryData: ecdsaSafeFactoryData(OWNER) });
    expect(size(signer.opSigner.dummySignature)).toBe(12 + 65);
    expect(reads).not.toHaveBeenCalled();
  });

  it('fingerprints changed: PhraseUnavailableError is re-thrown AND announced once per failure (E2)', async () => {
    const seen = jest.fn();
    const off = onPhraseUnavailable(seen);
    const signer = sessionSignerFor(WORDS_SESSION, {
      signPasskey: never,
      getPrf: never,
      phrase: { read: async () => Promise.reject(new PhraseUnavailableError()) },
    });
    await expect(signer.opSigner.signOpHash(v.userOp.safeOpHash as Hex)).rejects.toBeInstanceOf(PhraseUnavailableError);
    await expect(signer.signDigest(v.erc1271.safeMessageHash as Hex)).rejects.toBeInstanceOf(PhraseUnavailableError);
    off();
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('I-3: another account\'s words on this phone: a German PhraseMismatchError, announced for re-entry, every time', async () => {
    const seen = jest.fn();
    const off = onPhraseUnavailable(seen);
    const signer = sessionSignerFor(WORDS_SESSION, { signPasskey: never, getPrf: never, phrase: { read: async () => ABOUT } });
    const err = await signer.opSigner.signOpHash(v.userOp.safeOpHash as Hex).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PhraseMismatchError);
    // Handled like a lost phrase everywhere (instanceof PhraseUnavailableError).
    expect(err).toBeInstanceOf(PhraseUnavailableError);
    expect((err as Error).message).toBe(PHRASE_MISMATCH_MESSAGE);
    expect((err as Error).name).toBe('PhraseMismatchError');
    await expect(signer.signDigest(v.erc1271.safeMessageHash as Hex)).rejects.toBeInstanceOf(PhraseMismatchError);
    await expect(signer.vaultKey()).rejects.toBeInstanceOf(PhraseMismatchError);
    off();
    expect(seen).toHaveBeenCalledTimes(3);
  });

  it('a cancelled prompt is re-thrown as is and announces nothing', async () => {
    const seen = jest.fn();
    const off = onPhraseUnavailable(seen);
    const signer = sessionSignerFor(WORDS_SESSION, {
      signPasskey: never,
      getPrf: never,
      phrase: { read: async () => Promise.reject(new PhraseCancelledError()) },
    });
    await expect(signer.signDigest(v.erc1271.safeMessageHash as Hex)).rejects.toBeInstanceOf(PhraseCancelledError);
    off();
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('session signer — passkey (unchanged behaviour)', () => {
  const g = rv.guardianApproval;
  const x = g.guardianX as Hex;
  const y = g.guardianY as Hex;
  const assertion = {
    authenticatorData: g.authenticatorData as Hex,
    clientDataJSON: hexToString(g.clientDataJSONHex as Hex),
    r: BigInt(g.r),
    s: BigInt(g.s),
    prf: `0x${'ab'.repeat(32)}` as Hex,
  };
  const session: PasskeySession = {
    credentialId: 'cred',
    x,
    y,
    safe: getAddress(g.guardianSafe),
    identity: getAddress(g.guardianSafe),
    ownerType: 'sharedSigner',
    owner: SAFE_WEBAUTHN_SHARED_SIGNER,
  };

  it('signs with the passkey, returns the PRF of the same assertion, never reads the phrase', async () => {
    const read = jest.fn(async () => JUNK);
    const signPasskey = jest.fn(async () => assertion);
    const signer = sessionSignerFor(session, { signPasskey, getPrf: async () => null, phrase: { read } });
    const r = await signer.signDigest(g.safeMessageHash as Hex);
    expect(r.safeSignature).toBe(safeSignatureFromAssertion(assertion, g.safeMessageHash as Hex, SAFE_WEBAUTHN_SHARED_SIGNER));
    expect(r.vaultKey).toBe(assertion.prf);
    expect(signPasskey).toHaveBeenCalledWith('cred', g.safeMessageHash);
    expect(read).not.toHaveBeenCalled();
  });

  it('proof, counterfactual and vault key come from the passkey', async () => {
    const getPrf = jest.fn(async (_id: string) => `0x${'cd'.repeat(32)}` as Hex);
    const signer = sessionSignerFor(session, { signPasskey: never, getPrf, phrase: { read: never } });
    expect(signer.opSigner.proof).toEqual({ x, y });
    expect(signer.counterfactual).toEqual({ predicted: predictSafeAddress({ x, y }), factoryData: safeFactoryData({ x, y }) });
    expect(await signer.vaultKey()).toBe(`0x${'cd'.repeat(32)}`);
    expect(getPrf).toHaveBeenCalledWith('cred');
  });

  it('a passkey session with an empty credential is refused', () => {
    expect(() =>
      sessionSignerFor({ ...session, credentialId: '' }, { signPasskey: never, getPrf: never, phrase: { read: never } }),
    ).toThrow('passkey record required');
  });
});

describe('re-entry routing (E2 root watcher)', () => {
  it('opens /settings/my-words?reenter=1 once per burst of failed signatures, again after the cooldown', () => {
    let t = 1_000;
    const open = jest.fn();
    const off = routeOnPhraseUnavailable(open, () => t);
    emitPhraseUnavailable();
    emitPhraseUnavailable();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(PHRASE_REENTRY_ROUTE);
    expect(PHRASE_REENTRY_ROUTE).toBe('/settings/my-words?reenter=1');
    t += REENTRY_COOLDOWN_MS;
    emitPhraseUnavailable();
    expect(open).toHaveBeenCalledTimes(2);
    off();
    t += REENTRY_COOLDOWN_MS;
    emitPhraseUnavailable();
    expect(open).toHaveBeenCalledTimes(2);
  });
});
