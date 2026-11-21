/**
 * Main-screen transitions (Austausch, Erkunden, Profil):
 *
 *  - ENTRY (first mount of the screen): the screen's matched skeleton covers
 *    the content until its data is ready, at least ENTRY_MIN_MS, then fades.
 *  - TAB SWITCH (bottom nav): nothing — the sections are kept mounted
 *    (app/(tabs)/_layout.tsx), so the page is simply there (Max 2026-11-21:
 *    the old skeleton beat on every switch read as slow loading).
 *  - RETURN (the screen gains focus again, e.g. back from a detail page): no
 *    skeleton — the cached page is shown blurred and sharpens in one motion.
 *
 * Unlike the removed per-focus "entry shimmer", nothing is ever re-armed on
 * blur, so a visible page never flips to a skeleton (that was the flicker).
 * Place it after the scroll content and BEFORE floating chrome in JSX.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming, runOnJS } from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { onTabArrival, type MainTab } from '@/lib/navigation/goToTab';
import { GLASS_BLUR_AVAILABLE, useGlassTarget } from '@/components/GlassSurface';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export const ENTRY_MIN_MS = 350;
const ENTRY_FADE_MS = 220;
/** Detail screens fade out (no slide) in ~220 ms: a short hold, then the blur loosens. */
const RETURN_HOLD_MS = 80;
const RETURN_MS = 650;
const RETURN_INTENSITY = 42;

type Props = {
  /** The screen's skeleton (components/skeleton/EntrySkeletons). */
  skeleton: React.ReactNode;
  /** True once the screen can show real content (cached or fetched). */
  ready: boolean;
  /** Space kept clear at the top for the screen's header. */
  topInset?: number;
  /** Overlay fill behind the skeleton; defaults to the theme background. */
  backgroundColor?: string;
  /** The main section this screen is: a tab switch to it (bottom nav) skips the return blur. */
  tab?: MainTab;
  /**
   * The screen root is a SafeAreaView with the top edge: absolute overlays ignore its padding,
   * so the status-bar inset is added here (else the skeleton sits higher than the real UI).
   */
  safeAreaTop?: boolean;
};

export default function ScreenTransition({ skeleton, ready, topInset = 0, backgroundColor, tab, safeAreaTop = false }: Props) {
  const insets = useSafeAreaInsets();
  const overlayTop = topInset + (safeAreaTop ? insets.top : 0);
  const { colors, isDark } = useTheme();
  const target = useGlassTarget();

  // ---- Entry skeleton (first mount only) ----
  const [entryShown, setEntryShown] = useState(true);
  const entryOpacity = useSharedValue(1);
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    if (!ready || !entryShown) return;
    const wait = Math.max(0, ENTRY_MIN_MS - (Date.now() - mountedAt.current));
    const t = setTimeout(() => {
      entryOpacity.value = withTiming(0, { duration: ENTRY_FADE_MS, easing: Easing.out(Easing.quad) }, (done) => {
        if (done) runOnJS(setEntryShown)(false);
      });
    }, wait);
    return () => clearTimeout(t);
  }, [ready, entryShown, entryOpacity]);
  const entryStyle = useAnimatedStyle(() => ({ opacity: entryOpacity.value }));

  // ---- Tab arrival (bottom nav switch to this section): shown as is, no beat ----
  const arrivedByTab = useRef(false);
  useEffect(() => {
    if (!tab) return undefined;
    return onTabArrival((target) => {
      if (target === tab) arrivedByTab.current = true;
    });
  }, [tab]);

  // ---- Return blur (every focus after the first) ----
  const firstFocus = useRef(true);
  const [returning, setReturning] = useState(false);
  const blur = useSharedValue(0);
  const reduceMotion = useRef(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        reduceMotion.current = v;
      })
      .catch(() => {});
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        arrivedByTab.current = false;
        return undefined;
      }
      // A tab switch reveals the kept-alive page as it is.
      if (arrivedByTab.current) {
        arrivedByTab.current = false;
        return undefined;
      }
      if (reduceMotion.current) return undefined;
      blur.value = 1;
      setReturning(true);
      blur.value = withDelay(
        RETURN_HOLD_MS,
        withTiming(0, { duration: RETURN_MS, easing: Easing.out(Easing.cubic) }, (done) => {
          if (done) runOnJS(setReturning)(false);
        }),
      );
      return undefined;
    }, [blur]),
  );
  const blurProps = useAnimatedProps(() => ({ intensity: blur.value * RETURN_INTENSITY }));
  // Android blurs only by sampling the screen's GlassBackdrop; without one it would be a flat tint.
  const canBlur = GLASS_BLUR_AVAILABLE && (Platform.OS !== 'android' || !!target?.current);
  const frost = isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)';
  const blurStyle = useAnimatedStyle(() => ({ opacity: blur.value }));

  return (
    <>
      {returning && !canBlur ? (
        // No real blur here (Android screen without a blur target, or no expo-blur): a frosted
        // wash of the page colour that clears on the same curve.
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: frost }, blurStyle]} />
      ) : null}
      {returning && canBlur ? (
        // Blur strength AND layer opacity fall together, so no tint is left behind at the end
        // (a lone tint read as grey in dark mode and snapped from dark grey to white in light
        // mode). Plain light/dark tint matching the theme — no material film.
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, Platform.OS === 'ios' ? null : blurStyle]}
        >
          <AnimatedBlurView
            style={StyleSheet.absoluteFill}
            animatedProps={blurProps}
            tint={isDark ? 'dark' : 'light'}
            blurMethod="dimezisBlurViewSdk31Plus"
            blurTarget={Platform.OS === 'android' ? target ?? undefined : undefined}
          />
        </Animated.View>
      ) : null}
      {entryShown ? (
        <Animated.View
          pointerEvents={ready ? 'none' : 'auto'}
          // Fade the skeleton as ONE layer. Without this Android applies the opacity to every
          // child separately, so mid-fade the skeleton sheet turned see-through and the card bones
          // behind it showed over it (Profil, Max 2026-11-21).
          needsOffscreenAlphaCompositing
          style={[StyleSheet.absoluteFill, styles.entry, { top: overlayTop, backgroundColor: backgroundColor ?? colors.background }, entryStyle]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={styles.fill}>{skeleton}</View>
        </Animated.View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  entry: { overflow: 'hidden' },
  fill: { flex: 1 },
});
