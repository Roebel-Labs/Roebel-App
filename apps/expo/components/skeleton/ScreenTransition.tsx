/**
 * Main-screen transitions (Austausch, Erkunden, Profil):
 *
 *  - ENTRY (first mount of the screen): the screen's matched skeleton covers
 *    the content until its data is ready, at least ENTRY_MIN_MS, then fades.
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
import { BlurView } from 'expo-blur';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming, runOnJS } from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { onTabArrival, type MainTab } from '@/lib/navigation/goToTab';
import GlassSurface, { GLASS_BLUR_AVAILABLE, useGlassTarget } from '@/components/GlassSurface';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export const ENTRY_MIN_MS = 350;
const ENTRY_FADE_MS = 220;
/** The detail screen slides out on top for ~350 ms: hold the full blur that long, then sharpen. */
const RETURN_HOLD_MS = 320;
const RETURN_MS = 520;
const RETURN_INTENSITY = 100;

type Props = {
  /** The screen's skeleton (components/skeleton/EntrySkeletons). */
  skeleton: React.ReactNode;
  /** True once the screen can show real content (cached or fetched). */
  ready: boolean;
  /** Space kept clear at the top for the screen's header. */
  topInset?: number;
  /** Overlay fill behind the skeleton; defaults to the theme background. */
  backgroundColor?: string;
  /**
   * The main section this screen is. A tab switch to it (bottom nav) shows the skeleton beat
   * again, Airbnb-style — raised BEFORE the screen is revealed (goToTab signals first).
   */
  tab?: MainTab;
};

export default function ScreenTransition({ skeleton, ready, topInset = 0, backgroundColor, tab }: Props) {
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

  // ---- Tab arrival (bottom nav switch to this section) ----
  const arrivedByTab = useRef(false);
  useEffect(() => {
    if (!tab) return undefined;
    return onTabArrival((target) => {
      if (target !== tab) return;
      arrivedByTab.current = true;
      mountedAt.current = Date.now();
      entryOpacity.value = 1;
      setEntryShown(true);
    });
  }, [tab, entryOpacity]);

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
        return undefined;
      }
      // A tab switch shows the skeleton beat instead of the return blur.
      if (arrivedByTab.current) {
        arrivedByTab.current = false;
        return undefined;
      }
      if (reduceMotion.current) return undefined;
      blur.value = 1;
      setReturning(true);
      blur.value = withDelay(
        RETURN_HOLD_MS,
        withTiming(0, { duration: RETURN_MS, easing: Easing.inOut(Easing.cubic) }, (done) => {
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
  const blurStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, blur.value * 1.6) }));

  return (
    <>
      {returning && !canBlur ? (
        // No real blur here (Android screen without a blur target, or no expo-blur): a frosted
        // wash of the page colour that clears on the same curve.
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: frost }, blurStyle]} />
      ) : null}
      {returning && canBlur && Platform.OS === 'ios' ? (
        // iOS: the system chrome material dissolves by its own intensity (a parent opacity
        // would switch a UIVisualEffectView off mid-fade).
        <AnimatedBlurView
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          animatedProps={blurProps}
          tint={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterial'}
        />
      ) : null}
      {returning && canBlur && Platform.OS !== 'ios' ? (
        // Android: exactly the standard bottom bar's frosted glass over the page, fading out.
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, blurStyle]}>
          <GlassSurface androidExperimentalBlur />
        </Animated.View>
      ) : null}
      {entryShown ? (
        <Animated.View
          pointerEvents={ready ? 'none' : 'auto'}
          style={[StyleSheet.absoluteFill, styles.entry, { top: topInset, backgroundColor: backgroundColor ?? colors.background }, entryStyle]}
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
