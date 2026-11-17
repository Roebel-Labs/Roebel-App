/**
 * The passkey session source for the cold-start boot (WalletBootContext -> boot.ts).
 *
 * Light on purpose: only SecureStore and the session key name. `hasStored` reads the session key
 * directly; the heavy sign-in runtime (native passkey module, thirdweb adapter, Gnosis client) is
 * imported only by `load` / `connect`, i.e. only for someone who really holds a passkey session.
 * A failing import therefore can never send a thirdweb user's boot down the passkey path.
 */
import type { Wallet } from 'thirdweb/wallets';
import * as SecureStore from '@/lib/storage/secureStorage';
import { lazySessionSource, type SessionSource } from './boot';
import { PASSKEY_SESSION_KEY } from './session';

export type KeyReader = { getItem: (key: string) => Promise<string | null> };

export const secureKeyReader: KeyReader = { getItem: (key) => SecureStore.getItemAsync(key) };

/** Raw presence of `passkey_session_v1`. Throws on a storage error (the boot treats that as "stored"). */
export async function hasStoredPasskeySession(storage: KeyReader = secureKeyReader): Promise<boolean> {
  return (await storage.getItem(PASSKEY_SESSION_KEY)) !== null;
}

type SigninRuntime = Pick<typeof import('./signin-runtime'), 'passkeySessionSource'>;

export function passkeyBootSource(
  setActiveWallet: (w: Wallet) => Promise<void>,
  deps: { storage?: KeyReader; loadRuntime?: () => Promise<SigninRuntime> } = {},
): SessionSource {
  const storage = deps.storage ?? secureKeyReader;
  const loadRuntime = deps.loadRuntime ?? (() => import('./signin-runtime'));
  return lazySessionSource(
    'passkey',
    () => hasStoredPasskeySession(storage),
    async () => (await loadRuntime()).passkeySessionSource(setActiveWallet),
  ) as SessionSource;
}
