import React from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

type CategoryChip = {
  key: string;
  label: string;
  route: string;
};

const EXPLORE_CATEGORIES: CategoryChip[] = [
  { key: 'events', label: 'Veranstaltungen', route: '/category/all' },
  { key: 'news', label: 'Neuigkeiten', route: '/news' },
  { key: 'restaurants', label: 'Gastronomie', route: '/restaurant' },
  { key: 'movies', label: 'Kino', route: '/movies' },
  { key: 'businesses', label: 'Unternehmen', route: '/businesses' },
  { key: 'deals', label: 'Angebote', route: '/deals' },
  { key: 'marketplace', label: 'Marktplatz', route: '/marketplace' },
  { key: 'map', label: 'Karte', route: '/location' },
];

export default function ExploreCategoryChips() {
  const router = useRouter();
  const { colors } = useTheme();

  const renderChip = ({ item }: { item: CategoryChip }) => (
    <Pressable
      onPress={() => router.push(item.route as any)}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: colors.surfaceSecondary },
        pressed && styles.chipPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <Text style={[styles.chipLabel, { color: colors.textPrimary }]}>{item.label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        data={EXPLORE_CATEGORIES}
        renderItem={renderChip}
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
