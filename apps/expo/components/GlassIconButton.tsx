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
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';

export const GLASS_ICON_BUTTON_SIZE = 44;

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
  const dark = tone === 'dark' || isDark;
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
 * transparent container). iOS: system chrome blur; Android: tint + sheen,
 * deliberately without a blur sampler (see header comment).
 */
export function GlassFill({ dark, black = false, tint }: { dark: boolean; black?: boolean; tint?: string }) {
  const fill = tint ? tint : dark ? (black ? 'rgba(28,29,32,0.62)' : 'rgba(44,46,50,0.55)') : 'rgba(255,255,255,0.62)';
  const sheen = tint || dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.55)';
  const blur = Platform.OS === 'ios' && !tint;
  return (
    <>
      {blur ? (
        <BlurView
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          intensity={80}
          tint={dark ? 'systemChromeMaterialDark' : 'systemChromeMaterial'}
        />
      ) : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      )}
      <LinearGradient
        pointerEvents="none"
        colors={[sheen, 'rgba(255,255,255,0)']}
        locations={[0, 0.55]}
        style={StyleSheet.absoluteFill}
      />
    </>
  );
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
