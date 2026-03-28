import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { BUSINESS_CATEGORY_LABELS } from '@/lib/map/constants';
import type { BusinessRecord } from '@/lib/types';

type Props = {
  business: BusinessRecord;
  compact?: boolean;
  style?: ViewStyle;
};

export default function BusinessCardCompact({ business, compact = true, style }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  const categoryLabel = BUSINESS_CATEGORY_LABELS[business.category] || 'Sonstiges';

  if (compact) {
    const logoUrl = business.logo_url || business.cover_image_url;

    return (
      <Pressable
        onPress={() => router.push(`/business/${business.slug}` as any)}
        style={({ pressed }) => [
          styles.cardCompact,
          { borderColor: colors.border, backgroundColor: colors.background },
          style,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={business.name}
      >
        <View style={styles.logoContainer}>
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              style={[styles.logo, { backgroundColor: colors.cardPlaceholder }]}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[styles.logoPlaceholder, { backgroundColor: colors.cardPlaceholder }]}>
              <Text style={styles.placeholderEmoji}>🏪</Text>
            </View>
          )}
        </View>
        <Text style={[styles.nameCompact, { color: colors.textPrimary }]} numberOfLines={2}>
          {business.name}
        </Text>
        <View style={[styles.categoryBadge, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.categoryText, { color: colors.textSecondary }]}>{categoryLabel}</Text>
        </View>
      </Pressable>
    );
  }

  const imageUrl = business.cover_image_url || business.logo_url;

  return (
    <Pressable
      onPress={() => router.push(`/business/${business.slug}` as any)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={business.name}
    >
      <View style={styles.imageContainer}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.cardPlaceholder }]}>
            <Text style={styles.placeholderEmoji}>🏪</Text>
          </View>
        )}
      </View>
      <View style={styles.content}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
          {business.name}
        </Text>
        {business.description && (
          <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
            {business.description}
          </Text>
        )}
        <View style={styles.footer}>
          <View style={[styles.categoryBadge, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.categoryText, { color: colors.textSecondary }]}>{categoryLabel}</Text>
          </View>
          {business.address && (
            <Text style={[styles.address, { color: colors.textTertiary }]} numberOfLines={1}>
              {business.address}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardCompact: {
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
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
  logoContainer: {
    marginBottom: 10,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  logoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    height: 160,
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
    fontSize: 28,
  },
  content: {
    padding: 14,
  },
  nameCompact: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 19,
    marginBottom: 8,
    textAlign: 'center',
  },
  name: {
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  address: {
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
  },
});
