import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';

const DEFAULT_BANNER = require('../../assets/illustration/roebel-bg.png');

type Props = {
  assetUrl: string | null | undefined;
  height?: number;
};

/**
 * Cover image at the top of a profile screen. Falls back to the Roebel default
 * banner when the user has no custom banner equipped.
 */
export default function ProfileCoverBanner({ assetUrl, height = 160 }: Props) {
  const { colors } = useTheme();
  const isPlaceholderUrl = !!assetUrl && assetUrl.includes('placehold.co');
  const hasCustomBanner = !!assetUrl && !isPlaceholderUrl;

  return (
    <View style={[styles.container, { height, backgroundColor: colors.cardPlaceholder }]}>
      <Image
        source={hasCustomBanner ? { uri: assetUrl! } : DEFAULT_BANNER}
        style={StyleSheet.absoluteFill as any}
        contentFit="cover"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
});
