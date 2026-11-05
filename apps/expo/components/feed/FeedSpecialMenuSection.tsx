import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import MenuImage, { prefetchMenuImages } from '@/components/MenuImage';
import { placeCardStyles } from '@/components/GastroCard';
import { RAIL_LIST_PROPS } from '@/components/railListProps';
import { formatMenuPrice, hasMenuPrice } from '@/lib/utils';
import { transformedImageUrl } from '@/lib/image-url';
import { dishDayLabel, resolveDishDay, toIsoDay } from '@/lib/special-menu-days';
import type { SpecialMenuItemRecord, SpecialMenuWithItems } from '@/lib/types';

type Props = {
  menus: SpecialMenuWithItems[];
};

type Dish = {
  item: SpecialMenuItemRecord;
  menuId: string;
  restaurantName: string | null;
  restaurantLogo: string | null;
  /** Serving day (YYYY-MM-DD) parsed from the dish's category, if any. */
  day: string | null;
};

const LOGO_SIZE = 20;

const dishKey = (dish: Dish) => dish.item.id;

/**
 * Mittagstisch rail: one photo card per dish of every active weekly menu
 * (photos are generated in the background when a dish is saved), soonest
 * serving day first. Dishes of past days are hidden; dishes without a day
 * go last. Tapping a dish opens its restaurant's Mittagstisch page.
 */
export default function FeedSpecialMenuSection({ menus }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const today = toIsoDay(new Date());

  const dishes = useMemo<Dish[]>(() => {
    const all = menus.flatMap((menu) =>
      // Feed caches written before the dishes were embedded lack the array.
      (menu.special_menu_items ?? []).map((item) => ({
        item,
        menuId: menu.id,
        restaurantName: menu.restaurant?.name ?? null,
        restaurantLogo: menu.restaurant?.account?.avatar_url || menu.restaurant?.logo_url || null,
        day: resolveDishDay(item.category?.name, menu.start_date),
      }))
    );
    // Stable sort keeps menu + dish order within one day.
    return all
      .filter((d) => d.day === null || d.day >= today)
      .sort((a, b) => (a.day ?? '9999').localeCompare(b.day ?? '9999'));
  }, [menus, today]);

  useEffect(() => {
    prefetchMenuImages(dishes.map((d) => d.item));
  }, [dishes]);

  const renderItem = useCallback(
    ({ item: dish }: { item: Dish }) => {
      const { item } = dish;
      const meta = [dish.restaurantName, hasMenuPrice(item.price) ? formatMenuPrice(item.price) : null]
        .filter(Boolean)
        .join('  ·  ');
      const dayLabel = dish.day ? dishDayLabel(dish.day, today) : '';
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
            {dayLabel ? (
              <View style={placeCardStyles.pill}>
                <Text style={placeCardStyles.pillText}>{dayLabel}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
            {item.name}
          </Text>
          {meta ? (
            <View style={styles.metaRow}>
              {dish.restaurantLogo ? (
                <Image
                  source={{ uri: transformedImageUrl(dish.restaurantLogo, { width: 60 }) ?? undefined }}
                  style={[styles.logo, { backgroundColor: colors.surfaceSecondary }]}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={dish.restaurantLogo}
                  accessibilityIgnoresInvertColors
                />
              ) : null}
              <Text
                style={[placeCardStyles.line, styles.metaText, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {meta}
              </Text>
            </View>
          ) : null}
        </Pressable>
      );
    },
    [router, colors, today]
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
  },
  metaText: {
    flex: 1,
    marginTop: 0,
  },
});
