import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import DonutChart from '@/components/charts/DonutChart';
import { formatCompact } from '@/lib/charts/geometry';
import type { DayRange } from '@/lib/charts/ranges';
import { useAnalyticsTotals, useSurfaces } from '@/hooks/useOrgAnalytics';
import Card from './Card';
import { INTERACTION_METRICS, SURFACE_LABELS, engagementRate } from './tiles';

export default function EngagementSection({ range }: { range: DayRange }) {
  const { colors } = useTheme();
  const totals = useAnalyticsTotals(range, null);
  const surfaces = useSurfaces(range);
  const t = totals.data;
  const interactions = t ? INTERACTION_METRICS.reduce((s, m) => s + t[m.metric].current, 0) + t.link_tap.current : 0;
  const views = t ? t.view.current + t.impression.current : 0;
  const maxSurface = Math.max(1, ...(surfaces.data ?? []).map((s) => s.count));

  return (
    <View style={styles.wrap}>
      <Card title="Interaktionsrate" subtitle="Interaktionen je Aufruf" loading={totals.isLoading} error={totals.error ? 'Nicht verfügbar.' : null}>
        <Text style={[styles.hero, { color: colors.textPrimary }]}>{engagementRate(interactions, views)}</Text>
        <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
          {formatCompact(interactions)} Interaktionen · {formatCompact(views)} Aufrufe
        </Text>
      </Card>
      <Card title="Interaktionen nach Art" loading={totals.isLoading}>
        <DonutChart
          centerLabel="gesamt"
          slices={INTERACTION_METRICS.map((m) => ({ label: m.label, value: t ? t[m.metric].current : 0 }))}
        />
      </Card>
      <Card title="Wo es passiert" subtitle="Letzte 90 Tage" loading={surfaces.isLoading}>
        {(surfaces.data ?? []).length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>Noch keine Daten in diesem Zeitraum</Text>
        ) : (
          (surfaces.data ?? []).map((s) => (
            <View key={s.surface} style={styles.barRow}>
              <Text style={[styles.barLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                {SURFACE_LABELS[s.surface] ?? s.surface}
              </Text>
              <View style={[styles.barTrack, { backgroundColor: colors.surface }]}>
                <View style={[styles.barFill, { width: `${(s.count / maxSurface) * 100}%`, backgroundColor: colors.textPrimary }]} />
              </View>
              <Text style={[styles.barValue, { color: colors.textPrimary }]}>{formatCompact(s.count)}</Text>
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  hero: { fontFamily: fontFamily.heading, fontSize: 44 },
  heroSub: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: -6 },
  empty: { fontFamily: fontFamily.medium, fontSize: 14, paddingVertical: 16, textAlign: 'center' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { width: 110, fontFamily: fontFamily.regular, fontSize: 13 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barValue: { width: 48, textAlign: 'right', fontFamily: fontFamily.semiBold, fontSize: 13 },
});
