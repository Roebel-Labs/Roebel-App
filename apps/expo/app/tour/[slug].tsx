import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import EmbeddedMap, { type EmbeddedMapPoint } from '@/components/map/EmbeddedMap';
import MeckyNotFound from '@/components/MeckyNotFound';

import {
  fetchTourBySlug,
  fetchTourStops,
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS_DE,
  HOURS_LABELS_DE,
  TOUR_CATEGORY_LABELS_DE,
  type TourRecord,
  type TourStopRecord,
} from '@/lib/supabase-tours';

const STOP_EMOJIS: Record<string, string> = {
  start: '🚩',
  finish: '🏁',
  observation_stand: '🦅',
  swim_spot: '🏊',
  viewpoint: '🌄',
  eisdiele: '🍦',
  restaurant: '🍽️',
  toilet: '🚻',
  transit_stop: '🚌',
  sehenswuerdigkeit: '🏛️',
};

export default function TourDetailScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();

  const [tour, setTour] = useState<TourRecord | null>(null);
  const [stops, setStops] = useState<TourStopRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    void load();
  }, [slug]);

  async function load() {
    setLoading(true);
    const t = await fetchTourBySlug(slug!);
    if (t) {
      setTour(t);
      const s = await fetchTourStops(t.id);
      setStops(s);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.tabIconActive} />
        </View>
      </SafeAreaView>
    );
  }

  if (!tour) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <MeckyNotFound title="Tour nicht gefunden" />
      </SafeAreaView>
    );
  }

  const diffColor = DIFFICULTY_COLORS[tour.difficulty];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surfaceSecondary }]}
        >
          <ArrowLeftIcon size={24} color={colors.tabIconActive} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          Mecky-Tour
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {(() => {
          const mapPoints: EmbeddedMapPoint[] = [];
          if (tour.start_lat != null && tour.start_lon != null) {
            mapPoints.push({
              id: 'start',
              lat: tour.start_lat,
              lon: tour.start_lon,
              emoji: '🚩',
              color: '#194383',
              size: 'lg',
            });
          }
          stops.forEach((s, i) => {
            if (s.lat == null || s.lon == null) return;
            const isStart = s.stop_type === 'start' || (i === 0 && mapPoints.length === 0);
            const isFinish = s.stop_type === 'finish' || i === stops.length - 1;
            mapPoints.push({
              id: s.id,
              lat: s.lat,
              lon: s.lon,
              emoji: STOP_EMOJIS[s.stop_type || ''] || '📍',
              color: isFinish ? '#D62828' : isStart ? '#194383' : diffColor,
              size: isStart || isFinish ? 'lg' : 'sm',
            });
          });
          if (mapPoints.length === 0) return null;
          // For 2 points use arc (Uber Eats style); for many use line
          const drawRoute = mapPoints.length === 2 ? 'arc' : 'line';
          return <EmbeddedMap height={240} points={mapPoints} drawRoute={drawRoute} />;
        })()}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{tour.title_de}</Text>
        {tour.subtitle_de ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {tour.subtitle_de}
          </Text>
        ) : null}

        <View style={styles.statsRow}>
          {tour.distance_km != null ? (
            <Stat label="Distanz" value={`${tour.distance_km} km`} colors={colors} />
          ) : null}
          {tour.duration_min != null ? (
            <Stat
              label="Dauer"
              value={formatDuration(tour.duration_min)}
              colors={colors}
            />
          ) : null}
          <Stat
            label="Schwierigkeit"
            value={DIFFICULTY_LABELS_DE[tour.difficulty]}
            valueColor={diffColor}
            colors={colors}
          />
          {tour.hours_bucket ? (
            <Stat label="Zeitfenster" value={HOURS_LABELS_DE[tour.hours_bucket]} colors={colors} />
          ) : null}
        </View>

        {tour.description_de ? (
          <Text style={[styles.body, { color: colors.textPrimary }]}>{tour.description_de}</Text>
        ) : null}

        {tour.categories.length > 0 ? (
          <View style={styles.tagRow}>
            {tour.categories.map((c) => (
              <View key={c} style={[styles.tag, { backgroundColor: colors.surface }]}>
                <Text style={[styles.tagText, { color: colors.textSecondary }]}>
                  {TOUR_CATEGORY_LABELS_DE[c] || c}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {tour.highlights_de.length > 0 ? (
          <SectionTitle text="Höhepunkte" colors={colors} />
        ) : null}
        {tour.highlights_de.map((h, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={[styles.bulletDot, { color: '#194383' }]}>•</Text>
            <Text style={[styles.bulletText, { color: colors.textPrimary }]}>{h}</Text>
          </View>
        ))}

        {tour.warnings_de.length > 0 ? (
          <SectionTitle text="Mecky warnt" colors={colors} />
        ) : null}
        {tour.warnings_de.map((w, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={[styles.bulletDot, { color: '#D62828' }]}>⚠</Text>
            <Text style={[styles.bulletText, { color: colors.textPrimary }]}>{w}</Text>
          </View>
        ))}

        {tour.start_label_de || tour.season_de || tour.best_start_time_de || tour.return_options_de ? (
          <>
            <SectionTitle text="Logistik" colors={colors} />
            {tour.start_label_de ? (
              <KeyVal k="Start" v={tour.start_label_de} colors={colors} />
            ) : null}
            {tour.season_de ? <KeyVal k="Saison" v={tour.season_de} colors={colors} /> : null}
            {tour.best_start_time_de ? (
              <KeyVal k="Beste Zeit" v={tour.best_start_time_de} colors={colors} />
            ) : null}
            {tour.surface_de ? <KeyVal k="Belag" v={tour.surface_de} colors={colors} /> : null}
            {tour.return_options_de ? (
              <KeyVal k="Rückweg" v={tour.return_options_de} colors={colors} />
            ) : null}
          </>
        ) : null}

        {stops.length > 0 ? (
          <>
            <SectionTitle text="Stationen" colors={colors} />
            {stops.map((s) => (
              <View key={s.id} style={[styles.stopRow, { backgroundColor: colors.surface }]}>
                <Text style={styles.stopEmoji}>
                  {STOP_EMOJIS[s.stop_type || ''] || '📍'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stopName, { color: colors.textPrimary }]} numberOfLines={2}>
                    {s.name_de}
                  </Text>
                  {s.km_from_start != null ? (
                    <Text style={[styles.stopMeta, { color: colors.textSecondary }]}>
                      {s.km_from_start.toFixed(1)} km ab Start
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </>
        ) : null}

        {tour.gpx_url || tour.komoot_url || tour.alltrails_url ? (
          <>
            <SectionTitle text="Mit anderer App navigieren" colors={colors} />
            <View style={styles.handoffRow}>
              {tour.komoot_url ? (
                <Pressable
                  style={[styles.handoffBtn, { backgroundColor: '#3FA75F' }]}
                  onPress={() => Linking.openURL(tour.komoot_url!)}
                >
                  <Text style={styles.handoffText}>Komoot öffnen</Text>
                </Pressable>
              ) : null}
              {tour.alltrails_url ? (
                <Pressable
                  style={[styles.handoffBtn, { backgroundColor: '#3F84E5' }]}
                  onPress={() => Linking.openURL(tour.alltrails_url!)}
                >
                  <Text style={styles.handoffText}>AllTrails</Text>
                </Pressable>
              ) : null}
              {tour.gpx_url ? (
                <Pressable
                  style={[styles.handoffBtn, { backgroundColor: '#374453' }]}
                  onPress={() => Linking.openURL(tour.gpx_url!)}
                >
                  <Text style={styles.handoffText}>GPX laden</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}

        <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ text, colors }: { text: string; colors: any }) {
  return (
    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{text}</Text>
  );
}

function Stat({
  label,
  value,
  valueColor,
  colors,
}: {
  label: string;
  value: string;
  valueColor?: string;
  colors: any;
}) {
  return (
    <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor || colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function KeyVal({ k, v, colors }: { k: string; v: string; colors: any }) {
  return (
    <View style={styles.kvRow}>
      <Text style={[styles.kvKey, { color: colors.textSecondary }]}>{k}</Text>
      <Text style={[styles.kvVal, { color: colors.textPrimary }]}>{v}</Text>
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 17, fontFamily: 'Inter-SemiBold' },
  scrollContent: {},
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  title: { fontSize: 26, fontFamily: 'Inter-SemiBold', marginBottom: 4 },
  subtitle: { fontSize: 15, fontFamily: 'Inter-Regular', marginBottom: 16, lineHeight: 22 },
  body: { fontSize: 15, fontFamily: 'Inter-Regular', lineHeight: 22, marginBottom: 16 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statBox: { flex: 1, minWidth: 110, padding: 12, borderRadius: 12 },
  statLabel: { fontSize: 11, fontFamily: 'Inter-Medium', marginBottom: 2 },
  statValue: { fontSize: 16, fontFamily: 'Inter-SemiBold' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tagText: { fontSize: 12, fontFamily: 'Inter-Medium' },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginTop: 16,
    marginBottom: 8,
  },
  bullet: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  bulletDot: { fontSize: 18, lineHeight: 22 },
  bulletText: { flex: 1, fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 22 },
  kvRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  kvKey: { width: 100, fontSize: 13, fontFamily: 'Inter-Medium' },
  kvVal: { flex: 1, fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20 },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  stopEmoji: { fontSize: 22 },
  stopName: { fontSize: 14, fontFamily: 'Inter-Medium' },
  stopMeta: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  handoffRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  handoffBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  handoffText: { color: '#fff', fontFamily: 'Inter-Medium', fontSize: 13 },
});
