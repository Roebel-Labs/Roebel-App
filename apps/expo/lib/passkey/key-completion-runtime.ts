/**
 * Real-world wiring for key-completion.ts ("Schlüssel sichern" completes MACI + Nostr + salt).
 * Load lazily (native passkey code); only the preview-gated settings screens import it.
 *
 * thirdweb is only READ here, never reconfigured: the same `wallets[0]` instance and storage the
 * boot loop uses. `autoConnect` on that instance restores the stored inApp session WITHOUT the
 * connection manager, so the active wallet (the passkey adapter) and the passkey session stay as
 * they are. "Einmal mit Google/E-Mail bestätigen" connects that same instance the same way — the
 * thirdweb login is stored as after any login, and the app keeps running on the passkey session.
 */
import type { Account } from 'thirdweb/wallets';
import { preAuthenticate } from 'thirdweb/wallets/in-app';
import * as SecureStore from '@/lib/storage/secureStorage';
import { client } from '@/constants/thirdweb';
import { redirectUrl, wallets } from '@/constants/wallets';
import { supabase } from '@/lib/supabase';
import { deserializeKeypair, type SerializedKeypair } from '@/lib/maci';
import { isCitizenTokenRegistered, lookupMaciSignUp, thirdwebMaciSource } from '@/lib/maci-signup-runtime';
import { deriveCommitmentSalt, loadCitizenPreimage } from '@/lib/citizen-commitment';
import { deriveAndStoreIdentity } from '@/lib/nostr/identity';
import { passkeySessionOf } from './active';
import { deviceSecretSources, keyBackupFor } from './derived-keys-runtime';
import { MACI_KEYPAIR_STORE_KEY } from './derived-keys';
import { completeKeyBackup, type CompletionResult, type ThirdwebKeySource } from './key-completion';
import { deriveMaciSlotFromThirdweb } from './maci-key-resolver';
import type { KeyBackupSlot } from './key-backup';
import { unwrapSecret, wrapSecret } from './prf-vault';
import type { PasskeySession } from './session';
import { getPrfSecret } from './webauthn';

const enc = new TextEncoder();

export const maciPubKeyHashOf = (kp: SerializedKeypair) => (deserializeKeypair(kp).pubKey.hash() as bigint).toString();
const THIRDWEB_TIMEOUT_MS = 20_000;

const storage = {
  getItem: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
};

/** RN fetch never times out: a hanging thirdweb restore must not hang the button. */
function withTimeout<T>(p: Promise<T>, ms = THIRDWEB_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Zeitüberschreitung bei der Google-/E-Mail-Anmeldung.')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** The EXISTING deterministic thirdweb derivations, persisted locally as today. */
export function thirdwebKeySource(account: Account): ThirdwebKeySource {
  return {
    address: account.address,
    derive: async (slot: KeyBackupSlot) => {
      if (slot === 'maci') {
        // The shared resolver: Gnosis + July (Base) candidates, the one with a SignUp wins (a July
        // registrant's key is the Base one). Never overwrites a device key; persists like
        // MaciContext.persistKeypair (with the stateIndex when found).
        return deriveMaciSlotFromThirdweb(thirdwebMaciSource(account), {
          loadLocal: () => SecureStore.getItemAsync(MACI_KEYPAIR_STORE_KEY),
          saveLocal: (raw) => SecureStore.setItemAsync(MACI_KEYPAIR_STORE_KEY, raw),
          lookup: lookupMaciSignUp,
          isTokenRegistered: () => isCitizenTokenRegistered(account.address),
          pubKeyHashOf: maciPubKeyHashOf,
        });
      }
      if (slot === 'nostr') return (await deriveAndStoreIdentity(account)).secretKey;
      // salt: the preimage (which carries it) only exists after enrolment; the PRF device blob
      // written by the backup is where a passkey session then finds it (derived-keys case (b)).
      return enc.encode(await deriveCommitmentSalt(account));
    },
  };
}

/**
 * A thirdweb account for the key derivation WITHOUT a prompt: the active account when it is a
 * thirdweb one, else the device's stored inApp session restored silently. null = none.
 */
export async function silentThirdwebAccount(activeAccount: unknown): Promise<Account | null> {
  const active = activeAccount as Account | null | undefined;
  if (active?.address && !passkeySessionOf(active) && typeof active.signMessage === 'function') return active;
  const w = wallets[0];
  const connected = w.getAccount();
  if (connected) return connected;
  try {
    return (await withTimeout(w.autoConnect({ client }))) ?? null;
  } catch {
    return null;
  }
}

/** "Einmal mit E-Mail bestätigen", step 1: send the code (existing thirdweb email login). */
export async function sendThirdwebEmailCode(email: string): Promise<void> {
  await withTimeout(preAuthenticate({ client, strategy: 'email', email }));
}

/**
 * "Einmal mit Google/E-Mail bestätigen", step 2: the existing thirdweb login on the same wallet
 * instance, outside the connection manager, so the passkey session stays the active one.
 */
export async function confirmWithThirdweb(
  p: { strategy: 'google' } | { strategy: 'email'; email: string; verificationCode: string },
): Promise<Account> {
  const w = wallets[0];
  if (p.strategy === 'google') return w.connect({ client, strategy: 'google', redirectUrl } as any);
  return withTimeout(w.connect({ client, strategy: 'email', email: p.email, verificationCode: p.verificationCode } as any));
}

/**
 * Does the citizen have a commitment? A preimage on this device, or a commitment evidence row
 * (request_evidence, irys_id 'commitment'). A failed lookup counts as YES (fail-safe: the
 * checklist then also waits for the salt).
 */
export async function hasCommitment(identity: string): Promise<boolean> {
  if (await loadCitizenPreimage(identity).catch(() => null)) return true;
  try {
    const { data, error } = await supabase
      .from('request_evidence')
      .select('id')
      .eq('requester_address', identity.toLowerCase())
      .eq('irys_id', 'commitment')
      .limit(1);
    if (error) return true;
    return (data?.length ?? 0) > 0;
  } catch {
    return true;
  }
}

/**
 * "Schlüssel sichern" for a passkey session: back up what the device holds and derive what is
 * missing with a thirdweb session (`thirdwebAccount` from confirmWithThirdweb, else silent).
 */
export async function completeKeysForSession(
  session: PasskeySession,
  opts: { activeAccount?: unknown; thirdwebAccount?: Account | null } = {},
): Promise<CompletionResult> {
  return completeKeyBackup({
    identity: session.identity,
    remote: keyBackupFor(session),
    sources: deviceSecretSources(session.identity),
    storage,
    getPrf: () => getPrfSecret(session.credentialId),
    wrap: wrapSecret,
    unwrap: unwrapSecret,
    hasCommitment: () => hasCommitment(session.identity),
    thirdweb: async () => {
      const acc = opts.thirdwebAccount ?? (await silentThirdwebAccount(opts.activeAccount));
      return acc ? thirdwebKeySource(acc) : null;
    },
  });
}
