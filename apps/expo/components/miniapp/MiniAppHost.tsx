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
  StatusBar,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useActiveAccount } from 'thirdweb/react';

import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { fontFamily } from '@/constants/theme';
import { CloseIcon, ShareIcon } from '@/components/miniapp/hostIcons';

import { createHostBridge, type HostHandlers } from '@netizen-labs/miniapp-sdk/host';
import type {
  BridgeMessage,
  Eip1193RequestArgs,
  MiniAppContext,
} from '@netizen-labs/miniapp-sdk';

import type { MiniApp } from '@/lib/miniapps';
import { trackMiniAppEvent, newMiniAppSessionId } from '@/lib/miniapps';
import { markMiniAppInstalled } from '@/lib/miniapp-installs';
import {
  getNotificationDecision,
  setNotificationDecision,
  saveNotificationOptIn,
} from '@/lib/miniapp-notifications';
import WalletConfirmSheet, {
  type WalletConfirmRequest,
} from '@/components/miniapp/WalletConfirmSheet';
import MiniAppNotificationSheet from '@/components/miniapp/MiniAppNotificationSheet';
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
  apiDataGet,
  apiDataList,
  apiDataUserGet,
  apiDataUserSet,
  apiGetMuenzenBalance,
  apiGrantReward,
  apiSendNotification,
  hasMiniAppApi,
} from '@/lib/miniapp-api';

const HEARTBEAT_MS = 25_000;

/**
 * Host chrome is always dark (independent of the app theme), so the mini app
 * floats on a near-black stage with a rounded sheet — like the reference flow.
 */
