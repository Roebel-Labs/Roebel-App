/**
 * "Konto wiederherstellen" on a new phone — the state machine (no UI, every side effect injected).
 *
 *   idle → creatingPasskey → waitingForGuardians → executing → waitingDelay → finalizing → done
 *                                                                          ↘ cancelled | error
 *
 * 1. creatingPasskey: a NEW passkey on this phone; its per-key Safe owner is
 *    signer = SafeWebAuthnSignerFactory.getSigner(x, y). The phone shows
 *    roebel://passkey/recover?wallet&signer&name to the guardians.
 * 2. waitingForGuardians: guardians confirm ON-CHAIN (confirmRecovery(wallet, [signer], 1)); we
 *    poll getRecoveryApprovals until it reaches the wallet's threshold.
 * 3. executing: one sponsored op from this phone's fresh passkey Safe (deploys it):
 *    [createSigner(x, y), executeRecovery(wallet, [signer], 1)] — sponsor mode "recovery".
 * 4. waitingDelay: the SRM holds the request for 3 days; the owner may cancel. A request that
 *    disappears means cancelled — unless the wallet's owners already are [signer] (anyone may
 *    call the public finalizeRecovery), which means done.
 * 5. finalizing: [finalizeRecovery(wallet)], then `saveRecoveredRecord` (ownerType webauthnSigner)
 *    so the app operates the recovered Safe.
 *
 * The state is persisted (SecureStore) after every transition, so closing the app is safe; a
 * cancelled passkey sheet leaves nothing behind.
 *
 * With the recovery words (`startWordsRecovery`, method 'words') steps 2 and 3 collapse: the words
 * ARE guardians, so they sign the approvals on this phone and ONE op
 * [createSigner(x, y), multiConfirmRecovery(wallet, [signer], 1, approvals, execute = true)] starts
 * the same 3-day delay. The words never give instant control; the owner can cancel, which moves
 * the module nonce and kills every approval signed before. The phrase is never persisted.
 *
 * An EXPERT account (`ownerKind: 'ecdsa'`: the wallet's single owner is the key of 12 words) is
 * recovered to a NEW phrase instead of a passkey: `startRecovery` generates the words and stores
 * them behind the device unlock (words-account `generateAndStorePhrase`, preflight E4 applies),
 * signer = their address 0, and this phone's fresh EXPERT Safe (`predictEcdsaSafeAddress(signer)`)
 * sends the ops, signed by the new words (one device unlock per op): [executeRecovery(wallet,
 * [signer], 1)] (no createSigner: the owner is a plain key) and later [finalizeRecovery(wallet)].
 * `done` saves a words record AND session for the OLD wallet address. The new words are returned
 * ONCE by `startRecovery` (never persisted in the state); the screen shows and confirms them
 * before the guardians see the code. Keys wrapped under the OLD words (voting key, Nostr key,
 * salt) cannot be opened with the new ones: accepted (plan 3, open question 4).
 */
import { getAddress, isAddressEqual, type Address, type Hex } from 'viem';
import {
  encodeCreateSigner,
  encodeExecuteRecovery,
  encodeFinalizeRecovery,
  encodeMultiConfirmRecovery,
  type RecoveryRequest,
} from './guardians';
import { predictEcdsaSafeAddress } from './ecdsa-safe';
import { saveRecoveredRecord, type KeyValueStorage } from './migration';
import {
  NO_BIOMETRICS_MESSAGE,
  PHRASE_OVERWRITE_MESSAGE,
  PHRASE_PROMPT,
  PhraseOverwriteError,
  type PhraseStore,
} from './phrase-store';
import { predictSafeAddress } from './safe-address';
import { savePasskeySession, WORDS_KEY_PLACEHOLDER, type SessionStorage } from './session';
import { ecdsaOpSigner, passkeyOpSigner, type SafeOpSigner, type SafeUserOpArgs } from './userop';
import type { PasskeyAssertion, PasskeyCredential } from './webauthn';
import { generateAndStorePhrase } from './words-account';
import { phraseErrorMessage, validatePhrase, wordsFromSeed, type WordsKit } from './words';
import { NO_WORDS_ACCOUNT_MESSAGE, signWordApprovalsWithKit, wordGuardiansOf } from './words-recovery';

