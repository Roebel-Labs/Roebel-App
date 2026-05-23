import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { PRICE_TYPE_LABELS, CONDITION_LABELS } from '@/lib/map/constants';
import type { MarketplaceListingRecord } from '@/lib/types';

type Props = {
  listing: MarketplaceListingRecord;
  compact?: boolean;
  style?: ViewStyle;
};

function formatPrice(price: number, priceType: string): string {
  if (priceType === 'free') return 'Gratis';
  const formatted = price.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const suffix = PRICE_TYPE_LABELS[priceType] || '';
  return suffix ? `${formatted} ${suffix}` : formatted;
}

export default function MarketplaceCard({ listing, compact = true, style }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const firstImage = listing.media_urls?.[0] || null;
  const conditionLabel = listing.condition ? CONDITION_LABELS[listing.condition] : null;

  if (compact) {
    return (
      <Pressable
        onPress={() => router.push(`/marketplace/${listing.id}` as any)}
        style={({ pressed }) => [styles.cardCompact, style, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={listing.title}
      >
        <View style={[styles.imageContainerCompact, { backgroundColor: colors.cardPlaceholder }]}>
          {firstImage ? (
            <Image
              source={{ uri: firstImage }}
              style={styles.imageCompact}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: colors.cardPlaceholder }]}>
              <Text style={styles.placeholderEmoji}>🛍️</Text>
            </View>
          )}
        </View>
        <View style={styles.contentCompact}>
          <Text style={[styles.titleCompact, { color: colors.textPrimary }]} numberOfLines={2}>
            {listing.title}
          </Text>
          <Text style={[styles.priceCompact, { color: colors.textPrimary }]}>
            {formatPrice(listing.price, listing.price_type)}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => router.push(`/marketplace/${listing.id}` as any)}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={listing.title}
    >
      <View style={[styles.imageContainer, { backgroundColor: colors.cardPlaceholder }]}>
        {firstImage ? (
          <Image
            source={{ uri: firstImage }}
            style={styles.image}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.cardPlaceholder }]}>
            <Text style={styles.placeholderEmoji}>🛍️</Text>
          </View>
        )}
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {listing.title}
        </Text>
        <Text style={[styles.price, { color: colors.primary }]}>
          {formatPrice(listing.price, listing.price_type)}
        </Text>
        {listing.neighborhood && (
          <Text style={[styles.neighborhood, { color: colors.textTertiary }]} numberOfLines={1}>
            {listing.neighborhood}
          </Text>
        )}
        {conditionLabel && (
          <View style={[styles.conditionBadge, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.conditionText, { color: colors.textSecondary }]}>{conditionLabel}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardCompact: {
    width: 200,
    marginRight: 12,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.7,
  },
  imageContainerCompact: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageContainer: {
    width: '100%',
    height: 160,
  },
  imageCompact: {
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderEmoji: {
    fontSize: 40,
  },
  contentCompact: {
    paddingVertical: 10,
  },
  content: {
    padding: 12,
  },
  titleCompact: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 19,
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 22,
    marginBottom: 6,
  },
  priceCompact: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginBottom: 6,
  },
  price: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 6,
  },
  neighborhood: {
    fontSize: 13,
    marginBottom: 6,
  },
  conditionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  conditionText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
});