const CHROME_BG = '#0F1013';
const CHROME_TEXT = '#FFFFFF';

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
  const { colors } = useTheme();
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
  const [notifVisible, setNotifVisible] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  const notifCheckedRef = useRef(false);

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
      notifCheckedRef.current = false;
      setNotifVisible(false);
      setSplashVisible(true);
    }
  }, [visible]);

  // Opening the host IS the install (World-App Get→Open): persist the slug so
  // store buttons flip to "Öffnen" and skip the preview page next time.
  useEffect(() => {
    if (!visible) return;
    void markMiniAppInstalled(app.slug).then((isNew) => {
      if (isNew) track('install');
    });
  }, [visible, app.slug, track]);

  // Notification opt-in prompt: once per open, after the splash hides, only if
  // the app may send notifications, a wallet is connected, and the user has
  // never answered for this app.
  useEffect(() => {
    if (!visible || splashVisible || notifCheckedRef.current) return;
    if (!app.permissions.includes('notifications') || !walletLc) return;
    notifCheckedRef.current = true;
    let cancelled = false;
    void getNotificationDecision(app.slug).then((decision) => {
      if (decision !== null || cancelled) return;
      setTimeout(() => {
        if (!cancelled) setNotifVisible(true);
      }, 600);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, splashVisible, app.permissions, app.slug, walletLc]);

  const handleNotifEnable = useCallback(async () => {
    setNotifBusy(true);
    try {
      await setNotificationDecision(app.slug, 'enabled');
      if (walletLc) {
        await saveNotificationOptIn({ miniAppId: app.id, wallet: walletLc, enabled: true });
      }
      track('notifications_enabled');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setNotifBusy(false);
      setNotifVisible(false);
    }
  }, [app.slug, app.id, walletLc, track]);

  const handleNotifDismiss = useCallback(() => {
    void setNotificationDecision(app.slug, 'dismissed');
    track('notifications_dismissed');
    setNotifVisible(false);
  }, [app.slug, track]);

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

      // v0.3 mini-app datastore ("Mini-CMS"): app content + per-user state.
      dataGet: async (p) => {
        if (!hasMiniAppApi()) throw { code: 'unsupported', message: 'API nicht konfiguriert.' };
        return apiDataGet(apiId, p.key);
      },
      dataList: async (p) => {
        if (!hasMiniAppApi()) throw { code: 'unsupported', message: 'API nicht konfiguriert.' };
        return apiDataList(apiId, p.prefix);
      },
      dataUserGet: async (p) => {
        if (!hasMiniAppApi()) throw { code: 'unsupported', message: 'API nicht konfiguriert.' };
        return apiDataUserGet(apiId, p.key);
      },
      dataUserSet: async (p) => {
        if (!hasMiniAppApi()) throw { code: 'unsupported', message: 'API nicht konfiguriert.' };
        return apiDataUserSet(apiId, p.key, p.value);
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

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    bridgeRef.current?.handleMessage(e.nativeEvent.data);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Header share → native share sheet with the mini app's link.
  const handleShare = useCallback(() => {
    const message = `${app.name} – Mini-App in der Röbel App`;
    void Share.share(
      Platform.OS === 'ios'
        ? { message, url: app.homeUrl }
        : { message: `${message}\n${app.homeUrl}` },
    );
    track('share', { source: 'host_header' });
  }, [app.name, app.homeUrl, track]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor={CHROME_BG} />

        {/* Host chrome: ✕ — icon + name — share */}
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            style={styles.headerBtn}
            hitSlop={10}
            accessibilityLabel="Schließen"
          >
            <CloseIcon size={22} color={CHROME_TEXT} />
          </Pressable>
          <View style={styles.headerCenter} pointerEvents="none">
            <View style={[styles.headerIcon, { backgroundColor: app.primaryColor || colors.primary }]}>
              {app.iconUrl ? (
                <Image source={{ uri: app.iconUrl }} style={styles.headerIconImg} contentFit="cover" />
              ) : (
                <Text style={styles.headerIconLetter}>{app.name.slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {app.name}
            </Text>
          </View>
          <Pressable
            onPress={handleShare}
            style={styles.headerBtn}
            hitSlop={10}
            accessibilityLabel="Teilen"
          >
            <ShareIcon size={20} color={CHROME_TEXT} />
          </Pressable>
        </View>

        {/* WebView sheet — rounded top corners on the dark stage */}
        <View style={[styles.webWrap, { backgroundColor: colors.background }]}>
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

          {/* Splash overlay until actions.ready(): centered icon, spinner low */}
          {splashVisible && (
            <View
              style={[styles.splash, { backgroundColor: colors.background }]}
              pointerEvents="none"
            >
              <View style={[styles.splashIcon, { backgroundColor: app.primaryColor || colors.primary }]}>
                {app.iconUrl ? (
                  <Image source={{ uri: app.iconUrl }} style={styles.splashIconImg} contentFit="cover" />
                ) : (
                  <Text style={styles.splashIconLetter}>{app.name.slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
              <ActivityIndicator
                size="large"
                color={colors.textSecondary}
                style={[styles.splashSpinner, { bottom: insets.bottom + 56 }]}
              />
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

        {/* Floating notification opt-in (first open of notification-capable apps) */}
        <MiniAppNotificationSheet
          visible={notifVisible}
          app={app}
          busy={notifBusy}
          onEnable={handleNotifEnable}
          onDismiss={handleNotifDismiss}
        />
      </SafeAreaView>
    </Modal>
  );
}

const SHEET_RADIUS = 24;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CHROME_BG },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  headerIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconImg: { width: '100%', height: '100%' },
  headerIconLetter: {
    color: '#fff',
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
  },
  headerTitle: {
    color: CHROME_TEXT,
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    maxWidth: '75%',
  },
  webWrap: {
    flex: 1,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    overflow: 'hidden',
  },
  splash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashIcon: {
    width: 88,
    height: 88,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashIconImg: { width: '100%', height: '100%' },
  splashIconLetter: {
    color: '#fff',
    fontFamily: fontFamily.heading,
    fontSize: 40,
  },
  splashSpinner: { position: 'absolute' },
});
