import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import type { MarketplaceListingRecord } from '@/lib/types';
import { currency } from '@/lib/utils';

import FlyerIcon from '@/assets/icons/flyer.svg';

type Props = {
  listing: MarketplaceListingRecord;
};

const PRICE_TYPE_LABELS: Record<string, string> = {
  fixed: 'Festpreis',
  negotiable: 'VB',
  free: 'Zu verschenken',
};

export default function FeedMarketplaceCard({ listing }: Props) {
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

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.background },
        pressed && { backgroundColor: colors.pressedOverlay },
      ]}
    >
      <View style={[styles.badge, { backgroundColor: colors.warningBackground }]}>
        <FlyerIcon width={12} height={12} color={colors.warning} />
        <Text style={[styles.badgeText, { color: colors.warning }]}>Schwarzes Brett</Text>
      </View>

      <View style={styles.body}>
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
          {listing.description && (
            <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={1}>
              {listing.description}
            </Text>
          )}
          <Text style={[styles.price, { color: colors.primary }]}>{priceLabel}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    overflow: 'hidden' as const,
    gap: 10,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
  },
  body: {
    flexDirection: 'row',
    gap: 12,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    lineHeight: 20,
  },
  description: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  price: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
});
