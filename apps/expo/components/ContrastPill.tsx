/**
 * The pill that floats above the glass bottom bar ("Account wechseln", Erkunden's Karte switch).
 * Same material as the bottom-nav pill (Liquid Glass on iOS 26+, frosted GlassSurface elsewhere),
 * same rim and shadow, ink from the nav palette. Press: spring to 0.97 + haptic.
 *
 * Must render inside the screen's <GlassProvider> (like the bottom bar) so Android frosts too.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import GlassSurface from '@/components/GlassSurface';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { LiquidGlassView, useLiquidGlass } from '@/lib/liquidGlass';
import { glassPillPalette, type GlassPillPalette } from '@/lib/glass-pill-palette';
import { CONTRAST_PILL_HEIGHT } from '@/lib/contrast-pill';

type Slot = React.ReactNode | ((palette: GlassPillPalette) => React.ReactNode);

type Props = {
  label: string;
  onPress: () => void;
  /** Left slot, e.g. a 26 pt avatar or an icon; a function receives the palette (ink colors). */
  leading?: Slot;
  /** Right slot, e.g. the ⇆ icon. */
  trailing?: Slot;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const SPRING = { damping: 18, stiffness: 320, mass: 0.6 };

export function useGlassPillPalette(): GlassPillPalette {
  const { isDark, variant } = useTheme();
  return glassPillPalette(isDark, variant);
}

export default function ContrastPill({ label, onPress, leading, trailing, disabled, accessibilityLabel, style }: Props) {
  const { isDark } = useTheme();
  const palette = useGlassPillPalette();
  const liquid = useLiquidGlass();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const render = (slot: Slot) => (typeof slot === 'function' ? slot(palette) : slot);

  return (
    <Animated.View style={[styles.shadow, { boxShadow: palette.shadow } as object, pressStyle, style]}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        onPressIn={() => (scale.value = withSpring(0.97, SPRING))}
        onPressOut={() => (scale.value = withSpring(1, SPRING))}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={[styles.pill, { borderColor: palette.rim }, disabled && styles.disabled]}
      >
        {liquid && LiquidGlassView ? (
          <LiquidGlassView
            pointerEvents="none"
            glassEffectStyle="regular"
            colorScheme={isDark ? 'dark' : 'light'}
            tintColor={palette.liquidTint}
            style={[StyleSheet.absoluteFill, { borderRadius: CONTRAST_PILL_HEIGHT / 2 }]}
          />
        ) : (
          <GlassSurface androidExperimentalBlur />
        )}
        {leading ? <View style={styles.leading}>{render(leading)}</View> : null}
        <Text style={[styles.label, { color: palette.active }]} numberOfLines={1}>
          {label}
        </Text>
        {trailing ? <View style={styles.trailing}>{render(trailing)}</View> : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadow: { alignSelf: 'center', borderRadius: 999 },
  pill: {
    height: CONTRAST_PILL_HEIGHT,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  disabled: { opacity: 0.6 },
  leading: { marginRight: 8 },
  trailing: { marginLeft: 6 },
  label: { fontFamily: fontFamily.semiBold, fontSize: 15, letterSpacing: -0.1 },
});
