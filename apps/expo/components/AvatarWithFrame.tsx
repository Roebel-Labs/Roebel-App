import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useEquippedRewards } from '@/hooks/useEquippedRewards';
import type { LootboxRewardRarity } from '@/lib/supabase-rewards';

interface AvatarWithFrameProps {
  size: number;
  children: React.ReactNode;
  /** Disable frame rendering (e.g. in a context where it would overlap badges). */
  disabled?: boolean;
}

const RARITY_COLOR: Record<LootboxRewardRarity, string> = {
  common: '#94A3B8',
  rare: '#3B82F6',
  epic: '#8B5CF6',
  legendary: '#F59E0B',
};

/**
 * Wraps a circular avatar with the user's equipped profile_frame reward.
 * Falls through when nothing is equipped. If the admin has uploaded a
 * transparent-PNG frame asset, it's overlaid on top of the avatar (expected to
 * be a ring). For seeded placeholder frames (solid-color URLs) we also render
 * a rarity-colored ring so the user gets visual feedback that a frame is
 * equipped even before bespoke artwork lands.
 */
export default function AvatarWithFrame({
  size,
  children,
  disabled,
}: AvatarWithFrameProps) {
  const equipped = useEquippedRewards();
  const frame = equipped.profile_frame;

  if (disabled || !frame) {
    return <>{children}</>;
  }

  const ringThickness = Math.max(2, Math.round(size * 0.06));
  const ringColor = RARITY_COLOR[frame.reward.rarity];
  const outerSize = size + ringThickness * 2;
  const isPlaceholder = frame.reward.asset_url.includes('placehold.co');

  return (
    <View
      style={[
        styles.wrap,
        {
          width: outerSize,
          height: outerSize,
          borderRadius: outerSize / 2,
          borderWidth: ringThickness,
          borderColor: ringColor,
        },
      ]}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
      {!isPlaceholder && (
        <Image
          source={{ uri: frame.reward.asset_url }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: outerSize / 2 }]}
          resizeMode="stretch"
          pointerEvents="none"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
