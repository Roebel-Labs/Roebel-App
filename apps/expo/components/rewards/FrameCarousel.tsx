import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import RarityPill from '@/components/rewards/RarityPill';
import { FRAME_SCALE } from '@/components/UserAvatarWithFrame';
import type { LootboxReward, UserLootboxReward } from '@/lib/supabase-rewards';

type Props = {
  catalogue: LootboxReward[];
  userRewards: UserLootboxReward[];
  /** The user's current profile picture URL (rendered inside every preview). */
  avatarUri: string | null;
  equippedUserRewardId: string | null;
  onSelect: (userRewardId: string | null) => void;
  onLockedTap?: (reward: LootboxReward) => void;
};

const AVATAR_SIZE = 72;
const PREVIEW_SIZE = AVATAR_SIZE * FRAME_SCALE;

/**
 * Horizontal carousel of profile frames. Each tile shows the viewer's avatar
 * overlaid by the frame PNG at its true 1.30× scale so the preview matches
 * how the frame will render across the app. Locked tiles are desaturated and
 * get a lock overlay.
 */
export default function FrameCarousel({
  catalogue,
  userRewards,
  avatarUri,
  equippedUserRewardId,
  onSelect,
  onLockedTap,
}: Props) {
  const { colors } = useTheme();

  const ownedByRewardId = new Map<string, UserLootboxReward>();
  for (const ur of userRewards) {
    if (ur.reward?.type === 'profile_frame') {
      ownedByRewardId.set(ur.reward_id, ur);
    }
  }

  const renderAvatar = (tinted: boolean) => (
    <View style={styles.avatarInner}>
      {avatarUri ? (
        <Image
          source={{ uri: avatarUri }}
          style={[styles.avatarImage, tinted && { opacity: 0.5 }]}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[styles.avatarPlaceholder, { backgroundColor: colors.cardPlaceholder }]} />
      )}
    </View>
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {/* None / remove slot tile */}
      <Pressable
        onPress={() => onSelect(null)}
        style={styles.item}
        accessibilityRole="button"
        accessibilityLabel="Rahmen entfernen"
      >
        <View
          style={[
            styles.previewBox,
            equippedUserRewardId === null && {
              borderWidth: 2,
              borderColor: colors.primary,
              borderRadius: 12,
            },
          ]}
        >
          {renderAvatar(false)}
        </View>
        <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
          Kein Rahmen
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
            style={styles.item}
            accessibilityRole="button"
            accessibilityLabel={
              isUnlocked ? `Rahmen ${reward.name} auswählen` : `${reward.name} gesperrt`
            }
          >
            <View
              style={[
                styles.previewBox,
                isEquipped && {
                  borderWidth: 2,
                  borderColor: colors.primary,
                  borderRadius: 12,
                },
              ]}
            >
              {renderAvatar(!isUnlocked)}
              {!isPlaceholder && reward.asset_url && (
                <Image
                  source={{ uri: reward.asset_url }}
                  style={StyleSheet.absoluteFillObject as any}
                  contentFit="contain"
                  pointerEvents="none"
                />
              )}
              {!isUnlocked && (
                <View style={styles.lockOverlay}>
                  <Ionicons name="lock-closed" size={18} color="#ffffff" />
                </View>
              )}
              {isEquipped && (
                <View style={[styles.equippedBadge, { backgroundColor: colors.primary }]}>
                  <Ionicons name="checkmark" size={10} color={colors.onPrimary} />
                </View>
              )}
            </View>
            <Text
              style={[
                styles.label,
                { color: isUnlocked ? colors.textPrimary : colors.textTertiary },
              ]}
              numberOfLines={1}
            >
              {reward.name}
            </Text>
            <RarityPill rarity={reward.rarity} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 12,
    gap: 14,
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  item: {
    alignItems: 'center',
    gap: 6,
    width: PREVIEW_SIZE + 20,
  },
  previewBox: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    padding: 4,
  },
  avatarInner: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
  },
  lockOverlay: {
    position: 'absolute',
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  equippedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
});
