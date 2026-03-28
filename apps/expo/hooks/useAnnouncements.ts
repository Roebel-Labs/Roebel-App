import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { AnnouncementRecord } from '@/lib/types';
import { compareVersions } from '@/lib/utils/version';

const POLL_INTERVAL_MS = 60_000;
const DISMISSED_KEY_PREFIX = '@announcement_dismissed_';

type UseAnnouncementsResult = {
  announcement: AnnouncementRecord | null;
  loading: boolean;
  dismiss: (id: string) => Promise<void>;
};

export function useAnnouncements(): UseAnnouncementsResult {
  const [announcement, setAnnouncement] = useState<AnnouncementRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissedLoaded = useRef(false);

  // Load dismissed IDs from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const announcementKeys = keys.filter(k => k.startsWith(DISMISSED_KEY_PREFIX));
        const ids = announcementKeys.map(k => k.replace(DISMISSED_KEY_PREFIX, ''));
        setDismissedIds(new Set(ids));
      } catch {
        // ignore
      } finally {
        dismissedLoaded.current = true;
      }
    })();
  }, []);

  const fetchData = useCallback(async () => {
    if (!dismissedLoaded.current) return;

    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order('priority', { ascending: false })
        .limit(5);

      if (error) throw error;

      const allAnnouncements = (data as AnnouncementRecord[]) || [];
      const appVersion = Constants.expoConfig?.version;

      // Filter by app version constraints
      const announcements = allAnnouncements.filter(a => {
        if (a.min_app_version && appVersion && compareVersions(appVersion, a.min_app_version) < 0) return false;
        if (a.max_app_version && appVersion && compareVersions(appVersion, a.max_app_version) > 0) return false;
        return true;
      });

      const visible = announcements.find(a =>
        !a.show_once || !dismissedIds.has(a.id)
      );
      setAnnouncement(visible || null);
    } catch {
      setAnnouncement(null);
    } finally {
      setLoading(false);
    }
  }, [dismissedIds]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') fetchData();
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [fetchData]);

  const dismiss = useCallback(async (id: string) => {
    try {
      await AsyncStorage.setItem(`${DISMISSED_KEY_PREFIX}${id}`, 'true');
      setDismissedIds(prev => new Set([...prev, id]));
      setAnnouncement(null);
    } catch {
      // ignore storage errors
    }
  }, []);

  return { announcement, loading, dismiss };
}
