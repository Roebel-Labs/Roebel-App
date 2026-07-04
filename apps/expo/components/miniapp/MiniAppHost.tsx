/**
 * MiniAppHost — the Expo host half of the Netizen mini-app bridge (spec §5①).
 *
 * A full-screen modal that loads a live mini app's `homeUrl` in a
 * `react-native-webview`, wires `createHostBridge` from `@netizen-labs/miniapp-sdk/host`,
 * and maps every bridge method to a native capability:
 *   - ready            → hide splash
 *   - getContext       → MiniAppContext from the user record (untrusted, display only)
 *   - walletGetAccount → { address, chainId } from the thirdweb smart account
 *   - walletRequest    → EIP-1193, with a NATIVE confirm sheet for every signature
 *   - haptics.*        → expo-haptics
 *   - openUrl / share  → Linking / RN Share
 *   - getMuenzenBalance / grantReward / notificationsSend → apps/web API routes
 *   - track            → mini_app_events insert
 *
 * Permissions from the app's manifest are passed to the bridge so it enforces
 * them. Emits mini_app_events: app_open (on open), heartbeat (25s, visibility-
 * aware), wallet_connect (on first connected account).
 *
 * Transport (spec §3.2): the client posts via `window.ReactNativeWebView.postMessage`
 * (provided automatically by RN WebView — no extra injection needed to send). The
 * host delivers replies/events back by dispatching a synthetic `message` event
 * on `window` via `injectJavaScript`, which is what the client SDK listens for.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  Platform,
  Linking,
  Share,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useActiveAccount } from 'thirdweb/react';

import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { fontFamily } from '@/constants/theme';
import { CloseIcon, ChevronLeft } from '@/components/miniapp/hostIcons';

import { createHostBridge, type HostHandlers } from '@netizen-labs/miniapp-sdk/host';
import type {
  BridgeMessage,
  Eip1193RequestArgs,
  MiniAppContext,
  NetizenEvent,
} from '@netizen-labs/miniapp-sdk';

import type { MiniApp } from '@/lib/miniapps';
import { trackMiniAppEvent, newMiniAppSessionId } from '@/lib/miniapps';
import WalletConfirmSheet, {
  type WalletConfirmRequest,
} from '@/components/miniapp/WalletConfirmSheet';
import {
  HOST_CHAIN_ID,
  buildConfirmRequest,
  executeSigning,
  handleReadOnly,
  isSigningMethod,
  normalizeParams,
  userRejected,
} from '@/lib/miniapp-wallet';
import {
  apiGetMuenzenBalance,
  apiGrantReward,
  apiSendNotification,
  hasMiniAppApi,
} from '@/lib/miniapp-api';

const HEARTBEAT_MS = 25_000;

type Props = {
  app: MiniApp;
  visible: boolean;
  onClose: () => void;
};

/** Deferred confirm-sheet promise — resolves/rejects when the user decides. */
type PendingConfirm = {
  request: WalletConfirmRequest;
  method: string;
  params: unknown[];
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};