export const RECOVERY_STORE_KEY = 'passkey_recovery_v1';

export type RecoveryStep =
  | 'idle'
  | 'creatingPasskey'
  | 'waitingForGuardians'
  | 'executing'
  | 'waitingDelay'
  | 'finalizing'
  | 'done'
  | 'cancelled'
  | 'error';

export type RecoveryState = {
  step: RecoveryStep;
  /** The passkey Safe being recovered (its address survives the recovery). */
  wallet: Address;
  /** Sponsor hint: the legacy account the wallet administers (when the wallet holds no NFT). */
  recoveryLegacy: Address | null;
  /** Display name of the person (from the profile search) — display only. */
  name: string;
  credentialId?: string;
  x?: Hex;
  y?: Hex;
  /** This phone's fresh passkey Safe (sender of the recovery ops). */
  newSafe?: Address;
  /** The new owner the recovery installs: getSigner(x, y). */
  signer?: Address;
  /** Unix seconds when finalizeRecovery becomes possible. */
  executeAfter?: number;
  approvals?: number;
  threshold?: number;
  /** German, user-facing. */
  message?: string;
  /** Technical detail for logs only. */
  detail?: string;
  /** How the recovery is confirmed (absent = 'guardians', the flow before the words existed). */
  method?: 'guardians' | 'words';
  /** Words recovery: the 5 public pool addresses (never the words), saved again after `done`. */
  wordsPool?: Address[];
  /**
   * What the recovery installs as the wallet's owner: a new passkey (absent = 'passkey'), or for
   * an expert account a new 12-word key ('ecdsa'; `signer` = its address 0, no credential).
   */
  ownerKind?: 'passkey' | 'ecdsa';
};

/** `startRecovery`'s result: `phrase` = the new 12 words of an expert recovery, returned ONCE. */
export type RecoveryStart = { state: RecoveryState; phrase?: string };

export type RecoveryStorage = KeyValueStorage & { removeItem?: (key: string) => Promise<void> };

export type RecoveryDeps = {
  storage: RecoveryStorage;
  createPasskey: (userName: string) => Promise<PasskeyCredential>;
  getSigner: (x: Hex, y: Hex) => Promise<Address>;
  readThreshold: (wallet: Address) => Promise<bigint>;
  readApprovals: (wallet: Address, newOwners: Address[], threshold: number) => Promise<bigint>;
  readRequest: (wallet: Address) => Promise<RecoveryRequest>;
  readOwners: (wallet: Address) => Promise<Address[]>;
  isSafeDeployed: (safe: Address) => Promise<boolean>;
  /** One sponsored op; `args.signer` is the passkey or the new words (userop `sendSafeUserOp`). */
  sendUserOp: (args: SafeUserOpArgs) => Promise<{ userOpHash: Hex; txHash: Hex }>;
  /** The passkey assertion the passkey op signer uses (webauthn `signWithPasskey`). */
  signPasskey: (credentialId: string, challenge: Hex) => Promise<PasskeyAssertion>;
  /** Expert recovery: the protected store the new words go to (and are read from to sign). */
  phrase: PhraseStore;
  /** Expert recovery: entropy for the new words (default the platform's secure random). */
  random?: (n: number) => Uint8Array;
  /** Expert recovery: `done` saves the words session here (the passkey path signs in afterwards). */
  sessionStorage: Pick<SessionStorage, 'setItem'>;
  /** Unix seconds. */
  now?: () => number;
  /**
   * A words recovery reached `done` (words-recovery `markWordsRecoveryDone`: words pool + the
   * pending key-restore marker that outlives this state). Best effort.
   */
  wordsDone?: (s: RecoveryState) => Promise<void>;
};

