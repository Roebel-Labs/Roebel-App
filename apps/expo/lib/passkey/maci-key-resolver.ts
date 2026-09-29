/**
 * ONE resolver for "the MACI voting key of this identity" on a PASSKEY session. Used by
 * MaciContext ("Schlüssel erstellen" in VoteButtons) and by "Schlüssel sichern"
 * (key-completion.ts, slot `maci`).
 *
 * Why (device test 2026-09-29, Max's preview device, passkey session on legacy 0xc49d… via Safe
 * 0xe3d1…): no local key, no `maci` backup slot → the old case (d) only showed "braucht deinen
 * Schlüssel von deinem bisherigen Gerät". And the thirdweb re-derivation used by "Schlüssel
 * sichern" signed on GNOSIS, while every July registrant's key came from a BASE (8453) signature
 * (lib/maci-legacy-key.ts) → it backed up the WRONG key.
 *
 * Order:
 *   1. the key on this device, a PRF blob on this device, or the server backup
 *      (derived-keys.resolvePasskeySecret (a)/(b)); a passkey-only person without a key gets a
 *      random one ((c), unchanged)
 *   2. a migrated person without any of those: derive via the thirdweb in-app account (the
 *      dormant session restored silently, or the one "Einmal mit Google/E-Mail bestätigen" just
 *      connected; none → `needsThirdweb`). ONE Gnosis signature (today's key) + ONE Base signature
 *      (the July key, raw + ERC-6492 variants). The candidate whose pubkey has a SignUp wins.
 *      None has one: CitizenNFT token not registered at the gatekeeper → the Gnosis key (fresh
 *      signup); registered → MaciKeyLostError (support has to help).
 *   3. persist locally (with the stateIndex when found) and back it up wrapped under the passkey
 *      PRF (slot `maci`, never overwriting a different server copy).
 *
 * A key is NEVER derived from a passkey signature (randomized → a new key every time).
 *
 * Pure: every side effect is injected (maci-key-runtime.ts wires the real ones).
 */
import { isAddressEqual, type Address } from 'viem';
import type { SerializedKeypair } from '@/lib/maci';
import type { LookupResult } from '@/lib/maci-signup-lookup';
import {
  backupDeviceSecrets,
  KeyBackupNeededError,
  resolvePasskeySecret,
  type BackupReport,
  type ResolveDeps,
  type ResolveSource,
} from './derived-keys';
import type { RemoteBackup, RemoteRead } from './key-backup';

/** Same text VoteButtons shows for a token registered with a key nobody can reproduce. */
export const MACI_KEY_LOST_MESSAGE =
  'Dein Abstimmungsschlüssel von der ersten Anmeldung ist auf diesem Gerät nicht mehr vorhanden. Bitte melde dich bei uns — wir helfen dir.';
export const MACI_LOOKUP_FAILED_MESSAGE =
  'Deine Anmeldung zur Bürgerumfrage ließ sich gerade nicht prüfen. Bitte versuche es in einem Moment erneut.';
export const THIRDWEB_OTHER_ACCOUNT_MESSAGE =
  'Diese Google-/E-Mail-Anmeldung gehört zu einem anderen Konto. Bitte melde dich mit dem Konto an, mit dem du bisher die App genutzt hast.';

/** The token is registered, but neither the Gnosis nor the July (Base) key has a SignUp. */
export class MaciKeyLostError extends Error {
  constructor() {
    super(MACI_KEY_LOST_MESSAGE);
    this.name = 'MaciKeyLostError';
  }
}

export const MACI_THIRDWEB_NEEDED_MESSAGE =
  'Dein Abstimmungsschlüssel entsteht aus deiner bisherigen Google-/E-Mail-Anmeldung. Bestätige sie einmal – danach bleibst du mit deinem Passkey angemeldet.';

/** No key anywhere and no thirdweb session on this device: the UI offers ThirdwebConfirm. */
export class MaciThirdwebNeededError extends Error {
  constructor() {
    super(MACI_THIRDWEB_NEEDED_MESSAGE);
    this.name = 'MaciThirdwebNeededError';
  }
}

export type MaciKeyOrigin ='gnosis' | 'base' | 'base-6492';

