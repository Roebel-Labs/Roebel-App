import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import StackedBarChart from '@/components/charts/StackedBarChart';
import { bucketSeries } from '@/lib/charts/geometry';
import { eachDay, shortDayLabel, type DayRange } from '@/lib/charts/ranges';
import { useAnalyticsSeries, useTopObjects, sumSeries } from '@/hooks/useOrgAnalytics';
import type { AnalyticsMetric } from '@/lib/analytics/queries';
import Card from './Card';
import TopList from './TopList';

const VIEW_METRICS: AnalyticsMetric[] = ['view', 'impression', 'open'];
const TYPES = [
  { type: 'post' as const, label: 'Beiträge' },
  { type: 'deal' as const, label: 'Anzeigen' },
  { type: 'event' as const, label: 'Veranstaltungen' },
  { type: 'mini_app' as const, label: 'Mini-Apps' },
];
const TOP_METRICS: { metric: AnalyticsMetric; label: string; unit: string }[] = [
  { metric: 'impression', label: 'Impressionen', unit: 'Impr.' },
  { metric: 'view', label: 'Aufrufe', unit: 'Aufr.' },
  { metric: 'like', label: 'Likes', unit: 'Likes' },
  { metric: 'comment', label: 'Kommentare', unit: 'Komm.' },
  { metric: 'share', label: 'Geteilt', unit: 'geteilt' },
];

export default function ContentSection({ range }: { range: DayRange }) {
  const { colors } = useTheme();
  const [topMetric, setTopMetric] = useState(TOP_METRICS[0]);
  const days = eachDay(range);
  const post = useAnalyticsSeries(range, VIEW_METRICS, 'post');
  const deal = useAnalyticsSeries(range, VIEW_METRICS, 'deal');
  const event = useAnalyticsSeries(range, VIEW_METRICS, 'event');
  const mini = useAnalyticsSeries(range, VIEW_METRICS, 'mini_app');
  const results = [post, deal, event, mini];
  const top = useTopObjects(range, topMetric.metric);

  const weekly = days.length > 31;
  const labels = weekly
    ? bucketSeries(days.map(() => 0), 7).map((_, i) => `ab ${shortDayLabel(days[i * 7])}`)
    : days.map(shortDayLabel);
  const series = TYPES.map((t, i) => ({
    label: t.label,
    values: bucketSeries(sumSeries(results[i].data, VIEW_METRICS, days.length), 7),
  }));

  return (
    <View style={styles.wrap}>
      <Card
        title="Aufrufe nach Inhalt"
        subtitle={weekly ? 'pro Woche' : 'pro Tag'}
        loading={results.some((r) => r.isLoading)}
        error={results.some((r) => r.error) ? 'Statistiken sind gerade nicht verfügbar.' : null}
      >
        <StackedBarChart series={series} labels={labels} />
      </Card>

      <Card title="Top-Inhalte" loading={top.isLoading} error={top.error ? 'Nicht verfügbar.' : null}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {TOP_METRICS.map((m) => {
            const on = m.metric === topMetric.metric;
            return (
              <Pressable
                key={m.metric}
                onPress={() => setTopMetric(m)}
                style={[styles.chip, { backgroundColor: on ? colors.textPrimary : colors.surface }]}
              >
                <Text style={[styles.chipText, { color: on ? colors.background : colors.textPrimary }]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <TopList items={top.data ?? []} unit={topMetric.unit} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  chips: { gap: 8 },
  chip: { height: 32, borderRadius: 999, paddingHorizontal: 12, justifyContent: 'center' },
  chipText: { fontFamily: fontFamily.medium, fontSize: 13 },
});
