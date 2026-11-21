/**
 * Content that sharpens out of a blur whenever `swapKey` changes — e.g. the
 * text under a card carousel when the next card snaps in (Max 2026-11-21).
 * Android: expo-blur samples the content (its own GlassBackdrop, so it works
 * inside sheets/modals too); iOS: the system blur. Blur strength and layer
 * opacity fall together, so no tint is left behind.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { GLASS_BLUR_AVAILABLE, GlassBackdrop, GlassProvider, useGlassTarget } from '@/components/GlassSurface';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
const SWAP_MS = 420;
const SWAP_INTENSITY = 28;

export default function BlurSwap({
  swapKey,
  children,
  style,
}: {
  swapKey: string | number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <GlassProvider>
      <View style={style}>
        {/* Opaque page colour: the blur samples only this view, and transparent pixels came out
            inverted (dark blur in light mode, light in dark — Max 2026-11-21). */}
        <GlassBackdrop style={{ backgroundColor: colors.background }}>{children}</GlassBackdrop>
        <BlurPulse swapKey={swapKey} />
      </View>
    </GlassProvider>
  );
}

function BlurPulse({ swapKey }: { swapKey: string | number }) {
  const { isDark } = useTheme();
  const target = useGlassTarget();
  const [ready, setReady] = useState(Platform.OS === 'ios');
  const blur = useSharedValue(0);
  const first = useRef(true);

  useEffect(() => {
    if (target?.current) setReady(true);
  }, [target]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    blur.value = 1;
    blur.value = withTiming(0, { duration: SWAP_MS, easing: Easing.out(Easing.cubic) });
  }, [swapKey, blur]);

  const props = useAnimatedProps(() => ({ intensity: blur.value * SWAP_INTENSITY }));
  const fade = useAnimatedStyle(() => ({ opacity: blur.value }));

  if (!ready || !GLASS_BLUR_AVAILABLE) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, Platform.OS === 'ios' ? null : fade]}>
      <AnimatedBlurView
        style={StyleSheet.absoluteFill}
        animatedProps={props}
        tint={isDark ? 'dark' : 'light'}
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={Platform.OS === 'android' ? target ?? undefined : undefined}
      />
    </Animated.View>
  );
}