/** A thirdweb account for THIS identity that can reproduce the deterministic key signatures. */
export type MaciThirdwebSource = {
  address: string;
  /** Today's key: one signature by the Gnosis smart account (lib/maci-key-derivation.ts). */
  deriveGnosis: () => Promise<SerializedKeypair>;
  /** The July keys: ONE Base admin signature → [raw ERC-1271, ERC-6492] (lib/maci-legacy-key.ts). */
  deriveLegacy: () => Promise<SerializedKeypair[]>;
};

export type MaciSignUpDeps = {
  /** SignUp stateIndex for a pubkey (lib/maci-signup-lookup.ts findSignUpStateIndex). */
  lookup: (pubX: bigint, pubY: bigint) => Promise<LookupResult>;
  /** Is the identity's CitizenNFTv2 token registered at the gatekeeper? null = no token. Throws = unknown. */
  isTokenRegistered: () => Promise<boolean | null>;
};

export type MaciKeyChoice = { keypair: SerializedKeypair; origin: MaciKeyOrigin; stateIndex?: bigint };

const samePub = (a: SerializedKeypair, b: SerializedKeypair) => a.pubX === b.pubX && a.pubY === b.pubY;

/**
 * Step 2: derive the Gnosis + July candidates (one signature each) and pick the registered one.
 * Throws MaciKeyLostError (registered, none matches) or a retryable German error (lookup failed).
 */
export async function chooseMaciKeyFromThirdweb(tw: MaciThirdwebSource, d: MaciSignUpDeps): Promise<MaciKeyChoice> {
  const gnosis = await tw.deriveGnosis();
  let legacy: SerializedKeypair[] = [];
  let legacyFailed = false;
  try {
    legacy = await tw.deriveLegacy();
  } catch {
    legacyFailed = true; // only fatal if the token turns out to be registered
  }
  const candidates: { keypair: SerializedKeypair; origin: MaciKeyOrigin }[] = [{ keypair: gnosis, origin: 'gnosis' }];
  legacy.forEach((kp, i) => {
    if (!candidates.some((c) => samePub(c.keypair, kp))) candidates.push({ keypair: kp, origin: i === 0 ? 'base' : 'base-6492' });
  });

  let lookupFailed = false;
  for (const c of candidates) {
    const r = await d.lookup(BigInt(c.keypair.pubX), BigInt(c.keypair.pubY));
    if (r.kind === 'found') return { ...c, stateIndex: r.stateIndex };
    if (r.kind === 'error') lookupFailed = true;
  }

  // No SignUp found. A token that is not registered at the gatekeeper has no SignUp at all (the
  // gatekeeper marks the token on signUp), so today's Gnosis key is right even if a lookup failed.
  let registered: boolean | null;
  try {
    registered = await d.isTokenRegistered();
  } catch {
    throw new Error(MACI_LOOKUP_FAILED_MESSAGE);
  }
  if (registered !== true) return { keypair: gnosis, origin: 'gnosis' }; // fresh signup with today's key
  // Registered: one of the keys must be it — unless we could not check them all (retry).
  if (lookupFailed || legacyFailed) throw new Error(MACI_LOOKUP_FAILED_MESSAGE);
  throw new MaciKeyLostError();
}

export type MaciResolverDeps = Pick<ResolveDeps, 'storage' | 'getPrf' | 'wrap' | 'unwrap'> &
  MaciSignUpDeps & {
    identity: string;
    remote?: RemoteBackup;
    /** The keypair JSON as MaciContext stores it (SecureStore `roebel.maci.keypair.v1`), or null. */
    loadLocal: () => Promise<string | null>;
    saveLocal: (raw: string) => Promise<void>;
    hasLegacyHistory: () => Promise<boolean>;
    /** A random keypair JSON (passkey-only person, case (c)). */
    generate: () => string;
    /** A thirdweb source for the identity without a prompt; null = none (UI offers Google/E-Mail). */
    thirdweb: () => Promise<MaciThirdwebSource | null>;
    /** MaciContext's cache marker for a stateIndex (pubKey.hash() as a decimal string). */
    pubKeyHashOf: (kp: SerializedKeypair) => string;
  };

export type MaciResolution =
  | { status: 'needsThirdweb' }
  | {
      status: 'ready';
      keypair: SerializedKeypair;
      source: ResolveSource | 'thirdweb';
      origin?: MaciKeyOrigin;
      stateIndex?: bigint;
      /** thirdweb path: the key is in the server backup now. */
      backedUp?: boolean;
      /** thirdweb path: why the backup did not happen (the key is still saved on this device). */
      backupError?: string;
    };

