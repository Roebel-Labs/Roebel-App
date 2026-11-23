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
import { sendTransaction } from 'thirdweb';
import { useActiveAccount } from 'thirdweb/react';
import { markMiniAppNotificationsRead, syncWidget } from '@/lib/widget-sync';

import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { fontFamily } from '@/constants/theme';
import { previewBannerText } from '@/lib/miniapp-permissions';
import { CloseIcon, ShareIcon } from '@/components/miniapp/hostIcons';
import MuenzenRewardOverlay from '@/components/rewards/MuenzenRewardOverlay';

import {
  createHostBridge,
  credentialMatches,
  pendingConsentKeys,
  type ConsentKey,
  type HostHandlers,
} from '@netizen-labs/miniapp-sdk/host';
import type {
  BridgeMessage,
  Credential,
  Eip1193RequestArgs,
  MiniAppContext,
} from '@netizen-labs/miniapp-sdk';

import type { MiniApp } from '@/lib/miniapps';
import { trackMiniAppEvent, newMiniAppSessionId } from '@/lib/miniapps';
import { bridgeGuardScript, createBridgeGuard } from '@/lib/miniapp-bridge-guard';
import { getRandomBytes } from 'expo-crypto';
import { markMiniAppInstalled, markMiniAppOpened } from '@/lib/miniapp-installs';
import {
  getNotificationDecision,
  setNotificationDecision,
  saveNotificationOptIn,
} from '@/lib/miniapp-notifications';
import WalletConfirmSheet, {
  type WalletConfirmRequest,
} from '@/components/miniapp/WalletConfirmSheet';
import MiniAppNotificationSheet from '@/components/miniapp/MiniAppNotificationSheet';
import MiniAppConsentSheet from '@/components/miniapp/MiniAppConsentSheet';
import { readV1Choice, saveV1Choice, v1ConnectItems, v1User, type V1Choice } from '@/lib/miniapp-connection';
import {
  buildConsentItems,
  credentialsEqual,
  fetchIdentityState,
  grantChanged,
  manifestCredentialTypes,
  grantFromChoices,
  saveIdentityGrant,
  shapeUser,
  type ConsentItem,
  type IdentityState,
} from '@/lib/miniapp-identity';
import {
  ADDRESS_NOT_GRANTED,
  createIdentityGate,
  rewardForApp,
  walletAllowed,
  type IdentityGate,
} from '@/lib/miniapp-identity-gate';
import {
  HOST_CHAIN_ID,
  buildConfirmRequest,
  executeSigning,
  handleReadOnly,
  isSigningMethod,
  normalizeParams,
  userRejected,
} from '@/lib/miniapp-wallet';
import { createRpcProxy } from '@/lib/miniapp-rpc';
import { addressesIn, cachedName, orgNameForSafe, prefetchNames } from '@/lib/miniapp-names';
import { buildPayConfirm, preparePay } from '@/lib/miniapp-pay';
import { backPress, eventsFor, type HostSignals } from '@/lib/miniapp-host-events';
import { getRoebelTalerBalance, prepareSendRoebelTaler } from '@/lib/roebel-taler';
import { buildTransactionConfirm } from '@/lib/miniapp-confirm';
import { parseSendCalls, preflightCalls } from '@/lib/miniapp-calls';
import { assertHostChain } from '@/lib/miniapp-chain';
import { passkeySessionOf } from '@/lib/passkey/active';
import { GNOSIS_READ_RPC } from '@/constants/gnosis';
import {
  apiDataGet,
  apiDataList,
  apiDataUserGet,
  apiDataUserSet,
  apiDataRows,
  apiGetMuenzenBalance,
  apiGrantReward,
  apiSendNotification,
  hasMiniAppApi,
  miniAppApiBase,
} from '@/lib/miniapp-api';
import {
  createMiniAppTokenCache,
  requestMiniAppUserToken,
  resolveMiniAppUserToken,
} from '@/lib/miniapp-token';
import { canSignSilently } from '@/lib/passkey/api-session-runtime';
import {
  buildSignInMessage,
  encodeSignInToken,
  normalizeSignInNonce,
  signInOrigin,
} from '@/lib/miniapp-signin';

const HEARTBEAT_MS = 25_000;
/** Version 2: how often the identity state is re-read while the app is open. */
const IDENTITY_REFRESH_MS = 60_000;
const NO_CREDENTIALS: Credential[] = [];
const NO_ITEMS: ConsentItem[] = [];
/** Failsafe: reveal the WebView if the app never calls actions.ready(). */
const READY_TIMEOUT_MS = 10_000;
/**
 * Once the page has loaded, wait at most this long for actions.ready() before revealing it.
 * Apps that never call ready (13 % of opens hit the 10 s failsafe) no longer stare at a splash
 * over an already painted page.
 */
const READY_AFTER_LOAD_MS = 2_000;

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

/** The consent sheet on screen: what it shows and what happens with the answer. */
type PendingConsent = {
  items: ConsentItem[];
  /** Version-1 connect dialog: the answer is stored on the device, not on the node. */
  v1?: boolean;
  /** Resolved with the saved state (or null when saving failed) after Erlauben / Nicht jetzt. */
  done: (state: IdentityState | null) => void;
};

