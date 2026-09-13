/**
 * The frosted ground the map's bottom chrome stands on.
 *
 * Pinned to the real screen edge and reaching up past the category row, it
 * thickens toward the bottom instead of starting with a hard line: on iOS a
 * stack of bottom-anchored blur bands (each shorter and stronger than the one
 * above it) under a transparent-to-background wash; on Android the wash
 * alone. The map on Android draws into a SurfaceView, which a BlurTargetView
 * cannot sample (that is the 2026-08-23 crash class), so no blur is attempted
 * there.
 *
 * Never animated: a UIVisualEffectView under a partially transparent parent
 * drops its blur outright, so fading this with the rest of the chrome would
 * flicker. The sheets simply open over it.
 */
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/context/ThemeContext';
import { hexToRgba } from '@/lib/color';

type Props = {
  /** Distance from the screen bottom the fade reaches up to. */
  height: number;
};

// Fraction of the region each band covers (bottom-anchored) and its radius.
const BLUR_BANDS = [
  { fraction: 1, intensity: 10 },
  { fraction: 0.78, intensity: 14 },
  { fraction: 0.56, intensity: 18 },
  { fraction: 0.34, intensity: 24 },
];

const WASH_LOCATIONS = [0, 0.22, 0.55, 1];
const WASH_ALPHAS = [0, 0.42, 0.84, 0.96];

export default function MapBottomFade({ height }: Props) {
  const { colors, isDark } = useTheme();
  const washColors = WASH_ALPHAS.map((alpha) => hexToRgba(colors.background, alpha));

  return (
    <View pointerEvents="none" style={[styles.wrap, { height }]}>
      {Platform.OS === 'ios'
        ? BLUR_BANDS.map((band) => (
            <BlurView
              key={band.fraction}
              pointerEvents="none"
              intensity={band.intensity}
              tint={isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
              style={[styles.band, { height: Math.round(height * band.fraction) }]}
            />
          ))
        : null}
      <LinearGradient
        pointerEvents="none"
        colors={washColors as [string, string, ...string[]]}
        locations={WASH_LOCATIONS as [number, number, ...number[]]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1000 },
  band: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
