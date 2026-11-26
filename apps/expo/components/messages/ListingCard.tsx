import { openListing } from '@/lib/navigation/openDetail';
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';

export type ListingInquiry = {
  type: 'listing_inquiry';
  listingId: string;
  title: string;
  price: number;
  priceType: string;
  imageUrl?: string;
  condition?: string;
};

export function formatPrice(price: number, priceType: string): string {
  if (priceType === 'free') return 'Gratis';
  return price.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

type Props = {
  data: ListingInquiry;
  isOwn: boolean;
};

export default function ListingCard({ data, isOwn }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      style={[
        styles.card,
        {
          backgroundColor: isOwn ? colors.primary : colors.surface,
          borderColor: isOwn ? 'transparent' : colors.border,
        },
      ]}
      onPress={() => openListing({ id: data.listingId })}
    >
      {data.imageUrl ? (
        <Image
          source={{ uri: data.imageUrl }}
          style={styles.image}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.imagePlaceholder, { backgroundColor: colors.cardPlaceholder }]}>
          <Text style={[styles.placeholderText, { color: colors.textTertiary }]}>Kein Bild</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text
          style={[styles.title, { color: isOwn ? colors.onPrimary : colors.textPrimary }]}
          numberOfLines={2}
        >
          {data.title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.price, { color: isOwn ? colors.onPrimary : colors.primary }]}>
            {formatPrice(data.price, data.priceType)}
          </Text>
          {data.condition && (
            <View style={[styles.badge, { backgroundColor: isOwn ? 'rgba(255,255,255,0.2)' : `${colors.primary}15` }]}>
              <Text style={[styles.badgeText, { color: isOwn ? colors.onPrimary : colors.primary }]}>
                {data.condition}
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.cta, { color: isOwn ? 'rgba(255,255,255,0.7)' : colors.textTertiary }]}>
          Anzeige ansehen →
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    width: 220,
  },
  image: {
    width: '100%',
    height: 120,
  },
  imagePlaceholder: {
    width: '100%',
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 12,
    fontFamily: 'MonaSans-Regular',
  },
  info: {
    padding: 10,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontFamily: 'MonaSans-Medium',
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  price: {
    fontSize: 14,
    fontFamily: 'MonaSans-SemiBold',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'MonaSans-Medium',
  },
  cta: {
    fontSize: 12,
    fontFamily: 'MonaSans-Regular',
    marginTop: 4,
  },
});
