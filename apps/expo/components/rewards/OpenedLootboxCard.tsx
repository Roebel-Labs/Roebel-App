import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { LootboxRewardRarity, UserLootboxReward } from '@/lib/supabase-rewards';

interface OpenedLootboxCardProps {
  userReward: UserLootboxReward;
  onPress: () => void;
}

const RARITY_COLOR: Record<LootboxRewardRarity, string> = {
  common: '#94A3B8',
  rare: '#3B82F6',
  epic: '#8B5CF6',
  legendary: '#F59E0B',
};

/**
 * Grid card for a previously-opened lootbox. Visually parallel to LootboxCard
 * but shows the won reward's artwork instead of the chest. Tapping jumps
 * straight back to the reward success page for this specific win.
 */
export default function OpenedLootboxCard({ userReward, onPress }: OpenedLootboxCardProps) {
  const { colors, isDark } = useTheme();
  const reward = userReward.reward;

  if (!reward) return null;
  const rarityColor = RARITY_COLOR[reward.rarity];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isDark ? colors.surface : '#FFFFFF',
          borderColor: rarityColor,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      accessibilityRole="button"
    >
      <View style={[styles.rarityStrip, { backgroundColor: rarityColor }]} />
      <View style={styles.imageWrap}>
        <Image
          source={{ uri: reward.asset_url }}
          style={styles.image}
          resizeMode="contain"
        />
        {userReward.is_equipped && (
          <View style={[styles.equippedDot, { backgroundColor: colors.primary }]}>
            <Text style={styles.equippedText}>✓</Text>
          </View>
        )}
      </View>
      <Text
        style={[styles.name, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {reward.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingBottom: 8,
    alignItems: 'center',
    overflow: 'hidden',
  },
  rarityStrip: {
    alignSelf: 'stretch',
    height: 4,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    padding: 6,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  equippedDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  equippedText: {
    color: '#fff',
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
  },
  name: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    paddingHorizontal: 6,
  },
});
