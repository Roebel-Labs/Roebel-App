import React from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { hyphenate } from '@/lib/hyphenate';

type CategoryChip = {
  key: string;
  label: string;
  route: string;
  image: any;
};

const EXPLORE_CATEGORIES: CategoryChip[] = [
  { key: 'events', label: 'Events', route: '/events', image: require('@/assets/illustration/collections/events.png') },
  { key: 'news', label: 'News', route: '/news', image: require('@/assets/illustration/collections/neuigkeiten.png') },
  { key: 'restaurants', label: 'Gastro', route: '/restaurant', image: require('@/assets/illustration/collections/gastronomie.png') },
  { key: 'movies', label: 'Kino', route: '/movies', image: require('@/assets/illustration/collections/kino.png') },
  { key: 'businesses', label: 'Shops', route: '/businesses', image: require('@/assets/illustration/collections/unternehmen.png') },
  { key: 'deals', label: 'Angebote', route: '/deals', image: require('@/assets/illustration/collections/angebote.png') },
  { key: 'marketplace', label: 'Marktplatz', route: '/marketplace', image: require('@/assets/illustration/collections/marktplatz.png') },
];

export default function ExploreCategoryChips() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  // In dark mode, lift the tile above the surface by using a slightly lighter gray.
  const tileBackground = isDark ? '#4a4d52' : colors.surfaceSecondary;

  const renderItem = ({ item }: { item: CategoryChip }) => (
    <Pressable
      onPress={() => router.push(item.route as any)}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <View style={[styles.tile, { backgroundColor: tileBackground }]}>
        <Image
          source={item.image}
          style={styles.tileImage}
          contentFit="contain"
          transition={0}
        />
      </View>
      <Text
        style={[styles.label, { color: colors.textPrimary }]}
        numberOfLines={2}
      >
        {hyphenate(item.label)}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        data={EXPLORE_CATEGORIES}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  item: {
    width: 64,
    alignItems: 'center',
  },
  itemPressed: {
    opacity: 0.7,
  },
  tile: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  tileImage: {
    width: 40,
    height: 40,
  },
  label: {
    fontSize: 11,
    lineHeight: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
});
