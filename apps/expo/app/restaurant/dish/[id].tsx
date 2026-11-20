import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { ArrowLeftIcon } from '@/components/Icons';
import GlassIconButton from '@/components/GlassIconButton';
import MenuImage from '@/components/MenuImage';
import MeckyNotFound from '@/components/MeckyNotFound';
import DishComments from '@/components/DishComments';
import InlineErrorBoundary from '@/components/InlineErrorBoundary';
import CollapsingHeroScreen from '@/components/detail/CollapsingHeroScreen';
import { fetchSpecialMenuDish, type SpecialMenuDish } from '@/lib/supabase-restaurants';
import { dishDayLabel, resolveDishDay, toIsoDay } from '@/lib/special-menu-days';
import { formatMenuPrice, hasMenuPrice } from '@/lib/utils';
import { transformedImageUrl } from '@/lib/image-url';

const LOGO_SIZE = 40;
const HERO_HEIGHT = 340;

export default function SpecialMenuDishScreen() {
  return (
    <InlineErrorBoundary label="special-menu-dish">
      <SpecialMenuDishScreenInner />
    </InlineErrorBoundary>
  );
}

/** Mittagstisch dish: photo, serving day, restaurant, price and comments. */
function SpecialMenuDishScreenInner() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [dish, setDish] = useState<SpecialMenuDish | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchSpecialMenuDish(id).then((row) => {
      if (cancelled) return;
      setDish(row);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <CollapsingHeroScreen heroHeight={HERO_HEIGHT} onBack={() => router.back()} loading />
      </>
    );
  }

  if (!dish) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.floatingBack}>
          <GlassIconButton onPress={() => router.back()} accessibilityLabel="Zurück">
            <ArrowLeftIcon size={22} color={colors.textPrimary} />
          </GlassIconButton>
        </View>
        <MeckyNotFound title="Gericht nicht gefunden" />
      </SafeAreaView>
    );
  }

  const menu = dish.special_menu;
  const restaurant = menu?.restaurant ?? null;
  const logo = restaurant?.account?.avatar_url || restaurant?.logo_url || null;
  const day = resolveDishDay(dish.category?.name, menu?.start_date ?? null);
  const dayLine = day
    ? `${dishDayLabel(day, toIsoDay(new Date()))}, ${day.slice(8, 10)}.${day.slice(5, 7)}.`
    : null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <CollapsingHeroScreen
        heroHeight={HERO_HEIGHT}
        imageUri={dish.image_thumb_url || dish.image_url || null}
        heroBackgroundColor={colors.surfaceSecondary}
        renderHero={() =>
          dish.image_url ? (
            <MenuImage uri={dish.image_url} thumbUri={dish.image_thumb_url} size="full" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={styles.heroFallbackWrap}>
              <Image
                source={require('@/assets/illustration/categories/essen_trinken.png')}
                style={styles.heroFallback}
                contentFit="contain"
                accessibilityIgnoresInvertColors
              />
            </View>
          )
        }
        title={dish.name}
        onBack={() => router.back()}
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
        scrollViewProps={{ keyboardShouldPersistTaps: 'handled' }}
      >
        <View style={styles.headBlock}>
          {dayLine ? (
            <Text style={[styles.day, { color: colors.textSecondary }]}>Mittagstisch · {dayLine}</Text>
          ) : null}
          <Text style={[styles.title, { color: colors.textPrimary }]}>{dish.name}</Text>
          <View style={styles.tagsRow}>
            {hasMenuPrice(dish.price) ? (
              <Text style={[styles.price, { color: colors.textPrimary }]}>{formatMenuPrice(dish.price)}</Text>
            ) : null}
            {dish.is_vegetarian ? (
              <View style={[styles.tag, { backgroundColor: colors.surfaceSecondary }]}>
                <Text style={[styles.tagText, { color: colors.textPrimary }]}>Vegetarisch</Text>
              </View>
            ) : null}
          </View>
          {dish.description ? (
            <Text style={[styles.description, { color: colors.textPrimary }]}>{dish.description}</Text>
          ) : null}

          {restaurant && menu ? (
            <Pressable
              onPress={() => router.push(`/restaurant/menu/${menu.id}` as any)}
              style={({ pressed }) => [
                styles.restaurantRow,
                { borderColor: colors.borderSecondary },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Mittagstisch von ${restaurant.name} ansehen`}
            >
              {logo ? (
                <Image
                  source={{ uri: transformedImageUrl(logo, { width: 120 }) ?? undefined }}
                  style={[styles.logo, { backgroundColor: colors.surfaceSecondary }]}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : null}
              <View style={styles.restaurantText}>
                <Text style={[styles.restaurantName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {restaurant.name}
                </Text>
                <Text style={[styles.restaurantSub, { color: colors.textSecondary }]}>
                  Ganzen Mittagstisch ansehen
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>

        <DishComments target={{ kind: 'special_menu_item', id: dish.id }} />
      </CollapsingHeroScreen>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroFallbackWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  heroFallback: { width: 140, height: 140 },
  floatingBack: { position: 'absolute', top: 60, left: 20, zIndex: 10 },
  headBlock: { paddingHorizontal: 20, paddingTop: 24 },
  day: { fontSize: 14, fontFamily: 'MonaSans-Medium' },
  title: { fontSize: 26, fontFamily: 'MonaSansSemiCondensed-Bold', marginTop: 6 },
  tagsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  price: { fontSize: 17, fontFamily: 'MonaSans-SemiBold' },
  tag: { paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: 'center' },
  tagText: { fontSize: 13, fontFamily: 'MonaSans-Medium' },
  description: { fontSize: 15, fontFamily: 'MonaSans-Regular', lineHeight: 21, marginTop: 12 },
  restaurantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: LOGO_SIZE / 2 },
  restaurantText: { flex: 1 },
  restaurantName: { fontSize: 16, fontFamily: 'MonaSans-SemiBold' },
  restaurantSub: { fontSize: 13, fontFamily: 'MonaSans-Regular', marginTop: 2 },
});
