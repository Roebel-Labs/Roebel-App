import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { StarIcon } from '@/components/Icons';
import type { AccountRatingSummary } from '@/lib/types';

type Props = {
  summary: AccountRatingSummary | null;
  size?: 'sm' | 'md';
  showCount?: boolean;
};

function formatCount(n: number): string {
  if (n >= 500) return `${Math.floor(n / 100) * 100}+`;
  if (n >= 100) return `${Math.floor(n / 100) * 100}+`;
  return String(n);
}

export default function RatingSummary({ summary, size = 'md', showCount = true }: Props) {
  const { colors } = useTheme();
  const hasRatings = summary && summary.rating_count > 0;
  const avg = hasRatings ? summary!.avg_stars.toFixed(1) : '–';
  const count = hasRatings ? formatCount(summary!.rating_count) : '0';
  const fontSize = size === 'sm' ? 13 : 15;
  const iconSize = size === 'sm' ? 14 : 16;
  return (
    <View style={styles.row}>
      <Text style={[styles.value, { color: colors.textPrimary, fontSize }]}>{avg}</Text>
      <StarIcon size={iconSize} color="#FFB400" />
      {showCount && (
        <Text style={[styles.count, { color: colors.textSecondary, fontSize: fontSize - 1 }]}>
          ({count})
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  value: { fontFamily: 'Inter-SemiBold' },
  count: { fontFamily: 'Inter-Regular' },
});
