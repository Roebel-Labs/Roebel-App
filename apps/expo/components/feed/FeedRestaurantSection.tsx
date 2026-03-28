import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import RestaurantSection from '@/components/RestaurantSection';
import type { RestaurantRecord } from '@/lib/types';

type Props = {
  restaurants: RestaurantRecord[];
};

export default function FeedRestaurantSection({ restaurants }: Props) {
  const { colors } = useTheme();

  if (restaurants.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <RestaurantSection restaurants={restaurants} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    paddingVertical: 8,
  },
});