/** Deferred confirm-sheet promise — resolves/rejects when the user decides. */
type PendingConfirm = {
  request: WalletConfirmRequest;
  method: string;
  params: unknown[];
  /** Runs instead of `executeSigning` on approve (auth.signIn). */
  run?: () => Promise<unknown>;
  /** Declared calls of a version-2 app on an independent account: sent gasless for this app. */
  miniAppId?: string;
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
  // WebView messages that arrive before the bridge is constructed (raced hello).
  const earlyMessagesRef = useRef<string[]>([]);
  // Host-owned reward celebration: EVERY successful grantReward from ANY mini
  // app presents the same native Münzen screen the rest of the app uses
  // (daily mint, tasks, event scans) — apps don't build their own.
  const [rewardShow, setRewardShow] = useState<{
    visible: boolean;
    loading: boolean;
    amount: number;
    subtitle?: string;
    replayKey: number;
  }>({ visible: false, loading: false, amount: 0, replayKey: 0 });
  const sessionIdRef = useRef<string>(newMiniAppSessionId());
  const walletConnectFiredRef = useRef(false);
  const appOpenFiredRef = useRef(false);

  const [splashVisible, setSplashVisible] = useState(true);
  // Time-to-ready telemetry: when this open started, and whether its reveal was already tracked.
  const openedAtRef = useRef(Date.now());
  const revealTrackedRef = useRef(false);
  const afterLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAfterLoadTimer = useCallback(() => {
    if (afterLoadTimerRef.current) clearTimeout(afterLoadTimerRef.current);
    afterLoadTimerRef.current = null;
  }, []);
  // Bumped on every open: keys the WebView so each open mounts a FRESH page
  // (fresh hello/ready handshake). Without this, iOS keeps the Modal's
  // children mounted after the first open+close (Modal.isRendered only clears
  // via the native onDismiss, which is unreliable on the new architecture) —
  // the stale, already-ready page never re-sends `ready`, so the reset splash
  // spins forever on every reopen.
  const [openCount, setOpenCount] = useState(0);
  const hasOpenedRef = useRef(false);
  // Load failure handling: dedicated <slug>.roebel.site origins have failed
  // before (wildcard-cert outage → net::ERR_CONNECTION_RESET), so a failed
  // load first retries on the always-available /mini/<slug> path of the web
  // app (same HTML, CSP-sandboxed there). Only when that also fails do we
  // show a themed error state with retry.
  const [useFallback, setUseFallback] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [notifVisible, setNotifVisible] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  const notifCheckedRef = useRef(false);
  // Set by actions.ready({ handlesBack }): Android back then goes to the app. Reset on every open.
  const handlesBackRef = useRef(false);
  // Foreground state of the Röbel app, for visibilityChanged.
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const signalsRef = useRef<HostSignals | null>(null);

  const walletLc = account?.address?.toLowerCase() ?? null;

  // Home-screen widget + in-app dots: opening clears this app's unread notifications,
  // closing re-syncs the widget (names, icons, other apps' dots).
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      if (walletLc && !app.preview) {
        void markMiniAppNotificationsRead(walletLc, app.slug).then(() => syncWidget(walletLc));
      }
    } else if (!visible && wasVisible.current) {
      void syncWidget(walletLc);
    }
    wasVisible.current = visible;
  }, [visible, walletLc, app.slug, app.preview]);

  // --- identity (manifest version 2) ------------------------------------------
  // Version-1 apps and the dev preview never load an identity state: their gate is settled from
  // the start and everything below behaves exactly as before.
  const isV2 = app.manifestVersion === 2 && !app.preview;
  const [identityState, setIdentityStateRaw] = useState<IdentityState | null>(null);
  // Read by the bridge handlers at call time (they must see the state saved a moment ago).
  const identityRef = useRef<IdentityState | null>(null);
  const setIdentityState = useCallback((s: IdentityState | null) => {
    identityRef.current = s;
    setIdentityStateRaw(s);
  }, []);
  const gateRef = useRef<IdentityGate | null>(null);
  const gate = useCallback((): IdentityGate => {
    if (!gateRef.current) {
      gateRef.current = createIdentityGate();
      if (app.preview) gateRef.current.settle();
    }
    return gateRef.current;
  }, [app.preview]);
  // Version 1: the connect choice stored on this device (null = not asked yet / signed out).
  const v1ChoiceRef = useRef<V1Choice | null>(null);
  const [consentConnected, setConsentConnected] = useState(false);
  const [consent, setConsent] = useState<PendingConsent | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  // A credentials.request sheet on screen: its `done`, so closing the host never leaves it hanging.
  const requestConsentDoneRef = useRef<((s: IdentityState | null) => void) | null>(null);
  // The mini-app user token cache (see "mini-app user token" below); declared here because a
  // changed credential list clears it.
  const tokenAccountRef = useRef(account);
  const tokenCacheRef = useRef<ReturnType<typeof createMiniAppTokenCache> | null>(null);
  // Bumped by every applied state: a re-fetch that started earlier is dropped when it lands.
  const identitySeqRef = useRef(0);
  // Take a newer identity state. When any part of the grant changed, or the shared credentials
  // differ from what the app had, the token (whose claims carry them) is dropped; a changed
  // credential list also sends the app `credentialsChanged`.
  const applyIdentityState = useCallback(
    (next: IdentityState) => {
      identitySeqRef.current += 1;
      const prevState = identityRef.current;
      // No previous state (the first load failed): the app saw no credentials.
      const prev = prevState?.credentials ?? NO_CREDENTIALS;
      setIdentityState(next);
      const credsChanged = !credentialsEqual(prev, next.credentials);
      if (credsChanged || grantChanged(prevState, next)) tokenCacheRef.current?.clear();
      if (credsChanged) bridgeRef.current?.sendEvent('credentialsChanged', next.credentials);
    },
    [setIdentityState],
  );

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

  // Fallback target for apps published on a dedicated <slug>.roebel.site
  // origin: the same HTML served from the web app's /mini/<slug> route.
  const fallbackUrl = useMemo(() => {
    try {
      const host = new URL(app.homeUrl).hostname.toLowerCase();
      const m = host.match(/^([a-z0-9-]+)\.roebel\.site$/);
      const base = miniAppApiBase();
      if (!m || !base) return null;
      const candidate = `${base}/mini/${m[1]}`;
      return candidate === app.homeUrl ? null : candidate;
    } catch {
      return null;
    }
  }, [app.homeUrl]);
  const sourceUrl = useFallback && fallbackUrl ? fallbackUrl : app.homeUrl;

  // Bridge guard: a fresh nonce per WebView mount (keyed like the WebView by
  // openCount) and only the loaded URL's origin may talk to the bridge. Drops
  // messages from sub-frames (ads, embeds) and from a top frame that
  // navigated to another origin.
  const bridgeNonce = useMemo(
    () => Array.from(getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join(''),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- new nonce per open
    [openCount],
  );
  const bridgeGuard = useMemo(() => {
    let origin: string | null = null;
    try {
      origin = new URL(sourceUrl).origin;
    } catch {
      origin = null;
    }
    return createBridgeGuard({
      nonce: bridgeNonce,
      allowedOrigins: () => (origin ? [origin] : []),
    });
  }, [bridgeNonce, sourceUrl]);
  const bridgeGuardJs = useMemo(() => bridgeGuardScript(bridgeNonce), [bridgeNonce]);
  // Chain reads of the mini app: one rate-limited RPC proxy per open (fresh limits per mount).
  const rpcProxy = useMemo(
    () => createRpcProxy({ rpcUrl: GNOSIS_READ_RPC }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- new proxy per open
    [openCount],
  );
  // The guard whose first accepted message was already checked for the
  // envelope (bridge_envelope_missing is tracked once per open).
  const envelopeCheckedForRef = useRef<ReturnType<typeof createBridgeGuard> | null>(null);

  const handleLoadError = useCallback(
    (e: { nativeEvent: { description?: string; code?: number } }) => {
      const desc = e.nativeEvent.description ?? '';
      if (!useFallback && fallbackUrl) {
        setUseFallback(true);
        setOpenCount((c) => c + 1);
        track('load_fallback', { description: desc });
        return;
      }
      setSplashVisible(false);
      setLoadError(desc || 'Verbindung fehlgeschlagen');
      track('load_error', { description: desc, fallback: useFallback });
    },
    [useFallback, fallbackUrl, track],
  );

  const handleRetry = useCallback(() => {
    setLoadError(null);
    setSplashVisible(true);
    setUseFallback(false);
    setOpenCount((c) => c + 1);
  }, []);

  // Reset per-open session state.
  useEffect(() => {
    if (visible) {
      sessionIdRef.current = newMiniAppSessionId();
      walletConnectFiredRef.current = false;
      appOpenFiredRef.current = false;
      notifCheckedRef.current = false;
      handlesBackRef.current = false;
      openedAtRef.current = Date.now();
      revealTrackedRef.current = false;
      clearAfterLoadTimer();
      setNotifVisible(false);
      setSplashVisible(true);
      setLoadError(null);
      // Give the primary origin a fresh chance each open (a healed wildcard
      // cert should win again; a still-broken one fails fast into fallback).
      setUseFallback(false);
      // Remount the WebView on RE-opens only — the first open already mounts
      // fresh, and bumping the key there would load the page twice.
      if (hasOpenedRef.current) setOpenCount((c) => c + 1);
      hasOpenedRef.current = true;
    } else {
      clearAfterLoadTimer();
      // Pre-arm the splash so the first frame of the next open never flashes
      // the previous page before the reset effect runs.
      setSplashVisible(true);
    }
  }, [visible, clearAfterLoadTimer]);

  // Unmount: no reveal timer outlives the host.
  useEffect(() => clearAfterLoadTimer, [clearAfterLoadTimer]);

  // Splash failsafe: if `ready` never arrives (app-side error, dropped
  // message), reveal the page instead of spinning forever. Tracked so broken
  // apps stay visible in mini_app_events.
  useEffect(() => {
    if (!visible || !splashVisible) return;
    const id = setTimeout(() => {
      setSplashVisible(false);
      track('ready_timeout');
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [visible, splashVisible, track]);

  // Opening the host IS the install (World-App Get→Open): persist the slug so
  // store buttons flip to "Öffnen" and skip the preview page next time.
  useEffect(() => {
    if (!visible) return;
    void markMiniAppInstalled(app.slug).then((isNew) => {
      if (isNew) track('install');
    });
    // Home-screen widget: recently opened apps first.
    void markMiniAppOpened(app.slug);
  }, [visible, app.slug, track]);

  // Notification opt-in prompt: once per open, after the splash hides, only if
  // the app may send notifications, a wallet is connected, and the user has
  // never answered for this app.
  useEffect(() => {
    // Never on top of the consent sheet (version 2); it is asked once that is answered.
    if (!visible || splashVisible || notifCheckedRef.current || consent) return;
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
  }, [visible, splashVisible, app.permissions, app.slug, walletLc, consent]);

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

  // Version 1: the standard connect dialog on the first open per account; the choice is kept on
  // this device and identity-bearing calls wait for it (signed out until answered).
  useEffect(() => {
    if (!visible || isV2 || app.preview) return;
    const g = gateRef.current && !gateRef.current.isSettled() ? gateRef.current : createIdentityGate();
    gateRef.current = g;
    v1ChoiceRef.current = null;
    const wallet = walletLc;
    if (!wallet) {
      g.settle();
      return;
    }
    let cancelled = false;
    void readV1Choice(app.id, wallet).then((choice) => {
      if (cancelled) return;
      if (choice) {
        v1ChoiceRef.current = choice;
        return g.settle();
      }
      setConsent({
        items: v1ConnectItems(),
        v1: true,
        done: () => g.settle(),
      });
    });
    return () => {
      cancelled = true;
      g.settle();
      setConsent(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per open and per account only
  }, [visible, isV2, walletLc, app.id]);

  // Version 2: load the identity state on open (and when the account changes); ask for whatever
  // was never asked. Identity-bearing bridge calls wait for this gate.
  useEffect(() => {
    if (!visible || !isV2) return;
    // A call that arrived before this effect already waits on the current gate: keep it.
    const g = gateRef.current && !gateRef.current.isSettled() ? gateRef.current : createIdentityGate();
    gateRef.current = g;
    // The handlers read the ref: never the previous account's grant.
    identityRef.current = null;
    const acc = account;
    if (!acc) {
      g.settle();
      return;
    }
    let cancelled = false;
    void fetchIdentityState(acc, app.id).then((state) => {
      if (cancelled) return;
      // The host stays mounted between opens: a token cached on an earlier open may carry a grant
      // withdrawn meanwhile (detail page, another device). Every open starts from a fresh token.
      tokenCacheRef.current?.clear();
      setIdentityState(state);
      // Offline / node down: no sheet, the app runs signed out.
      if (!state) return g.settle();
      const items = buildConsentItems(app, state, pendingConsentKeys(app.identity ?? undefined, state.asked));
      if (items.length === 0) return g.settle();
      setConsent({
        items,
        done: (saved) => {
          if (saved) applyIdentityState(saved);
          g.settle();
        },
      });
    });
    return () => {
      cancelled = true;
      // A closed host never leaves a bridge call hanging.
      g.settle();
      requestConsentDoneRef.current?.(null);
      setIdentityState(null);
      setConsent(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload per open and per account only
  }, [visible, isV2, walletLc, app.id]);

  // Version 2: re-read the identity state while open (every 60 s and when the app returns to the
  // foreground), so a grant withdrawn elsewhere or a new / renewed credential reaches the app.
  useEffect(() => {
    if (!visible || !isV2) return;
    const acc = account;
    if (!acc) return;
    let cancelled = false;
    const refresh = () => {
      const seq = identitySeqRef.current;
      void fetchIdentityState(acc, app.id).then((state) => {
        // Closed, another account, or a newer state (a grant just saved) landed meanwhile.
        if (cancelled || !state || seq !== identitySeqRef.current) return;
        // The first load (and its consent sheet) has not finished: leave it to the open effect.
        if (!gateRef.current?.isSettled()) return;
        applyIdentityState(state);
      });
    };
    const id = setInterval(refresh, IDENTITY_REFRESH_MS);
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') refresh();
    });
    return () => {
      cancelled = true;
      clearInterval(id);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per open and per account only
  }, [visible, isV2, walletLc, app.id, applyIdentityState]);

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
      // Resolve to a display name, never surface the raw wallet. Version 2: only what was granted.
      user: !account?.address
        ? null
        : !isV2 && !app.preview
          ? v1User(app.id, account.address, v1ChoiceRef.current, {
              displayName: user?.display_name ?? user?.username ?? undefined,
              avatarUrl: user?.profile_picture_url ?? undefined,
              isCitizen: !!isCitizen,
            })
          : shapeUser(app, identityRef.current, {
            address: account.address,
            displayName: user?.display_name ?? user?.username ?? undefined,
            avatarUrl: user?.profile_picture_url ?? undefined,
            isCitizen: !!isCitizen,
          }),
      host: {
        name: 'Röbel',
        platform,
        version: Constants.expoConfig?.version ?? '0.0.0',
        theme: isDark ? 'dark' : 'light',
      },
      safeAreaInsets: {
        // The host header sits below the status bar (SafeAreaView edges=['top'])
        // and fully consumes the top inset — the app's viewport starts safe.
        // Reporting the raw top would make apps double-pad their headers.
        top: 0,
        // The WebView DOES extend under the home indicator / gesture bar:
        // apps must pad their bottom by this (the generated boilerplate keeps
        // --safe-bottom in sync from exactly this value).
        bottom: insets.bottom,
        left: insets.left,
        right: insets.right,
      },
      launch: { entry: app.slug, referrer: 'roebel-store' },
    };
  }, [account?.address, user, isCitizen, insets, app, isDark, isV2]);

  // --- wallet request with confirm sheet -----------------------------------
  const walletRequest = useCallback(
    async (args: Eip1193RequestArgs): Promise<unknown> => {
      const method = args.method;
      const params = normalizeParams(args.params);

      // Version 2 without the address grant: reads see no account, signing is refused.
      const allowed = isV2 || app.preview ? walletAllowed(app, identityRef.current) : v1ChoiceRef.current?.address === true;
      if (!isSigningMethod(method)) {
        return handleReadOnly(method, params, allowed ? account : undefined, rpcProxy);
      }
      if (!allowed) throw ADDRESS_NOT_GRANTED;
      if (!account) {
        throw { code: 'unauthorized', message: 'Kein Konto verbunden.' };
      }

      // Sends: the calls, checked before any sheet. An independent account sending for a
      // version-2 app may only send its declared calls (gasless, the app id rides along);
      // version 1 and the old sign-in keep today's path.
      const confirmApp = { ...app, manifestVersion: isV2 ? (2 as const) : (1 as const) };
      let miniAppId: string | undefined;
      let calls: { to?: string; data?: string; value?: string }[] | null = null;
      if (method === 'wallet_sendCalls') {
        calls = parseSendCalls(params, account.address).calls;
      } else if (method === 'eth_sendTransaction') {
        const tx = (params[0] ?? {}) as { to?: string; data?: string; value?: string; chainId?: unknown };
        assertHostChain(tx.chainId);
        calls = [{ to: tx.to, data: tx.data, value: tx.value }];
      }
      if (calls) {
        const pre = preflightCalls({ app: confirmApp, calls, sponsored: !!passkeySessionOf(account) });
        if (!pre.ok) throw pre.error;
        if (pre.miniAppId) miniAppId = app.id;
      }

      // Names for every address in the request first: the sheet never shows an address.
      await prefetchNames(addressesIn(params));
      const request = calls
        ? buildTransactionConfirm(confirmApp, calls, cachedName)
        : buildConfirmRequest(confirmApp, method, params, cachedName);
      if (!request) throw { code: 'unsupported', message: `Methode "${method}".` };

      // Show the sheet and wait for the user.
      return new Promise((resolve, reject) => {
        setConfirm({ request, method, params, miniAppId, resolve, reject });
      });
    },
    [account, app, rpcProxy, isV2],
  );

  const handleConfirmApprove = useCallback(async () => {
    if (!confirm || !account) return;
    setConfirmBusy(true);
    try {
      const result = confirm.run
        ? await confirm.run()
        : await executeSigning(confirm.method, confirm.params, account, { miniAppId: confirm.miniAppId });
      confirm.resolve(result);
      if (confirm.method === 'eth_sendTransaction' || confirm.method === 'wallet_sendCalls') {
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

  // --- mini-app user token ---------------------------------------------------
  // Fetched lazily by the handlers that need it (never on open, so opening an app never
  // prompts). One cache per host, cleared when the account changes. Failures resolve to null
  // and back off 60 s; the call then goes out wallet-only, as before.
  // The cache is created on first use (inside a handler, never during render) and reads the
  // current account through a ref updated after each render.
  useEffect(() => {
    tokenAccountRef.current = account;
  }, [account]);
  useEffect(() => {
    tokenCacheRef.current?.clear();
  }, [walletLc]);
  // `silent`: reads an app may fire on load (balance, user data, auth.getToken) never prompt:
  // a cached token, else a thirdweb signature (silent) or a passkey session's EXISTING API
  // session token; otherwise they go out wallet-only. Writes may ask once (then back off 60 s).
  const getUserToken = useCallback(async (opts?: { silent?: boolean }): Promise<string | null> => {
    if (tokenCacheRef.current == null) {
      tokenCacheRef.current = createMiniAppTokenCache({
        request: async (appRef, ctx) => {
          const acc = tokenAccountRef.current;
          return acc ? requestMiniAppUserToken(acc, appRef, ctx) : null;
        },
      });
    }
    return resolveMiniAppUserToken({
      appId: app.id,
      wallet: walletLc,
      hasApi: hasMiniAppApi(),
      silent: !!opts?.silent,
      cache: tokenCacheRef.current,
      canSignSilently: () => canSignSilently(tokenAccountRef.current),
    });
  }, [app.id, walletLc]);

  // --- consent sheet answers --------------------------------------------------
  const answerConsent = useCallback(
    async (on: Set<ConsentKey>, viaButton = false) => {
      const pending = consent;
      const state = identityRef.current;
      if (!pending) return;
      if (pending.v1) {
        const wallet = walletLc;
        const choice: V1Choice = { profile: on.has('profile'), address: on.has('address') };
        if (wallet) await saveV1Choice(app.id, wallet, choice);
        v1ChoiceRef.current = choice;
        track(on.size > 0 ? 'identity_granted' : 'identity_declined', { count: on.size });
        if (viaButton && on.size > 0) {
          setConsentConnected(true);
          await new Promise((r) => setTimeout(r, 900));
          setConsentConnected(false);
        }
        setConsent(null);
        pending.done(null);
        return;
      }
      if (!state || !account) {
        setConsent(null);
        pending.done(null);
        return;
      }
      setConsentBusy(true);
      try {
        const shown = pending.items.map((i) => i.key);
        const saved = await saveIdentityGrant(account, app.id, grantFromChoices(app, state, shown, on));
        // A changed grant changes the token's claims (and `pending.done` applies the new state,
        // which sends credentialsChanged when the shared list differs).
        if (saved) tokenCacheRef.current?.clear();
        track(on.size > 0 ? 'identity_granted' : 'identity_declined', { count: on.size });
        if (viaButton && saved && on.size > 0) {
          setConsentConnected(true);
          await new Promise((r) => setTimeout(r, 900));
          setConsentConnected(false);
        }
        pending.done(saved);
      } finally {
        setConsentBusy(false);
        setConsent(null);
      }
    },
    [consent, account, app, track, walletLc],
  );
  const handleConsentAllow = useCallback((on: Set<ConsentKey>) => void answerConsent(on, true), [answerConsent]);
  // "Nicht jetzt": nothing granted, but the items count as asked.
  const handleConsentLater = useCallback(() => void answerConsent(new Set()), [answerConsent]);

  // --- host handlers --------------------------------------------------------
  const handlers = useMemo<HostHandlers>(() => {
    const apiId = { miniAppId: app.id, slug: app.slug, wallet: walletLc };
    // A 401 on a call carrying the token drops it from the cache (the next call fetches a new
    // one); the failed call itself is not retried without the token.
    const onTokenRejected = (token: string) => {
      if (walletLc) tokenCacheRef.current?.invalidate(app.id, walletLc, token);
    };
    const userApiId = async (opts?: { silent?: boolean }) => ({
      ...apiId,
      token: await getUserToken(opts),
      onTokenRejected,
    });
    // Version 2: identity-bearing calls wait for the consent decision. Version 1 is untouched.
    const settled = () => gate().settled;
    // The account is shared: version 2 per grant, version 1 per the connect choice, the dev
    // preview always.
    const addressShared = () =>
      isV2 || app.preview ? walletAllowed(app, identityRef.current) : v1ChoiceRef.current?.address === true;
    const v2Only = {
      getContext: async () => {
        await settled();
        return buildContext();
      },
      walletGetAccount: async () => {
        await settled();
        return account?.address && walletAllowed(app, identityRef.current)
          ? { address: account.address, chainId: HOST_CHAIN_ID }
          : null;
      },
      walletRequest: async (args: Eip1193RequestArgs) => {
        await settled();
        return walletRequest(args);
      },
      authGetToken: async () => {
        await settled();
        // No identity state (offline): the app runs signed out.
        if (!identityRef.current) return null;
        const t = await getUserToken({ silent: true });
        return t ? { token: t } : null;
      },
      // Only the credentials the person shares with this app (the node already filtered them).
      credentialsList: async () => {
        await settled();
        return identityRef.current?.credentials ?? [];
      },
      credentialsHas: async (p: { type: string }) => {
        const type = p?.type;
        if (typeof type !== 'string') throw { code: 'invalid_params', message: 'type fehlt.' };
        await settled();
        return (identityRef.current?.credentials ?? []).some((held) => credentialMatches(type, held));
      },
      // Asks again (even if asked before) for credential types from the reviewed manifest; a type
      // the manifest does not request is refused, so review cannot be bypassed at runtime.
      credentialsRequest: async (p: { types: string[] }) => {
        const types = p?.types;
        if (!Array.isArray(types) || types.length === 0 || !types.every((t) => typeof t === 'string')) {
          throw { code: 'invalid_params', message: 'types muss eine Liste sein.' };
        }
        await settled();
        // Types in the manifest's spelling (case-insensitive, like the node), so `cred:` keys and
        // the grant compare match what the node stores.
        const refs = manifestCredentialTypes(app, types);
        if (!refs) {
          throw { code: 'unauthorized', message: 'Diese Mitgliedschaft fragt die Mini-App in ihrem Manifest nicht an.' };
        }
        const state = identityRef.current;
        if (!state || !account) throw { code: 'unauthorized', message: 'Kein Konto verbunden.' };
        const keys = refs.map((t) => `cred:${t}` as ConsentKey);
        const items = buildConsentItems(app, state, keys);
        if (items.length > 0) {
          if (requestConsentDoneRef.current) {
            throw { code: 'rate_limited', message: 'Eine Anfrage ist noch offen.' };
          }
          await new Promise<void>((resolve) => {
            const done = (saved: IdentityState | null) => {
              if (requestConsentDoneRef.current !== done) return;
              requestConsentDoneRef.current = null;
              if (saved) applyIdentityState(saved);
              resolve();
            };
            requestConsentDoneRef.current = done;
            setConsent({ items, done });
          });
        }
        // `granted` = the requested types the person has granted this app (manifest spelling),
        // whether or not they currently hold them; credentials.list says what is held. (The SDK
        // mock answers held types instead; a real host answers grants.)
        const granted = identityRef.current?.granted.credentials ?? [];
        return { granted: refs.filter((t) => granted.includes(t)) };
      },
    } satisfies Partial<HostHandlers>;
    // Version 1 (and the dev preview): no identity section, so nothing is shared.
    const v1Credentials = {
      credentialsList: async () => [] as Credential[],
      credentialsHas: async () => false,
      credentialsRequest: async (): Promise<{ granted: string[] }> => {
        throw { code: 'unauthorized', message: 'Diese Mini-App fragt keine Mitgliedschaften an.' };
      },
    } satisfies Partial<HostHandlers>;
    // auth.signIn: an EIP-4361 message for the app's own domain, signed by the account after a
    // native confirmation. Needs the address grant (version 2); version 1 always has the wallet.
    const authSignIn = async (p: { nonce?: string }): Promise<{ token: string }> => {
      await settled();
      if (!addressShared()) throw ADDRESS_NOT_GRANTED;
      const acc = account;
      if (!acc) throw { code: 'unauthorized', message: 'Kein Konto verbunden.' };
      const origin = signInOrigin(app.homeUrl);
      if (!origin) throw { code: 'internal', message: 'Ungültige Adresse der Mini-App.' };
      const message = buildSignInMessage({
        ...origin,
        address: acc.address,
        nonce: normalizeSignInNonce(p?.nonce, getRandomBytes),
        issuedAt: new Date().toISOString(),
        appName: app.name,
      });
      const request: WalletConfirmRequest = {
        kind: 'personal_sign',
        title: 'Anmelden',
        appName: app.name,
        rows: [{ label: 'App', value: app.name }],
      };
      return new Promise<{ token: string }>((resolve, reject) => {
        setConfirm({
          request,
          method: 'personal_sign',
          params: [],
          run: async () => {
            const signature = await acc.signMessage({ message });
            return { token: encodeSignInToken({ address: acc.address, message, signature }) };
          },
          resolve: resolve as (v: unknown) => void,
          reject,
        });
      });
    };
    // roebel.pay: Röbel Münzen to a person or org account known in Röbel, after the native sheet.
    // The memo is shown on the sheet only (never on chain, never logged, never returned).
    const pay = async (p: unknown): Promise<{ txHash: string }> => {
      await settled();
      if (!addressShared()) throw ADDRESS_NOT_GRANTED;
      const acc = account;
      if (!acc) throw { code: 'unauthorized', message: 'Kein Konto verbunden.' };
      const prepared = await preparePay(p, {
        self: acc.address,
        personName: async (a) => {
          await prefetchNames([a]);
          return cachedName(a);
        },
        orgName: orgNameForSafe,
        // The transfer moves the Röbel Münzen group token, so that is the balance that counts.
        balance: getRoebelTalerBalance,
      });
      const request = buildPayConfirm(app.name, prepared);
      return new Promise<{ txHash: string }>((resolve, reject) => {
        setConfirm({
          request,
          method: 'roebel.pay',
          params: [],
          // Same account the host signs with; on an independent account this is the everyday
          // Circles transfer the sponsor already accepts (no mini-app id attached).
          run: async () => {
            const { transactionHash } = await sendTransaction({
              account: acc,
              transaction: prepareSendRoebelTaler(acc.address, prepared.to, prepared.units),
            });
            track('pay', { amount: prepared.amount });
            return { txHash: transactionHash };
          },
          resolve: resolve as (v: unknown) => void,
          reject,
        });
      });
    };
    return {
      hello: () => ({ ok: true, host: 'roebel' }),
      ready: (opts) => {
        handlesBackRef.current = opts?.handlesBack === true;
        clearAfterLoadTimer();
        if (!revealTrackedRef.current) {
          revealTrackedRef.current = true;
          track('ready', { ms: Date.now() - openedAtRef.current });
        }
        setSplashVisible(false);
      },
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
      getContext: isV2
        ? v2Only.getContext
        : async () => {
            await settled();
            return buildContext();
          },

      walletGetAccount: isV2
        ? v2Only.walletGetAccount
        : async () => {
            await settled();
            const ok = app.preview || v1ChoiceRef.current?.address === true;
            return ok && account?.address ? { address: account.address, chainId: HOST_CHAIN_ID } : null;
          },
      walletRequest: isV2
        ? v2Only.walletRequest
        : async (args: Eip1193RequestArgs) => {
            await settled();
            return walletRequest(args);
          },

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
        return apiGetMuenzenBalance(await userApiId({ silent: true }));
      },
      grantReward: async (p) => {
        if (!hasMiniAppApi()) throw { code: 'unsupported', message: 'API nicht konfiguriert.' };
        // Native celebration is host-owned: the SAME MuenzenRewardView as the
        // daily mint / task rewards, in loading state while the server
        // authorizes and mints. The bridge promise resolves independently.
        const reason = typeof p.reason === 'string' ? p.reason.trim() : '';
        setRewardShow((c) => ({
          visible: true,
          loading: true,
          amount: 0,
          subtitle: reason.length >= 4 && reason.length <= 120 ? reason : undefined,
          replayKey: c.replayKey + 1,
        }));
        try {
          const res = await apiGrantReward(await userApiId(), p);
          if (res.granted) {
            track('reward_granted', { amount: p.amount, reason: p.reason });
            const granted = Number(res.amount ?? p.amount ?? 1) || 1;
            setRewardShow((c) => ({ ...c, loading: false, amount: granted }));
          } else {
            // Not granted (daily cap / budget) — no celebration; the app
            // explains it (the bridge result/error carries the code).
            setRewardShow((c) => ({ ...c, visible: false, loading: false }));
          }
          return rewardForApp(app, identityRef.current, res);
        } catch (e) {
          setRewardShow((c) => ({ ...c, visible: false, loading: false }));
          throw e;
        }
      },
      notificationsSend: async (p) => {
        if (!hasMiniAppApi()) throw { code: 'unsupported', message: 'API nicht konfiguriert.' };
        return apiSendNotification(await userApiId(), p);
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
        return apiDataUserGet(await userApiId({ silent: true }), p.key);
      },
      dataUserSet: async (p) => {
        if (!hasMiniAppApi()) throw { code: 'unsupported', message: 'API nicht konfiguriert.' };
        return apiDataUserSet(await userApiId(), p.key, p.value);
      },
      // v0.5 shared collections (bookings, sign-ups, check-ins). Shared lists can be read
      // without a person; writes and private collections need one.
      dataRows: async (p) => {
        if (!hasMiniAppApi()) throw { code: 'unsupported', message: 'API nicht konfiguriert.' };
        const needsPerson = p.op !== 'list' || p.scope === 'private';
        return apiDataRows(await userApiId(needsPerson ? undefined : { silent: true }), p);
      },

      authGetToken: isV2
        ? v2Only.authGetToken
        : async () => {
            await settled();
            // The version-1 token names the account: only once the address is shared.
            if (!app.preview && v1ChoiceRef.current?.address !== true) return null;
            const t = await getUserToken({ silent: true });
            return t ? { token: t } : null;
          },

      authSignIn,
      pay: (p) => pay(p),

      credentialsList: isV2 ? v2Only.credentialsList : v1Credentials.credentialsList,
      credentialsHas: isV2 ? v2Only.credentialsHas : v1Credentials.credentialsHas,
      credentialsRequest: isV2 ? v2Only.credentialsRequest : v1Credentials.credentialsRequest,

      track: ({ event, props }) => track(event, props),
    };
  }, [app, walletLc, onClose, buildContext, account, walletRequest, track, getUserToken, isV2, gate, applyIdentityState, clearAfterLoadTimer]);

  // The page finished loading (success only; failures go through handleLoadError): give the app a
  // short window to call ready, then reveal it anyway.
  const handleLoad = useCallback(() => {
    clearAfterLoadTimer();
    afterLoadTimerRef.current = setTimeout(() => {
      afterLoadTimerRef.current = null;
      setSplashVisible(false);
      if (!revealTrackedRef.current) {
        revealTrackedRef.current = true;
        track('ready_after_load', { ms: Date.now() - openedAtRef.current });
      }
    }, READY_AFTER_LOAD_MS);
  }, [clearAfterLoadTimer, track]);

  // --- construct/refresh the bridge ----------------------------------------
  useEffect(() => {
    bridgeRef.current = createHostBridge({
      post,
      handlers,
      grantedPermissions: app.permissions,
    });
    // Drain WebView messages that raced ahead of the bridge (typically the
    // SDK's `bridge.hello` on a fast first paint) — dropping the hello would
    // strand the app in mock mode with its built-in fallback content.
    const queued = earlyMessagesRef.current;
    if (queued.length) {
      earlyMessagesRef.current = [];
      for (const raw of queued) bridgeRef.current.handleMessage(raw);
    }
  }, [post, handlers, app.permissions]);

  // Emit walletChanged whenever the address the app may see changes while open. Version 1: the
  // active account. Version 2: the account only with the address grant, else null.
  const exposedAddress = isV2
    ? walletAllowed(app, identityState)
      ? (account?.address ?? null)
      : null
    : (account?.address ?? null);
  useEffect(() => {
    if (visible && bridgeRef.current) {
      bridgeRef.current.sendEvent('walletChanged', {
        address: exposedAddress,
        chainId: HOST_CHAIN_ID,
      });
    }
  }, [exposedAddress, visible]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const raw = bridgeGuard.accept({ data: e.nativeEvent.data, url: e.nativeEvent.url });
      if (raw === null) return;
      if (envelopeCheckedForRef.current !== bridgeGuard) {
        envelopeCheckedForRef.current = bridgeGuard;
        if (!bridgeGuard.envelopeSeen()) track('bridge_envelope_missing');
      }
      const bridge = bridgeRef.current;
      if (bridge) bridge.handleMessage(raw);
      else earlyMessagesRef.current.push(raw);
    },
    [bridgeGuard, track],
  );

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Android back: to the app when it said it handles back (it closes itself with
  // sdk.actions.close()), else close as before. The header ✕ always closes.
  const handleBack = useCallback(() => {
    if (backPress(handlesBackRef.current) === 'event') bridgeRef.current?.sendEvent('back');
    else onClose();
  }, [onClose]);

  // visibilityChanged / themeChanged from the host signals (open, foreground, theme).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    const next: HostSignals = { open: visible, appActive, dark: isDark };
    const events = eventsFor(signalsRef.current, next);
    signalsRef.current = next;
    for (const e of events) bridgeRef.current?.sendEvent(e.event, e.data);
  }, [visible, appActive, isDark]);

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
      onRequestClose={handleBack}
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

        {app.preview ? (
          <Text style={styles.previewBanner}>{previewBannerText(app.permissions)}</Text>
        ) : null}

        {/* WebView sheet — rounded top corners on the dark stage */}
        <View style={[styles.webWrap, { backgroundColor: colors.background }]}>
          <WebView
            key={`open-${openCount}`}
            ref={webViewRef}
            source={{ uri: sourceUrl }}
            onMessage={onMessage}
            // Top frame only (ForMainFrameOnly defaults to true): tags every
            // top-frame message with this open's nonce.
            injectedJavaScriptBeforeContentLoaded={bridgeGuardJs}
            onError={handleLoadError}
            onLoad={handleLoad}
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
                // Compare against the URL actually loaded (primary OR
                // fallback origin) — else the fallback's own first load
                // would be kicked out to the external browser on iOS.
                const home = new URL(sourceUrl);
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

          {/* Load-failure state: covers the WebView's default error page. */}
          {loadError && (
            <View style={[styles.splash, { backgroundColor: colors.background }]}>
              <View style={[styles.splashIcon, { backgroundColor: app.primaryColor || colors.primary }]}>
                {app.iconUrl ? (
                  <Image source={{ uri: app.iconUrl }} style={styles.splashIconImg} contentFit="cover" />
                ) : (
                  <Text style={styles.splashIconLetter}>{app.name.slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
              <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
                Mini-App konnte nicht geladen werden
              </Text>
              <Text style={[styles.errorText, { color: colors.textSecondary }]}>
                Bitte überprüfe deine Verbindung und versuch es erneut.
              </Text>
              <Pressable
                onPress={handleRetry}
                style={({ pressed }) => [
                  styles.errorRetry,
                  { backgroundColor: colors.primary },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.errorRetryText}>Erneut versuchen</Text>
              </Pressable>
            </View>
          )}

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

        {/* Version-2 consent: what the app may know, over the splash on open */}
        <MiniAppConsentSheet
          visible={!!consent}
          appName={app.name}
          iconUrl={app.iconUrl}
          items={consent?.items ?? NO_ITEMS}
          busy={consentBusy}
          verified={!app.preview}
          connected={consentConnected}
          onAllow={handleConsentAllow}
          onLater={handleConsentLater}
        />

        {/* Floating notification opt-in (first open of notification-capable apps) */}
        <MiniAppNotificationSheet
          visible={notifVisible}
          app={app}
          busy={notifBusy}
          onEnable={handleNotifEnable}
          onDismiss={handleNotifDismiss}
        />

        {/* Host-owned reward celebration — the same native Münzen screen as
            the daily mint / tasks / event scans, for EVERY mini-app grant. */}
        <MuenzenRewardOverlay
          visible={rewardShow.visible}
          loading={rewardShow.loading}
          loadingLabel={[
            'Münzen werden abgeholt…',
            'Einen Moment noch…',
            'Fast geschafft…',
            'Gleich ist es soweit…',
          ]}
          amount={rewardShow.amount}
          subtitle={rewardShow.subtitle}
          unit="Münzen"
          replayKey={rewardShow.replayKey}
          onClose={() => setRewardShow((c) => ({ ...c, visible: false }))}
        />
      </SafeAreaView>
    </Modal>
  );
}

const SHEET_RADIUS = 24;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CHROME_BG },
  previewBanner: {
    color: CHROME_TEXT,
    opacity: 0.7,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
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
    ...StyleSheet.absoluteFill,
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
  errorTitle: {
    marginTop: 24,
    paddingHorizontal: 40,
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 6,
    paddingHorizontal: 40,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorRetry: {
    marginTop: 20,
    height: 44,
    paddingHorizontal: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorRetryText: {
    color: '#fff',
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
  },
});
