import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, Stack } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useVerificationContext } from '@/context/VerificationContext';
import { useActiveAccount } from 'thirdweb/react';
import Skeleton from '@/components/ui/Skeleton';
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
  const { hasCitizenNFT } = useVerificationContext();

  const [events, setEvents] = useState<EventWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AccountRole | null>(null);

  const isOrg = activeAccount?.account_type === 'organisation';
  // Only CitizenNFT holders may create reward-bearing event QRs. Gate on the LIVE on-chain
  // check (useVerificationContext), not the DB is_verified_citizen flag — that flag is stale
  // for citizens verified on Gnosis. The mini-app + edge fn re-check CitizenNFT server-side too.
  const isCitizen = hasCitizenNFT;

  const openCreateQr = useCallback(() => {
    const base = process.env.EXPO_PUBLIC_CIRCLES_INVITER_URL || 'https://circles-inviter.vercel.app';
    void openBrowserAsync(`${base}?inviter=${account?.address ?? ''}`);
  }, [account?.address]);

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

    // Org accounts see only their own events (newest first).
    // Personal/citizen accounts see ALL events (every status), upcoming first.
    let query = supabase.from('events').select('*');
    if (isOrg) {
      query = query.eq('account_id', activeAccount.id).order('date', { ascending: false });
    } else {
      query = query.order('date', { ascending: true });
    }

    const { data, error } = await query;

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
  }, [activeAccount?.id, account?.address, isOrg]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const renderEventRow = ({ item }: { item: EventWithStats }) => {
    const status = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;

    return (
      <Pressable
        onPress={() => {
          // Only org accounts may edit their own events; the citizen "all events"
          // view is read-only since those events belong to other accounts.
          if (isOrg && canEditEvents(role)) {
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

      {isCitizen && (
        <Pressable
          onPress={openCreateQr}
          style={({ pressed }) => [styles.qrCta, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Event-QR-Code erstellen"
        >
          <Text style={styles.qrCtaText}>＋ Event-QR-Code erstellen</Text>
        </Pressable>
      )}

      {loading ? (
        <View style={styles.list}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[styles.eventRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Skeleton width={60} height={60} radius={8} />
              <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
                <Skeleton width={170} height={14} radius={6} />
                <Skeleton width={100} height={11} radius={6} />
                <Skeleton width={120} height={18} radius={10} />
              </View>
            </View>
          ))}
        </View>
      ) : events.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {isOrg ? 'Noch keine Veranstaltungen erstellt' : 'Keine Veranstaltungen vorhanden'}
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
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
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
  qrCta: {
    marginHorizontal: 16,
    marginTop: 12,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCtaText: {
    color: '#fff',
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
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
