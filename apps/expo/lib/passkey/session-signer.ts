/**
 * One signer per session, whoever owns the Safe:
 *
 *   - passkey (`sharedSigner` / `webauthnSigner`): today's behaviour — a WebAuthn assertion over the
 *     digest (`safeSignatureFromAssertion`), the vault key = the PRF output of that same assertion;
 *   - words (`ecdsa`, expert path): ONE protected phrase read (device unlock, PHRASE_PROMPT) per
 *     call, then the words' account key 0 signs the raw digest; the vault key comes from the same
 *     read. A phrase whose address 0 is not the session's owner is refused.
 *
 * `signDigest(digest)` returns the Safe's one-owner signature over `digest` exactly as Safe checks
 * it (ERC-1271: digest = safeMessageHash(safe, hash)); `opSigner` signs userOps (userop.ts).
 *
 * The phrase is never cached, logged or returned beyond the call that read it. When it is gone
 * (biometrics changed and the system invalidated it), PhraseUnavailableError is re-thrown and
 * announced on phrase-events (preflight E2) so the app asks for the words again; the session is
 * never touched (Review Focus 1: the person stays signed in).
 */
import { isAddressEqual, type Address, type Hex } from 'viem';
import { ecdsaSafeFactoryData, predictEcdsaSafeAddress } from './ecdsa-safe';
import { emitPhraseUnavailable } from './phrase-events';
import { PHRASE_PROMPT, PhraseUnavailableError, type PhraseStore } from './phrase-store';
import { predictSafeAddress, safeFactoryData } from './safe-address';
import { isWordsOwner, requirePasskeyOwner, type PasskeySession } from './session';
import { ecdsaOpSigner, normalizeEcdsaSignature, passkeyOpSigner, safeSignatureFromAssertion, type SafeOpSigner } from './userop';
import type { PasskeyAssertion } from './webauthn';
import { wordsFromSeed } from './words';

export type SessionSigner = {
  opSigner: SafeOpSigner;
  /** The Safe owner signature over `digest`, plus the vault key when the same prompt yields one. */
  signDigest: (digest: Hex) => Promise<{ safeSignature: Hex; vaultKey?: Hex }>;
  /** The key-backup vault key (passkey: PRF; words: derived from the phrase), null when none. */
  vaultKey: () => Promise<Hex | null>;
  /** The Safe this signer deploys counterfactually, and its factory call. */
  counterfactual: { factoryData: Hex; predicted: Address };
};

export type SessionSignerDeps = {
  signPasskey: (credentialId: string, challenge: Hex) => Promise<PasskeyAssertion>;
  getPrf: (credentialId: string) => Promise<Hex | null>;
  phrase: Pick<PhraseStore, 'read'>;
};

export function sessionSignerFor(session: PasskeySession, deps: SessionSignerDeps): SessionSigner {
  return isWordsOwner(session) ? wordsSigner(session, deps) : passkeySigner(session, deps);
}

function passkeySigner(session: PasskeySession, deps: SessionSignerDeps): SessionSigner {
  const { credentialId, x, y, owner } = requirePasskeyOwner(session);
  const key = { x, y };
  return {
    opSigner: passkeyOpSigner({ credentialId, x, y, owner }, deps.signPasskey),
    signDigest: async (digest) => {
      const assertion = await deps.signPasskey(credentialId, digest);
      const safeSignature = safeSignatureFromAssertion(assertion, digest, owner);
      return assertion.prf ? { safeSignature, vaultKey: assertion.prf } : { safeSignature };
    },
    vaultKey: () => deps.getPrf(credentialId),
    counterfactual: { factoryData: safeFactoryData(key), predicted: predictSafeAddress(key) },
  };
}

function wordsSigner(session: PasskeySession, deps: SessionSignerDeps): SessionSigner {
  const owner = session.owner;
  /** One device-unlock prompt; the seed runs once; the key must be the session's owner. */
  const unlock = async () => {
    let phrase: string;
    try {
      phrase = await deps.phrase.read(PHRASE_PROMPT);
    } catch (e) {
      if (e instanceof PhraseUnavailableError) emitPhraseUnavailable();
      throw e;
    }
    const kit = wordsFromSeed(phrase);
    const account = kit.account(0);
    if (!isAddressEqual(account.address, owner)) throw new Error('the 12 words on this device do not own this account');
    return { account, kit };
  };
  return {
    opSigner: ecdsaOpSigner(owner, async (digest) => (await unlock()).account.sign({ hash: digest })),
    signDigest: async (digest) => {
      const { account, kit } = await unlock();
      const safeSignature = normalizeEcdsaSignature(await account.sign({ hash: digest }));
      return { safeSignature, vaultKey: kit.vaultKey() };
    },
    vaultKey: async () => (await unlock()).kit.vaultKey(),
    counterfactual: { factoryData: ecdsaSafeFactoryData(owner), predicted: predictEcdsaSafeAddress(owner) },
  };
}
