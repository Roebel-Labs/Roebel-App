import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import BottomNavigation from '@/components/BottomNavigation';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';

import {
  fetchTours,
  fetchMeckysTippToday,
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS_DE,
  HOURS_LABELS_DE,
  type TourFilters,
  type TourHoursBucket,
  type TourRecord,
} from '@/lib/supabase-tours';

const HOURS_OPTIONS: { value: TourHoursBucket | 'all'; label: string }[] = [
  { value: 'all', label: 'Alle Zeiten' },
  { value: '2h', label: '~ 2 h' },
  { value: '4h', label: '~ 4 h' },
  { value: 'tag', label: 'Ganztag' },
  { value: 'mehrtag', label: 'Mehrtag' },
];

const CATEGORY_OPTIONS: { value: string | 'all'; label: string }[] = [
  { value: 'all', label: 'Alle Themen' },
  { value: 'familie', label: 'Familie' },
  { value: 'wildlife', label: 'Wildlife' },
  { value: 'faehre_kombi', label: 'Schiff-Kombi' },
  { value: 'schlechtwetter', label: 'Schlechtwetter' },
  { value: 'sonnenuntergang', label: 'Sonnenuntergang' },
  { value: 'sonnenaufgang', label: 'Sonnenaufgang' },
  { value: 'altstadt', label: 'Altstadt' },
  { value: 'naturpark', label: 'Nationalpark' },
];

export default function ToursScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [tours, setTours] = useState<TourRecord[]>([]);
  const [meckysTipp, setMeckysTipp] = useState<TourRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hoursFilter, setHoursFilter] = useState<TourHoursBucket | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
  const [sternfahrtOnly, setSternfahrtOnly] = useState(false);

  useEffect(() => {
    void load();
  }, [hoursFilter, categoryFilter, sternfahrtOnly]);

  async function load() {
    setLoading(true);
    const filters: TourFilters = {};
    if (hoursFilter !== 'all') filters.hours_bucket = hoursFilter;
    if (categoryFilter !== 'all') filters.category = categoryFilter;
    if (sternfahrtOnly) filters.is_sternfahrt = true;
    const [t, tipp] = await Promise.all([fetchTours(filters), fetchMeckysTippToday()]);
    setTours(t);
    setMeckysTipp(tipp);
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const visibleTours = useMemo(
    () => tours.filter((t) => !meckysTipp || t.id !== meckysTipp.id),
    [tours, meckysTipp]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surfaceSecondary }]}
        >
          <ArrowLeftIcon size={24} color={colors.tabIconActive} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Sternfahrten · Mecky-Touren
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter row 1 — hours */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {HOURS_OPTIONS.map((opt) => {
          const active = hoursFilter === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setHoursFilter(opt.value)}
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
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Filter row 2 — categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {CATEGORY_OPTIONS.map((opt) => {
          const active = categoryFilter === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setCategoryFilter(opt.value)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? '#00498B' : colors.surface,
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
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Sternfahrt toggle */}
      <View style={styles.toggleRow}>
        <Pressable
          onPress={() => setSternfahrtOnly((v) => !v)}
          style={[
            styles.toggle,
            {
              backgroundColor: sternfahrtOnly ? '#00498B' : colors.surface,
            },
          ]}
        >
          <Text
            style={[
              styles.toggleText,
              { color: sternfahrtOnly ? '#fff' : colors.textSecondary },
            ]}
          >
            ★ Nur Sternfahrten ab Röbel
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.tabIconActive}
          />
        }
      >
        {meckysTipp ? (
          <Pressable
            style={[styles.tippCard, { backgroundColor: '#FFF5E1', borderColor: '#FFB703' }]}
            onPress={() => router.push(`/tour/${meckysTipp.slug}` as any)}
          >
            <Text style={styles.tippLabel}>★ Mecky-Tipp heute</Text>
            <Text style={[styles.tippTitle, { color: '#00498B' }]}>{meckysTipp.title_de}</Text>
            {meckysTipp.subtitle_de ? (
              <Text style={[styles.tippSub, { color: '#374453' }]}>{meckysTipp.subtitle_de}</Text>
            ) : null}
            <View style={styles.tippMeta}>
              <Text style={[styles.tippMetaText, { color: '#6b7280' }]}>
                {meckysTipp.distance_km ? `${meckysTipp.distance_km} km` : ''} ·{' '}
                {meckysTipp.duration_min ? `${meckysTipp.duration_min} min` : ''} ·{' '}
                {DIFFICULTY_LABELS_DE[meckysTipp.difficulty]}
              </Text>
            </View>
          </Pressable>
        ) : null}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.tabIconActive} />
          </View>
        ) : visibleTours.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Keine Touren mit diesen Filtern
            </Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Mecky empfiehlt: Filter lockern oder andere Kategorie probieren.
            </Text>
          </View>
        ) : (
          visibleTours.map((tour) => <TourCard key={tour.id} tour={tour} colors={colors} />)
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <BottomNavigation
        activeTab="explore"
        onTabPress={(t) => {
          if (t === 'home') router.replace('/');
          else if (t === 'explore') router.replace('/explore');
          else if (t === 'profile') router.replace('/profile');
        }}
      />
    </SafeAreaView>
  );
}

