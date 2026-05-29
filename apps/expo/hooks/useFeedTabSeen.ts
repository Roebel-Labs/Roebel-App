import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FeedType } from '@/lib/types/feed';

/**
 * Tracks when the user last viewed each feed tab so FeedHome can show a "new
 * content" dot on inactive tabs. Device-local + global (not account-scoped),
 * mirroring the read-id pattern in useNotificationInbox.
 *
 * Only the tabs that carry a dot are tracked (rathaus, app). On first ever run
 * we baseline both to "now" so a fresh install doesn't dot pre-existing content.
 */

const STORAGE_KEY = '@feed_tab_seen';
type TrackedTab = Extract<FeedType, 'rathaus' | 'app'>;
type SeenMap = Partial<Record<TrackedTab, string>>;

export function useFeedTabSeen() {
  const [lastSeen, setLastSeen] = useState<SeenMap>({});
  const [loaded, setLoaded] = useState(false);
  const lastSeenRef = useRef<SeenMap>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as SeenMap;
          lastSeenRef.current = parsed;
          setLastSeen(parsed);
        } else {
          // First run: baseline both tabs to now.
          const now = new Date().toISOString();
          const baseline: SeenMap = { rathaus: now, app: now };
          lastSeenRef.current = baseline;
          setLastSeen(baseline);
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(baseline)).catch(() => {});
        }
      } catch (err) {
        console.error('Error loading feed tab seen state:', err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markSeen = useCallback((tab: TrackedTab) => {
    const now = new Date().toISOString();
    const next = { ...lastSeenRef.current, [tab]: now };
    lastSeenRef.current = next;
    setLastSeen(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  return { lastSeen, markSeen, loaded };
}
