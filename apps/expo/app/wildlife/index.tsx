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
import { supabase } from '@/lib/supabase';

import {
  fetchSightings,
  fetchSpecies,
  fetchSeasonalEvents,
  freshnessLabelDe,
  isEventActive,
  MONTH_LABELS_DE,
  type WildlifeSighting,
  type WildlifeSpecies,
  type WildlifeSeasonalEvent,
} from '@/lib/supabase-wildlife';

type Tab = 'heute' | 'kalender';

export default function WildlifeScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [tab, setTab] = useState<Tab>('heute');
  const [sightings, setSightings] = useState<WildlifeSighting[]>([]);
  const [species, setSpecies] = useState<Map<string, WildlifeSpecies>>(new Map());
  const [events, setEvents] = useState<WildlifeSeasonalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  // Realtime: new sightings push into the feed within ~2s.
  useEffect(() => {
    const channel = supabase
      .channel('wildlife-sightings-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wildlife_sightings' },
        (payload) => {
          const next = payload.new as WildlifeSighting;
          if (!next.is_visible) return;
          setSightings((cur) => [next, ...cur].slice(0, 100));
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  async function load() {
    setLoading(true);
    const [s, sp, ev] = await Promise.all([
      fetchSightings({ limit: 50 }),
      fetchSpecies(),
      fetchSeasonalEvents(),
    ]);
    setSightings(s);
    setSpecies(new Map(sp.map((x) => [x.id, x])));
    setEvents(ev);
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const activeEvents = useMemo(() => events.filter((e) => isEventActive(e)), [events]);
  const upcomingEvents = useMemo(
    () =>
      events
        .filter((e) => !isEventActive(e))
        .sort((a, b) => a.start_month - b.start_month),
    [events]
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
          Wildlife · Müritz
        </Text>
        <Pressable
          onPress={() => router.push('/wildlife/report' as any)}
          style={[styles.reportButton, { backgroundColor: '#2B9348' }]}
        >
          <Text style={styles.reportButtonText}>+ Melden</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TabPill
          label="Live-Sichtungen"
          active={tab === 'heute'}
          onPress={() => setTab('heute')}
          colors={colors}
        />
        <TabPill
          label="Saisonkalender"
          active={tab === 'kalender'}
          onPress={() => setTab('kalender')}
          colors={colors}
        />
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
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.tabIconActive} />
          </View>
        ) : tab === 'heute' ? (
          <>
            {sightings.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                  Noch keine Sichtungen heute
                </Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                  Sei der erste — Mecky belohnt frühe Beobachter.
                </Text>
              </View>
            ) : (
              sightings.map((s) => (
                <SightingRow
                  key={s.id}
                  sighting={s}
                  species={s.species_id ? species.get(s.species_id) : undefined}
                  colors={colors}
                />
              ))
            )}
          </>
        ) : (
          <>
            {activeEvents.length > 0 ? (
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                Jetzt aktiv
              </Text>
            ) : null}
            {activeEvents.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                species={e.species_id ? species.get(e.species_id) : undefined}
                isActive
                colors={colors}
              />
            ))}

            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 20 }]}>
              Demnächst im Jahresverlauf
            </Text>
            {upcomingEvents.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                species={e.species_id ? species.get(e.species_id) : undefined}
                isActive={false}
                colors={colors}
              />
            ))}
          </>
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

