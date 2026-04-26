import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { useLocation } from '@/context/LocationContext';

import {
  fetchSpecies,
  submitSighting,
  WILDLIFE_CATEGORY_LABELS_DE,
  type WildlifeSpecies,
} from '@/lib/supabase-wildlife';

export default function WildlifeReportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { location, requestLocation } = useLocation();

  const [species, setSpecies] = useState<WildlifeSpecies[]>([]);
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string | null>(null);
  const [count, setCount] = useState('1');
  const [notes, setNotes] = useState('');
  const [observerName, setObserverName] = useState('');
  const [landmark, setLandmark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchSpecies().then((s) => {
      setSpecies(s);
      setLoading(false);
    });
  }, []);

  const selected = species.find((s) => s.id === selectedSpeciesId) ?? null;

  async function ensureLocation(): Promise<{ lat: number; lon: number } | null> {
    if (location?.coords) {
      return { lat: location.coords.latitude, lon: location.coords.longitude };
    }
    const ok = await requestLocation();
    if (!ok) return null;
    if (location?.coords) {
      return { lat: location.coords.latitude, lon: location.coords.longitude };
    }
    return null;
  }

  async function handleSubmit() {
    if (!selectedSpeciesId || !selected) {
      Alert.alert('Welche Art?', 'Bitte wähle eine Tierart aus.');
      return;
    }
    const coords = await ensureLocation();
    if (!coords) {
      Alert.alert(
        'Standort nötig',
        'Mecky braucht deinen Standort, damit andere die Sichtung finden können.'
      );
      return;
    }
    const n = Math.max(1, parseInt(count, 10) || 1);
    setSubmitting(true);
    const result = await submitSighting(
      {
        species_id: selectedSpeciesId,
        observer_name_de: observerName.trim() || null,
        lat: coords.lat,
        lon: coords.lon,
        individual_count: n,
        notes_de: notes.trim() || null,
        near_landmark_de: landmark.trim() || null,
      },
      selected.protect_coordinates
    );
    setSubmitting(false);
    if (result) {
      Alert.alert(
        'Danke!',
        selected.protect_coordinates
          ? 'Mecky bedankt sich. Da die Art geschützt ist, wird der genaue Ort etwas verschleiert angezeigt.'
          : 'Mecky bedankt sich für deine Sichtung.'
      );
      router.replace('/wildlife' as any);
    } else {
      Alert.alert('Fehler', 'Sichtung konnte nicht gespeichert werden.');
    }
  }

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
          Sichtung melden
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>Welche Art?</Text>
        {loading ? (
          <ActivityIndicator color={colors.tabIconActive} />
        ) : (
          <View style={styles.speciesGrid}>
            {species.map((s) => {
              const active = s.id === selectedSpeciesId;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setSelectedSpeciesId(s.id)}
                  style={[
                    styles.speciesChip,
                    {
                      backgroundColor: active ? '#2B9348' : colors.surface,
                      borderColor: active ? '#2B9348' : 'transparent',
                    },
                  ]}
                >
                  <Text style={styles.speciesEmoji}>
                    {s.category === 'saeugetier' ? '🦌' : '🦅'}
                  </Text>
                  <Text
                    style={[
                      styles.speciesName,
                      { color: active ? '#fff' : colors.textPrimary },
                    ]}
                  >
                    {s.name_de}
                  </Text>
                  <Text
                    style={[
                      styles.speciesCat,
                      { color: active ? '#fff' : colors.textSecondary },
                    ]}
                  >
                    {WILDLIFE_CATEGORY_LABELS_DE[s.category]}
                    {s.is_protected ? ' · geschützt' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {selected?.mecky_tipp_de ? (
          <View style={styles.tippBox}>
            <Text style={styles.tippHead}>Mecky-Tipp</Text>
            <Text style={styles.tippText}>{selected.mecky_tipp_de}</Text>
          </View>
        ) : null}

        <Text style={[styles.label, { color: colors.textPrimary, marginTop: 20 }]}>
          Wie viele Tiere?
        </Text>
        <TextInput
          value={count}
          onChangeText={setCount}
          placeholder="1"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          style={[
            styles.input,
            { backgroundColor: colors.surface, color: colors.textPrimary },
          ]}
        />

        <Text style={[styles.label, { color: colors.textPrimary }]}>
          In der Nähe von… (optional)
        </Text>
        <TextInput
          value={landmark}
          onChangeText={setLandmark}
          placeholder="z.B. Rederangsee, Federow, Bolter Kanal"
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.input,
            { backgroundColor: colors.surface, color: colors.textPrimary },
          ]}
        />

        <Text style={[styles.label, { color: colors.textPrimary }]}>
          Beobachtung beschreiben (optional)
        </Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Was hat das Tier gemacht? Verhalten, Auffälligkeiten…"
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={3}
          style={[
            styles.input,
            styles.inputMulti,
            { backgroundColor: colors.surface, color: colors.textPrimary },
          ]}
        />

        <Text style={[styles.label, { color: colors.textPrimary }]}>
          Dein Name (optional)
        </Text>
        <TextInput
          value={observerName}
          onChangeText={setObserverName}
          placeholder="Anna · Berlin"
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.input,
            { backgroundColor: colors.surface, color: colors.textPrimary },
          ]}
        />

        <View
          style={[
            styles.gpsBox,
            { backgroundColor: location?.coords ? '#2B9348' + '22' : '#FFB703' + '22' },
          ]}
        >
          <Text
            style={[
              styles.gpsText,
              { color: location?.coords ? '#2B9348' : '#FFB703' },
            ]}
          >
            {location?.coords
              ? `Standort erfasst (±${Math.round(location.coords.accuracy ?? 0)} m)`
              : 'Standort wird beim Absenden geholt'}
          </Text>
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={[
            styles.submitBtn,
            { backgroundColor: '#2B9348', opacity: submitting ? 0.6 : 1 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Sichtung melden</Text>
          )}
        </Pressable>

        <Text style={[styles.privacyHint, { color: colors.textSecondary }]}>
          Geschützte Arten (z.B. Fischadler, Seeadler, Wolf): Mecky verschleiert
          die exakten Koordinaten zum Schutz der Tiere.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
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
  backButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Inter-SemiBold' },
  scrollContent: { padding: 16 },
  label: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    marginTop: 12,
  },
  speciesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  speciesChip: {
    width: '48%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  speciesEmoji: { fontSize: 24, marginBottom: 4 },
  speciesName: { fontSize: 14, fontFamily: 'Inter-SemiBold' },
  speciesCat: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  tippBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FFF5E1',
    borderColor: '#FFB703',
    borderWidth: 1,
  },
  tippHead: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#FFB703',
    marginBottom: 4,
  },
  tippText: { fontSize: 13, fontFamily: 'Inter-Regular', color: '#374453', lineHeight: 19 },
  input: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  gpsBox: {
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  gpsText: { fontSize: 13, fontFamily: 'Inter-Medium' },
  submitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  submitText: { color: '#fff', fontSize: 15, fontFamily: 'Inter-SemiBold' },
  privacyHint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    lineHeight: 17,
    marginTop: 12,
    textAlign: 'center',
  },
});