const enc = new TextEncoder();
const dec = new TextDecoder();

/** One server read per resolution: later reads (the backup) reuse it and its PRF output. */
function memoRead(remote: RemoteBackup): RemoteBackup {
  let read: Promise<RemoteRead> | null = null;
  return {
    read: () => {
      if (!read) read = remote.read().catch((e) => ((read = null), Promise.reject(e)));
      return read;
    },
    write: (blobs, replace) => remote.write(blobs, replace),
  };
}

/** A chosen key in the stored format: with stateIndex + pubKeyHash when it has a SignUp. */
export function storedMaciKeypair(choice: MaciKeyChoice, pubKeyHashOf: (kp: SerializedKeypair) => string): SerializedKeypair {
  const { stateIndex: _s, pubKeyHash: _h, ...base } = choice.keypair as SerializedKeypair & { pubKeyHash?: string };
  if (choice.stateIndex === undefined) return base as SerializedKeypair;
  return { ...base, stateIndex: choice.stateIndex.toString(), pubKeyHash: pubKeyHashOf(base as SerializedKeypair) } as SerializedKeypair;
}

export async function resolveMaciKeyForIdentity(d: MaciResolverDeps): Promise<MaciResolution> {
  const remote = d.remote ? memoRead(d.remote) : undefined;
  try {
    const r = await resolvePasskeySecret({
      slot: 'maci',
      loadLocal: async () => {
        const raw = await d.loadLocal();
        return raw ? enc.encode(raw) : null;
      },
      saveLocal: (secret) => d.saveLocal(dec.decode(secret)),
      storage: d.storage,
      getPrf: d.getPrf,
      remote,
      hasLegacyHistory: d.hasLegacyHistory,
      generate: () => enc.encode(d.generate()),
      wrap: d.wrap,
      unwrap: d.unwrap,
    });
    return { status: 'ready', keypair: JSON.parse(dec.decode(r.secret)) as SerializedKeypair, source: r.source };
  } catch (e) {
    if (!(e instanceof KeyBackupNeededError)) throw e;
  }

  // A migrated person with no key anywhere: the thirdweb derivation (never a passkey signature).
  const tw = await d.thirdweb();
  if (!tw) return { status: 'needsThirdweb' };
  if (!isAddressEqual(tw.address as Address, d.identity as Address)) throw new Error(THIRDWEB_OTHER_ACCOUNT_MESSAGE);

  const choice = await chooseMaciKeyFromThirdweb(tw, d);
  const keypair = storedMaciKeypair(choice, d.pubKeyHashOf);
  const raw = JSON.stringify(keypair);
  await d.saveLocal(raw); // voting works even if the backup below fails

  let backedUp = false;
  let backupError: string | undefined;
  if (remote) {
    try {
      const report: BackupReport = await backupDeviceSecrets([{ slot: 'maci', loadLocal: async () => enc.encode(raw) }], {
        storage: d.storage,
        getPrf: d.getPrf, // only when the (memoized) read carried no PRF output
        remote,
        wrap: d.wrap,
        unwrap: d.unwrap,
      });
      backedUp = report.saved.includes('maci');
      if (report.conflicts.includes('maci')) backupError = 'Auf dem Server liegt bereits ein anderer Abstimmungsschlüssel.';
    } catch (e) {
      backupError = e instanceof Error ? e.message : String(e);
    }
  }
  return {
    status: 'ready',
    keypair,
    source: 'thirdweb',
    origin: choice.origin,
    ...(choice.stateIndex !== undefined ? { stateIndex: choice.stateIndex } : {}),
    backedUp,
    ...(backupError ? { backupError } : {}),
  };
}

/**
 * "Schlüssel sichern" (key-completion.ts), slot `maci`: the same thirdweb choice as above, for a
 * device with no key. A key already on the device is never overwritten. Returns the stored bytes.
 */
export async function deriveMaciSlotFromThirdweb(
  tw: MaciThirdwebSource,
  d: MaciSignUpDeps & Pick<MaciResolverDeps, 'loadLocal' | 'saveLocal' | 'pubKeyHashOf'>,
): Promise<Uint8Array> {
  const existing = await d.loadLocal();
  if (existing) return enc.encode(existing);
  const raw = JSON.stringify(storedMaciKeypair(await chooseMaciKeyFromThirdweb(tw, d), d.pubKeyHashOf));
  await d.saveLocal(raw);
  return enc.encode(raw);
}
