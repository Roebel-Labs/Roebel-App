import React from 'react';
import { StyleSheet, View } from 'react-native';
import LineAreaChart from '@/components/charts/LineAreaChart';
import { eachDay, shortDayLabel, type DayRange } from '@/lib/charts/ranges';
import { useAnalyticsSeries, useTopObjects, sumSeries } from '@/hooks/useOrgAnalytics';
import Card from './Card';
import TopList from './TopList';

export default function MiniAppsSection({ range }: { range: DayRange }) {
  const days = eachDay(range);
  const opens = useAnalyticsSeries(range, ['open'], 'mini_app');
  const top = useTopObjects(range, 'open');
  return (
    <View style={styles.wrap}>
      <Card title="Mini-App-Öffnungen" loading={opens.isLoading} error={opens.error ? 'Nicht verfügbar.' : null}>
        <LineAreaChart values={sumSeries(opens.data, ['open'], days.length)} labels={days.map(shortDayLabel)} />
      </Card>
      <Card title="Meistgeöffnet" loading={top.isLoading}>
        <TopList items={(top.data ?? []).filter((o) => o.objectType === 'mini_app')} unit="×" />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: 14 } });
