/**
 * ConsentContext — single source of truth for DSGVO consent state.
 *
 * Mounted high in the provider tree (above ThirdwebProvider and PostHogProvider
 * so it can gate them), but below SafeAreaProvider + ThemeProvider so the
 * consent UI can read theme tokens.
 *
 * Loads from expo-secure-store on mount, mirrors every change to Supabase
 * (debounced 500ms), and notifies React subscribers via context.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  ACCEPT_ALL_PREFERENCES,
  CONSENT_CATEGORIES,
  DEFAULT_PREFERENCES,
  PRIVACY_POLICY_VERSION,
  SMART_REPROMPT,
  type ConsentCategoryId,
  type ConsentPreferences,
  type ConsentSource,
} from '@/constants/consent';
import {
  loadConsent,
  loadDeviceId,
  loadGrandfatherBannerDismissed,
  loadPromptState,
  loadVersion,
  loadWalletReconciled,
  saveConsent,
  savePromptState,
  saveVersion,
  setGrandfatherBannerDismissed,
  setWalletReconciled,
  type PromptState,
} from '@/lib/consent-storage';
import {
  fetchAuditHistory,
  logBannerDismissal,
  logSpecialEvent,
  mirrorConsent,
  reconcileWalletAddress,
  type AuditLogEntry,
} from '@/lib/consent-supabase';

type ContextValue = {
  /** True once SecureStore has been read at least once. Children should render skeletons until ready. */
  ready: boolean;
  preferences: ConsentPreferences;
  policyVersion: string;
  storedPolicyVersion: string | null;
  deviceId: string | null;
  walletAddress: string | null;

  /** No stored prefs and no grandfather signal — show the full-screen modal. */
  needsConsent: boolean;
  /** Stored version differs from current — show the re-consent sheet. */
  needsReconsent: boolean;
  /** Grandfathered to all-true; show one-time banner pointing at customize. */
  showGrandfatherBanner: boolean;

  setPreference: (id: ConsentCategoryId, value: boolean, source?: ConsentSource) => Promise<void>;
  acceptAll: (source?: ConsentSource) => Promise<void>;
  rejectAll: (source?: ConsentSource) => Promise<void>;
  acceptEssential: (source?: ConsentSource) => Promise<void>;

  /** Called by UserContext when the wallet appears. Idempotent. */
  reconcileWallet: (walletAddress: string) => Promise<void>;
  /** Called by UserContext when an existing user (terms_accepted_at != null) appears with no consent record. */
  applyGrandfather: () => Promise<void>;
  /** Dismiss the grandfather banner forever. */
  dismissGrandfatherBanner: () => Promise<void>;

  /** Confirm a re-consent prompt — bumps stored version and writes audit entry. */
  confirmReconsent: () => Promise<void>;

  /** Smart contextual re-prompt logic. */
  shouldShowContextualBanner: (id: ConsentCategoryId) => boolean;
  recordContextualDismiss: (id: ConsentCategoryId) => Promise<void>;

  fetchHistory: (limit?: number) => Promise<AuditLogEntry[]>;
};

const ConsentContext = createContext<ContextValue | undefined>(undefined);

