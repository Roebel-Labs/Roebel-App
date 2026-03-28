import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import SpecialMenuGrid from '@/components/SpecialMenuGrid';
import type { SpecialMenuRecord } from '@/lib/types';

type Props = {
  menus: SpecialMenuRecord[];
};

export default function FeedSpecialMenuSection({ menus }: Props) {
  const { colors } = useTheme();

  if (menus.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Aktuelle Speisekarten</Text>
      <SpecialMenuGrid menus={menus} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
  },
});
