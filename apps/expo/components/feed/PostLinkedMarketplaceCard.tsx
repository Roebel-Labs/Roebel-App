import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { currency } from '@/lib/utils';
import type { MarketplaceListingRecord } from '@/lib/types';

type Props = {
  listing: Pick<MarketplaceListingRecord, 'id' | 'title' | 'price' | 'price_type' | 'category' | 'condition' | 'media_urls' | 'neighborhood'>;
};

const PRICE_TYPE_LABELS: Record<string, string> = {
  fixed: 'Festpreis',
  negotiable: 'VB',
  free: 'Zu verschenken',
};

const CONDITION_LABELS: Record<string, string> = {
  neu: 'Neu',
  wie_neu: 'Wie neu',
  gut: 'Gut',
  akzeptabel: 'Akzeptabel',
};

export default function PostLinkedMarketplaceCard({ listing }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const handlePress = () => {
    router.push(`/marketplace/${listing.id}` as any);
  };

  const firstImage = listing.media_urls?.[0];
  const priceLabel =
    listing.price_type === 'free'
      ? 'Zu verschenken'
      : `${currency(listing.price)} ${PRICE_TYPE_LABELS[listing.price_type] || ''}`;
  const conditionLabel = listing.condition ? CONDITION_LABELS[listing.condition] : null;

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.container, { borderColor: colors.border }]}
    >
      {firstImage && (
        <Image
          source={{ uri: firstImage }}
          style={styles.thumbnail}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      )}
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {listing.title}
        </Text>
        <Text style={[styles.price, { color: colors.primary }]}>{priceLabel}</Text>
        <View style={styles.meta}>
          {conditionLabel && (
            <View style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.chipText, { color: colors.textSecondary }]}>{conditionLabel}</Text>
            </View>
          )}
          {listing.neighborhood && (
            <Text style={[styles.location, { color: colors.textTertiary }]} numberOfLines={1}>
              {listing.neighborhood}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbnail: {
    width: 80,
    height: 80,
  },
  info: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    lineHeight: 19,
  },
  price: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  location: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
});
