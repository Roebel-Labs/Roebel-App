import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSetActiveWallet } from 'thirdweb/react';
import { client } from '@/constants/thirdweb';
import { wallets } from '@/constants/wallets';
import { bootWallets } from '@/lib/passkey/boot';
import { passkeyChannelAllowed } from '@/lib/passkey/gate';

interface WalletBootContextValue {
  /**
   * True once the cold-start auto-connect attempt has finished — whether it
   * restored a session, found none, or errored. Consumers use this to tell
   * "still reconnecting" apart from "genuinely logged out" so they don't wipe
   * optimistic state during the reconnect window.
   */
  autoConnectFinished: boolean;
}

const WalletBootContext = createContext<WalletBootContextValue | undefined>(undefined);

/**
 * Restores the last connected wallet on cold start and exposes when that attempt
 * has completed.
 *
 * We call wallet.autoConnect({ client }) explicitly per wallet (rather than using
 * <AutoConnect> / useAutoConnect) because the higher-level helpers were swallowing
 * errors and leaving the connection status as 'unknown' on Android preview builds
 * even when AsyncStorage held a valid session.
 */
export function WalletBootProvider({ children }: { children: React.ReactNode }) {
  const setActiveWallet = useSetActiveWallet();
  const [autoConnectFinished, setAutoConnectFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // The existing thirdweb restore, byte-for-byte as before.
    const autoConnectThirdweb = async () => {
      for (const wallet of wallets) {
        try {
          const account = await wallet.autoConnect({ client });
          if (cancelled) return;
          if (account) {
            await setActiveWallet(wallet);
            return;
          }
        } catch {
          // No stored session for this wallet, or restore failed; try next.
        }
      }
    };
    (async () => {
      try {
        // Passkey session first (preview channels only; production skips this without reading
        // any storage), else the thirdweb path above. See lib/passkey/boot.ts.
        await bootWallets({
          channelAllowed: () => passkeyChannelAllowed(),
          loadSession: async () => (await import('@/lib/passkey/signin-runtime')).loadStoredPasskeySession(),
          connectPasskey: async (session) =>
            (await import('@/lib/passkey/signin-runtime')).activatePasskeySession(session, setActiveWallet),
          autoConnectThirdweb,
          isCancelled: () => cancelled,
        });
      } finally {
        if (!cancelled) setAutoConnectFinished(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setActiveWallet]);

  const value = useMemo<WalletBootContextValue>(
    () => ({ autoConnectFinished }),
    [autoConnectFinished],
  );

  return <WalletBootContext.Provider value={value}>{children}</WalletBootContext.Provider>;
}

export function useWalletBoot(): WalletBootContextValue {
  const context = useContext(WalletBootContext);
  if (!context) {
    throw new Error('useWalletBoot must be used within WalletBootProvider');
  }
  return context;
}
