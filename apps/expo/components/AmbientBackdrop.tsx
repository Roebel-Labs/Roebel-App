import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  uri: string;
  /** Total height of the backdrop; it fades into the page background over
   *  the bottom `fadeRatio` of it. */
  height: number;
  /** 0..1 — how much of the height the bottom fade takes. */
  fadeRatio?: number;
  /** Darkens the top so white chrome (back / share) always reads. */
  topScrim?: boolean;
  /** Overall strength of the blurred picture, 1 = as loud as the page allows. */
  intensity?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * The picture itself, blurred wide, as an ambient wash behind a detail page's
 * header: sits absolutely at the top of the scroll content and fades into the
 * page background so the title block below it stays on a plain surface.
 * Shared by the event and movie detail pages.
 */
export default function AmbientBackdrop({
  uri,
  height,
  fadeRatio = 0.55,
  topScrim = true,
  intensity = 1,
  style,
}: Props) {
  const { colors, isDark } = useTheme();
  return (
    <View style={[styles.root, { height, opacity: intensity }, style]} pointerEvents="none">
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={48}
        cachePolicy="memory-disk"
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.12)' },
        ]}
      />
      {topScrim && (
        <LinearGradient colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']} style={styles.topScrim} />
      )}
      <LinearGradient
        colors={[`${colors.background}00`, colors.background]}
        style={[styles.fade, { height: `${Math.round(fadeRatio * 100)}%` }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
