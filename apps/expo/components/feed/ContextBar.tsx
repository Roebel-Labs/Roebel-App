import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

const DAYS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export default function ContextBar() {
  const { colors } = useTheme();
  const now = new Date();
  const dayName = DAYS_DE[now.getDay()];
  const day = now.getDate();
  const month = MONTHS_DE[now.getMonth()];

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      <Text style={[styles.item, { color: colors.textSecondary }]}>☀️ Röbel</Text>
      <Text style={[styles.separator, { color: colors.border }]}>|</Text>
      <Text style={[styles.item, { color: colors.textSecondary }]}>🌊 Müritz</Text>
      <Text style={[styles.separator, { color: colors.border }]}>|</Text>
      <Text style={[styles.item, { color: colors.success }]}>{dayName}, {day}. {month}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  item: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  separator: {
    fontSize: 13,
  },
});
