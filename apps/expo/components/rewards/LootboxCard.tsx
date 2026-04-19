import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { Lootbox } from '@/lib/supabase-rewards';

interface LootboxCardProps {
  lootbox: Lootbox;
  locked?: boolean;
  onPress: () => void;
}

const CHEST = require('../../assets/illustration/gamification/lootbox.png');

export default function LootboxCard({ lootbox, locked, onPress }: LootboxCardProps) {
  const { colors, isDark } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isDark ? colors.surface : '#FFFFFF',
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.imageWrap}>
        {lootbox.image_url ? (
          <Image
            source={{ uri: lootbox.image_url }}
            style={[styles.image, locked && { opacity: 0.55 }]}
            resizeMode="contain"
          />
        ) : (
          <Image
            source={CHEST}
            style={[styles.image, locked && { opacity: 0.55 }]}
            resizeMode="contain"
          />
        )}
        {locked && (
          <View style={styles.lockedOverlay}>
            <Text style={styles.lockedEmoji}>🔒</Text>
          </View>
        )}
      </View>
      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
        {lootbox.name}
      </Text>
      <View style={styles.costRow}>
        <Text style={styles.costEmoji}>🪙</Text>
        <Text style={[styles.cost, { color: colors.textSecondary }]}>
          {lootbox.coins_per_key}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 8,
    alignItems: 'center',
    gap: 6,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedEmoji: {
    fontSize: 28,
  },
  name: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  costEmoji: {
    fontSize: 11,
  },
  cost: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
  },
});
