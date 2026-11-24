/** Key-metric tile: label, big number, Δ% vs previous period ("neu" when there was nothing). Selected = drives the main chart. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { formatCompact } from '@/lib/charts/geometry';

type Props = { label: string; value: number; delta: number | null; selected?: boolean; onPress?: () => void };

export default function MetricTile({ label, value, delta, selected, onPress }: Props) {
  const { colors, isDark } = useTheme();
  const selBg = isDark ? 'rgba(91,155,224,0.16)' : '#EAF2FB';
  const selBorder = isDark ? '#5B9BE0' : '#00498B';
  const up = delta !== null && delta > 0;
  const down = delta !== null && delta < 0;
  const deltaText = delta === null ? 'neu' : `${up ? '+' : ''}${delta} %`;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={`${label} ${value}, ${delta === null ? 'neu' : `${delta} Prozent zur Vorperiode`}`}
      style={[
        styles.tile,
        { borderColor: selected ? selBorder : colors.border, backgroundColor: selected ? selBg : colors.card },
      ]}
    >
      <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.value, { color: colors.textPrimary }]}>{formatCompact(value)}</Text>
      <View style={styles.deltaRow}>
        <Text
          style={[
            styles.delta,
            { color: up ? (isDark ? '#4ade80' : '#047857') : down ? (isDark ? '#f87171' : '#b91c1c') : colors.textTertiary },
          ]}
        >
          {up ? '▲ ' : down ? '▼ ' : ''}
          {deltaText}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, minWidth: '45%', borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  label: { fontFamily: fontFamily.medium, fontSize: 14 },
  value: { fontFamily: fontFamily.semiBold, fontSize: 28, letterSpacing: -0.5 },
  deltaRow: { flexDirection: 'row' },
  delta: { fontFamily: fontFamily.medium, fontSize: 12 },
});
