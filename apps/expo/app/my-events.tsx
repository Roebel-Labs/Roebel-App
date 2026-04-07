import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, Stack } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useActiveAccount } from 'thirdweb/react';
import { supabase } from '@/lib/supabase';
import { EventRecord } from '@/lib/types';
import { ArrowLeftIcon, HeartIcon, EyeIcon } from '@/components/Icons';
import { formatDate } from '@/lib/utils';
import { getInterestCount } from '@/lib/supabase-interests';
import { getViewCount } from '@/lib/supabase-event-views';
import { getAccountRole, canEditEvents, AccountRole } from '@/lib/supabase-account-roles';

type EventWithStats = EventRecord & {
  viewCount: number;
  interestCount: number;
};

const STATUS_CONFIG = {
  approved: { label: 'Genehmigt', color: '#4CAF50' },
  pending: { label: 'Ausstehend', color: '#FFA726' },
  rejected: { label: 'Abgelehnt', color: '#E53935' },
} as const;

export default function MyEventsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const account = useActiveAccount();

  const [events, setEvents] = useState<EventWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AccountRole | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!activeAccount?.id) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Fetch role
    if (account?.address) {
      const userRole = await getAccountRole(activeAccount.id, account.address);
      setRole(userRole);
    }

    // Fetch events for active account
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('account_id', activeAccount.id)
      .order('date', { ascending: false });

    if (error || !data) {
      setEvents([]);
      setLoading(false);
      return;
    }

    // Fetch stats in parallel
    const eventsWithStats = await Promise.all(
      (data as EventRecord[]).map(async (event) => {
        const [viewCount, interestCount] = await Promise.all([
          getViewCount(event.id),
          getInterestCount(event.id),
        ]);
        return { ...event, viewCount, interestCount };
      })
    );

    setEvents(eventsWithStats);
    setLoading(false);
  }, [activeAccount?.id, account?.address]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const renderEventRow = ({ item }: { item: EventWithStats }) => {
    const status = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;

    return (
      <Pressable
        onPress={() => {
          if (canEditEvents(role)) {
            router.push({ pathname: '/edit-event/[id]', params: { id: item.id } });
          } else {
            router.push({ pathname: '/event/[id]', params: { id: item.id } });
          }
        }}
        style={({ pressed }) => [
          styles.eventRow,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && styles.eventRowPressed,
        ]}
      >
        <View style={styles.thumbnailWrap}>
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={[styles.thumbnail, { backgroundColor: colors.cardPlaceholder }]}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.thumbnail, { backgroundColor: colors.cardPlaceholder }]} />
          )}
        </View>

        <View style={styles.eventInfo}>
          <Text style={[styles.eventTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
            {formatDate(item.date)}
          </Text>

          <View style={styles.statusStatsRow}>
            <View style={[styles.statusBadge, { backgroundColor: status.color + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: status.color }]} />
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <EyeIcon size={14} color={colors.textTertiary} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>{item.viewCount}</Text>
              </View>
              <View style={styles.statItem}>
                <HeartIcon size={14} color={colors.textTertiary} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>{item.interestCount}</Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeftIcon size={24} color={colors.textPrimary} strokeWidth={1.5} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Meine Veranstaltungen</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Noch keine Veranstaltungen erstellt
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          renderItem={renderEventRow}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 32,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  eventRow: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: 1,
  },
  eventRowPressed: {
    opacity: 0.8,
  },
  thumbnailWrap: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  eventInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  eventTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  eventDate: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  statusStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
});