function TabPill({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tabPill,
        { backgroundColor: active ? '#2B9348' : colors.surface },
      ]}
    >
      <Text
        style={[
          styles.tabPillText,
          { color: active ? '#fff' : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SightingRow({
  sighting,
  species,
  colors,
}: {
  sighting: WildlifeSighting;
  species: WildlifeSpecies | undefined;
  colors: any;
}) {
  const ageHours = (Date.now() - new Date(sighting.observed_at).getTime()) / 3600000;
  const opacity = ageHours > 24 ? 0.55 : 1;
  return (
    <View style={[styles.sightingRow, { backgroundColor: colors.surface, opacity }]}>
      <View style={styles.sightingTopRow}>
        <Text style={styles.sightingEmoji}>
          {species?.category === 'saeugetier' ? '🦌' : '🦅'}
        </Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sightingName, { color: colors.textPrimary }]}>
            {species?.name_de || 'Unbekannte Art'}
          </Text>
          <Text style={[styles.sightingMeta, { color: colors.textSecondary }]}>
            {sighting.individual_count > 1 ? `${sighting.individual_count} Tiere · ` : ''}
            {sighting.near_landmark_de} · {freshnessLabelDe(sighting.observed_at)}
          </Text>
        </View>
        {sighting.verified_by_mecky ? (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>Mecky bestätigt</Text>
          </View>
        ) : null}
      </View>
      {sighting.notes_de ? (
        <Text style={[styles.sightingNotes, { color: colors.textPrimary }]} numberOfLines={3}>
          „{sighting.notes_de}"
        </Text>
      ) : null}
      {sighting.observer_name_de ? (
        <Text style={[styles.sightingObserver, { color: colors.textSecondary }]}>
          — {sighting.observer_name_de}
        </Text>
      ) : null}
    </View>
  );
}

function EventCard({
  event,
  species,
  isActive,
  colors,
}: {
  event: WildlifeSeasonalEvent;
  species: WildlifeSpecies | undefined;
  isActive: boolean;
  colors: any;
}) {
  const monthRange =
    event.start_month <= event.end_month
      ? `${MONTH_LABELS_DE[event.start_month - 1]} – ${MONTH_LABELS_DE[event.end_month - 1]}`
      : `${MONTH_LABELS_DE[event.start_month - 1]} – ${MONTH_LABELS_DE[event.end_month - 1]} (Jahresübergang)`;
  return (
    <View
      style={[
        styles.eventCard,
        {
          backgroundColor: colors.surface,
          borderLeftColor: isActive ? '#2B9348' : colors.border,
          borderLeftWidth: 3,
        },
      ]}
    >
      <View style={styles.eventTopRow}>
        <Text style={[styles.eventTitle, { color: colors.textPrimary }]}>
          {event.title_de}
        </Text>
        {isActive ? (
          <View style={[styles.eventActiveBadge, { backgroundColor: '#2B9348' }]}>
            <Text style={styles.eventActiveText}>Jetzt</Text>
          </View>
        ) : null}
      </View>
      {species ? (
        <Text style={[styles.eventSpecies, { color: '#00498B' }]}>{species.name_de}</Text>
      ) : null}
      {event.description_de ? (
        <Text style={[styles.eventDesc, { color: colors.textPrimary }]}>
          {event.description_de}
        </Text>
      ) : null}
      <View style={styles.eventMetaRow}>
        <Text style={[styles.eventMeta, { color: colors.textSecondary }]}>📅 {monthRange}</Text>
        {event.peak_window_de ? (
          <Text style={[styles.eventMeta, { color: colors.textSecondary }]}>
            ★ Peak: {event.peak_window_de}
          </Text>
        ) : null}
        {event.best_location_de ? (
          <Text style={[styles.eventMeta, { color: colors.textSecondary }]}>
            📍 {event.best_location_de}
          </Text>
        ) : null}
      </View>
    </View>
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
  headerTitle: { fontSize: 17, fontFamily: 'MonaSansSemiCondensed-SemiBold'},
  reportButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  reportButtonText: { color: '#fff', fontFamily: 'MonaSansSemiCondensed-Bold', fontSize: 13 },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  tabPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  tabPillText: { fontSize: 13, fontFamily: 'Inter-Medium' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 6 },
  loadingBox: { padding: 40, alignItems: 'center' },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter-Medium', marginBottom: 4 },
  emptySub: { fontSize: 13, fontFamily: 'Inter-Regular', textAlign: 'center' },
  sightingRow: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  sightingTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  sightingEmoji: { fontSize: 26 },
  sightingName: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  sightingMeta: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  verifiedBadge: {
    backgroundColor: '#2B9348' + '22',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  verifiedText: { fontSize: 11, fontFamily: 'Inter-Medium', color: '#2B9348' },
  sightingNotes: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 4,
  },
  sightingObserver: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 4 },
  sectionTitle: {
    fontSize: 15,
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
    marginBottom: 8,
    marginTop: 4,
  },
  eventCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  eventTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  eventTitle: { flex: 1, fontSize: 15, fontFamily: 'Inter-SemiBold' },
  eventActiveBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  eventActiveText: { color: '#fff', fontSize: 11, fontFamily: 'Inter-SemiBold' },
  eventSpecies: { fontSize: 12, fontFamily: 'Inter-Medium', marginBottom: 6 },
  eventDesc: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 19, marginBottom: 8 },
  eventMetaRow: { gap: 4 },
  eventMeta: { fontSize: 12, fontFamily: 'Inter-Regular' },
});
