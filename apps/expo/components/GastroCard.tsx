import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { StarIcon } from '@/components/Icons';
import { describeOpenState, formatAddress, formatRating } from '@/lib/org-profile';
import type { AccountRatingSummary, RestaurantRecord } from '@/lib/types';
import { transformedImageUrl } from '@/lib/image-url';

export const PLACE_CARD_WIDTH = 280;
export const PLACE_COVER_HEIGHT = 186;
const COVER_RADIUS = 16;
const LOGO_SIZE = 72;
const STAR_GOLD = '#FFB400';

type Props = {
  restaurant: RestaurantRecord;
  ratingSummary: AccountRatingSummary | null;
};

/**
 * Large gastro card for the Erkunden rail: a wide photo with an open/closed
 * pill, then name + star rating, address, and the open-state detail line.
 * Without a cover photo the logo sits centred on the brand colour.
 */
function GastroCard({ restaurant, ratingSummary }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  // The detail page renders the linked org account, so prefer its cover,
  // logo, address and hours; the restaurant row is the fallback.
  const account = restaurant.account ?? null;
  const cover = account?.cover_url || restaurant.cover_image_url;
  const logo = account?.avatar_url || restaurant.logo_url;
  const address = formatAddress(account?.address || restaurant.address);
  const openState = describeOpenState(account?.opening_hours ?? restaurant.opening_hours ?? null);
  const ratingCount = ratingSummary?.rating_count ?? 0;
  const hasRatings = ratingCount > 0;
  const ratingText = ratingSummary ? formatRating(ratingSummary.avg_stars) : '';
  const metaParts = [
    'Gastronomie',
    hasRatings ? `${ratingCount} ${ratingCount === 1 ? 'Bewertung' : 'Bewertungen'}` : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={() => router.push(`/restaurant/${restaurant.slug}` as any)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
      accessibilityLabel={`${restaurant.name} ansehen`}
    >
      <View
        style={[
          styles.cover,
          { backgroundColor: restaurant.background_color || colors.cardPlaceholder },
        ]}
      >
        {cover ? (
          <Image
            source={{ uri: transformedImageUrl(cover, { width: 840 }) ?? undefined }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={cover}
            accessibilityIgnoresInvertColors
          />
        ) : logo ? (
          <Image
            source={{ uri: transformedImageUrl(logo, { width: 220 }) ?? undefined }}
            style={styles.logo}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={logo}
            accessibilityIgnoresInvertColors
          />
        ) : null}

        {openState ? (
          <View style={styles.pill}>
            <View
              style={[styles.pillDot, { backgroundColor: openState.isOpen ? '#16a34a' : '#9ca3af' }]}
            />
            <Text style={styles.pillText}>{openState.label}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.titleRow}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {restaurant.name}
        </Text>
        {hasRatings ? (
          <View style={styles.rating}>
            <StarIcon size={16} color={STAR_GOLD} />
            <Text style={[styles.ratingValue, { color: colors.textPrimary }]}>
              {ratingText}
            </Text>
          </View>
        ) : null}
      </View>
      {address ? (
        <Text style={[styles.line, { color: colors.textSecondary }]} numberOfLines={1}>
          {address}
        </Text>
      ) : null}
      <Text style={[styles.line, { color: colors.textSecondary }]} numberOfLines={1}>
        {metaParts.join('  ·  ')}
      </Text>
    </Pressable>
  );
}

export const placeCardStyles = StyleSheet.create({
  card: {
    width: PLACE_CARD_WIDTH,
    marginRight: 14,
    paddingBottom: 8,
  },
  cover: {
    width: '100%',
    height: PLACE_COVER_HEIGHT,
    borderRadius: COVER_RADIUS,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
  },
  pill: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillText: {
    fontSize: 14,
    fontFamily: 'MonaSans-SemiBold',
    color: '#000000',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  name: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'MonaSans-SemiBold',
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingValue: {
    fontSize: 16,
    fontFamily: 'MonaSans-SemiBold',
  },
  line: {
    fontSize: 15,
    fontFamily: 'MonaSans-Regular',
    marginTop: 3,
  },
});

const styles = placeCardStyles;

export default memo(GastroCard);
