/** Share-of-total donut with a legend that carries labels + values (identity never by color alone). */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { formatCompact } from '@/lib/charts/geometry';
import { seriesColors } from './palette';

type Slice = { label: string; value: number };

export default function DonutChart({ slices, size = 132, centerLabel }: { slices: Slice[]; size?: number; centerLabel?: string }) {
  const { colors, isDark } = useTheme();
  const palette = seriesColors(isDark);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <View style={styles.row}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
          {total > 0
            ? slices.map((s, i) => {
                const len = (s.value / total) * c;
                const gap = slices.filter((x) => x.value > 0).length > 1 ? 2 : 0;
                const el = (
                  <Circle
                    key={s.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={palette[i % palette.length]}
                    strokeWidth={stroke}
                    fill="none"
                    strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += len;
                return s.value > 0 ? el : null;
              })
            : null}
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={[styles.total, { color: colors.textPrimary }]}>{formatCompact(total)}</Text>
          {centerLabel ? <Text style={[styles.centerLabel, { color: colors.textSecondary }]}>{centerLabel}</Text> : null}
        </View>
      </View>
      <View style={styles.legend}>
        {slices.map((s, i) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: palette[i % palette.length] }]} />
            <Text style={[styles.legendLabel, { color: colors.textSecondary }]} numberOfLines={1}>
              {s.label}
            </Text>
            <Text style={[styles.legendValue, { color: colors.textPrimary }]}>{formatCompact(s.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  center: { alignItems: 'center', justifyContent: 'center' },
  total: { fontFamily: fontFamily.semiBold, fontSize: 22 },
  centerLabel: { fontFamily: fontFamily.regular, fontSize: 11 },
  legend: { flex: 1, gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { flex: 1, fontFamily: fontFamily.regular, fontSize: 13 },
  legendValue: { fontFamily: fontFamily.semiBold, fontSize: 13 },
});
