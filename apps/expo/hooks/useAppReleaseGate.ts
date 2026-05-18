import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import type { AppReleaseConfig } from '@/lib/types';
import { compareVersions } from '@/lib/utils/version';
import {
  DEFAULT_ANDROID_STORE_URL,
  DEFAULT_IOS_STORE_URL,
} from '@/constants/app-store';

type UseAppReleaseGateResult = {
  shouldShow: boolean;
  currentVersion: string;
  latestVersion: string;
  storeUrl: string;
  title: string;
  body: string;
  ctaLabel: string;
  dismissLabel: string;
  dismiss: () => void;
};

const DEFAULT_TITLE = 'Update verfügbar';
const DEFAULT_BODY =
  'Eine neue Version der Röbel App ist verfügbar. Aktualisiere jetzt, um die neuesten Funktionen und Verbesserungen zu erhalten.';
const DEFAULT_CTA = 'Jetzt aktualisieren';
const DEFAULT_DISMISS = 'Später';

/**
 * Watches the singleton `app_release_config` row and decides whether the
 * "Update available" modal should be shown.
 *
 * Dismiss is session-only: the boolean lives in state (no AsyncStorage), so
 * dismissing hides the modal until the next cold launch OR the next
 * background → foreground transition, whichever comes first.
 */
export function useAppReleaseGate(): UseAppReleaseGateResult {
  const [config, setConfig] = useState<AppReleaseConfig | null>(null);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);
  const mountedRef = useRef(true);

  const fetchConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('app_release_config')
        .select('*')
        .eq('id', 1)
        .single();

      if (error) throw error;
      if (mountedRef.current) {
        setConfig(data as AppReleaseConfig);
      }
    } catch {
      if (mountedRef.current) setConfig(null);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchConfig();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchConfig]);

  // Re-fetch + re-arm dismissal whenever the app comes back to foreground.
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        setDismissedThisSession(false);
        fetchConfig();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [fetchConfig]);

  const dismiss = useCallback(() => {
    setDismissedThisSession(true);
  }, []);

  const currentVersion = Constants.expoConfig?.version ?? '0.0.0';
  const isIos = Platform.OS === 'ios';

  const latestVersion = isIos
    ? config?.ios_latest_version ?? '0.0.0'
    : config?.android_latest_version ?? '0.0.0';

  const storeUrl = isIos
    ? (config?.ios_store_url && config.ios_store_url.length > 0
        ? config.ios_store_url
        : DEFAULT_IOS_STORE_URL)
    : (config?.android_store_url && config.android_store_url.length > 0
        ? config.android_store_url
        : DEFAULT_ANDROID_STORE_URL);

  const title = config?.title_de || DEFAULT_TITLE;
  const body = config?.body_de || DEFAULT_BODY;
  const ctaLabel = config?.cta_label_de || DEFAULT_CTA;
  const dismissLabel = config?.dismiss_label_de || DEFAULT_DISMISS;

  const outOfDate =
    !!config &&
    config.is_active &&
    compareVersions(currentVersion, latestVersion) < 0;

  const shouldShow = outOfDate && !dismissedThisSession;

  return {
    shouldShow,
    currentVersion,
    latestVersion,
    storeUrl,
    title,
    body,
    ctaLabel,
    dismissLabel,
    dismiss,
  };
}
