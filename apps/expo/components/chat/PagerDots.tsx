import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

export type PagerDotsProps = {
  count: number;
  index: number;
  style?: StyleProp<ViewStyle>;
};

/** Small onboarding pager dots (refs 2/3): 6pt, active dark grey. */
export function PagerDots({ count, index, style }: PagerDotsProps) {
  const { isDark } = useTheme();
  const active = isDark ? '#D0D0D4' : '#6B6B70';
  const idle = isDark ? '#3A3A3E' : '#E2E2E5';
  return (
    <View style={[styles.row, style]} accessibilityRole="adjustable" accessibilityValue={{ min: 1, max: count, now: index + 1 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: i === index ? active : idle }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});

export default PagerDots;
