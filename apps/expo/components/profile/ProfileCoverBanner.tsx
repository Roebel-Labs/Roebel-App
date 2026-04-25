import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  assetUrl: string | null | undefined;
  height?: number;
};

/**
 * Cover image at the top of a profile screen. Falls back to a subtle gradient
 * placeholder when the user has no banner equipped.
 */
export default function ProfileCoverBanner({ assetUrl, height = 160 }: Props) {
  const { colors } = useTheme();
  const isPlaceholderUrl = !!assetUrl && assetUrl.includes('placehold.co');
  const shouldRender = !!assetUrl && !isPlaceholderUrl;

  return (
    <View style={[styles.container, { height, backgroundColor: colors.cardPlaceholder }]}>
      {shouldRender ? (
        <Image
          source={{ uri: assetUrl! }}
          style={StyleSheet.absoluteFill as any}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.placeholder,
            { backgroundColor: colors.primary + '22' },
          ]}
        >
          <View style={[styles.placeholderStripe, { backgroundColor: colors.primary + '44' }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  placeholder: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  placeholderStripe: {
    width: '140%',
    height: 60,
    transform: [{ rotate: '-8deg' }, { translateY: 40 }],
  },
});
