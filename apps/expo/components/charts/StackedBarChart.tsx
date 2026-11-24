/** Stacked daily bars per category (fixed palette order), 2px surface gap between segments, tap a bar for its numbers. */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { formatCompact } from '@/lib/charts/geometry';
import { seriesColors } from './palette';

export type StackSeries = { label: string; values: number[] };

type Props = { series: StackSeries[]; labels: string[]; height?: number };

export default function StackedBarChart({ series, labels, height = 160 }: Props) {
  const { colors, isDark } = useTheme();
  const palette = seriesColors(isDark);
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((s, ser) => s + (ser.values[i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const slot = n > 0 ? width / n : 0;
  const barW = Math.max(2, Math.min(18, slot - 3));
  const empty = totals.every((t) => t === 0);

  return (
    <View>
      <View style={styles.legend}>
        {series.map((s, i) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: palette[i % palette.length] }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>{s.label}</Text>
          </View>
        ))}
      </View>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && !empty ? (
          <Svg width={width} height={height}>
            {labels.map((_, i) => {
              let y = height;
              return series.map((s, si) => {
                const v = s.values[i] ?? 0;
                if (v <= 0) return null;
                const h = Math.max(1, (v / max) * height - 2);
                y -= h + 2;
                return (
                  <Rect
                    key={`${i}-${si}`}
                    x={i * slot + (slot - barW) / 2}
                    y={y + 2}
                    width={barW}
                    height={h}
                    rx={Math.min(4, barW / 2)}
                    fill={palette[si % palette.length]}
                    opacity={picked === null || picked === i ? 1 : 0.35}
                  />
                );
              });
            })}
          </Svg>
        ) : null}
        {empty ? (
          <View style={[StyleSheet.absoluteFill, styles.emptyWrap]}>
            <Text style={[styles.empty, { color: colors.textSecondary }]}>Noch keine Daten in diesem Zeitraum</Text>
          </View>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.hitRow]}>
            {labels.map((l, i) => (
              <Pressable
                key={l + i}
                style={{ width: slot, height }}
                onPress={() => setPicked((p) => (p === i ? null : i))}
                accessibilityLabel={`${l}: ${totals[i]}`}
              />
            ))}
          </View>
        )}
      </View>
      {picked !== null ? (
        <Text style={[styles.detail, { color: colors.textPrimary }]}>
          {labels[picked]}: {series.map((s) => `${s.label} ${formatCompact(s.values[picked] ?? 0)}`).join(' · ')}
        </Text>
      ) : (
        <View style={styles.axis}>
          <Text style={[styles.axisText, { color: colors.textTertiary }]}>{labels[0] ?? ''}</Text>
          <Text style={[styles.axisText, { color: colors.textTertiary }]}>{labels[n - 1] ?? ''}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontFamily: fontFamily.medium, fontSize: 12 },
  hitRow: { flexDirection: 'row' },
  emptyWrap: { alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: fontFamily.medium, fontSize: 14 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  axisText: { fontFamily: fontFamily.regular, fontSize: 12 },
  detail: { marginTop: 8, fontFamily: fontFamily.medium, fontSize: 13 },
});
