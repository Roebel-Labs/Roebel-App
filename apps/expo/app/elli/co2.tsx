// Elli CO₂-Bilanz: how much CO₂ the rider saved by riding Elli instead of
// their own diesel car, their rides, the town-wide pilot total and everyday
// equivalents. Method + factors: lib/elli/co2.ts, explained in ./co2-info.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { fontFamily } from '@/constants/theme';
import InfoIcon from '@/assets/icons/information-circle.svg';
import { ELLI_GREEN, LeafIcon } from '@/components/elli/LeafIcon';
import { equivalents, formatCo2, formatEquivalent, type Co2Totals } from '@/lib/elli/co2';
import { fetchMyElliRides, fetchPilotTotals, type ElliRide, type PilotTotals } from '@/lib/elli/co2-data';

const EQUIV_EMOJI = { diesel: '⛽', km: '🚗', phone: '📱', forest: '🌳' } as const;

const kmDe = (km: number) => km.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const dateDe = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });

export default function ElliCo2Screen() {
  const { colors } = useTheme();
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  const [rides, setRides] = useState<ElliRide[]>([]);
  const [totals, setTotals] = useState<Co2Totals | null>(null);
  const [pilot, setPilot] = useState<PilotTotals | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [mine, town] = await Promise.all([fetchMyElliRides(user?.wallet_address), fetchPilotTotals()]);
    setRides(mine.rides);
    setTotals(mine.totals);
    setPilot(town);
  }, [user?.wallet_address]);

  useEffect(() => {
    load();
  }, [load]);

  const saved = totals?.savedGrams ?? 0;
  // Like Uber: show what the rider's own saving equals, or 10 kg as an example.
  const equivGrams = saved >= 1000 ? saved : 10_000;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <View style={[styles.hero, { paddingTop: insets.top + 8 }]}>
          <View style={styles.heroBar}>
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Schließen" style={styles.heroBtn}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/elli/co2-info' as any)}
              hitSlop={12}
              accessibilityLabel="So rechnen wir"
              style={styles.heroBtn}
            >
              <InfoIcon width={28} height={28} color="#fff" />
            </Pressable>
          </View>
          <View style={styles.pill}>
            <LeafIcon size={34} />
            <Text style={styles.pillText} accessibilityLabel={`${formatCo2(saved)} CO₂ gespart`}>
              {formatCo2(saved)}
            </Text>
          </View>
          <Text style={styles.heroLabel}>Geschätzt eingespartes CO₂</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>Deine Elli-Fahrten</Text>
          <Text style={styles.body}>
            Jede Fahrt mit Elli statt im eigenen Diesel-Auto zählt — Elli fährt 100 % elektrisch mit Ökostrom.
          </Text>
          {rides.length === 0 ? (
            <View style={styles.row}>
              <View style={styles.tile}>
                <Text style={styles.tileEmoji}>🚐</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Elli</Text>
                <Text style={styles.rowSub}>Nissan e-NV200 · elektrisch</Text>
              </View>
              <View style={styles.rowRight}>
                <View style={styles.badge}>
                  <LeafIcon size={14} color={colors.textSecondary} />
                  <Text style={styles.badgeText}>0 g</Text>
                </View>
                <Text style={styles.rowSub}>0 Fahrten</Text>
              </View>
            </View>
          ) : (
            rides.map((r, i) => (
              <View key={r.id} style={[styles.row, i > 0 && styles.rowDivider]}>
                <View style={styles.tile}>
                  <Text style={styles.tileEmoji}>🚐</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{dateDe(r.completedAt)}</Text>
                  <Text style={styles.rowSub}>
                    {kmDe(r.rideKm)} km{r.passengers > 1 ? ` · ${r.passengers} Personen` : ''}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <View style={styles.badge}>
                    <LeafIcon size={14} color={ELLI_GREEN} />
                    <Text style={styles.badgeText}>{formatCo2(r.savedGrams)}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {pilot && pilot.rides > 0 ? (
          <>
            <View style={styles.gap} />
            <View style={styles.section}>
              <Text style={styles.h2}>Ganz Röbel mit Elli</Text>
              <Text style={styles.body}>
                {pilot.rides.toLocaleString('de-DE')} Fahrten · {kmDe(pilot.passengerKm)} Personen-km ·{' '}
                <Text style={styles.strong}>{formatCo2(pilot.savedGrams)} CO₂ gespart</Text>
              </Text>
            </View>
          </>
        ) : null}

        <View style={styles.gap} />

        <View style={styles.section}>
          <Text style={styles.h2}>{formatCo2(equivGrams)} CO₂ entsprechen …</Text>
          {equivalents(equivGrams).map((e, i) => (
            <View key={e.key} style={[styles.row, i > 0 && styles.rowDivider]}>
              <View style={[styles.tile, styles.equivTile]}>
                <Text style={styles.tileEmoji}>{EQUIV_EMOJI[e.key]}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.equivValue}>{formatEquivalent(e)}</Text>
                <Text style={styles.rowSub}>{e.label}</Text>
              </View>
            </View>
          ))}
          <Pressable onPress={() => router.push('/elli/co2-info' as any)} style={styles.methodLink}>
            <Text style={styles.methodLinkText}>So rechnen wir →</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    hero: { backgroundColor: ELLI_GREEN, paddingHorizontal: 20, paddingBottom: 28, alignItems: 'center' },
    heroBar: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    heroBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    close: { color: '#fff', fontSize: 28, lineHeight: 32, fontFamily: fontFamily.medium },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: '#000',
      borderRadius: 999,
      paddingHorizontal: 28,
      paddingVertical: 12,
    },
    pillText: { color: '#fff', fontSize: 44, fontFamily: fontFamily.heading, fontVariant: ['tabular-nums'] },
    heroLabel: { color: '#fff', fontSize: 22, fontFamily: fontFamily.heading, marginTop: 14 },
    section: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
    h2: { color: colors.textPrimary, fontSize: 26, fontFamily: fontFamily.heading, marginBottom: 6 },
    body: { color: colors.textSecondary, fontSize: 16, lineHeight: 23, fontFamily: fontFamily.regular, marginBottom: 12 },
    strong: { color: colors.textPrimary, fontFamily: fontFamily.semiBold },
    gap: { height: 8, backgroundColor: colors.backdrop, marginTop: 16 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 16 },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    tile: {
      width: 64,
      height: 64,
      borderRadius: 14,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    equivTile: { backgroundColor: colors.successBackground },
    tileEmoji: { fontSize: 30 },
    rowText: { flex: 1 },
    rowTitle: { color: colors.textPrimary, fontSize: 18, fontFamily: fontFamily.semiBold },
    rowSub: { color: colors.textSecondary, fontSize: 15, fontFamily: fontFamily.regular, marginTop: 2 },
    rowRight: { alignItems: 'flex-end' },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.surface,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    badgeText: { color: colors.textPrimary, fontSize: 15, fontFamily: fontFamily.medium },
    equivValue: { color: colors.textPrimary, fontSize: 20, fontFamily: fontFamily.heading },
    methodLink: { paddingVertical: 16 },
    methodLinkText: { color: colors.primary, fontSize: 16, fontFamily: fontFamily.semiBold },
  });
