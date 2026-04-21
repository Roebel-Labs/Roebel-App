import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import RarityPill from '@/components/rewards/RarityPill';
import type { UserLootboxReward } from '@/lib/supabase-rewards';

interface OpenedLootboxCardProps {
  userReward: UserLootboxReward;
  onPress: () => void;
}

/**
 * Grid card for a previously-opened lootbox. Shows the won reward's artwork
 * and a rarity pill at the bottom so the tier reads at a glance without a
 * colored border dominating the card.
 */
export default function OpenedLootboxCard({ userReward, onPress }: OpenedLootboxCardProps) {
  const { colors, isDark } = useTheme();
  const reward = userReward.reward;

  if (!reward) return null;

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
      accessibilityRole="button"
    >
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
      <View style={styles.pillRow}>
        <RarityPill rarity={reward.rarity} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingBottom: 10,
    alignItems: 'center',
    overflow: 'hidden',
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
  pillRow: {
    marginTop: 4,
    paddingHorizontal: 6,
  },
});
