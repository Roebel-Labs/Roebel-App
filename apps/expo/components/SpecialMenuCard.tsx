import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SpecialMenuRecord } from '@/lib/types';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  menu: SpecialMenuRecord;
  restaurantSlug: string;
};

export default function SpecialMenuCard({ menu, restaurantSlug }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => router.push(`/restaurant/menu/${menu.id}` as any)}
      style={({ pressed }) => [styles.container, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={`${menu.name} ansehen`}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.surfaceSecondary }]}>
        {menu.icon_image_url ? (
          <Image
            source={{ uri: menu.icon_image_url }}
            style={styles.icon}
            contentFit="contain"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={styles.emoji}>
            {menu.name.toLowerCase().includes('weihnacht') ? '🎄' :
             menu.name.toLowerCase().includes('silvester') ? '🎆' :
             menu.name.toLowerCase().includes('mittag') ? '☕' : '🍽️'}
          </Text>
        )}
      </View>
      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
        {menu.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 120,
    marginRight: 12,
    alignItems: 'center',
  },
  iconBox: {
    width: 100,
    height: 80,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    width: 60,
    height: 60,
  },
  emoji: {
    fontSize: 40,
  },
  name: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    lineHeight: 18,
  },
});
