import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { fetchAllUserInterests } from '@/lib/supabase-interests';
import HorizontalEventCard from '@/components/HorizontalEventCard';
import type { EventRecord } from '@/lib/types';

type Props = {
  walletAddress: string;
};

/**
 * Events the user is interested in — shown on the "Veranstaltungen" tab of
 * the public profile. Queries `event_interests` via fetchAllUserInterests,
 * then batch-loads the event rows.
 */
export default function UserEventsList({ walletAddress }: Props) {
  const { colors } = useTheme();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const ids = await fetchAllUserInterests(walletAddress);
      if (cancelled) return;
      if (ids.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('events')
        .select('*')
        .in('id', ids)
        .eq('status', 'approved')
        .order('date', { ascending: true });
      if (!cancelled) {
        setEvents((data as EventRecord[] | null) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  if (loading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
          Noch keine Veranstaltungen markiert
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {events.map((event) => (
        <HorizontalEventCard key={event.id} event={event} fullWidth />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  empty: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