const MIRROR_DEBOUNCE_MS = 500;

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>(DEFAULT_PREFERENCES);
  const [storedPolicyVersion, setStoredPolicyVersion] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [hasStoredConsent, setHasStoredConsent] = useState(false);
  const [grandfatherBannerVisible, setGrandfatherBannerVisible] = useState(false);
  const [promptState, setPromptState] = useState<PromptState>({
    lastPromptAt: null,
    promptCount: 0,
    contextualDismissals: {},
  });

  const previousPrefsRef = useRef<ConsentPreferences | null>(null);
  const mirrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMirrorRef = useRef<{
    next: ConsentPreferences;
    source: ConsentSource;
  } | null>(null);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [
        storedPrefs,
        version,
        id,
        promptStateLoaded,
        bannerDismissed,
      ] = await Promise.all([
        loadConsent(),
        loadVersion(),
        loadDeviceId(),
        loadPromptState(),
        loadGrandfatherBannerDismissed(),
      ]);
      if (cancelled) return;

      setDeviceId(id);
      setStoredPolicyVersion(version);
      setPromptState(promptStateLoaded);

      if (storedPrefs) {
        setPreferences(storedPrefs);
        previousPrefsRef.current = storedPrefs;
        setHasStoredConsent(true);
        setGrandfatherBannerVisible(false);
        // bannerDismissed flag only matters once we've grandfathered. If we
        // already have stored prefs we never show the banner.
        void bannerDismissed;
      } else {
        setHasStoredConsent(false);
      }

      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cleanup pending debounced mirror on unmount.
  useEffect(() => {
    return () => {
      if (mirrorTimerRef.current) clearTimeout(mirrorTimerRef.current);
    };
  }, []);

  // Re-evaluate prompt-state on app foreground (so contextual cooldowns refresh).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        loadPromptState().then((s) => setPromptState(s));
      }
    });
    return () => sub.remove();
  }, []);

  const scheduleMirror = useCallback(
    (next: ConsentPreferences, source: ConsentSource) => {
      pendingMirrorRef.current = { next, source };
      if (mirrorTimerRef.current) clearTimeout(mirrorTimerRef.current);
      mirrorTimerRef.current = setTimeout(() => {
        const pending = pendingMirrorRef.current;
        if (!pending || !deviceId) return;
        const previous = previousPrefsRef.current;
        previousPrefsRef.current = pending.next;
        void mirrorConsent({
          deviceId,
          walletAddress,
          previous,
          next: pending.next,
          source: pending.source,
        });
        pendingMirrorRef.current = null;
      }, MIRROR_DEBOUNCE_MS);
    },
    [deviceId, walletAddress]
  );

  const persist = useCallback(
    async (next: ConsentPreferences, source: ConsentSource) => {
      const sanitized: ConsentPreferences = { ...next, essential: true };
      setPreferences(sanitized);
      setHasStoredConsent(true);
      await saveConsent(sanitized);
      await saveVersion(PRIVACY_POLICY_VERSION);
      setStoredPolicyVersion(PRIVACY_POLICY_VERSION);
      scheduleMirror(sanitized, source);
    },
    [scheduleMirror]
  );

  const setPreference = useCallback(
    async (id: ConsentCategoryId, value: boolean, source: ConsentSource = 'customize_screen') => {
      const next: ConsentPreferences = { ...preferences, [id]: value };
      // Toggling a category back on resets its contextual dismissal counter.
      if (value && promptState.contextualDismissals[id]) {
        const updatedPromptState: PromptState = {
          ...promptState,
          contextualDismissals: { ...promptState.contextualDismissals, [id]: [] },
        };
        setPromptState(updatedPromptState);
        await savePromptState(updatedPromptState);
      }
      await persist(next, source);
    },
    [preferences, persist, promptState]
  );

  const acceptAll = useCallback(
    async (source: ConsentSource = 'first_launch') => {
      await persist(ACCEPT_ALL_PREFERENCES, source);
      // Reset all contextual dismissals on accept-all.
      const reset: PromptState = {
        ...promptState,
        contextualDismissals: {},
      };
      setPromptState(reset);
      await savePromptState(reset);
    },
    [persist, promptState]
  );

  const rejectAll = useCallback(
    async (source: ConsentSource = 'customize_screen') => {
      await persist(DEFAULT_PREFERENCES, source);
    },
    [persist]
  );

  const acceptEssential = useCallback(
    async (source: ConsentSource = 'first_launch') => {
      await persist(DEFAULT_PREFERENCES, source);
    },
    [persist]
  );

  const reconcileWallet = useCallback(
    async (incoming: string) => {
      setWalletAddress(incoming);
      if (!deviceId) return;
      const reconciledFor = await loadWalletReconciled();
      if (reconciledFor === incoming) return;
      await reconcileWalletAddress({ deviceId, walletAddress: incoming });
      await setWalletReconciled(incoming);
    },
    [deviceId]
  );

  const applyGrandfather = useCallback(async () => {
    if (hasStoredConsent || !deviceId) return;
    await persist(ACCEPT_ALL_PREFERENCES, 'migration');
    await logSpecialEvent({
      deviceId,
      walletAddress,
      category: '__migration__',
      source: 'migration',
    });
    const dismissed = await loadGrandfatherBannerDismissed();
    setGrandfatherBannerVisible(!dismissed);
  }, [hasStoredConsent, deviceId, walletAddress, persist]);

  const dismissGrandfatherBanner = useCallback(async () => {
    setGrandfatherBannerVisible(false);
    await setGrandfatherBannerDismissed();
  }, []);

  const confirmReconsent = useCallback(async () => {
    await saveVersion(PRIVACY_POLICY_VERSION);
    setStoredPolicyVersion(PRIVACY_POLICY_VERSION);
    if (deviceId) {
      scheduleMirror(preferences, 'reconsent');
    }
  }, [deviceId, preferences, scheduleMirror]);

  const shouldShowContextualBanner = useCallback(
    (id: ConsentCategoryId) => {
      if (preferences[id]) return false;
      const dismissals = promptState.contextualDismissals[id] ?? [];
      const cutoff = Date.now() - SMART_REPROMPT.windowMs;
      const recent = dismissals.filter((ts) => ts > cutoff);
      return recent.length < SMART_REPROMPT.maxDismissals;
    },
    [preferences, promptState]
  );

  const recordContextualDismiss = useCallback(
    async (id: ConsentCategoryId) => {
      const prev = promptState.contextualDismissals[id] ?? [];
      const cutoff = Date.now() - SMART_REPROMPT.windowMs;
      const next = [...prev.filter((ts) => ts > cutoff), Date.now()];
      const updated: PromptState = {
        ...promptState,
        contextualDismissals: { ...promptState.contextualDismissals, [id]: next },
      };
      setPromptState(updated);
      await savePromptState(updated);
      if (deviceId) {
        void logBannerDismissal({ deviceId, walletAddress, category: id });
      }
    },
    [promptState, deviceId, walletAddress]
  );

  const fetchHistory = useCallback(
    async (limit?: number) => {
      if (!deviceId) return [];
      return fetchAuditHistory({ deviceId, limit });
    },
    [deviceId]
  );

  const needsConsent = ready && !hasStoredConsent;
  const needsReconsent =
    ready &&
    hasStoredConsent &&
    storedPolicyVersion !== null &&
    storedPolicyVersion !== PRIVACY_POLICY_VERSION;

  const value = useMemo<ContextValue>(
    () => ({
      ready,
      preferences,
      policyVersion: PRIVACY_POLICY_VERSION,
      storedPolicyVersion,
      deviceId,
      walletAddress,
      needsConsent,
      needsReconsent,
      showGrandfatherBanner: grandfatherBannerVisible,
      setPreference,
      acceptAll,
      rejectAll,
      acceptEssential,
      reconcileWallet,
      applyGrandfather,
      dismissGrandfatherBanner,
      confirmReconsent,
      shouldShowContextualBanner,
      recordContextualDismiss,
      fetchHistory,
    }),
    [
      ready,
      preferences,
      storedPolicyVersion,
      deviceId,
      walletAddress,
      needsConsent,
      needsReconsent,
      grandfatherBannerVisible,
      setPreference,
      acceptAll,
      rejectAll,
      acceptEssential,
      reconcileWallet,
      applyGrandfather,
      dismissGrandfatherBanner,
      confirmReconsent,
      shouldShowContextualBanner,
      recordContextualDismiss,
      fetchHistory,
    ]
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    throw new Error('useConsent must be used within ConsentProvider');
  }
  return ctx;
}

export function useConsentCategory(id: ConsentCategoryId): boolean {
  const { preferences } = useConsent();
  return preferences[id];
}

export const CONSENT_CATEGORY_LIST = CONSENT_CATEGORIES;