const nowSec = (deps: RecoveryDeps) => (deps.now ? deps.now() : Math.floor(Date.now() / 1000));
const errName = (e: unknown) => (e as { name?: string } | null)?.name;
/** The person dismissed the fingerprint sheet or the device unlock. */
const isCancelled = (e: unknown) => errName(e) === 'PasskeyCancelledError' || errName(e) === 'PhraseCancelledError';
const isEcdsa = (s: Pick<RecoveryState, 'ownerKind'>) => s.ownerKind === 'ecdsa';
/** The state holds the new owner's key material (a passkey, or for an expert recovery its signer). */
const hasRecoveryKey = (s: RecoveryState) => (isEcdsa(s) ? !!s.signer && !!s.newSafe : !!s.credentialId && !!s.x && !!s.y);
const detailOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** A failed op's message: the new words became unreadable (biometrics changed), or a generic retry. */
const opFailedMessage = (e: unknown) =>
  errName(e) === 'PhraseUnavailableError'
    ? 'Dein Handy hat die neuen Wörter gesperrt, weil sich Fingerabdruck oder Gesicht geändert haben. Bitte wende dich an den Support.'
    : 'Das hat nicht geklappt. Bitte versuche es erneut.';
const ownsOnly = (owners: readonly Address[], signer: Address) => owners.length === 1 && isAddressEqual(owners[0], signer);

export async function loadRecoveryState(storage: RecoveryStorage): Promise<RecoveryState | null> {
  const raw = await storage.getItem(RECOVERY_STORE_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as RecoveryState;
    if (!s?.step || !s.wallet) return null;
    return s;
  } catch {
    return null;
  }
}

export async function saveRecoveryState(storage: RecoveryStorage, s: RecoveryState): Promise<void> {
  await storage.setItem(RECOVERY_STORE_KEY, JSON.stringify(s));
}

export async function clearRecoveryState(storage: RecoveryStorage): Promise<void> {
  if (storage.removeItem) await storage.removeItem(RECOVERY_STORE_KEY);
  else await storage.setItem(RECOVERY_STORE_KEY, '');
}

async function persist(deps: RecoveryDeps, s: RecoveryState): Promise<RecoveryState> {
  await saveRecoveryState(deps.storage, s);
  return s;
}

/**
 * A recovering person's ops always come from this phone's fresh Safe, never the wallet: the
 * passkey Safe (SharedSigner), or for an expert recovery the new words' expert Safe (one device
 * unlock per op; a phrase whose address 0 is not `signer` is refused by the session signer).
 */
function opBase(s: RecoveryState, deps: RecoveryDeps): Pick<SafeUserOpArgs, 'signer' | 'recoveryLegacy'> {
  let signer: SafeOpSigner;
  if (isEcdsa(s)) {
    if (!s.signer || !s.newSafe) throw new Error('recovery state has no words owner');
    const owner = s.signer;
    // Not the session signer: this phone has no words session yet, so a lost phrase must not
    // trigger the app-wide "enter your words again" route (phrase-events); the step says it here.
    signer = ecdsaOpSigner(owner, async (digest) => {
      const account = wordsFromSeed(await deps.phrase.read(PHRASE_PROMPT)).account(0);
      if (!isAddressEqual(account.address, owner)) throw new Error('the 12 words on this device are not this recovery\'s');
      return account.sign({ hash: digest });
    });
  } else {
    if (!s.credentialId || !s.x || !s.y) throw new Error('recovery state has no passkey');
    signer = passkeyOpSigner({ credentialId: s.credentialId, x: s.x, y: s.y }, deps.signPasskey);
  }
  return { signer, ...(s.recoveryLegacy ? { recoveryLegacy: s.recoveryLegacy } : {}) };
}

/**
 * Step 1. Creates the passkey + resolves its signer. A cancelled sheet returns `idle` and
 * persists nothing; an unsupported device returns `error` (not persisted either).
 */
type KeyStep = { ok: true; state: RecoveryState } | { ok: false; state: RecoveryState };

