import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useEquippedRewards } from '@/hooks/useEquippedRewards';
import { useTheme } from '@/context/ThemeContext';
import { transformedImageUrl } from '@/lib/image-url';

/**
 * Frame PNGs are designed to overflow the avatar's circle so they read as a
 * decorative halo (crowns, horns, ornaments) rather than a tight ring. The
 * outer container is scaled by FRAME_SCALE; the avatar sits at its nominal
 * size centered inside, and the frame PNG fills the larger container with
 * `contentFit="contain"`.
 */
export const FRAME_SCALE = 1.3;

type Props = {
  size: number;
  uri?: string | null;
  fallbackInitial?: string;
  /** Explicit frame override. When omitted, falls back to the viewer's own equipped frame. */
  frameAssetUrl?: string | null;
  /** Skip frame rendering entirely (used for org / bot avatars). */
  disabled?: boolean;
  style?: ViewStyle;
};

function isPlaceholderUrl(url: string | null | undefined): boolean {
  return !!url && url.includes('placehold.co');
}

export default function UserAvatarWithFrame({
  size,
  uri,
  fallbackInitial,
  frameAssetUrl,
  disabled,
  style,
}: Props) {
  const { colors } = useTheme();
  const equipped = useEquippedRewards();

  // Only default to the viewer's own equipped frame when no override was
  // passed in at all (undefined). An explicit `null` means "no frame".
  const resolvedFrame =
    frameAssetUrl === undefined ? equipped.profile_frame?.reward.asset_url ?? null : frameAssetUrl;
  const showFrame = !disabled && !!resolvedFrame && !isPlaceholderUrl(resolvedFrame);

  const outerSize = showFrame ? size * FRAME_SCALE : size;

  return (
    <View
      style={[
        {
          width: outerSize,
          height: outerSize,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          backgroundColor: colors.cardPlaceholder,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {uri ? (
          // expo-image (not RN Image) so avatars are cached in memory + on
          // disk. Repeat appearances across the DM list and chat then render
          // instantly instead of re-fetching over the network every time.
          <ExpoImage
            source={{ uri: transformedImageUrl(uri, { width: 160 }) ?? undefined }}
            style={{ width: size, height: size }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
            recyclingKey={uri}
            accessibilityIgnoresInvertColors
          />
        ) : fallbackInitial ? (
          <Text
            style={{
              fontSize: size * 0.42,
              fontFamily: 'Inter-SemiBold',
              color: colors.textSecondary,
            }}
          >
            {fallbackInitial}
          </Text>
        ) : null}
      </View>
      {showFrame && (
        <ExpoImage
          source={{ uri: resolvedFrame! }}
          style={StyleSheet.absoluteFillObject}
          contentFit="contain"
          pointerEvents="none"
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  );
}
