import React, { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import MetricTile from '@/components/charts/MetricTile';
import LineAreaChart from '@/components/charts/LineAreaChart';
import { deltaPercent, eachDay, previousRange, shortDayLabel, type DayRange } from '@/lib/charts/ranges';
import { useAnalyticsSeries, useAnalyticsTotals, sumSeries } from '@/hooks/useOrgAnalytics';
import Card from './Card';
import { OVERVIEW_TILES, tileTotal } from './tiles';

export default function OverviewSection({ range }: { range: DayRange }) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState(OVERVIEW_TILES[0].key);
  const [compare, setCompare] = useState(false);
  const tile = OVERVIEW_TILES.find((t) => t.key === selected)!;

  const all = useAnalyticsTotals(range, null);
  const posts = useAnalyticsTotals(range, 'post');
  const profile = useAnalyticsTotals(range, 'profile');
  const totalsFor = (type: string | null) => (type === 'post' ? posts.data : type === 'profile' ? profile.data : all.data);

  const prev = useMemo(() => previousRange(range), [range]);
  const cur = useAnalyticsSeries(range, tile.metrics, tile.objectType);
  const before = useAnalyticsSeries(prev, compare ? tile.metrics : [], tile.objectType);
  const days = eachDay(range);
  const values = sumSeries(cur.data, tile.metrics, days.length);
  const previousValues = compare ? sumSeries(before.data, tile.metrics, days.length) : null;

  const error = all.error ? 'Statistiken sind gerade nicht verfügbar.' : null;

  return (
    <View style={styles.wrap}>
      <Card title="Kennzahlen" subtitle={`${shortDayLabel(range.from)} – ${shortDayLabel(range.to)}`} loading={all.isLoading} error={error}>
        <View style={styles.grid}>
          {OVERVIEW_TILES.map((t) => {
            const v = tileTotal(t, totalsFor(t.objectType));
            return (
              <MetricTile
                key={t.key}
                label={t.label}
                value={v.current}
                delta={deltaPercent(v.current, v.previous)}
                selected={t.key === selected}
                onPress={() => setSelected(t.key)}
              />
            );
          })}
        </View>
      </Card>

      <Card title={tile.label} loading={cur.isLoading} error={cur.error ? 'Verlauf nicht verfügbar.' : null}>
        <LineAreaChart values={values} previous={previousValues} labels={days.map(shortDayLabel)} />
        <View style={styles.compareRow}>
          <Text style={[styles.compareText, { color: colors.textPrimary }]}>Vorperiode vergleichen</Text>
          <Switch value={compare} onValueChange={setCompare} />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  compareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compareText: { fontFamily: fontFamily.medium, fontSize: 15 },
});
