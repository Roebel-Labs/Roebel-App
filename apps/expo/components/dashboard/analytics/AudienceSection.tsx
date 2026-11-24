import React from 'react';
import { StyleSheet, View } from 'react-native';
import LineAreaChart from '@/components/charts/LineAreaChart';
import StackedBarChart from '@/components/charts/StackedBarChart';
import MetricTile from '@/components/charts/MetricTile';
import { bucketSeries } from '@/lib/charts/geometry';
import { deltaPercent, eachDay, shortDayLabel, type DayRange } from '@/lib/charts/ranges';
import { useAnalyticsSeries, useAnalyticsTotals, useUniques, sumSeries } from '@/hooks/useOrgAnalytics';
import Card from './Card';

export default function AudienceSection({ range }: { range: DayRange }) {
  const days = eachDay(range);
  const labels = days.map(shortDayLabel);
  const profileViews = useAnalyticsSeries(range, ['view'], 'profile');
  const follows = useAnalyticsSeries(range, ['follow', 'unfollow'], 'profile');
  const uniques = useUniques(range);
  const totals = useAnalyticsTotals(range, 'profile');

  const weekly = days.length > 31;
  const barLabels = weekly ? bucketSeries(days.map(() => 0), 7).map((_, i) => `ab ${labels[i * 7]}`) : labels;
  const f = totals.data?.follow ?? { current: 0, previous: 0 };
  const u = totals.data?.unfollow ?? { current: 0, previous: 0 };

  return (
    <View style={styles.wrap}>
      <Card loading={totals.isLoading} error={totals.error ? 'Statistiken sind gerade nicht verfügbar.' : null}>
        <View style={styles.grid}>
          <MetricTile label="Neue Follower" value={f.current} delta={deltaPercent(f.current, f.previous)} />
          <MetricTile label="Netto" value={f.current - u.current} delta={deltaPercent(f.current - u.current, f.previous - u.previous)} />
        </View>
      </Card>
      <Card title="Profilaufrufe" loading={profileViews.isLoading}>
        <LineAreaChart values={sumSeries(profileViews.data, ['view'], days.length)} labels={labels} />
      </Card>
      <Card title="Follower" subtitle="Neu und entfolgt" loading={follows.isLoading}>
        <StackedBarChart
          labels={barLabels}
          series={[
            { label: 'Neu', values: bucketSeries(sumSeries(follows.data, ['follow'], days.length), 7) },
            { label: 'Entfolgt', values: bucketSeries(sumSeries(follows.data, ['unfollow'], days.length), 7) },
          ]}
        />
      </Card>
      <Card title="Erreichte Personen" subtitle="Verschiedene Betrachter pro Tag (letzte 90 Tage)" loading={uniques.isLoading}>
        <LineAreaChart values={uniques.data ?? new Array(days.length).fill(0)} labels={labels} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
