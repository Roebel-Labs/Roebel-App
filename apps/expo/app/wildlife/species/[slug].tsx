import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import MeckyNotFound from '@/components/MeckyNotFound';

import {
  fetchSpeciesBySlug,
  fetchSeasonalEventsForSpecies,
  fetchSightings,
  freshnessLabelDe,
  isEventActive,
  MONTH_LABELS_DE,
  WILDLIFE_CATEGORY_LABELS_DE,
  type WildlifeSpecies,
  type WildlifeSeasonalEvent,
  type WildlifeSighting,
} from '@/lib/supabase-wildlife';

export default function SpeciesDetailScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();

  const [species, setSpecies] = useState<WildlifeSpecies | null>(null);
  const [events, setEvents] = useState<WildlifeSeasonalEvent[]>([]);
  const [sightings, setSightings] = useState<WildlifeSighting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    void load();
  }, [slug]);

  async function load() {
    setLoading(true);
    const sp = await fetchSpeciesBySlug(slug!);
    setSpecies(sp);
    if (sp) {
      const [e, s] = await Promise.all([
        fetchSeasonalEventsForSpecies(sp.id),
        fetchSightings({ species_id: sp.id, hours: 24 * 30, limit: 8 }),
      ]);
      setEvents(e);
      setSightings(s);
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
  if (!species) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <MeckyNotFound title="Art nicht gefunden" />
      </SafeAreaView>
    );
  }

  const emoji = species.category === 'saeugetier' ? '🦌' : '🦅';
  const monthsList = species.best_months
    .slice()
    .sort((a, b) => a - b)
    .map((m) => MONTH_LABELS_DE[m - 1])
    .join(', ');

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
          {species.name_de}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {species.image_url ? (
          <Image source={{ uri: species.image_url }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.coverPlaceholder, { backgroundColor: colors.surface }]}>
            <Text style={styles.coverEmoji}>{emoji}</Text>
          </View>
        )}

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{species.name_de}</Text>
            {species.is_protected ? (
              <View style={[styles.pill, { backgroundColor: '#D62828' + '22' }]}>
                <Text style={[styles.pillText, { color: '#D62828' }]}>geschützt</Text>
              </View>
            ) : null}
          </View>
          {species.name_scientific ? (
            <Text style={[styles.scientific, { color: colors.textSecondary }]}>
              {species.name_scientific}
            </Text>
          ) : null}
          <Text style={[styles.category, { color: '#00498B' }]}>
            {WILDLIFE_CATEGORY_LABELS_DE[species.category]}
          </Text>

          {species.description_de ? (
            <Text style={[styles.description, { color: colors.textPrimary }]}>
              {species.description_de}
            </Text>
          ) : null}

          {species.mecky_tipp_de ? (
            <View style={styles.meckyBox}>
              <Text style={styles.meckyHead}>🦔 Mecky-Tipp</Text>
              <Text style={styles.meckyText}>{species.mecky_tipp_de}</Text>
            </View>
          ) : null}

          {monthsList ? (
            <Row label="Beste Monate" value={monthsList} colors={colors} />
          ) : null}
          {species.best_locations_de ? (
            <Row label="Beste Orte" value={species.best_locations_de} colors={colors} />
          ) : null}
          {species.protect_coordinates ? (
            <Row
              label="Hinweis"
              value="Standorte werden zum Schutz der Tiere unscharf angezeigt."
              colors={colors}
            />
          ) : null}

          {events.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                Saisonkalender
              </Text>
              {events.map((e) => (
                <View
                  key={e.id}
                  style={[
                    styles.eventCard,
                    {
                      backgroundColor: colors.surface,
                      borderLeftColor: isEventActive(e) ? '#2B9348' : colors.border,
                    },
                  ]}
                >
                  <View style={styles.eventTopRow}>
                    <Text style={[styles.eventTitle, { color: colors.textPrimary }]}>
                      {e.title_de}
                    </Text>
                    {isEventActive(e) ? (
                      <View style={[styles.activeBadge, { backgroundColor: '#2B9348' }]}>
                        <Text style={styles.activeText}>Jetzt</Text>
                      </View>
                    ) : null}
                  </View>
                  {e.description_de ? (
                    <Text style={[styles.eventDesc, { color: colors.textPrimary }]}>
                      {e.description_de}
                    </Text>
                  ) : null}
                  <Text style={[styles.eventMeta, { color: colors.textSecondary }]}>
                    📅 {MONTH_LABELS_DE[e.start_month - 1]} – {MONTH_LABELS_DE[e.end_month - 1]}
                    {e.peak_window_de ? ` · ★ ${e.peak_window_de}` : ''}
                  </Text>
                  {e.best_location_de ? (
                    <Text style={[styles.eventMeta, { color: colors.textSecondary }]}>
                      📍 {e.best_location_de}
                    </Text>
                  ) : null}
                </View>
              ))}
            </>
          ) : null}

          {sightings.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                Aktuelle Sichtungen
              </Text>
              {sightings.map((s) => (
                <Pressable
                  key={s.id}
                  style={[styles.sightingRow, { backgroundColor: colors.surface }]}
                  onPress={() =>
                    router.push({
                      pathname: '/wildlife/sighting/[id]',
                      params: { id: s.id },
                    } as any)
                  }
                >
                  <Text style={styles.sightingMeta}>
                    {s.individual_count > 1 ? `${s.individual_count}× ` : ''}
                    {s.near_landmark_de} · {freshnessLabelDe(s.observed_at)}
                  </Text>
                  {s.notes_de ? (
                    <Text style={[styles.sightingNotes, { color: colors.textPrimary }]} numberOfLines={2}>
                      „{s.notes_de}"
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </>
          ) : null}

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  scrollContent: {},
  cover: { width: '100%', height: 240 },
  coverPlaceholder: { width: '100%', height: 200, justifyContent: 'center', alignItems: 'center' },
  coverEmoji: { fontSize: 80 },
  body: { padding: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 26, fontFamily: 'Inter-SemiBold' },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  pillText: { fontSize: 11, fontFamily: 'Inter-Medium' },
  scientific: { fontSize: 14, fontFamily: 'Inter-Regular', fontStyle: 'italic', marginBottom: 4 },
  category: { fontSize: 13, fontFamily: 'Inter-Medium', marginBottom: 12 },
  description: { fontSize: 15, fontFamily: 'Inter-Regular', lineHeight: 22, marginBottom: 16 },
  meckyBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFF5E1',
    borderColor: '#FFB703',
    borderWidth: 1,
    marginBottom: 16,
  },
  meckyHead: { fontSize: 12, fontFamily: 'Inter-SemiBold', color: '#FFB703', marginBottom: 4 },
  meckyText: { fontSize: 14, fontFamily: 'Inter-Regular', color: '#374453', lineHeight: 20 },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  rowLabel: { width: 110, fontSize: 13, fontFamily: 'Inter-Medium' },
  rowValue: { flex: 1, fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20 },
  sectionTitle: { fontSize: 16, fontFamily: 'MonaSansSemiCondensed-SemiBold', marginTop: 16, marginBottom: 8 },
  eventCard: {
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 3,
    marginBottom: 8,
  },
  eventTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  eventTitle: { flex: 1, fontSize: 14, fontFamily: 'Inter-SemiBold' },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  activeText: { color: '#fff', fontSize: 11, fontFamily: 'Inter-SemiBold' },
  eventDesc: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 19, marginBottom: 4 },
  eventMeta: { fontSize: 12, fontFamily: 'Inter-Regular' },
  sightingRow: { padding: 12, borderRadius: 10, marginBottom: 6 },
  sightingMeta: { fontSize: 12, fontFamily: 'Inter-Medium', color: '#00498B' },
  sightingNotes: { fontSize: 13, fontFamily: 'Inter-Regular', fontStyle: 'italic', marginTop: 4 },
});
