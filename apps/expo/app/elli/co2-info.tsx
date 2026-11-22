// Explainer for the Elli CO₂ figures — for riders and for the mayor /
// LandStation funders. Every number is rendered from lib/elli/co2.ts, so the
// published method always matches what the app calculates.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import { CO2_FACTORS, CO2_SOURCES, dieselGramsPerKm, elliGramsPerKm, formatCo2 } from '@/lib/elli/co2';
import { fetchPilotTotals, type PilotTotals } from '@/lib/elli/co2-data';
import { ELLI_GREEN } from '@/components/elli/LeafIcon';

const num = (n: number, d = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: d });

export default function ElliCo2InfoScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const [pilot, setPilot] = useState<PilotTotals | null>(null);

  useEffect(() => {
    fetchPilotTotals().then(setPilot);
  }, []);

  const diesel = dieselGramsPerKm();
  const elli = elliGramsPerKm();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Zurück">
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>So rechnen wir</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>
          Elli fährt elektrisch und mit Ökostrom. Wer mitfährt, lässt sein eigenes Auto stehen. Wie viel CO₂ das spart,
          rechnen wir für jede Fahrt einzeln aus — offen und nachprüfbar.
        </Text>

        <Text style={styles.h2}>Die Rechnung</Text>
        <View style={styles.formula}>
          <Text style={styles.formulaText}>
            Fahrgäste × Fahrstrecke × {num(diesel, 0)} g/km{'\n'}− (Fahrstrecke + Anfahrt) × {num(elli)} g/km
          </Text>
        </View>
        <Text style={styles.body}>
          <Text style={styles.strong}>Ohne Elli</Text> wäre jede mitfahrende Person allein mit dem eigenen Diesel-Auto
          gefahren: {num(CO2_FACTORS.dieselLitresPer100Km)} l auf 100 km, also rund {num(diesel, 0)} g CO₂ pro Kilometer.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.strong}>Mit Elli</Text> entstehen rund {num(elli)} g CO₂ pro Kilometer: Elli braucht etwa{' '}
          {CO2_FACTORS.elliKwhPer100Km} kWh auf 100 km, und auch Ökostrom ist über die Lebensdauer von Wind- und
          Solaranlagen nicht ganz CO₂-frei.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.strong}>Die Anfahrt zählt mit.</Text> Fährt Elli leer zu Ihnen, ziehen wir diese
          Kilometer ehrlich von der Ersparnis ab.
        </Text>

        <Text style={styles.h2}>Ein Beispiel</Text>
        <Text style={styles.body}>
          8 km zum Einkauf nach Röbel, Elli kommt 6 km angefahren, eine Person fährt mit:{'\n'}8 × {num(diesel, 0)} g − 14
          × {num(elli)} g ≈ <Text style={styles.strong}>{formatCo2(8 * diesel - 14 * elli)} CO₂ gespart</Text>. Fahren zwei
          Personen mit, ist es rund doppelt so viel.
        </Text>

        <Text style={styles.h2}>Annahmen</Text>
        <Text style={styles.bullet}>• Elli lädt Ökostrom.</Text>
        <Text style={styles.bullet}>• Ohne Elli wäre jede Person mit dem eigenen Diesel-Auto gefahren.</Text>
        <Text style={styles.bullet}>• Gespeichert werden nur Kilometer und Personenzahl — keine Adressen, keine Strecken.</Text>
        <Text style={styles.bullet}>• Alle Werte sind Schätzungen, keine Messung am Auspuff.</Text>

        <Text style={styles.h2}>Quellen und Werte</Text>
        {CO2_SOURCES.map((s) => (
          <View key={s.label} style={styles.source}>
            <Text style={styles.sourceLabel}>{s.label}</Text>
            <Text style={styles.sourceDetail}>{s.detail}</Text>
          </View>
        ))}

        <Text style={styles.h2}>Pilotprojekt LandStation</Text>
        <Text style={styles.body}>
          Elli ist Teil des Förderprogramms LandStation für vernetzte Mobilität auf dem Land. Die Gesamtbilanz aller
          Fahrten:
        </Text>
        <View style={styles.statGrid}>
          <Stat label="Fahrten" value={num(pilot?.rides ?? 0, 0)} styles={styles} />
          <Stat label="Fahrgäste" value={num(pilot?.passengers ?? 0, 0)} styles={styles} />
          <Stat label="Personen-km" value={num(pilot?.passengerKm ?? 0, 0)} styles={styles} />
          <Stat label="Elli-km inkl. Anfahrt" value={num(pilot?.vehicleKm ?? 0, 0)} styles={styles} />
        </View>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>CO₂ gespart</Text>
          <Text style={styles.totalValue}>{formatCo2(pilot?.savedGrams ?? 0)}</Text>
          {pilot?.since ? (
            <Text style={styles.totalSince}>
              seit {new Date(pilot.since).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          ) : (
            <Text style={styles.totalSince}>Noch keine Fahrten erfasst</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, styles }: { label: string; value: string; styles: any }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 52 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: colors.textPrimary, fontSize: 18, fontFamily: fontFamily.semiBold },
    content: { paddingHorizontal: 20, paddingBottom: 48 },
    lead: { color: colors.textPrimary, fontSize: 18, lineHeight: 26, fontFamily: fontFamily.regular, marginTop: 8 },
    h2: { color: colors.textPrimary, fontSize: 22, fontFamily: fontFamily.heading, marginTop: 28, marginBottom: 10 },
    body: { color: colors.textSecondary, fontSize: 16, lineHeight: 24, fontFamily: fontFamily.regular, marginBottom: 10 },
    strong: { color: colors.textPrimary, fontFamily: fontFamily.semiBold },
    bullet: { color: colors.textSecondary, fontSize: 16, lineHeight: 24, fontFamily: fontFamily.regular, marginBottom: 4 },
    formula: { backgroundColor: colors.successBackground, borderRadius: 12, padding: 16, marginBottom: 14 },
    formulaText: { color: colors.textPrimary, fontSize: 15, lineHeight: 24, fontFamily: fontFamily.monoMedium },
    source: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    sourceLabel: { color: colors.textPrimary, fontSize: 16, fontFamily: fontFamily.semiBold },
    sourceDetail: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, fontFamily: fontFamily.regular, marginTop: 2 },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
    stat: { width: '48%', backgroundColor: colors.surface, borderRadius: 12, padding: 14, flexGrow: 1 },
    statValue: { color: colors.textPrimary, fontSize: 22, fontFamily: fontFamily.heading, fontVariant: ['tabular-nums'] },
    statLabel: { color: colors.textSecondary, fontSize: 13, fontFamily: fontFamily.regular, marginTop: 2 },
    totalBox: { backgroundColor: ELLI_GREEN, borderRadius: 14, padding: 18, marginTop: 10, alignItems: 'center' },
    totalLabel: { color: '#fff', fontSize: 15, fontFamily: fontFamily.medium },
    totalValue: { color: '#fff', fontSize: 36, fontFamily: fontFamily.heading, fontVariant: ['tabular-nums'] },
    totalSince: { color: '#fff', opacity: 0.85, fontSize: 13, fontFamily: fontFamily.regular, marginTop: 2 },
  });
