import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import MenuImage, { prefetchMenuImages } from '@/components/MenuImage';
import { placeCardStyles } from '@/components/GastroCard';
import { RAIL_LIST_PROPS } from '@/components/railListProps';
import { formatMenuPrice, hasMenuPrice } from '@/lib/utils';
import type { SpecialMenuItemRecord, SpecialMenuWithItems } from '@/lib/types';

type Props = {
  menus: SpecialMenuWithItems[];
};

type Dish = {
  item: SpecialMenuItemRecord;
  menuId: string;
  restaurantName: string | null;
};

const dishKey = (dish: Dish) => dish.item.id;

/**
 * Mittagstisch rail: one photo card per dish of every active weekly menu
 * (photos are generated in the background when a dish is saved). Tapping a
 * dish opens its restaurant's Mittagstisch page.
 */
export default function FeedSpecialMenuSection({ menus }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const dishes = useMemo<Dish[]>(
    () =>
      menus.flatMap((menu) =>
        // Feed caches written before the dishes were embedded lack the array.
        (menu.special_menu_items ?? []).map((item) => ({
          item,
          menuId: menu.id,
          restaurantName: menu.restaurant?.name ?? null,
        }))
      ),
    [menus]
  );

  useEffect(() => {
    prefetchMenuImages(dishes.map((d) => d.item));
  }, [dishes]);

  const renderItem = useCallback(
    ({ item: dish }: { item: Dish }) => {
      const { item } = dish;
      const meta = [dish.restaurantName, hasMenuPrice(item.price) ? formatMenuPrice(item.price) : null]
        .filter(Boolean)
        .join('  ·  ');
      return (
        <Pressable
          onPress={() => router.push(`/restaurant/menu/${dish.menuId}` as any)}
          style={({ pressed }) => [placeCardStyles.card, pressed && { opacity: 0.9 }]}
          accessibilityRole="button"
          accessibilityLabel={`${item.name} ansehen`}
        >
          <View style={[placeCardStyles.cover, { backgroundColor: colors.surfaceSecondary }]}>
            {item.image_url ? (
              <MenuImage uri={item.image_url} thumbUri={item.image_thumb_url} style={StyleSheet.absoluteFill} />
            ) : (
              <Image
                source={require('@/assets/illustration/categories/essen_trinken.png')}
                style={styles.fallback}
                contentFit="contain"
                accessibilityIgnoresInvertColors
              />
            )}
          </View>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
            {item.name}
          </Text>
          {meta ? (
            <Text style={[placeCardStyles.line, { color: colors.textSecondary }]} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </Pressable>
      );
    },
    [router, colors]
  );

  if (dishes.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Mittagstisch</Text>
      <FlatList
        horizontal
        data={dishes}
        renderItem={renderItem}
        keyExtractor={dishKey}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        {...RAIL_LIST_PROPS}
      />
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
    fontSize: 22,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    paddingHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  fallback: {
    width: 96,
    height: 96,
  },
  name: {
    fontSize: 18,
    fontFamily: 'MonaSans-SemiBold',
    marginTop: 10,
  },
});