/** Creates the passkey of `base` (cancel → idle, unsupported → error; neither persisted). */
async function createRecoveryKey(base: RecoveryState, deps: RecoveryDeps): Promise<KeyStep> {
  let cred: PasskeyCredential;
  try {
    cred = await deps.createPasskey(base.name);
  } catch (e) {
    if (errName(e) === 'PasskeyCancelledError') {
      return { ok: false, state: { ...base, step: 'idle', message: 'Abgebrochen. Du kannst es jederzeit erneut versuchen.' } };
    }
    if (errName(e) === 'PasskeyNotSupportedError') {
      return { ok: false, state: { ...base, step: 'error', message: 'Dieses Gerät unterstützt keine Passkeys.', detail: detailOf(e) } };
    }
    return { ok: false, state: { ...base, step: 'error', message: 'Der Fingerabdruck konnte nicht eingerichtet werden.', detail: detailOf(e) } };
  }
  return {
    ok: true,
    state: { ...base, credentialId: cred.credentialId, x: cred.x, y: cred.y, newSafe: predictSafeAddress({ x: cred.x, y: cred.y }) },
  };
}

/** Resolves the signer of a state that has its passkey; a failure is persisted (the passkey is reused on retry). */
async function resolveSigner(s: RecoveryState, deps: RecoveryDeps): Promise<KeyStep> {
  if (s.signer) return { ok: true, state: s };
  try {
    return { ok: true, state: { ...s, signer: await deps.getSigner(s.x!, s.y!) } };
  } catch (e) {
    return { ok: false, state: await persist(deps, { ...s, step: 'error', message: 'Keine Verbindung. Bitte versuche es erneut.', detail: detailOf(e) }) };
  }
}

/**
 * Step 1. Creates the passkey + resolves its signer. A cancelled sheet returns `idle` and
 * persists nothing; an unsupported device returns `error` (not persisted either).
 *
 * `ownerKind: 'ecdsa'` (an expert account): new 12 words instead of a passkey, stored behind the
 * device unlock; returned once as `phrase`. Missing biometrics, the unconfirmed words of another
 * account on this phone (E4), a dismissed unlock or a failed write persist nothing.
 */
export async function startRecovery(
  args: { wallet: Address; name: string; recoveryLegacy?: Address | null; ownerKind?: 'passkey' | 'ecdsa' },
  deps: RecoveryDeps,
): Promise<RecoveryStart> {
  const base: RecoveryState = {
    step: 'creatingPasskey',
    wallet: getAddress(args.wallet),
    recoveryLegacy: args.recoveryLegacy ? getAddress(args.recoveryLegacy) : null,
    name: args.name,
  };
  if (args.ownerKind === 'ecdsa') return startExpertRecovery({ ...base, ownerKind: 'ecdsa' }, deps);
  const key = await createRecoveryKey(base, deps);
  if (!key.ok) return { state: key.state };
  const signed = await resolveSigner(key.state, deps);
  if (!signed.ok) return { state: signed.state };
  return { state: await persist(deps, { ...signed.state, step: 'waitingForGuardians' }) };
}

async function startExpertRecovery(base: RecoveryState, deps: RecoveryDeps): Promise<RecoveryStart> {
  const failed = (message: string, step: RecoveryStep = 'idle', e?: unknown): RecoveryStart => ({
    state: { ...base, step, message, ...(e !== undefined ? { detail: detailOf(e) } : {}) },
  });
  let created: { phrase: string; owner: Address };
  try {
    if (!(await deps.phrase.canProtect())) return failed(NO_BIOMETRICS_MESSAGE, 'error');
    created = await generateAndStorePhrase(deps.phrase, deps.random);
  } catch (e) {
    if (e instanceof PhraseOverwriteError) return failed(PHRASE_OVERWRITE_MESSAGE);
    if (e instanceof Error && e.message === NO_BIOMETRICS_MESSAGE) return failed(NO_BIOMETRICS_MESSAGE, 'error');
    // A mid-write failure may leave the NEW words' marker without words: drop it (as words-account).
    await deps.phrase.remove().catch(() => undefined);
    if (isCancelled(e) || /cancel/i.test(detailOf(e))) return failed('Abgebrochen. Du kannst es jederzeit erneut versuchen.');
    return failed('Die Wörter konnten nicht sicher gespeichert werden. Bitte versuche es erneut.', 'error', e);
  }
  const signer = getAddress(created.owner);
  const state = await persist(deps, {
    ...base,
    step: 'waitingForGuardians',
    signer,
    newSafe: predictEcdsaSafeAddress(signer),
  });
  return { state, phrase: created.phrase };
}

