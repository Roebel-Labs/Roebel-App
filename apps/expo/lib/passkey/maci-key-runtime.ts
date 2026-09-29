/**
 * Real-world wiring for maci-key-resolver.ts on a PASSKEY session ("Schlüssel erstellen" in
 * VoteButtons via MaciContext). Load lazily (native passkey code) — load-derived-keys.ts.
 *
 * The thirdweb account is the device's dormant inApp session restored silently (outside the
 * connection manager, exactly like "Schlüssel sichern"), or the one ThirdwebConfirm just
 * connected. Nothing here calls setActiveWallet: the passkey session stays the active one.
 */
import type { Account } from 'thirdweb/wallets';
import * as SecureStore from '@/lib/storage/secureStorage';
import { isCitizenTokenRegistered, lookupMaciSignUp, thirdwebMaciSource } from '@/lib/maci-signup-runtime';
import { hasLegacyHistory, keyBackupFor, SLOT_GENERATORS } from './derived-keys-runtime';
import { MACI_KEYPAIR_STORE_KEY, singleFlight } from './derived-keys';
import { maciPubKeyHashOf, silentThirdwebAccount } from './key-completion-runtime';
import { resolveMaciKeyForIdentity, type MaciResolution } from './maci-key-resolver';
import { unwrapSecret, wrapSecret } from './prf-vault';
import type { PasskeySession } from './session';
import { getPrfSecret } from './webauthn';

const storage = {
  getItem: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
};
const dec = new TextDecoder();

const inFlight = new Map<string, Promise<MaciResolution>>();

/**
 * The MACI key for the passkey session's identity (see maci-key-resolver.ts for the order).
 * `thirdwebAccount`: from ThirdwebConfirm; otherwise a silent thirdweb session is used, or the
 * result is `needsThirdweb`. Concurrent calls share one resolution (one fingerprint at most).
 */
export function resolveMaciKeyForSession(
  session: PasskeySession,
  opts: { activeAccount?: unknown; thirdwebAccount?: Account | null } = {},
): Promise<MaciResolution> {
  const key = `${session.identity.toLowerCase()}:${opts.thirdwebAccount ? 'tw' : 'silent'}`;
  return singleFlight(inFlight, key, () =>
    resolveMaciKeyForIdentity({
      identity: session.identity,
      remote: keyBackupFor(session),
      storage,
      getPrf: () => getPrfSecret(session.credentialId),
      wrap: wrapSecret,
      unwrap: unwrapSecret,
      loadLocal: () => SecureStore.getItemAsync(MACI_KEYPAIR_STORE_KEY),
      saveLocal: (raw) => SecureStore.setItemAsync(MACI_KEYPAIR_STORE_KEY, raw),
      hasLegacyHistory: () => hasLegacyHistory(session),
      generate: () => dec.decode(SLOT_GENERATORS.maci()),
      thirdweb: async () => {
        const acc = opts.thirdwebAccount ?? (await silentThirdwebAccount(opts.activeAccount));
        return acc ? thirdwebMaciSource(acc) : null;
      },
      lookup: lookupMaciSignUp,
      // The CitizenNFT belongs to the identity (the legacy account), not the passkey Safe.
      isTokenRegistered: () => isCitizenTokenRegistered(session.identity),
      pubKeyHashOf: maciPubKeyHashOf,
    }),
  );
}