function TourCard({ tour, colors }: { tour: TourRecord; colors: any }) {
  const router = useRouter();
  const difficulty = DIFFICULTY_COLORS[tour.difficulty];
  const tagLine: string[] = [];
  if (tour.distance_km != null) tagLine.push(`${tour.distance_km} km`);
  if (tour.duration_min != null) tagLine.push(`${formatDuration(tour.duration_min)}`);
  if (tour.hours_bucket) tagLine.push(HOURS_LABELS_DE[tour.hours_bucket]);

  return (
    <Pressable
      style={[styles.tourCard, { backgroundColor: colors.surface }]}
      onPress={() => router.push(`/tour/${tour.slug}` as any)}
    >
      <View style={styles.tourHeaderRow}>
        <Text style={[styles.tourTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {tour.title_de}
        </Text>
        <View style={[styles.diffPill, { backgroundColor: difficulty + '22' }]}>
          <Text style={[styles.diffText, { color: difficulty }]}>
            {DIFFICULTY_LABELS_DE[tour.difficulty]}
          </Text>
        </View>
      </View>
      {tour.subtitle_de ? (
        <Text style={[styles.tourSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {tour.subtitle_de}
        </Text>
      ) : null}
      <Text style={[styles.tourMeta, { color: colors.textSecondary }]}>
        {tagLine.join(' · ')}
        {tour.start_label_de ? ` · ab ${tour.start_label_de}` : ''}
      </Text>
      <View style={styles.tagRow}>
        {tour.is_sternfahrt ? <FlagPill label="Sternfahrt" color="#00498B" /> : null}
        {tour.ferry_combo ? <FlagPill label="⛴️ Schiff" color="#00A6FB" /> : null}
        {tour.bus_combo ? <FlagPill label="🚌 Bus" color="#0077B6" /> : null}
        {tour.has_swim_stop ? <FlagPill label="🏊 Bad" color="#00B7C2" /> : null}
        {tour.family_friendly ? <FlagPill label="👨‍👩‍👧 Familie" color="#9B5DE5" /> : null}
        {tour.bad_weather_alternative ? <FlagPill label="🌧️ Indoor" color="#374453" /> : null}
        {tour.categories.includes('wildlife') ? <FlagPill label="🦅 Wildlife" color="#2B9348" /> : null}
        {tour.categories.includes('sonnenuntergang') ? <FlagPill label="🌅 Sonnenunt." color="#FF8C42" /> : null}
      </View>
    </Pressable>
  );
}

function FlagPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.flagPill, { backgroundColor: color + '1A' }]}>
      <Text style={[styles.flagText, { color }]}>{label}</Text>
    </View>
  );
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
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
  backButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'MonaSansSemiCondensed-SemiBold'},
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
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
  toggleRow: { paddingHorizontal: 16, paddingVertical: 6 },
  toggle: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, alignSelf: 'flex-start' },
  toggleText: { fontSize: 13, fontFamily: 'Inter-Medium' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 6 },
  tippCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 16,
  },
  tippLabel: { fontSize: 12, fontFamily: 'Inter-SemiBold', color: '#FFB703', marginBottom: 4 },
  tippTitle: { fontSize: 18, fontFamily: 'Inter-SemiBold', marginBottom: 4 },
  tippSub: { fontSize: 14, fontFamily: 'Inter-Regular', marginBottom: 8 },
  tippMeta: { flexDirection: 'row' },
  tippMetaText: { fontSize: 12, fontFamily: 'Inter-Regular' },
  loadingBox: { padding: 40, alignItems: 'center' },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter-Medium', marginBottom: 4 },
  emptySub: { fontSize: 13, fontFamily: 'Inter-Regular', textAlign: 'center' },
  tourCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  tourHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  tourTitle: { flex: 1, fontSize: 15, fontFamily: 'Inter-SemiBold' },
  diffPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  diffText: { fontSize: 11, fontFamily: 'Inter-SemiBold' },
  tourSubtitle: { fontSize: 13, fontFamily: 'Inter-Regular', marginBottom: 6 },
  tourMeta: { fontSize: 12, fontFamily: 'Inter-Regular', marginBottom: 8 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flagPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  flagText: { fontSize: 11, fontFamily: 'Inter-Medium' },
});
