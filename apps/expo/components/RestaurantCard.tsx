import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { RestaurantRecord } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  restaurant: RestaurantRecord;
  compact?: boolean;
};

// Helper to darken a hex color by a percentage
function darkenColor(hex: string, percent: number): string {
  const cleanHex = hex.replace('#', '');
  const num = parseInt(cleanHex, 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max((num >> 16) - amt, 0);
  const G = Math.max(((num >> 8) & 0x00ff) - amt, 0);
  const B = Math.max((num & 0x0000ff) - amt, 0);
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

export default function RestaurantCard({ restaurant, compact = false }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const backgroundColor = restaurant.background_color || colors.success;
  const spineColor = darkenColor(backgroundColor, 15);

  return (
    <Pressable
      onPress={() => router.push(`/restaurant/${restaurant.slug}` as any)}
      style={[styles.card, compact ? styles.compact : styles.full]}
      accessibilityRole="button"
      accessibilityLabel={`${restaurant.name} Speisekarte ansehen`}
    >
      {/* Spine */}
      <View style={[styles.spine, { backgroundColor: spineColor }]} />

      {/* Book Body */}
      <View style={[styles.body, { backgroundColor }]}>
        {restaurant.logo_url ? (
          <Image
            source={{ uri: restaurant.logo_url }}
            style={styles.logo}
            contentFit="contain"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text
            style={[styles.name, { color: colors.textInverted }]}
            numberOfLines={2}
          >
            {restaurant.name}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
  },
  compact: {
    width: 140,
    height: 200,
    marginRight: 12,
  },
  full: {
    width: 160,
    height: 220,
    marginBottom: 16,
  },
  spine: {
    width: 12,
    height: '100%',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  logo: {
    width: '80%',
    height: '50%',
  },
  name: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
});
