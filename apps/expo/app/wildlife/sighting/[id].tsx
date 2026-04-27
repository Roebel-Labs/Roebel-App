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
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import EmbeddedMap from '@/components/map/EmbeddedMap';

import {
  fetchSightingById,
  fetchSpeciesBySlug,
  fetchSpecies,
  freshnessLabelDe,
  type WildlifeSighting,
  type WildlifeSpecies,
} from '@/lib/supabase-wildlife';

export default function SightingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const [sighting, setSighting] = useState<WildlifeSighting | null>(null);
  const [species, setSpecies] = useState<WildlifeSpecies | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void load();
  }, [id]);

  async function load() {
    setLoading(true);
    const s = await fetchSightingById(id!);
    setSighting(s);
    if (s?.species_id) {
      const all = await fetchSpecies();
      setSpecies(all.find((x) => x.id === s.species_id) ?? null);
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
  if (!sighting) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textPrimary, padding: 20 }}>Sichtung nicht gefunden.</Text>
      </SafeAreaView>
    );
  }

  const emoji = species?.category === 'saeugetier' ? '🦌' : '🦅';

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
          Wildlife-Sichtung
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <EmbeddedMap
          height={220}
          points={[
            {
              id: sighting.id,
              lat: sighting.lat,
              lon: sighting.lon,
              emoji,
              color: '#2B9348',
              size: 'lg',
            },
          ]}
        />

        <View style={styles.body}>
          {sighting.photo_url ? (
            <Image
              source={{ uri: sighting.photo_url }}
              style={styles.photo}
              contentFit="cover"
            />
          ) : null}

          <View style={styles.titleRow}>
            <Text style={styles.titleEmoji}>{emoji}</Text>
            <View style={{ flex: 1 }}>
              <Pressable
                onPress={() =>
                  species &&
                  router.push({
                    pathname: '/wildlife/species/[slug]',
                    params: { slug: species.slug },
                  } as any)
                }
              >
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  {species?.name_de ?? 'Unbekannte Art'}
                </Text>
                {species?.name_scientific ? (
                  <Text style={[styles.scientific, { color: colors.textSecondary }]}>
                    {species.name_scientific}
                  </Text>
                ) : null}
              </Pressable>
            </View>
            {sighting.verified_by_mecky ? (
              <View style={[styles.verifiedBadge, { backgroundColor: '#2B9348' + '22' }]}>
                <Text style={styles.verifiedText}>Mecky bestätigt</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              {sighting.individual_count > 1 ? `${sighting.individual_count} Tiere · ` : ''}
              {sighting.near_landmark_de ? `${sighting.near_landmark_de} · ` : ''}
              {freshnessLabelDe(sighting.observed_at)}
            </Text>
          </View>

          {sighting.notes_de ? (
            <View style={[styles.notesBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.notesText, { color: colors.textPrimary }]}>
                „{sighting.notes_de}"
              </Text>
              {sighting.observer_name_de ? (
                <Text style={[styles.observer, { color: colors.textSecondary }]}>
                  — {sighting.observer_name_de}
                </Text>
              ) : null}
            </View>
          ) : null}

          {sighting.mecky_verification_note_de ? (
            <View style={styles.meckyBox}>
              <Text style={styles.meckyHead}>🦔 Mecky meint</Text>
              <Text style={styles.meckyText}>{sighting.mecky_verification_note_de}</Text>
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: '#374453' }]}
              onPress={() =>
                Linking.openURL(`https://maps.google.com/?q=${sighting.lat},${sighting.lon}`)
              }
            >
              <Text style={styles.actionText}>🧭 Route</Text>
            </Pressable>
            {species ? (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: '#194383' }]}
                onPress={() =>
                  router.push({
                    pathname: '/wildlife/species/[slug]',
                    params: { slug: species.slug },
                  } as any)
                }
              >
                <Text style={styles.actionText}>Mehr zur Art</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
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
  photo: { width: '100%', height: 220, borderRadius: 14, marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  titleEmoji: { fontSize: 32 },
  title: { fontSize: 22, fontFamily: 'Inter-SemiBold' },
  scientific: { fontSize: 13, fontFamily: 'Inter-Regular', fontStyle: 'italic', marginTop: 2 },
  verifiedBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  verifiedText: { fontSize: 11, fontFamily: 'Inter-Medium', color: '#2B9348' },
  metaRow: { marginBottom: 12 },
  metaText: { fontSize: 13, fontFamily: 'Inter-Regular' },
  notesBox: { padding: 14, borderRadius: 12, marginBottom: 12 },
  notesText: { fontSize: 14, fontFamily: 'Inter-Regular', fontStyle: 'italic', lineHeight: 20 },
  observer: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 6 },
  meckyBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFF5E1',
    borderColor: '#FFB703',
    borderWidth: 1,
    marginBottom: 12,
  },
  meckyHead: { fontSize: 12, fontFamily: 'Inter-SemiBold', color: '#FFB703', marginBottom: 4 },
  meckyText: { fontSize: 14, fontFamily: 'Inter-Regular', color: '#374453', lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  actionText: { color: '#fff', fontFamily: 'Inter-Medium', fontSize: 13 },
});