/**
 * Where an expert recovery's new words stand on this phone: 'confirmed' (the guardians may see
 * the code), 'unconfirmed' (show and confirm them first; the app may have been closed in between),
 * 'missing' (the stored words are not this recovery's: it cannot finish on this phone).
 * A passkey recovery is always 'confirmed'.
 */
export async function recoveryWordsStatus(
  s: RecoveryState,
  phrase: Pick<PhraseStore, 'storedOwner' | 'isConfirmed'>,
): Promise<'confirmed' | 'unconfirmed' | 'missing'> {
  if (!isEcdsa(s)) return 'confirmed';
  const stored = await phrase.storedOwner();
  if (!stored || !s.signer || !isAddressEqual(stored, s.signer)) return 'missing';
  return (await phrase.isConfirmed()) ? 'confirmed' : 'unconfirmed';
}

/**
 * "Abbrechen und neu beginnen": clears the state. The new words of an expert recovery that were
 * never confirmed are removed too: the guardians never saw their address (the code appears only
 * after the confirmation), so they own nothing, and leaving them would block the next attempt
 * (E4). Confirmed words stay (a guardian may already have approved them).
 */
export async function abandonRecovery(s: RecoveryState | null, deps: Pick<RecoveryDeps, 'storage' | 'phrase'>): Promise<void> {
  if (s && (await recoveryWordsStatus(s, deps.phrase).catch(() => 'missing')) === 'unconfirmed') {
    await deps.phrase.remove().catch(() => undefined);
  }
  await clearRecoveryState(deps.storage);
}

/** An owner without contract code, or with an EIP-7702 designator, is a plain key: an expert account (E9). */
export function ownerKindForCode(code: Hex | null | undefined): 'passkey' | 'ecdsa' {
  if (!code || code === '0x') return 'ecdsa';
  return /^0xef0100[0-9a-fA-F]{40}$/.test(code) ? 'ecdsa' : 'passkey';
}

export type WordsRecoveryDeps = RecoveryDeps & {
  readGuardians: (wallet: Address) => Promise<Address[]>;
  readNonce: (wallet: Address) => Promise<bigint>;
  /**
   * Stores the words vault key on this phone in the recovered WALLET's own slot (never the global
   * one: another account's vault key on this phone stays untouched); the `_w` key copies are
   * restored with it after `done`.
   */
  saveVaultKey: (key: Hex, wallet: Address) => Promise<void>;
};

/**
 * Recovery with the 12 words: checks the words BEFORE any passkey exists (typo → idle with the
 * German reason; words that are not, or no longer, enough guardians → idle with
 * NO_WORDS_ACCOUNT_MESSAGE), then new passkey → signer → the words sign the approvals at the
 * current module nonce → vault key saved → ONE op from the fresh Safe → `waitingDelay`.
 *
 * A passkey made by an earlier attempt that did not start the delay (persisted idle / error
 * words state for the same wallet) is reused, so retrying never piles up passkeys. `kit` lets a
 * caller that already ran the seed (the screen's lookup) skip a second run. The phrase and the
 * kit are dropped when this returns; only public addresses and the passkey are persisted.
 */
