/** Org Profil "Überblick": four key numbers + a 28-day trend, linking to the Dashboard tab. Owner/admin only. */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import LineAreaChart from '@/components/charts/LineAreaChart';
import { formatCompact } from '@/lib/charts/geometry';
import { eachDay, rangeDates, shortDayLabel } from '@/lib/charts/ranges';
import { goToTab } from '@/lib/navigation/goToTab';
import { useAnalyticsSeries, useAnalyticsTotals, sumSeries } from '@/hooks/useOrgAnalytics';
import { orgOverviewMetrics } from '@/components/dashboard/analytics/tiles';

const PLACEHOLDERS = ['Beitragsaufrufe', 'Profilaufrufe', 'Neue Follower', 'Interaktionen'].map((label) => ({
  label,
  value: 0,
  delta: null as number | null,
}));

export default function OrgOverviewCard() {
  const { colors } = useTheme();
  const pathname = usePathname();
  const range = useMemo(() => rangeDates('28d', new Date()), []);
  const all = useAnalyticsTotals(range, null);
  const posts = useAnalyticsTotals(range, 'post');
  const profile = useAnalyticsTotals(range, 'profile');
  const trend = useAnalyticsSeries(range, ['view', 'impression', 'open']);
  const days = eachDay(range);

  if (all.error) return null; // analytics not available yet: keep the profile clean
  const metrics = all.data && posts.data && profile.data ? orgOverviewMetrics(all.data, posts.data, profile.data) : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Überblick</Text>
        <Text style={[styles.range, { color: colors.textSecondary }]}>Letzte 28 Tage</Text>
      </View>
      <View style={styles.grid}>
        {(metrics ?? PLACEHOLDERS).map((m, i) => (
          <View
            key={m.label}
            style={[
              styles.cell,
              i % 2 === 1 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
              i >= 2 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
            ]}
          >
            <Text style={[styles.label, { color: colors.textPrimary }]}>{m.label}</Text>
            <Text style={[styles.value, { color: colors.textPrimary }]}>{metrics ? formatCompact(m.value) : '–'}</Text>
            {metrics ? (
              <Text style={[styles.delta, { color: colors.textSecondary }]}>
                {m.delta === null ? 'neu' : `${m.delta > 0 ? '+' : ''}${m.delta} %`}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      <LineAreaChart
        height={110}
        values={sumSeries(trend.data, ['view', 'impression', 'open'], days.length)}
        labels={days.map(shortDayLabel)}
      />
      <Pressable onPress={() => goToTab('dashboard', pathname)} style={styles.link} accessibilityRole="button">
        <Text style={[styles.linkText, { color: colors.textPrimary }]}>Zum Dashboard</Text>
        <Feather name="chevron-right" size={18} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderRadius: 18, padding: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontFamily: fontFamily.heading, fontSize: 20 },
  range: { fontFamily: fontFamily.regular, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', paddingVertical: 12, paddingHorizontal: 12, gap: 4 },
  label: { fontFamily: fontFamily.medium, fontSize: 14 },
  value: { fontFamily: fontFamily.semiBold, fontSize: 26 },
  delta: { fontFamily: fontFamily.regular, fontSize: 12 },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  linkText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
});
