import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import RarityPill from '@/components/rewards/RarityPill';
import { RARITY_COLOR } from '@/lib/rarity';
import type { LootboxReward, UserLootboxReward } from '@/lib/supabase-rewards';

type Props = {
  catalogue: LootboxReward[];
  userRewards: UserLootboxReward[];
  equippedUserRewardId: string | null;
  onSelect: (userRewardId: string | null) => void;
  onLockedTap?: (reward: LootboxReward) => void;
};

/**
 * 2-column grid listing every banner in the catalogue. Unlocked tiles show
 * the artwork at full color; locked tiles are grayed out with a lock icon.
 * The first tile is a "Kein Banner" option that clears the equipped slot.
 */
export default function BannerSelectionGrid({
  catalogue,
  userRewards,
  equippedUserRewardId,
  onSelect,
  onLockedTap,
}: Props) {
  const { colors } = useTheme();

  // Map: reward_id -> user_lootbox_rewards row (if owned).
  const ownedByRewardId = new Map<string, UserLootboxReward>();
  for (const ur of userRewards) {
    if (ur.reward?.type === 'profile_banner') {
      ownedByRewardId.set(ur.reward_id, ur);
    }
  }

  return (
    <View style={styles.grid}>
      {/* None / remove slot tile */}
      <Pressable
        onPress={() => onSelect(null)}
        style={({ pressed }) => [
          styles.tile,
          {
            backgroundColor: colors.surface,
            borderColor: equippedUserRewardId === null ? colors.primary : colors.border,
            borderWidth: equippedUserRewardId === null ? 2 : 1,
          },
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Banner entfernen"
      >
        <View style={[styles.noneBanner, { backgroundColor: colors.cardPlaceholder }]}>
          <Ionicons name="ban-outline" size={22} color={colors.textTertiary} />
        </View>
        <Text style={[styles.tileLabel, { color: colors.textSecondary }]} numberOfLines={1}>
          Kein Banner
        </Text>
      </Pressable>

      {catalogue.map((reward) => {
        const owned = ownedByRewardId.get(reward.id);
        const isUnlocked = !!owned;
        const isEquipped = !!owned && owned.id === equippedUserRewardId;
        const isPlaceholder = reward.asset_url.includes('placehold.co');

        return (
          <Pressable
            key={reward.id}
            onPress={() => {
              if (isUnlocked) onSelect(owned!.id);
              else onLockedTap?.(reward);
            }}
            style={({ pressed }) => [
              styles.tile,
              {
                backgroundColor: colors.surface,
                borderColor: isEquipped ? colors.primary : colors.border,
                borderWidth: isEquipped ? 2 : 1,
              },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              isUnlocked ? `Banner ${reward.name} auswählen` : `${reward.name} gesperrt`
            }
          >
            <View style={styles.bannerWrap}>
              {isPlaceholder || !reward.asset_url ? (
                <View
                  style={[
                    styles.bannerPlaceholder,
                    { backgroundColor: (RARITY_COLOR[reward.rarity] ?? '#94A3B8') + '33' },
                  ]}
                />
              ) : (
                <Image
                  source={{ uri: reward.asset_url }}
                  style={styles.bannerImage}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              )}
              {!isUnlocked && (
                <View style={styles.lockOverlay}>
                  <Ionicons name="lock-closed" size={20} color="#ffffff" />
                </View>
              )}
              {isEquipped && (
                <View style={[styles.equippedBadge, { backgroundColor: colors.primary }]}>
                  <Ionicons name="checkmark" size={12} color={colors.onPrimary} />
                </View>
              )}
            </View>
            <View style={styles.tileFooter}>
              <Text
                style={[
                  styles.tileLabel,
                  { color: isUnlocked ? colors.textPrimary : colors.textTertiary },
                ]}
                numberOfLines={1}
              >
                {reward.name}
              </Text>
              <RarityPill rarity={reward.rarity} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
  },
  tile: {
    width: '48%',
    borderRadius: 12,
    padding: 8,
    gap: 8,
  },
  bannerWrap: {
    width: '100%',
    aspectRatio: 3,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerPlaceholder: {
    width: '100%',
    height: '100%',
  },
  noneBanner: {
    width: '100%',
    aspectRatio: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  equippedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  tileFooter: {
    gap: 4,
  },
});