export async function startWordsRecovery(
  args: { wallet: Address; name: string; phrase: string; recoveryLegacy?: Address | null; kit?: WordsKit },
  deps: WordsRecoveryDeps,
): Promise<RecoveryState> {
  const wallet = getAddress(args.wallet);
  const base: RecoveryState = {
    step: 'creatingPasskey',
    wallet,
    recoveryLegacy: args.recoveryLegacy ? getAddress(args.recoveryLegacy) : null,
    name: args.name,
    method: 'words',
  };
  const check = validatePhrase(args.phrase);
  if (!check.ok) return { ...base, step: 'idle', message: phraseErrorMessage(check) };
  const kit = args.kit ?? wordsFromSeed(check.phrase);
  const pool = kit.addresses();

  let guardians: Address[];
  let threshold: bigint;
  try {
    [guardians, threshold] = await Promise.all([deps.readGuardians(wallet), deps.readThreshold(wallet)]);
  } catch (e) {
    return { ...base, step: 'idle', message: 'Keine Verbindung. Bitte versuche es erneut.', detail: detailOf(e) };
  }
  if (threshold <= 0n || BigInt(wordGuardiansOf(pool, guardians).length) < threshold) {
    return { ...base, step: 'idle', message: NO_WORDS_ACCOUNT_MESSAGE };
  }

  const prev = await loadRecoveryState(deps.storage).catch(() => null);
  const reusable =
    prev?.method === 'words' &&
    isAddressEqual(prev.wallet, wallet) &&
    !prev.executeAfter &&
    (prev.step === 'idle' || prev.step === 'error') &&
    !!prev.credentialId && !!prev.x && !!prev.y;
  let s: RecoveryState;
  if (reusable) {
    s = { ...base, credentialId: prev.credentialId, x: prev.x, y: prev.y, newSafe: prev.newSafe, signer: prev.signer };
  } else {
    const key = await createRecoveryKey(base, deps);
    if (!key.ok) return key.state;
    s = key.state;
  }
  s = { ...s, wordsPool: pool };
  const signed = await resolveSigner(s, deps);
  if (!signed.ok) return signed.state;
  s = signed.state;
  const signer = s.signer!;

  let calls;
  try {
    const nonce = await deps.readNonce(wallet);
    const approvals = await signWordApprovalsWithKit(kit, { wallet, newOwner: signer, nonce, guardians, threshold: Number(threshold) });
    calls = [encodeCreateSigner(s.x!, s.y!), encodeMultiConfirmRecovery(wallet, [signer], 1, approvals, true)];
  } catch (e) {
    return persist(deps, { ...s, step: 'error', message: 'Keine Verbindung. Bitte versuche es erneut.', detail: detailOf(e) });
  }
  try {
    await deps.saveVaultKey(kit.vaultKey(), wallet);
  } catch (e) {
    return persist(deps, { ...s, step: 'error', message: 'Auf diesem Handy konnte nichts gespeichert werden. Bitte versuche es erneut.', detail: detailOf(e) });
  }
  // Persist the passkey before the op: a crash during the op must not lose it.
  s = await persist(deps, { ...s, step: 'idle', message: undefined, detail: undefined });

  try {
    const deployed = await deps.isSafeDeployed(s.newSafe!).catch(() => false);
    await deps.sendUserOp({ ...opBase(s, deps), calls, deployed });
  } catch (e) {
    const req = await deps.readRequest(wallet).catch(() => null);
    if (req && req.executeAfter > 0n && ownsOnly(req.newOwners, signer)) {
      return persist(deps, { ...s, step: 'waitingDelay', executeAfter: Number(req.executeAfter) });
    }
    if (errName(e) === 'PasskeyCancelledError') {
      return { ...s, step: 'idle', message: 'Abgebrochen. Gib die Wörter erneut ein, wenn du bereit bist.' };
    }
    return persist(deps, { ...s, step: 'error', message: 'Das hat nicht geklappt. Bitte versuche es erneut.', detail: detailOf(e) });
  }
  const req = await deps.readRequest(wallet).catch(() => null);
  const executeAfter = req && req.executeAfter > 0n ? Number(req.executeAfter) : undefined;
  return persist(deps, { ...s, step: 'waitingDelay', executeAfter });
}

