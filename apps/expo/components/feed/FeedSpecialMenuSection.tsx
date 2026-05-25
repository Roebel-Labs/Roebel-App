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
      <Text style={[styles.title, { color: colors.textPrimary }]}>Mittagstisch</Text>
      <SpecialMenuGrid menus={menus} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    paddingVertical: 16,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter-Medium',
    // Match the grid's own horizontal padding so the left card aligns with the headline.
    paddingHorizontal: 16,
  },
});
