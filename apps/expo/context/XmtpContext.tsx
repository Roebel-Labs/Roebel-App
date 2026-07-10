import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import type { DecodedMessage } from '@xmtp/react-native-sdk';

import { useWalletBoot } from '@/context/WalletBootContext';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import {
  bootXmtpClient,
  dropXmtpClient,
  getXmtpClient,
  type XmtpClientHandle,
} from '@/lib/xmtp/client';

interface XmtpContextValue {
  /** Null until boot succeeds (or forever on old builds / kill switch). */
  handle: XmtpClientHandle | null;
  /** True once the boot attempt has settled (success OR failure). */
  ready: boolean;
  /** Subscribe to every inbound/outbound streamed message. Returns unsubscribe. */
  subscribeMessages: (cb: (message: DecodedMessage<any>) => void) => () => void;
}

const XmtpContext = createContext<XmtpContextValue>({
  handle: null,
  ready: false,
  subscribeMessages: () => () => {},
});

export function useXmtp(): XmtpContextValue {
  return useContext(XmtpContext);
}

/**
 * Boots the XMTP client once the wallet layer is settled and streams all DM
 * messages to subscribers (MessagingContext + open threads).
 *
 * Boot gating mirrors the UserContext invariant: during the cold-start
 * reconnect window (autoConnectFinished === false) we neither boot nor tear
 * down. Only a real logout (no account AFTER autoConnect settled) drops the
 * client.
 */
export function XmtpProvider({ children }: { children: React.ReactNode }) {
  const { autoConnectFinished } = useWalletBoot();
  const { gnosisAccount, ready: gnosisReady } = useGnosisWallet();

  const [handle, setHandle] = useState<XmtpClientHandle | null>(() => getXmtpClient());
  const [ready, setReady] = useState(false);
  const subscribersRef = useRef<Set<(m: DecodedMessage<any>) => void>>(new Set());
  const streamingForRef = useRef<string | null>(null);

  // ── Boot / teardown ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    if (!autoConnectFinished || !gnosisReady) return; // still reconnecting — do nothing
    if (!gnosisAccount) {
      // Real logout: settle as ready-without-client and drop any old client.
      setReady(true);
      if (handle) {
        setHandle(null);
        streamingForRef.current = null;
        dropXmtpClient();
      }
      return;
    }
    if (handle?.wallet === gnosisAccount.address.toLowerCase()) {
      setReady(true);
      return;
    }

    (async () => {
      const booted = await bootXmtpClient(gnosisAccount);
      if (!cancelled) {
        setHandle(booted);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnectFinished, gnosisReady, gnosisAccount?.address]);

  // ── Message stream (re-armed on app foreground) ────────────────
  const startStream = useCallback(async (h: XmtpClientHandle) => {
    const streamKey = `${h.wallet}:${Date.now()}`;
    streamingForRef.current = streamKey;
    try {
      await h.client.conversations.streamAllMessages(
        async (message) => {
          for (const cb of subscribersRef.current) {
            try {
              cb(message);
            } catch (err) {
              console.warn('[xmtp] message subscriber threw', err);
            }
          }
        },
        'dms',
        ['allowed', 'unknown'],
        () => {
          // Stream closed (backgrounding, network). Foreground handler re-arms.
          if (streamingForRef.current === streamKey) streamingForRef.current = null;
        }
      );
    } catch (err) {
      console.warn('[xmtp] streamAllMessages failed', err);
      if (streamingForRef.current === streamKey) streamingForRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!handle) return;
    startStream(handle);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && handle && !streamingForRef.current) {
        handle.client.conversations
          .syncAllConversations(['allowed', 'unknown'])
          .catch(() => {});
        startStream(handle);
      }
    });

    return () => {
      sub.remove();
      streamingForRef.current = null;
      try {
        handle.client.conversations.cancelStreamAllMessages();
      } catch {
        // stream already torn down
      }
    };
  }, [handle, startStream]);

  const subscribeMessages = useCallback((cb: (m: DecodedMessage<any>) => void) => {
    subscribersRef.current.add(cb);
    return () => {
      subscribersRef.current.delete(cb);
    };
  }, []);

  const value = useMemo<XmtpContextValue>(
    () => ({ handle, ready, subscribeMessages }),
    [handle, ready, subscribeMessages]
  );

  return <XmtpContext.Provider value={value}>{children}</XmtpContext.Provider>;
}
