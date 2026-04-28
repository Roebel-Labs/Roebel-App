import React, { useEffect, useMemo, useState } from 'react';
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
  fetchTransitLineByCode,
  fetchTransitStops,
  fetchTransitDepartures,
  TRANSIT_MODE_COLORS,
  TRANSIT_MODE_EMOJIS,
  TRANSIT_MODE_LABELS_DE,
  isInSeason,
  isServiceToday,
  isUpcoming,
  type TransitLine,
  type TransitStop,
  type TransitDeparture,
} from '@/lib/supabase-transit';

export default function TransitLineDetail() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { colors } = useTheme();

  const [line, setLine] = useState<TransitLine | null>(null);
  const [stops, setStops] = useState<TransitStop[]>([]);
  const [departures, setDepartures] = useState<TransitDeparture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    void load();
  }, [code]);

  async function load() {
    setLoading(true);
    const l = await fetchTransitLineByCode(code!);
    setLine(l);
    if (l) {
      const [s, d] = await Promise.all([
        fetchTransitStops(l.id),
        fetchTransitDepartures(l.id),
      ]);
      setStops(s);
      setDepartures(d);
    }
    setLoading(false);
  }

  const mapPoints = useMemo<EmbeddedMapPoint[]>(() => {
    if (!line) return [];
    return stops
      .filter((s) => s.lat != null && s.lon != null)
      .map((s, i) => ({
        id: s.id,
        lat: s.lat!,
        lon: s.lon!,
        emoji: i === 0 ? '🚩' : i === stops.length - 1 ? '🏁' : TRANSIT_MODE_EMOJIS[line.mode],
        color: TRANSIT_MODE_COLORS[line.mode],
        size: i === 0 || i === stops.length - 1 ? 'lg' : 'sm',
      }));
  }, [stops, line]);

  const upcomingToday = useMemo(() => {
    const now = new Date();
    return departures
      .filter(
        (d) =>
          isInSeason(d.season_start, d.season_end, now) &&
          isServiceToday(d.service_days, now) &&
          isUpcoming(d.departure_time, now)
      )
      .slice(0, 12);
  }, [departures]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.tabIconActive} />
        </View>
      </SafeAreaView>
    );
  }
  if (!line) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <MeckyNotFound title="Linie nicht gefunden" />
      </SafeAreaView>
    );
  }

  const lineColor = TRANSIT_MODE_COLORS[line.mode];
  const lineEmoji = TRANSIT_MODE_EMOJIS[line.mode];

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
          {line.code}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {mapPoints.length > 0 ? (
          <EmbeddedMap
            height={220}
            points={mapPoints}
            drawRoute={mapPoints.length > 1 ? 'line' : 'none'}
          />
        ) : (
          <View style={[styles.mapPlaceholder, { backgroundColor: colors.surface }]}>
            <Text style={{ color: colors.textSecondary }}>
              Diese Linie hat keine festen Haltestellen (z.B. Bürgerbus auf Anruf).
            </Text>
          </View>
        )}

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.titleEmoji}>{lineEmoji}</Text>
            <View style={[styles.codeBadge, { backgroundColor: lineColor }]}>
              <Text style={styles.codeText}>{line.code}</Text>
            </View>
            <View style={[styles.modeBadge, { backgroundColor: lineColor + '22' }]}>
              <Text style={[styles.modeText, { color: lineColor }]}>
                {TRANSIT_MODE_LABELS_DE[line.mode]}
              </Text>
            </View>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{line.name_de}</Text>
          {line.operator_de ? (
            <Text style={[styles.operator, { color: colors.textSecondary }]}>
              {line.operator_de}
            </Text>
          ) : null}

          <View style={styles.flagRow}>
            {line.free_with_gaestekarte ? (
              <Flag label="Kostenfrei mit Gästekarte" color="#2B9348" />
            ) : null}
            {line.carries_bikes ? (
              <Flag
                label={line.bike_fee_eur ? `🚲 ${line.bike_fee_eur} €` : '🚲 frei'}
                color="#E85D04"
              />
            ) : null}
            {line.is_electric ? <Flag label="⚡ Elektro" color="#0077B6" /> : null}
            {line.is_volunteer ? <Flag label="💛 Ehrenamt" color="#FFB703" /> : null}
          </View>

          {line.notes_de ? (
            <Text style={[styles.notes, { color: colors.textPrimary }]}>{line.notes_de}</Text>
          ) : null}

          {line.fare_de ? <Row label="Tarif" value={line.fare_de} colors={colors} /> : null}
          {line.season_window_de ? (
            <Row label="Saison" value={line.season_window_de} colors={colors} />
          ) : null}
          {line.call_window_de ? (
            <Row label="Reservierung" value={line.call_window_de} colors={colors} />
          ) : null}

          {/* Action buttons: call / website */}
          <View style={styles.actionRow}>
            {line.call_phone ? (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: '#2B9348' }]}
                onPress={() => Linking.openURL(`tel:${line.call_phone!.replace(/\s+/g, '')}`)}
              >
                <Text style={styles.actionText}>📞 Reservieren</Text>
              </Pressable>
            ) : null}
            {line.call_email ? (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: '#194383' }]}
                onPress={() => Linking.openURL(`mailto:${line.call_email}`)}
              >
                <Text style={styles.actionText}>✉️ E-Mail</Text>
              </Pressable>
            ) : null}
            {line.website ? (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: '#374453' }]}
                onPress={() => Linking.openURL(line.website!)}
              >
                <Text style={styles.actionText}>🌐 Website</Text>
              </Pressable>
            ) : null}
          </View>

          {stops.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Haltestellen</Text>
              {stops.map((s, i) => (
                <View key={s.id} style={styles.stopRow}>
                  <View style={[styles.stopDot, { backgroundColor: lineColor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stopName, { color: colors.textPrimary }]}>
                      {s.name_de}
                    </Text>
                    {s.notes_de ? (
                      <Text style={[styles.stopNotes, { color: colors.textSecondary }]}>
                        {s.notes_de}
                      </Text>
                    ) : null}
                  </View>
                  {i === 0 ? <Text style={styles.stopBadge}>Start</Text> : null}
                  {i === stops.length - 1 ? <Text style={styles.stopBadge}>Ende</Text> : null}
                </View>
              ))}
            </>
          ) : null}

          {upcomingToday.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                Heute · nächste Abfahrten
              </Text>
              {upcomingToday.map((d) => (
                <View
                  key={d.id}
                  style={[styles.depRow, { backgroundColor: colors.surface }]}
                >
                  <Text style={[styles.depTime, { color: lineColor }]}>
                    {d.departure_time.slice(0, 5)}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.depDest, { color: colors.textPrimary }]} numberOfLines={1}>
                      {d.trip_label_de || '→ ' + (d.destination_de || '')}
                    </Text>
                    {d.destination_de ? (
                      <Text style={[styles.depSub, { color: colors.textSecondary }]} numberOfLines={1}>
                        → {d.destination_de}
                      </Text>
                    ) : null}
                  </View>
                  {d.is_last_of_day ? (
                    <View style={[styles.lastBadge, { backgroundColor: '#D62828' + '22' }]}>
                      <Text style={[styles.lastText, { color: '#D62828' }]}>Letzte heute</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </>
          ) : (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              Heute keine weiteren Abfahrten.
            </Text>
          )}

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Flag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.flag, { backgroundColor: color + '1A' }]}>
      <Text style={[styles.flagText, { color }]}>{label}</Text>
    </View>
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
  headerTitle: { fontSize: 17, fontFamily: 'Inter-SemiBold' },
  scrollContent: {},
  mapPlaceholder: { height: 120, justifyContent: 'center', alignItems: 'center', padding: 20 },
  body: { padding: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  titleEmoji: { fontSize: 28 },
  codeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  codeText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-SemiBold' },
  modeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  modeText: { fontSize: 12, fontFamily: 'Inter-Medium' },
  title: { fontSize: 22, fontFamily: 'Inter-SemiBold', marginBottom: 4 },
  operator: { fontSize: 13, fontFamily: 'Inter-Regular', marginBottom: 12 },
  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  flag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  flagText: { fontSize: 11, fontFamily: 'Inter-Medium' },
  notes: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  rowLabel: { width: 110, fontSize: 13, fontFamily: 'Inter-Medium' },
  rowValue: { flex: 1, fontSize: 14, fontFamily: 'Inter-Regular' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  actionText: { color: '#fff', fontFamily: 'Inter-Medium', fontSize: 13 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter-SemiBold', marginTop: 20, marginBottom: 8 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  stopDot: { width: 12, height: 12, borderRadius: 6 },
  stopName: { fontSize: 14, fontFamily: 'Inter-Medium' },
  stopNotes: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  stopBadge: { fontSize: 11, fontFamily: 'Inter-Medium', color: '#194383' },
  depRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  depTime: { fontSize: 18, fontFamily: 'Inter-SemiBold', minWidth: 56 },
  depDest: { fontSize: 14, fontFamily: 'Inter-Medium' },
  depSub: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  lastBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  lastText: { fontSize: 11, fontFamily: 'Inter-Medium' },
  empty: { fontSize: 13, fontFamily: 'Inter-Regular', padding: 14 },
});