/** Retries a persisted `error` state from the right step (the signer may still be missing). */
export async function resumeRecovery(s: RecoveryState, deps: RecoveryDeps): Promise<RecoveryState> {
  if (s.step !== 'error') return s;
  if (!hasRecoveryKey(s)) return { ...s, step: 'idle' };
  // Words: the phrase is gone; until the delay started, the words are asked again (the passkey stays).
  if (s.method === 'words' && !s.executeAfter) {
    return persist(deps, { ...s, step: 'idle', message: 'Gib die 12 Wörter bitte noch einmal ein.', detail: undefined });
  }
  if (!s.signer) {
    try {
      const signer = await deps.getSigner(s.x!, s.y!);
      return persist(deps, { ...s, signer, step: 'waitingForGuardians', message: undefined, detail: undefined });
    } catch (e) {
      return { ...s, message: 'Keine Verbindung. Bitte versuche es erneut.', detail: detailOf(e) };
    }
  }
  const back: RecoveryStep = s.executeAfter ? 'waitingDelay' : 'waitingForGuardians';
  return persist(deps, { ...s, step: back, message: undefined, detail: undefined });
}

/**
 * One poll tick (call every few seconds while the screen is open, and on resume). Reads chain
 * state and moves on when something happened. Never submits an op itself — the screen calls
 * `executeRecoveryStep` / `finalizeRecoveryStep` when the returned step says so.
 */
export async function pollRecovery(s: RecoveryState, deps: RecoveryDeps): Promise<RecoveryState> {
  if (!s.signer) return s;
  const signer = s.signer;
  try {
    if (s.step === 'waitingForGuardians') {
      const req = await deps.readRequest(s.wallet);
      if (req.executeAfter > 0n) {
        if (ownsOnly(req.newOwners, signer)) {
          return persist(deps, { ...s, step: 'waitingDelay', executeAfter: Number(req.executeAfter) });
        }
        return {
          ...s,
          message: 'Für dieses Konto läuft gerade eine andere Wiederherstellung. Bitte warte, bis sie vorbei ist.',
        };
      }
      const [approvals, threshold] = await Promise.all([
        deps.readApprovals(s.wallet, [signer], 1),
        deps.readThreshold(s.wallet),
      ]);
      const next: RecoveryState = { ...s, approvals: Number(approvals), threshold: Number(threshold), message: undefined };
      if (threshold > 0n && approvals >= threshold) return persist(deps, { ...next, step: 'executing' });
      if (next.approvals !== s.approvals || next.threshold !== s.threshold) return persist(deps, next);
      return next;
    }
    if (s.step === 'waitingDelay' || s.step === 'finalizing') {
      const req = await deps.readRequest(s.wallet);
      if (req.executeAfter === 0n || !ownsOnly(req.newOwners, signer)) {
        const owners = await deps.readOwners(s.wallet);
        if (ownsOnly(owners, signer)) return completeRecovery(s, deps);
        return persist(deps, {
          ...s,
          step: 'cancelled',
          message: 'Die Wiederherstellung wurde abgebrochen. Wenn du das nicht warst, sprich mit deinen Vertrauenspersonen.',
        });
      }
      const executeAfter = Number(req.executeAfter);
      if (s.step === 'waitingDelay' && nowSec(deps) >= executeAfter) {
        return persist(deps, { ...s, executeAfter, step: 'finalizing' });
      }
      return executeAfter !== s.executeAfter ? persist(deps, { ...s, executeAfter }) : s;
    }
  } catch (e) {
    // A read failure is transient: stay where we are, surface a soft message.
    return { ...s, message: 'Keine Verbindung. Wir versuchen es gleich noch einmal.', detail: detailOf(e) };
  }
  return s;
}

