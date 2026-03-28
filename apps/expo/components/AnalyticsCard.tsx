import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  label: string;
  value: number | string;
};

export default function AnalyticsCard({ label, value }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.value, { color: colors.textPrimary }]}>
        {typeof value === 'number' ? value.toLocaleString('de-DE') : value}
      </Text>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    minWidth: '45%',
  },
  value: {
    fontSize: 24,
    fontFamily: 'Inter-Medium',
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
});
