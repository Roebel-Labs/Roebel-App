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
      : `${currency(listing.price)} ${PRICE_TYPE_LABELS[listing.price_type] || ''}`.trim();
  const conditionLabel = listing.condition ? CONDITION_LABELS[listing.condition] : null;

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.container,
        { borderColor: colors.border, backgroundColor: colors.background },
      ]}
    >
      <Image
        source={firstImage ? { uri: firstImage } : undefined}
        style={[styles.thumbnail, { backgroundColor: colors.cardPlaceholder }]}
        contentFit="cover"
        accessibilityIgnoresInvertColors
      />
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {listing.title}
        </Text>
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: colors.textPrimary }]} numberOfLines={1}>
            {priceLabel}
          </Text>
          {conditionLabel && (
            <Text style={[styles.condition, { color: colors.textSecondary }]} numberOfLines={1}>
              {conditionLabel}
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
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumbnail: {
    width: 96,
    height: 96,
  },
  info: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 22,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  price: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  condition: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
