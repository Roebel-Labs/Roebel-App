import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { StarIcon } from '@/components/Icons';
import { isRestaurantOpen } from '@/lib/utils';
import type { AccountRatingSummary, RestaurantRecord } from '@/lib/types';
import { transformedImageUrl } from '@/lib/image-url';

const CARD_WIDTH = 168;
const COVER_HEIGHT = 100;
const COVER_RADIUS = 16;
const AVATAR_SIZE = 56;

type Props = {
  restaurant: RestaurantRecord;
  ratingSummary: AccountRatingSummary | null;
};

function formatCount(n: number): string {
  if (n >= 100) return `${Math.floor(n / 100) * 100}+`;
  return String(n);
}

/**
 * Gastro card for the Explore section, shaped like OrgAccountCard but
 * borderless: a fully-rounded banner image (cover, falling back to the
 * restaurant's brand color), circular logo avatar overlapping the banner,
 * name, then a small black-star rating + Geöffnet/Geschlossen pill.
 */
export default function GastroCard({ restaurant, ratingSummary }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const { isOpen } = isRestaurantOpen(restaurant.opening_hours);
  const hasRatings = !!ratingSummary && ratingSummary.rating_count > 0;
  const avg = hasRatings ? ratingSummary!.avg_stars.toFixed(1) : '–';

  return (
    <Pressable
      onPress={() => router.push(`/restaurant/${restaurant.slug}` as any)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
      accessibilityLabel={`${restaurant.name} Speisekarte ansehen`}
    >
      <View
        style={[
          styles.coverWrap,
          { backgroundColor: restaurant.background_color || colors.cardPlaceholder },
        ]}
      >
        {restaurant.cover_image_url ? (
          <Image
            source={{ uri: transformedImageUrl(restaurant.cover_image_url, { width: 640 }) ?? undefined }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={restaurant.cover_image_url ?? undefined}
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>

      <View style={[styles.avatarWrap, { borderColor: colors.background }]}>
        {restaurant.logo_url ? (
          <Image
            source={{ uri: transformedImageUrl(restaurant.logo_url, { width: 160 }) ?? undefined }}
            style={styles.avatarImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={restaurant.logo_url ?? undefined}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.surface }]}>
            <Text style={[styles.avatarInitial, { color: colors.textPrimary }]}>
              {(restaurant.name[0] || '?').toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {restaurant.name}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.rating}>
            <Text style={[styles.ratingValue, { color: colors.textPrimary }]}>{avg}</Text>
            <StarIcon size={12} color={colors.textPrimary} />
            {hasRatings && (
              <Text style={[styles.ratingCount, { color: colors.textSecondary }]}>
                ({formatCount(ratingSummary!.rating_count)})
              </Text>
            )}
          </View>
          <View
            style={[
              styles.pill,
              { backgroundColor: isOpen ? colors.successBackground : colors.surfaceSecondary },
            ]}
          >
            <Text
              style={[styles.pillText, { color: isOpen ? colors.success : colors.textSecondary }]}
            >
              {isOpen ? 'Geöffnet' : 'Geschlossen'}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    marginRight: 12,
    paddingBottom: 12,
  },
  coverWrap: {
    width: '100%',
    height: COVER_HEIGHT,
    borderRadius: COVER_RADIUS,
    overflow: 'hidden',
  },
  avatarWrap: {
    position: 'absolute',
    top: COVER_HEIGHT - AVATAR_SIZE / 2,
    left: '50%',
    marginLeft: -AVATAR_SIZE / 2,
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
  },
  info: {
    alignItems: 'center',
    paddingTop: AVATAR_SIZE / 2 + 8,
    paddingHorizontal: 8,
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingValue: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  ratingCount: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  pill: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
});
