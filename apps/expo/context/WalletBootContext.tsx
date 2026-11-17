import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useActiveWallet, useSetActiveWallet } from 'thirdweb/react';
import { client } from '@/constants/thirdweb';
import { wallets } from '@/constants/wallets';
import { bootWallets, retrySource, type SessionSource } from '@/lib/passkey/boot';
import { passkeyChannelAllowed } from '@/lib/passkey/gate';
import { bufferError } from '@/lib/sentry-init';
import {
  appendRestoreReport,
  RESTORE_BACKGROUND_INTERVAL_MS,
  RESTORE_BACKGROUND_MAX_TICKS,
  RESTORE_RETRY_DELAYS_MS,
  restoreWithRetry,
  type RestoreReport,
  type RestoreResult,
} from '@/lib/wallet-restore';

/** thirdweb's in-app wallet keeps its login token under this AsyncStorage key (read-only here). */
const THIRDWEB_AUTH_TOKEN_KEY = `walletToken-${client.clientId}`;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Writes one restore outcome to the on-device log (and to crash reporting when it failed). */
function recordRestore(
  result: RestoreResult,
  outcome: RestoreReport['outcome'] = result.outcome,
  owner: RestoreReport['owner'] = 'thirdweb',
): void {
  let updateId: string | null | undefined;
  let embeddedLaunch: boolean | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require('expo-updates');
    updateId = Updates.updateId ?? null;
    embeddedLaunch = Updates.isEmbeddedLaunch;
  } catch {
    // expo-updates unavailable (web, tests)
  }
  const report: RestoreReport = {
    ...result,
    outcome,
    owner,
    at: new Date().toISOString(),
    appVersion: Constants.expoConfig?.version,
    platform: Platform.OS,
    updateId,
    embeddedLaunch,
  };
  void appendRestoreReport(AsyncStorage, report);
  if (outcome === 'failed') {
    bufferError(new Error(`wallet restore failed: ${result.errors[result.errors.length - 1] ?? 'unknown'}`), { ...report });
  }
}

interface WalletBootContextValue {
  /**
   * True once the cold-start auto-connect attempt has finished — whether it
   * restored a session, found none, or errored. Consumers use this to tell
   * "still reconnecting" apart from "genuinely logged out" so they don't wipe
   * optimistic state during the reconnect window.
   */
  autoConnectFinished: boolean;
  /**
   * True while the device holds a login but restoring it failed (thirdweb unreachable, restore
   * error). This is NOT a logout: the provider keeps retrying in the background, and consumers
   * must not delete persisted account state while it is set.
   */
  restoreFailed: boolean;
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
  const [restoreFailed, setRestoreFailed] = useState(false);
  // Someone who logs in by hand after a failed restore must never be disturbed by a background
  // retry: the retry loop checks this before every attempt.
  const activeWallet = useActiveWallet();
  const hasActiveWalletRef = useRef(false);
  useEffect(() => {
    hasActiveWalletRef.current = !!activeWallet;
  }, [activeWallet]);

