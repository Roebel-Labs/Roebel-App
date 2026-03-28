import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';
import { EventRecord } from '@/lib/types';

type UseLivestreamResult = {
  liveEvents: EventRecord[];
  primaryLiveEvent: EventRecord | null;
  loading: boolean;
  refetch: () => Promise<void>;
};

const POLL_INTERVAL_MS = 60_000;

export function useLivestream(): UseLivestreamResult {
  const [liveEvents, setLiveEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('livestream_active', true)
        .eq('status', 'approved')
        .order('date', { ascending: true })
        .order('time', { ascending: true, nullsFirst: true });

      if (error) throw error;
      setLiveEvents((data as EventRecord[]) || []);
    } catch {
      setLiveEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  return {
    liveEvents,
    primaryLiveEvent: liveEvents[0] || null,
    loading,
    refetch: fetchData,
  };
}
