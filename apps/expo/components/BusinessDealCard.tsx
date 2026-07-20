import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { DEAL_TYPE_LABELS } from '@/lib/map/constants';
import type { BusinessDealWithBusiness } from '@/lib/types';
import StarIcon from '@/assets/icons/star.svg';
import { transformedImageUrl } from '@/lib/image-url';

type Props = {
  deal: BusinessDealWithBusiness;
  compact?: boolean;
  style?: ViewStyle;
};

export default function BusinessDealCard({ deal, compact = true, style }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const dealTypeLabel = DEAL_TYPE_LABELS[deal.deal_type] || deal.deal_type;

  if (compact) {
    // Styled to look like a MarketplaceCard product item: square 1:1 image,
    // same corner radius/dimensions/typography — the only visual difference
    // is the price chip overlaid on the image (no type badge, no grid tag).
    return (
      <Pressable
        onPress={() => router.push(`/deals/${deal.id}` as any)}
        style={({ pressed }) => [styles.cardCompact, style, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={deal.title}
      >
        <View style={[styles.imageContainerCompact, { backgroundColor: colors.cardPlaceholder }]}>
          {deal.image_url ? (
            <Image
              source={{ uri: transformedImageUrl(deal.image_url, { width: 640 }) ?? undefined }}
              style={styles.imageCompact}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={deal.image_url ?? undefined}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: colors.cardPlaceholder }]}>
              <Text style={styles.placeholderEmoji}>🏷️</Text>
            </View>
          )}
          {deal.deal_value && (
            <View style={[styles.priceTag, { backgroundColor: colors.primary }]}>
              <Text style={[styles.priceTagText, { color: colors.onPrimary }]}>{deal.deal_value}</Text>
            </View>
          )}
        </View>
        <View style={styles.contentCompact}>
          <Text style={[styles.titleCompact, { color: colors.textPrimary }]} numberOfLines={2}>
            {deal.title}
          </Text>
          {deal.business?.name && (
            <Text style={[styles.businessNameCompact, { color: colors.textSecondary }]} numberOfLines={1}>
              {deal.business.name}
            </Text>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => router.push(`/deals/${deal.id}` as any)}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={deal.title}
    >
      <View style={styles.imageContainer}>
        {deal.image_url ? (
          <Image
            source={{ uri: transformedImageUrl(deal.image_url, { width: 640 }) ?? undefined }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={deal.image_url ?? undefined}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.cardPlaceholder }]}>
            <Text style={styles.placeholderEmoji}>🏷️</Text>
          </View>
        )}
        {deal.deal_value && (
          <View style={[styles.dealBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.dealBadgeText}>{deal.deal_value}</Text>
          </View>
        )}
        {deal.is_boosted && (
          <View style={[styles.boostedBadge, { backgroundColor: '#FFA500' }]}>
            <StarIcon width={12} height={12} color="#fff" />
          </View>
        )}
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {deal.title}
        </Text>
        {deal.description && (
          <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
            {deal.description}
          </Text>
        )}
        <View style={styles.footer}>
          {deal.business?.name && (
            <Text style={[styles.businessName, { color: colors.textSecondary }]} numberOfLines={1}>
              {deal.business.name}
            </Text>
          )}
          <View style={[styles.typeBadge, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.typeBadgeText, { color: colors.textSecondary }]}>{dealTypeLabel}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardCompact: {
    width: 150,
    marginRight: 12,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    marginHorizontal: 16,
  },
  pressed: {
    opacity: 0.7,
  },
  imageContainerCompact: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  imageContainer: {
    width: '100%',
    height: 180,
    position: 'relative',
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
    fontSize: 48,
  },
  dealBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  dealBadgeText: {
    color: '#000000',
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  boostedBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  priceTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priceTagText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  contentCompact: {
    paddingTop: 10,
    paddingBottom: 0,
  },
  content: {
    padding: 14,
  },
  titleCompact: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 19,
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 22,
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  businessName: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 6,
  },
  businessNameCompact: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginBottom: 6,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
});
