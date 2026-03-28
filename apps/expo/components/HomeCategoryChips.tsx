import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { EVENT_CATEGORIES, EventCategory } from '@/lib/categories';
import CategoryCard from './CategoryCard';

type Props = {
  onCategoryPress: (category: EventCategory) => void;
};

export default function HomeCategoryChips({ onCategoryPress }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.contentContainer}
      style={styles.scroll}
    >
      {EVENT_CATEGORIES.map((category) => (
        <CategoryCard
          key={category}
          category={category}
          onPress={() => onCategoryPress(category)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    marginBottom: 16,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
});
