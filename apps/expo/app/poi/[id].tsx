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
import EmbeddedMap from '@/components/map/EmbeddedMap';
import MeckyNotFound from '@/components/MeckyNotFound';

import {
  fetchPoiById,
  POI_TYPE_COLORS,
  POI_TYPE_LABELS_DE,
  SWIM_STATUS_COLORS,
  SWIM_STATUS_LABELS_DE,
  type PoiRecord,
} from '@/lib/supabase-pois';

const POI_EMOJIS: Record<string, string> = {
  toilet: '🚻',
  drinking_water: '🚰',
  bike_repair: '🔧',
  bike_rental: '🚲',
  swim_spot: '🏊',
  indoor_alternative: '🏛️',
  tourist_info: 'ℹ️',
  pharmacy: '💊',
  observation_stand: '🦅',
  viewpoint: '🌄',
};

export default function PoiDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [poi, setPoi] = useState<PoiRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void fetchPoiById(id).then((p) => {
      setPoi(p);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.tabIconActive} />
        </View>
      </SafeAreaView>
    );
  }

  if (!poi) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <MeckyNotFound title="POI nicht gefunden" />
      </SafeAreaView>
    );
  }

  const typeColor = POI_TYPE_COLORS[poi.type];
  const typeLabel = POI_TYPE_LABELS_DE[poi.type];
  const emoji = POI_EMOJIS[poi.type] || '📍';
  const isSwim = poi.type === 'swim_spot' && poi.status?.startsWith('swim_');
  const swimColor = isSwim ? SWIM_STATUS_COLORS[poi.status as string] : null;
  const swimLabel = isSwim ? SWIM_STATUS_LABELS_DE[poi.status as string] : null;

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
          {typeLabel}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <EmbeddedMap
          height={220}
          points={[
            {
              id: poi.id,
              lat: poi.lat,
              lon: poi.lon,
              emoji,
              color: typeColor,
              size: 'lg',
            },
          ]}
        />

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <View style={[styles.typePill, { backgroundColor: typeColor + '22' }]}>
              <Text style={[styles.typePillText, { color: typeColor }]}>
                {emoji} {typeLabel}
              </Text>
            </View>
            {poi.is_24h ? (
              <View style={[styles.typePill, { backgroundColor: '#194383' + '22' }]}>
                <Text style={[styles.typePillText, { color: '#194383' }]}>24h</Text>
              </View>
            ) : null}
            {poi.is_pannendienst ? (
              <View style={[styles.typePill, { backgroundColor: '#E85D04' + '22' }]}>
                <Text style={[styles.typePillText, { color: '#E85D04' }]}>Pannendienst</Text>
              </View>
            ) : null}
            {poi.has_gaestekarte_discount ? (
              <View style={[styles.typePill, { backgroundColor: '#2B9348' + '22' }]}>
                <Text style={[styles.typePillText, { color: '#2B9348' }]}>Gästekarte</Text>
              </View>
            ) : null}
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{poi.name_de}</Text>

          {isSwim && swimColor && swimLabel ? (
            <View
              style={[
                styles.swimBox,
                { backgroundColor: swimColor + '22', borderColor: swimColor },
              ]}
            >
              <View style={[styles.swimDot, { backgroundColor: swimColor }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.swimLabel, { color: swimColor }]}>{swimLabel}</Text>
                {poi.status_note_de ? (
                  <Text style={[styles.swimNote, { color: colors.textPrimary }]}>
                    {poi.status_note_de}
                  </Text>
                ) : null}
                {poi.status_source_de ? (
                  <Text style={[styles.swimSource, { color: colors.textSecondary }]}>
                    Quelle: {poi.status_source_de}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {poi.description_de ? (
            <Text style={[styles.description, { color: colors.textPrimary }]}>
              {poi.description_de}
            </Text>
          ) : null}

          <View style={styles.actionRow}>
            {poi.phone ? (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: '#2B9348' }]}
                onPress={() => Linking.openURL(`tel:${poi.phone!.replace(/\s+/g, '')}`)}
              >
                <Text style={styles.actionText}>📞 Anrufen</Text>
              </Pressable>
            ) : null}
            {poi.website ? (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: '#194383' }]}
                onPress={() => Linking.openURL(poi.website!)}
              >
                <Text style={styles.actionText}>🌐 Website</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.actionBtn, { backgroundColor: '#374453' }]}
              onPress={() =>
                Linking.openURL(`https://maps.google.com/?q=${poi.lat},${poi.lon}`)
              }
            >
              <Text style={styles.actionText}>🧭 Route</Text>
            </Pressable>
          </View>

          {poi.address ? (
            <Row label="Adresse" value={poi.address} colors={colors} />
          ) : null}
          {poi.opening_hours_de ? (
            <Row label="Öffnungszeiten" value={poi.opening_hours_de} colors={colors} />
          ) : null}
          {poi.email ? <Row label="E-Mail" value={poi.email} colors={colors} /> : null}

          <Pressable
            style={[styles.viewOnMapBtn, { borderColor: typeColor }]}
            onPress={() =>
              router.push({
                pathname: '/location',
                params: { selected_poi_id: poi.id },
              } as any)
            }
          >
            <Text style={[styles.viewOnMapText, { color: typeColor }]}>
              Auf der Karte ansehen →
            </Text>
          </Pressable>

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
  headerTitle: { fontSize: 17, fontFamily: 'Inter-SemiBold' },
  scrollContent: {},
  body: { padding: 16 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  typePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  typePillText: { fontSize: 12, fontFamily: 'Inter-Medium' },
  title: { fontSize: 24, fontFamily: 'Inter-SemiBold', marginBottom: 12 },
  swimBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  swimDot: { width: 14, height: 14, borderRadius: 7 },
  swimLabel: { fontSize: 14, fontFamily: 'Inter-SemiBold', marginBottom: 2 },
  swimNote: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18 },
  swimSource: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 4 },
  description: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
    marginBottom: 16,
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  actionText: { color: '#fff', fontFamily: 'Inter-Medium', fontSize: 13 },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  rowLabel: { width: 110, fontSize: 13, fontFamily: 'Inter-Medium' },
  rowValue: { flex: 1, fontSize: 14, fontFamily: 'Inter-Regular' },
  viewOnMapBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    marginTop: 16,
  },
  viewOnMapText: { fontSize: 14, fontFamily: 'Inter-SemiBold' },
});
