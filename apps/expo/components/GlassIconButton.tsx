/**
 * Round glass button for screens that float their controls over content
 * (back, share, close, favorite …) instead of a classic app header — and
 * for floating action buttons.
 *
 * Same material family as the glass nav pill, built to stay cheap:
 *   iOS      the system chrome material (one BlurView per button)
 *   Android  NO blur sampler — a translucent theme tint with a light rim and
 *            a soft top sheen. A second expo-blur sampler on one screen is
 *            what made content disappear on the Pixel (GlassSurface notes);
 *            the nav keeps the screen's single sampler.
 * Press: a short scale-down with one ease-out back, no spring bounce.
 */
import React, { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import GlassSurface, { GLASS_BLUR_AVAILABLE, useGlassTarget } from '@/components/GlassSurface';

export const GLASS_ICON_BUTTON_SIZE = 48;

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
  /** Diameter; 44 for header controls, 56 for floating action buttons. */
  size?: number;
  /**
   * 'auto' follows the theme. 'dark' is for controls over photos/flyers in
   * light mode where a white glass would vanish into a bright image.
   */
  tone?: 'auto' | 'dark';
  /** Filled brand button (FAB) — glass rim and sheen over the primary color. */
  tint?: string;
  hitSlop?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const PRESS_IN = { duration: 90, easing: Easing.out(Easing.quad) } as const;
const PRESS_OUT = { duration: 160, easing: Easing.out(Easing.cubic) } as const;

export default function GlassIconButton({
  onPress,
  accessibilityLabel,
  children,
  size = GLASS_ICON_BUTTON_SIZE,
  tone = 'auto',
  tint,
  hitSlop = 6,
  disabled,
  style,
}: Props) {
  const { isDark, variant } = useTheme();
  // Standard frosted material follows the theme; `tone` no longer darkens it (white icons on a
  // light glass in light mode). Kept in the props for existing callers.
  void tone;
  const dark = isDark;
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const onPressIn = useCallback(() => {
    scale.set(withTiming(0.92, PRESS_IN));
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  }, [scale]);
  const onPressOut = useCallback(() => {
    scale.set(withTiming(1, PRESS_OUT));
  }, [scale]);

  const radius = size / 2;
  const { rim, shadow } = glassChrome(dark, !!tint);
  return (
    <Animated.View style={[{ width: size, height: size, borderRadius: radius, boxShadow: shadow } as ViewStyle, pressStyle, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.clip, { borderRadius: radius, borderColor: rim }]}
      >
        <GlassFill dark={dark} black={variant === 'dark'} tint={tint} />
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** Rim + shadow of the glass family (button, pill, FAB). */
export function glassChrome(dark: boolean, tinted = false): { rim: string; shadow: string } {
  return {
    rim: tinted ? 'rgba(255,255,255,0.28)' : dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.9)',
    shadow: dark || tinted ? '0px 4px 14px rgba(0,0,0,0.35)' : '0px 4px 14px rgba(0,0,0,0.12)',
  };
}

/**
 * The glass material as an absolute-fill layer (first child of a clipped,
 * transparent container) — EXACTLY the standard bottom bar's frosted glass
 * (GlassSurface: iOS chrome material; Android expo-blur sampling the screen's
 * GlassBackdrop + its tuned wash). Max 2026-11-20: "use the same technology
 * the standard bottom nav uses". Where nothing can be sampled (Android
 * without a GlassBackdrop), a plain translucent tint.
 * `tint`: brand-coloured glass (FABs) — the colour laid over the frost.
 */
export function GlassFill({
  dark,
  black = false,
  tint,
  fillAlpha,
}: {
  dark: boolean;
  black?: boolean;
  tint?: string;
  /** Opacity of the fallback tint / brand colour (defaults per tone). */
  fillAlpha?: number;
}) {
  const target = useGlassTarget();
  const real = GLASS_BLUR_AVAILABLE && Platform.OS !== 'web' && (Platform.OS === 'ios' || !!target);
  if (real) {
    return (
      <>
        <GlassSurface androidExperimentalBlur />
        {tint ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: fillAlpha ?? 0.82 }]} />
        ) : null}
      </>
    );
  }
  const fa = fillAlpha ?? (dark ? (black ? 0.72 : 0.66) : 0.78);
  const fill = tint ? tint : dark ? (black ? `rgba(28,29,32,${fa})` : `rgba(44,46,50,${fa})`) : `rgba(255,255,255,${fa})`;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />;
}

const styles = StyleSheet.create({
  clip: {
    flex: 1,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