  useEffect(() => {
    let cancelled = false;
    let backgroundTimer: ReturnType<typeof setInterval> | null = null;
    let appStateSub: { remove: () => void } | null = null;
    let backgroundBusy = false;
    let backgroundTicks = 0;
    // Set when a sovereign session owns a failed boot: the background retry then retries that
    // source and never falls to thirdweb.
    let failedSource: SessionSource | null = null;

    // One pass over the wallets. true = connected, false = nothing to restore; throws the last
    // error when a wallet's restore failed (the caller decides whether that is a logout).
    const attemptThirdweb = async (): Promise<boolean> => {
      let lastError: unknown;
      for (const wallet of wallets) {
        try {
          const account = await wallet.autoConnect({ client });
          if (cancelled) return false;
          if (account) {
            await setActiveWallet(wallet);
            return true;
          }
        } catch (e) {
          lastError = e;
        }
      }
      if (lastError) throw lastError;
      return false;
    };
    const hasStoredSession = async () => (await AsyncStorage.getItem(THIRDWEB_AUTH_TOKEN_KEY)) !== null;

    const stopBackground = () => {
      if (backgroundTimer) clearInterval(backgroundTimer);
      backgroundTimer = null;
      appStateSub?.remove();
      appStateSub = null;
    };
    // After a failed boot restore: try again every 20 s and whenever the app comes to the front,
    // until the login is back or the stored session is gone (the person logged in or out).
    const backgroundRetry = async () => {
      if (cancelled || backgroundBusy) return;
      if (hasActiveWalletRef.current) {
        stopBackground();
        return;
      }
      backgroundBusy = true;
      try {
        const source = failedSource;
        const result = source
          ? await retrySource(source, { sleep, isCancelled: () => cancelled })
          : await restoreWithRetry({
              attempt: attemptThirdweb,
              hasStoredSession,
              delaysMs: [],
              sleep,
              isCancelled: () => cancelled,
            });
        if (cancelled || result.outcome === 'failed' || result.outcome === 'cancelled') return;
        stopBackground();
        setRestoreFailed(false);
        if (result.outcome === 'restored') recordRestore(result, 'restored-late', source ? source.owner : 'thirdweb');
      } finally {
        backgroundBusy = false;
      }
    };

    const restoreThirdweb = (): Promise<RestoreResult> =>
      restoreWithRetry({
        attempt: attemptThirdweb,
        hasStoredSession,
        delaysMs: RESTORE_RETRY_DELAYS_MS,
        sleep,
        isCancelled: () => cancelled,
      });

    const startBackgroundRetry = () => {
      setRestoreFailed(true);
      backgroundTimer = setInterval(() => {
        // The timer gives up after ~5 minutes; coming back to the app still retries.
        backgroundTicks += 1;
        if (backgroundTicks > RESTORE_BACKGROUND_MAX_TICKS && backgroundTimer) {
          clearInterval(backgroundTimer);
          backgroundTimer = null;
          return;
        }
        void backgroundRetry();
      }, RESTORE_BACKGROUND_INTERVAL_MS);
      appStateSub = AppState.addEventListener('change', (state) => {
        if (state === 'active') void backgroundRetry();
      });
    };

    (async () => {
      try {
        // Sovereign session first (preview channels only; production builds no sources and reads
        // no storage), else the thirdweb path above. See lib/passkey/boot.ts.
        const sources: SessionSource[] = passkeyChannelAllowed()
          ? [(await import('@/lib/passkey/signin-runtime')).passkeySessionSource(setActiveWallet) as SessionSource]
          : [];
        const { owner, result } = await bootWallets({
          channelAllowed: () => passkeyChannelAllowed(),
          sources,
          restoreThirdweb,
          delaysMs: RESTORE_RETRY_DELAYS_MS,
          sleep,
          isCancelled: () => cancelled,
        });
        if (cancelled || result.outcome === 'cancelled') return;
        // A plain logged-out start is not worth a log line; everything else is.
        if (result.outcome !== 'no-session' && (result.outcome !== 'restored' || result.attempts > 1)) {
          recordRestore(result, result.outcome, owner);
        }
        if (result.outcome === 'failed') {
          failedSource = owner === 'thirdweb' ? null : (sources.find((x) => x.owner === owner) ?? null);
          startBackgroundRetry();
        }
      } finally {
        if (!cancelled) setAutoConnectFinished(true);
      }
    })();
    return () => {
      cancelled = true;
      stopBackground();
    };
  }, [setActiveWallet]);

  const value = useMemo<WalletBootContextValue>(
    // With a connected wallet there is nothing left to restore, whatever the boot attempt said.
    () => ({ autoConnectFinished, restoreFailed: restoreFailed && !activeWallet }),
    [autoConnectFinished, restoreFailed, activeWallet],
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
