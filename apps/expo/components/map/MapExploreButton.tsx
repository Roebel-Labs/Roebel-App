/**
 * The "Erkunden" pill under the category row — the map's way back to the
 * explore feed. Floats on the bottom fade with its own shadow, in the spot the
 * design gives the primary navigation pill.
 */
import React from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import DiscoverStroke from '@/assets/icons/bottom-nav/discover.svg';

import PressableScale from '@/components/PressableScale';
import { glassEdgeColor } from '@/components/GlassSurface';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { softShadow } from '@/lib/shadow';

export const EXPLORE_BUTTON_HEIGHT = 52;

type Props = {
  onPress: () => void;
  /** Absolute offset from the screen bottom. */
  bottom: number;
  opacity?: Animated.Value;
  /** While a sheet is open the chrome is faded out and must not take taps. */
  hidden?: boolean;
};

export default function MapExploreButton({ onPress, bottom, opacity, hidden = false }: Props) {
  const { colors, isDark } = useTheme();

  return (
    <Animated.View
      style={[styles.wrap, { bottom }, opacity ? { opacity } : null]}
      pointerEvents={hidden ? 'none' : 'box-none'}
    >
      <PressableScale
        onPress={onPress}
        haptic="selection"
        accessibilityRole="button"
        accessibilityLabel="Erkunden öffnen"
        style={[
          styles.pill,
          { backgroundColor: colors.card, borderColor: glassEdgeColor(isDark) },
          softShadow(3, isDark),
        ]}
      >
        <DiscoverStroke width={20} height={20} color={colors.textPrimary} />
        <Text style={[styles.label, { color: colors.textPrimary }]}>Erkunden</Text>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2000,
  },
  pill: {
    height: EXPLORE_BUTTON_HEIGHT,
    borderRadius: EXPLORE_BUTTON_HEIGHT / 2,
    borderWidth: 1,
    paddingHorizontal: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: { fontSize: 16, fontFamily: fontFamily.semiBold },
});