/** Step 3: the fingerprint-signed executeRecovery op (starts the 3-day delay). */
export async function executeRecoveryStep(s: RecoveryState, deps: RecoveryDeps): Promise<RecoveryState> {
  if (s.step !== 'executing' || !s.signer || !s.newSafe || !hasRecoveryKey(s)) return s;
  try {
    const deployed = await deps.isSafeDeployed(s.newSafe);
    const execute = encodeExecuteRecovery(s.wallet, [s.signer], 1);
    // An expert owner is a plain key: nothing to create, the op is the one SRM call.
    const calls = isEcdsa(s) ? [execute] : [encodeCreateSigner(s.x!, s.y!), execute];
    await deps.sendUserOp({ ...opBase(s, deps), calls, deployed });
  } catch (e) {
    if (isCancelled(e)) {
      return { ...s, message: 'Abgebrochen. Tippe erneut, wenn du bereit bist.' };
    }
    // Maybe it landed anyway (receipt timeout) — the next poll of waitingDelay will tell.
    const req = await deps.readRequest(s.wallet).catch(() => null);
    if (req && req.executeAfter > 0n && ownsOnly(req.newOwners, s.signer)) {
      return persist(deps, { ...s, step: 'waitingDelay', executeAfter: Number(req.executeAfter), message: undefined });
    }
    return { ...s, message: opFailedMessage(e), detail: detailOf(e) };
  }
  const req = await deps.readRequest(s.wallet).catch(() => null);
  const executeAfter = req && req.executeAfter > 0n ? Number(req.executeAfter) : undefined;
  return persist(deps, { ...s, step: 'waitingDelay', executeAfter, message: undefined, detail: undefined });
}

/** Step 5: finalizeRecovery once the delay is over, then the device operates the recovered Safe. */
export async function finalizeRecoveryStep(s: RecoveryState, deps: RecoveryDeps): Promise<RecoveryState> {
  if (s.step !== 'finalizing' || !s.signer) return s;
  if (s.executeAfter && nowSec(deps) < s.executeAfter) return persist(deps, { ...s, step: 'waitingDelay' });
  try {
    await deps.sendUserOp({ ...opBase(s, deps), calls: [encodeFinalizeRecovery(s.wallet)], deployed: true });
  } catch (e) {
    if (isCancelled(e)) return { ...s, message: 'Abgebrochen. Tippe erneut, wenn du bereit bist.' };
    const owners = await deps.readOwners(s.wallet).catch(() => [] as Address[]);
    if (ownsOnly(owners, s.signer)) return completeRecovery(s, deps);
    return { ...s, message: opFailedMessage(e), detail: detailOf(e) };
  }
  return completeRecovery(s, deps);
}

async function completeRecovery(s: RecoveryState, deps: RecoveryDeps): Promise<RecoveryState> {
  if (!s.signer || !hasRecoveryKey(s)) return s;
  if (isEcdsa(s)) {
    // The OLD wallet address stays the account; the new words own it. No legacy account: identity = wallet.
    const key = { credentialId: '', x: WORDS_KEY_PLACEHOLDER, y: WORDS_KEY_PLACEHOLDER, safe: s.wallet, owner: s.signer };
    await saveRecoveredRecord(deps.storage, { ...key, ownerType: 'ecdsa' });
    await savePasskeySession(deps.sessionStorage, { ...key, identity: s.wallet, ownerType: 'ecdsa' });
    return persist(deps, { ...s, step: 'done', message: undefined, detail: undefined });
  }
  await saveRecoveredRecord(deps.storage, {
    credentialId: s.credentialId!,
    x: s.x!,
    y: s.y!,
    safe: s.wallet,
    owner: s.signer,
    ...(s.recoveryLegacy ? { legacy: s.recoveryLegacy } : {}),
  });
  if (s.method === 'words' && deps.wordsDone) await deps.wordsDone(s).catch(() => undefined);
  return persist(deps, { ...s, step: 'done', message: undefined, detail: undefined });
}

/** "Noch 2 Tage, 14 Stunden" (minutes only in the last hour). */
export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s === 0) return 'Gleich geschafft';
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.ceil((s % 3600) / 60);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (days > 0) return `Noch ${plural(days, 'Tag', 'Tage')}, ${plural(hours, 'Stunde', 'Stunden')}`;
  if (hours > 0) return `Noch ${plural(hours, 'Stunde', 'Stunden')}`;
  return `Noch ${plural(minutes, 'Minute', 'Minuten')}`;
}

/** The pending request is someone ELSE's recovery of my Safe (the owner must be warned). */
export function isForeignRecoveryPending(req: RecoveryRequest | null, myOwner: Address): boolean {
  if (!req || req.executeAfter === 0n) return false;
  return !req.newOwners.some((o) => isAddressEqual(o, myOwner));
}
