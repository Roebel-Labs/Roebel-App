/**
 * Cold-start wallet restore order (WalletBootContext):
 *
 *   1. passkey channel allowed (sync, no network) AND `passkey_session_v1` exists
 *        → connect the passkey adapter wallet. No biometric prompt: the address needs no signature.
 *   2. otherwise (or if 1 fails) → the existing thirdweb autoConnect path, unchanged.
 *
 * On the production channel step 1 returns before reading any storage, so production boots
 * exactly as before. This module never reads, writes or deletes a thirdweb key; the only key it
 * reads is `passkey_session_v1`.
 */
import type { PasskeySession } from './session';

export type BootDeps = {
  channelAllowed: () => boolean;
  loadSession: () => Promise<PasskeySession | null>;
  connectPasskey: (session: PasskeySession) => Promise<void>;
  autoConnectThirdweb: () => Promise<void>;
  isCancelled?: () => boolean;
};

export type BootOutcome = 'passkey' | 'thirdweb' | 'cancelled';

export async function bootWallets(deps: BootDeps): Promise<BootOutcome> {
  if (deps.channelAllowed()) {
    let session: PasskeySession | null = null;
    try {
      session = await deps.loadSession();
    } catch {
      session = null;
    }
    if (deps.isCancelled?.()) return 'cancelled';
    if (session) {
      try {
        await deps.connectPasskey(session);
        return 'passkey';
      } catch {
        // A broken session must never leave the person stuck: fall through to thirdweb.
      }
    }
  }
  if (deps.isCancelled?.()) return 'cancelled';
  await deps.autoConnectThirdweb();
  return 'thirdweb';
}
