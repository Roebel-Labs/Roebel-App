import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import BottomNavigation from '@/components/BottomNavigation';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { useLocation } from '@/context/LocationContext';

import {
  fetchNextDepartures,
  fetchTransitLines,
  TRANSIT_MODE_COLORS,
  TRANSIT_MODE_EMOJIS,
  TRANSIT_MODE_LABELS_DE,
  type NextDeparture,
  type TransitLine,
  type TransitMode,
} from '@/lib/supabase-transit';

const MODE_FILTERS: { mode: TransitMode | 'all'; label: string }[] = [
  { mode: 'all', label: 'Alle' },
  { mode: 'bus_regio', label: 'Linie 12' },
  { mode: 'bus_city', label: 'Stadtbus' },
  { mode: 'bus_park', label: 'Nationalpark' },
  { mode: 'ferry', label: 'Schiff' },
  { mode: 'buergerbus', label: 'Elli-Bus' },
];

export default function TransitScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { location } = useLocation();

  const [departures, setDepartures] = useState<NextDeparture[]>([]);
  const [lines, setLines] = useState<TransitLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<TransitMode | 'all'>('all');

  useEffect(() => {
    void load();
  }, [location?.coords?.latitude, location?.coords?.longitude]);

  async function load() {
    setLoading(true);
    const [dep, l] = await Promise.all([
      fetchNextDepartures({
        lat: location?.coords.latitude,
        lon: location?.coords.longitude,
        limit: 30,
      }),
      fetchTransitLines(),
    ]);
    setDepartures(dep);
    setLines(l);
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = useMemo(
    () => (filter === 'all' ? departures : departures.filter((d) => d.line.mode === filter)),
    [departures, filter]
  );

  const elliLine = lines.find((l) => l.mode === 'buergerbus');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surfaceSecondary }]}
        >
          <ArrowLeftIcon size={24} color={colors.tabIconActive} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Verkehr · Heute</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Mode filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {MODE_FILTERS.map((f) => {
          const active = filter === f.mode;
          return (
            <Pressable
              key={f.mode}
              onPress={() => setFilter(f.mode)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? colors.tabIconActive : colors.surface,
                  borderColor: active ? 'transparent' : colors.border,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.filterText,
                  { color: active ? '#fff' : colors.textSecondary },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tabIconActive} />
        }
      >
        {/* Elli-Bus call-based card (always visible at top) */}
        {elliLine && (filter === 'all' || filter === 'buergerbus') ? (
          <View
            style={[
              styles.elliCard,
              { backgroundColor: TRANSIT_MODE_COLORS.buergerbus + '1A', borderColor: TRANSIT_MODE_COLORS.buergerbus },
            ]}
          >
            <Text style={styles.elliEmoji}>💛</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.elliTitle, { color: colors.textPrimary }]}>
                {elliLine.name_de}
              </Text>
              <Text style={[styles.elliSub, { color: colors.textSecondary }]}>
                {elliLine.notes_de}
              </Text>
              <View style={styles.elliButtonRow}>
                {elliLine.call_phone ? (
                  <Pressable
                    onPress={() =>
                      Linking.openURL(`tel:${elliLine.call_phone!.replace(/\s+/g, '')}`)
                    }
                    style={[styles.elliButton, { backgroundColor: TRANSIT_MODE_COLORS.buergerbus }]}
                  >
                    <Text style={styles.elliButtonText}>Reservieren · anrufen</Text>
                  </Pressable>
                ) : null}
                {elliLine.call_email ? (
                  <Pressable
                    onPress={() => Linking.openURL(`mailto:${elliLine.call_email}`)}
                    style={[styles.elliButtonSecondary, { borderColor: TRANSIT_MODE_COLORS.buergerbus }]}
                  >
                    <Text
                      style={[styles.elliButtonSecondaryText, { color: TRANSIT_MODE_COLORS.buergerbus }]}
                    >
                      E-Mail
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.tabIconActive} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Heute keine weiteren Abfahrten
            </Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Mecky empfiehlt: Morgen früh schauen oder den Elli-Bus rufen.
            </Text>
          </View>
        ) : (
          filtered.map((d) => (
            <DepartureRow key={d.departure.id} item={d} colors={colors} />
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <BottomNavigation activeTab="explore" onTabPress={(t) => {
        if (t === 'home') router.replace('/');
        else if (t === 'explore') router.replace('/explore');
        else if (t === 'profile') router.replace('/profile');
      }} />
    </SafeAreaView>
  );
}

function DepartureRow({ item, colors }: { item: NextDeparture; colors: any }) {
  const { line, stop, departure, distance_km } = item;
  const color = TRANSIT_MODE_COLORS[line.mode];
  const emoji = TRANSIT_MODE_EMOJIS[line.mode];
  const time = departure.departure_time.slice(0, 5);
  const router = useRouter();

  return (
    <Pressable
      style={[styles.depRow, { backgroundColor: colors.surface }]}
      onPress={() =>
        router.push({ pathname: '/transit/line/[code]', params: { code: line.code } } as any)
      }
    >
      <View style={[styles.depColorBar, { backgroundColor: color }]} />
      <View style={{ flex: 1, padding: 12 }}>
        <View style={styles.depHeader}>
          <Text style={styles.depEmoji}>{emoji}</Text>
          <View style={[styles.depBadge, { backgroundColor: color + '22' }]}>
            <Text style={[styles.depBadgeText, { color }]}>{line.code}</Text>
          </View>
          {line.free_with_gaestekarte ? (
            <View style={[styles.depTag, { backgroundColor: '#2B9348' + '22' }]}>
              <Text style={[styles.depTagText, { color: '#2B9348' }]}>Gästekarte gratis</Text>
            </View>
          ) : null}
          {line.carries_bikes ? (
            <View style={[styles.depTag, { backgroundColor: '#E85D04' + '22' }]}>
              <Text style={[styles.depTagText, { color: '#E85D04' }]}>🚲</Text>
            </View>
          ) : null}
          {departure.is_last_of_day ? (
            <View style={[styles.depTag, { backgroundColor: '#D62828' + '22' }]}>
              <Text style={[styles.depTagText, { color: '#D62828' }]}>Letzte heute</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.depTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {departure.trip_label_de || line.name_de}
        </Text>
        {departure.destination_de ? (
          <Text style={[styles.depDest, { color: colors.textSecondary }]} numberOfLines={1}>
            → {departure.destination_de}
          </Text>
        ) : null}
        <View style={styles.depBottomRow}>
          <Text style={[styles.depTime, { color }]}>{time}</Text>
          <Text style={[styles.depMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {stop?.name_de}
            {distance_km != null ? ` · ${distance_km < 1 ? `${Math.round(distance_km * 1000)} m` : `${distance_km.toFixed(1)} km`} entfernt` : ''}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 16,
    minHeight: 36,
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterText: { fontSize: 13, fontFamily: 'Inter-Medium' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 6 },
  elliCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  elliEmoji: { fontSize: 30 },
  elliTitle: { fontSize: 16, fontFamily: 'Inter-SemiBold', marginBottom: 6 },
  elliSub: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18, marginBottom: 12 },
  elliButtonRow: { flexDirection: 'row', gap: 8 },
  elliButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  elliButtonText: { color: '#000', fontFamily: 'Inter-Medium', fontSize: 13 },
  elliButtonSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  elliButtonSecondaryText: { fontFamily: 'Inter-Medium', fontSize: 13 },
  loadingBox: { padding: 40, alignItems: 'center' },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter-Medium', marginBottom: 4 },
  emptySub: { fontSize: 13, fontFamily: 'Inter-Regular', textAlign: 'center' },
  depRow: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
  },
  depColorBar: { width: 4 },
  depHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  depEmoji: { fontSize: 16 },
  depBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  depBadgeText: { fontSize: 12, fontFamily: 'Inter-SemiBold' },
  depTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  depTagText: { fontSize: 11, fontFamily: 'Inter-Medium' },
  depTitle: { fontSize: 14, fontFamily: 'Inter-Medium' },
  depDest: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  depBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  depTime: { fontSize: 18, fontFamily: 'Inter-SemiBold' },
  depMeta: { fontSize: 12, fontFamily: 'Inter-Regular', flex: 1 },
});