export default function MiniAppHost({ app, visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const account = useActiveAccount();
  const { user, isCitizen } = useUser();

  const webViewRef = useRef<WebView>(null);
  const bridgeRef = useRef<ReturnType<typeof createHostBridge> | null>(null);
  const sessionIdRef = useRef<string>(newMiniAppSessionId());
  const walletConnectFiredRef = useRef(false);
  const appOpenFiredRef = useRef(false);

  const [splashVisible, setSplashVisible] = useState(true);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const walletLc = account?.address?.toLowerCase() ?? null;

  // --- telemetry convenience -----------------------------------------------
  const track = useCallback(
    (event: string, props?: Record<string, unknown>) => {
      trackMiniAppEvent({
        miniAppId: app.id,
        slug: app.slug,
        sessionId: sessionIdRef.current,
        wallet: walletLc,
        event,
        props,
      });
    },
    [app.id, app.slug, walletLc],
  );

  // Reset per-open session state.
  useEffect(() => {
    if (visible) {
      sessionIdRef.current = newMiniAppSessionId();
      walletConnectFiredRef.current = false;
      appOpenFiredRef.current = false;
      setSplashVisible(true);
    }
  }, [visible]);

  // app_open once per open.
  useEffect(() => {
    if (visible && !appOpenFiredRef.current) {
      appOpenFiredRef.current = true;
      track('app_open', { category: app.category });
    }
  }, [visible, track, app.category]);

  // wallet_connect when a connected account first appears while open.
  useEffect(() => {
    if (visible && walletLc && !walletConnectFiredRef.current) {
      walletConnectFiredRef.current = true;
      track('wallet_connect');
    }
  }, [visible, walletLc, track]);

  // heartbeat every 25s while open + app foregrounded (visibility-aware).
  useEffect(() => {
    if (!visible) return;
    let appActive = AppState.currentState === 'active';
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      appActive = s === 'active';
    });
    const id = setInterval(() => {
      if (appActive) track('heartbeat');
    }, HEARTBEAT_MS);
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [visible, track]);

  // --- transport: host → client --------------------------------------------
  // Deliver a bridge message by dispatching a synthetic `message` event on the
  // mini app's `window` (double-JSON so the outer injected string is valid JS).
  const post = useCallback((msg: BridgeMessage) => {
    const payload = JSON.stringify(JSON.stringify(msg));
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new MessageEvent('message',{data:${payload}}));true;`,
    );
  }, []);

  // --- context builder ------------------------------------------------------
  const buildContext = useCallback((): MiniAppContext => {
    const platform: 'ios' | 'android' | 'web' =
      Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
    return {
      user: account?.address
        ? {
            id: account.address,
            // Resolve to a display name, never surface the raw wallet.
            displayName: user?.display_name ?? user?.username ?? undefined,
            avatarUrl: user?.profile_picture_url ?? undefined,
            isCitizen: !!isCitizen,
          }
        : null,
      host: {
        name: 'Röbel',
        platform,
        version: Constants.expoConfig?.version ?? '0.0.0',
      },
      safeAreaInsets: {
        top: insets.top,
        bottom: insets.bottom,
        left: insets.left,
        right: insets.right,
      },
      launch: { entry: app.slug, referrer: 'roebel-store' },
    };
  }, [account?.address, user, isCitizen, insets, app.slug]);

  // --- wallet request with confirm sheet -----------------------------------
  const walletRequest = useCallback(
    async (args: Eip1193RequestArgs): Promise<unknown> => {
      const method = args.method;
      const params = normalizeParams(args.params);

      if (!isSigningMethod(method)) {
        return handleReadOnly(method, account);
      }
      if (!account) {
        throw { code: 'unauthorized', message: 'Kein Konto verbunden.' };
      }

      const request = buildConfirmRequest(app.name, method, params, account.address);
      if (!request) throw { code: 'unsupported', message: `Methode "${method}".` };

      // Show the sheet and wait for the user.
      return new Promise((resolve, reject) => {
        setConfirm({ request, method, params, resolve, reject });
      });
    },
    [account, app.name],
  );

  const handleConfirmApprove = useCallback(async () => {
    if (!confirm || !account) return;
    setConfirmBusy(true);
    try {
      const result = await executeSigning(confirm.method, confirm.params, account);
      confirm.resolve(result);
      if (confirm.method === 'eth_sendTransaction') {
        track('tx_sent', { app: app.slug });
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      confirm.reject(
        e && typeof e === 'object' && 'code' in e
          ? e
          : { code: 'internal', message: e instanceof Error ? e.message : String(e) },
      );
    } finally {
      setConfirmBusy(false);
      setConfirm(null);
    }
  }, [confirm, account, track, app.slug]);

  const handleConfirmReject = useCallback(() => {
    if (!confirm) return;
    confirm.reject(userRejected());
    setConfirm(null);
    setConfirmBusy(false);
  }, [confirm]);

  // --- host handlers --------------------------------------------------------
  const handlers = useMemo<HostHandlers>(() => {
    const apiId = { miniAppId: app.id, slug: app.slug, wallet: walletLc };
    return {
      hello: () => ({ ok: true, host: 'roebel' }),
      ready: () => setSplashVisible(false),
      close: () => onClose(),
      openUrl: ({ url }) => {
        if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
          void Linking.openURL(url);
        }
      },
      share: async ({ text, url }) => {
        const message = [text, url].filter(Boolean).join('\n');
        if (message) await Share.share({ message });
      },
      addMiniApp: () => ({ added: false }),
      getContext: () => buildContext(),

      walletGetAccount: () =>
        account?.address ? { address: account.address, chainId: HOST_CHAIN_ID } : null,
      walletRequest,

      hapticsImpact: ({ style }) => {
        const map: Record<string, Haptics.ImpactFeedbackStyle> = {
          light: Haptics.ImpactFeedbackStyle.Light,
          medium: Haptics.ImpactFeedbackStyle.Medium,
          heavy: Haptics.ImpactFeedbackStyle.Heavy,
        };
        void Haptics.impactAsync(map[style ?? 'medium'] ?? Haptics.ImpactFeedbackStyle.Medium);
      },
      hapticsNotification: ({ type }) => {
        const map: Record<string, Haptics.NotificationFeedbackType> = {
          success: Haptics.NotificationFeedbackType.Success,
          warning: Haptics.NotificationFeedbackType.Warning,
          error: Haptics.NotificationFeedbackType.Error,
        };
        void Haptics.notificationAsync(
          map[type ?? 'success'] ?? Haptics.NotificationFeedbackType.Success,
        );
      },
      hapticsSelection: () => {
        void Haptics.selectionAsync();
      },

      getMuenzenBalance: async () => {
        if (!hasMiniAppApi()) throw { code: 'unsupported', message: 'API nicht konfiguriert.' };
        return apiGetMuenzenBalance(apiId);
      },
      grantReward: async (p) => {
        if (!hasMiniAppApi()) throw { code: 'unsupported', message: 'API nicht konfiguriert.' };
        const res = await apiGrantReward(apiId, p);
        if (res.granted) track('reward_granted', { amount: p.amount, reason: p.reason });
        return res;
      },
      notificationsSend: async (p) => {
        if (!hasMiniAppApi()) throw { code: 'unsupported', message: 'API nicht konfiguriert.' };
        return apiSendNotification(apiId, p);
      },

      track: ({ event, props }) => track(event, props),
    };
  }, [app.id, app.slug, walletLc, onClose, buildContext, account, walletRequest, track]);

  // --- construct/refresh the bridge ----------------------------------------
  useEffect(() => {
    bridgeRef.current = createHostBridge({
      post,
      handlers,
      grantedPermissions: app.permissions,
    });
  }, [post, handlers, app.permissions]);

  // Emit walletChanged whenever the active account changes while open.
  useEffect(() => {
    if (visible && bridgeRef.current) {
      bridgeRef.current.sendEvent('walletChanged', {
        address: account?.address ?? null,
        chainId: HOST_CHAIN_ID,
      });
    }
  }, [account?.address, visible]);

  const sendEvent = useCallback((event: NetizenEvent, data?: unknown) => {
    bridgeRef.current?.sendEvent(event, data);
  }, []);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    bridgeRef.current?.handleMessage(e.nativeEvent.data);
  }, []);

  // Header back → emit `back` (mini app may intercept for in-app navigation).
  const handleBack = useCallback(() => {
    sendEvent('back');
    void Haptics.selectionAsync();
  }, [sendEvent]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const author = app.authorName ?? 'Netizen Mini App';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        {/* Host header */}
        <View style={[styles.header, { borderBottomColor: colors.borderSecondary }]}>
          <Pressable
            onPress={handleBack}
            style={styles.headerBtn}
            hitSlop={10}
            accessibilityLabel="Zurück"
          >
            <ChevronLeft size={24} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.headerCenter} pointerEvents="none">
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {app.name}
            </Text>
            <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {author}
            </Text>
          </View>
          <Pressable
            onPress={handleClose}
            style={styles.headerBtn}
            hitSlop={10}
            accessibilityLabel="Schließen"
          >
            <CloseIcon size={22} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* WebView */}
        <View style={styles.webWrap}>
          <WebView
            ref={webViewRef}
            source={{ uri: app.homeUrl }}
            onMessage={onMessage}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            // No extra shim needed to SEND: RN WebView provides
            // window.ReactNativeWebView.postMessage automatically. The host
            // delivers replies via injectJavaScript (see `post`).
            style={{ backgroundColor: colors.background }}
            allowsBackForwardNavigationGestures={false}
            setSupportMultipleWindows={false}
            // External links open in the host browser, never in-app.
            onShouldStartLoadWithRequest={(req) => {
              try {
                const home = new URL(app.homeUrl);
                const target = new URL(req.url);
                if (target.origin === home.origin) return true;
                if (req.url.startsWith('about:') || req.url.startsWith('data:')) return true;
                void Linking.openURL(req.url);
                return false;
              } catch {
                return true;
              }
            }}
          />

          {/* Splash overlay until actions.ready() */}
          {splashVisible && (
            <View
              style={[styles.splash, { backgroundColor: app.primaryColor || colors.primary }]}
              pointerEvents="none"
            >
              <View style={styles.splashInner}>
                <Text style={styles.splashName} numberOfLines={2}>
                  {app.name}
                </Text>
                <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />
              </View>
            </View>
          )}
        </View>

        {/* Native wallet confirmation sheet */}
        <WalletConfirmSheet
          visible={!!confirm}
          request={confirm?.request ?? null}
          busy={confirmBusy}
          onConfirm={handleConfirmApprove}
          onReject={handleConfirmReject}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    maxWidth: '100%',
  },
  headerSub: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginTop: 1,
  },
  webWrap: { flex: 1 },
  splash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashInner: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  splashName: {
    color: '#fff',
    fontFamily: fontFamily.heading,
    fontSize: 26,
    textAlign: 'center',
  },
});
