/** "7 Tage · 28 Tage · 90 Tage · 365 Tage · Zeitraum" — horizontally scrolling pills, selected = filled ink. */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { RANGE_KEYS, RANGE_LABELS, type RangeKey } from '@/lib/charts/ranges';

type Props = { value: RangeKey; onChange: (k: RangeKey) => void; customLabel?: string | null };

export default function RangePills({ value, onChange, customLabel }: Props) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {RANGE_KEYS.map((k) => {
        const on = k === value;
        return (
          <Pressable
            key={k}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(k);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.pill, { backgroundColor: on ? colors.textPrimary : colors.surface }]}
          >
            <Text style={[styles.text, { color: on ? colors.background : colors.textPrimary }]}>
              {k === 'custom' && on && customLabel ? customLabel : RANGE_LABELS[k]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16 },
  pill: { height: 38, borderRadius: 999, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fontFamily.medium, fontSize: 15 },
});
