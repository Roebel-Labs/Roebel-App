/**
 * "Glas" bottom navigation (Profil → Darstellung → Navigationsleiste).
 *
 * A floating pill inset from the screen edges: very light glass, a 1 px
 * light rim and a soft wide shadow. The active tab sits in a stadium
 * highlight spanning icon + label (filled icon, bold label); inactive tabs
 * show the outline icon in mid grey.
 *
 * Material per platform:
 *   iOS 26+   Liquid Glass (expo-glass-effect GlassView) with a white tint
 *   iOS < 26  GlassSurface (chrome material BlurView) + a white wash
 *   Android   GlassSurface with androidExperimentalBlur — the screen's ONE
 *             blur sampler (hosts drop their full-width glass in this mode)
 *
 * There is no tab navigator: every pseudo-tab screen mounts its own bar, so
 * the highlight remembers the last tab at module level and springs from it
 * on mount — the slide reads as one bar across the instant screen cuts.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useIsFocused } from 'expo-router';
import GlassSurface from '@/components/GlassSurface';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { LiquidGlassView, useLiquidGlass } from '@/lib/liquidGlass';
import {
  GLASS_HIGHLIGHT_HEIGHT,
  GLASS_PILL_BORDER,
  glassPillInnerWidth,
  GLASS_PILL_HEIGHT,
  GLASS_PILL_INSET,
  GLASS_PILL_SIDE_MARGIN,
  GLASS_PILL_TOP_GAP,
  glassBarFootprint,
  glassHighlightX,
  glassPillBottomGap,
  glassTabWidth,
} from '@/lib/glass-tab-geometry';
import { glassPillPalette } from '@/lib/glass-pill-palette';

export type GlassTab<K extends string> = {
  key: K;
  label: string;
  stroke: React.ComponentType<{ width: number; height: number; color: string }>;
  filled: React.ComponentType<{ width: number; height: number; color: string }>;
  /** Small brand dot on the icon (e.g. "new in Erkunden"). */
  dot?: boolean;
};

type Props<K extends string> = {
  tabs: readonly GlassTab<K>[];
  activeKey: K;
  onTabPress: (key: K) => void;
};

const ICON_SIZE = 24;
/** Highlight slide: short and decisive so it lands with the color change, no spring overshoot. */
const SLIDE = { duration: 220, easing: Easing.out(Easing.cubic) } as const;

// Last highlighted tab across all bar instances (one per pseudo-tab screen).
let lastHighlightIndex: number | null = null;

export default function GlassTabBar<K extends string>({ tabs, activeKey, onTabPress }: Props<K>) {
  const { colors, isDark, variant } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const liquid = useLiquidGlass();

  // Immediate feedback on press. Cleared only when this bar's screen GAINS
  // focus again (or the host's activeKey changes) — never on blur: resetting
  // on blur flipped the still-visible outgoing bar back to the old tab for a
  // frame before the next screen appeared (the "color jumps back" flicker).
  const [pressedKey, setPressedKey] = useState<K | null>(null);
  // expo-router's own hook — the @react-navigation/native one crashes under
  // expo-router 56 (memory: reference_expo_router_use_is_focused).
  const focused = useIsFocused();
  useEffect(() => {
    if (focused) setPressedKey(null);
  }, [activeKey, focused]);
  const shownKey = pressedKey ?? activeKey;
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.key === shownKey));

  // Known up front from the window, so the highlight is in place on the very
  // first frame of a freshly mounted bar (waiting for onLayout left one frame
  // without it on every tab switch).
  const { width: windowWidth } = useWindowDimensions();
  const pillWidth = glassPillInnerWidth(windowWidth);
  const tabWidth = glassTabWidth(pillWidth, tabs.length);
  const x = useSharedValue(0);
  const placed = useSharedValue(0);

  useEffect(() => {
    if (pillWidth <= 0) return;
    const target = glassHighlightX(pillWidth, tabs.length, activeIndex);
    if (placed.value === 0) {
      // First layout: start where the previous screen's bar left off.
      const from = lastHighlightIndex ?? activeIndex;
      x.value = glassHighlightX(pillWidth, tabs.length, from);
      placed.value = 1;
    }
    x.value = reduceMotion ? target : withTiming(target, SLIDE);
    lastHighlightIndex = activeIndex;
  }, [pillWidth, activeIndex, tabs.length, reduceMotion, x, placed]);

  const highlightStyle = useAnimatedStyle(() => {
    'worklet';
    return { opacity: placed.value, transform: [{ translateX: x.value }] };
  });

  // Keyboard: Android resizes the window, which would lift the floating
  // pill onto the keyboard. Slide it away instead (never fade — Liquid
  // Glass stops rendering under opacity < 1).
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, () => setKeyboardUp(true));
    const b = Keyboard.addListener(hideEvt, () => setKeyboardUp(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  const footprint = glassBarFootprint(insets.bottom);
  const hideStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ translateY: withTiming(keyboardUp ? footprint + 24 : 0, { duration: 180 }) }],
    };
  }, [keyboardUp, footprint]);

  const palette = useMemo(
    () => glassPillPalette(isDark, variant),
    [isDark, variant],
  );

  const handlePress = (key: K) => {
    if (key !== shownKey) setPressedKey(key);
    onTabPress(key);
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { paddingTop: GLASS_PILL_TOP_GAP, paddingBottom: glassPillBottomGap(insets.bottom) },
        hideStyle,
      ]}
      pointerEvents={keyboardUp ? 'none' : 'box-none'}
    >
      <View style={[styles.shadowBox, { boxShadow: palette.shadow } as object]}>
        <View style={[styles.pill, { borderColor: palette.rim }]}>
          {liquid && LiquidGlassView ? (
            <LiquidGlassView
              pointerEvents="none"
              glassEffectStyle="regular"
              colorScheme={isDark ? 'dark' : 'light'}
              tintColor={palette.liquidTint}
              style={[StyleSheet.absoluteFill, { borderRadius: GLASS_PILL_HEIGHT / 2 }]}
            />
          ) : (
            <>
              {/* Exactly the standard bar's frosted material — no extra wash on top
                  (it turned the glass into a flat fill). */}
              <GlassSurface androidExperimentalBlur />
            </>
          )}

          {tabWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.highlight,
                { width: tabWidth, backgroundColor: palette.highlight },
                highlightStyle,
              ]}
            />
          )}

          <View style={styles.row}>
            {tabs.map((tab) => {
              const active = tab.key === shownKey;
              const Icon = active ? tab.filled : tab.stroke;
              const tint = active ? palette.active : palette.inactive;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => handlePress(tab.key)}
                  style={({ pressed }) => [styles.tab, pressed && !active && styles.tabPressed]}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: active }}
                >
                  <View style={styles.iconBox}>
                    <Icon width={ICON_SIZE} height={ICON_SIZE} color={tint} />
                    {tab.dot && (
                      <View style={[styles.dot, { backgroundColor: colors.primary, borderColor: isDark ? '#1C1C1E' : '#FFFFFF' }]} />
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[styles.label, { color: tint, fontFamily: active ? fontFamily.bold : fontFamily.semiBold }]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: GLASS_PILL_SIDE_MARGIN,
  },
  shadowBox: {
    borderRadius: GLASS_PILL_HEIGHT / 2,
  },
  pill: {
    height: GLASS_PILL_HEIGHT,
    borderRadius: GLASS_PILL_HEIGHT / 2,
    borderWidth: GLASS_PILL_BORDER,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  highlight: {
    position: 'absolute',
    left: 0,
    top: GLASS_PILL_INSET,
    height: GLASS_HIGHLIGHT_HEIGHT,
    borderRadius: GLASS_HIGHLIGHT_HEIGHT / 2,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: GLASS_PILL_INSET,
    height: '100%',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPressed: {
    opacity: 0.6,
  },
  iconBox: {
    width: 26,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    // More air between icon and label, slightly smaller type (Max's reference, 2026-11-20).
    marginTop: 4,
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: 0.1,
  },
  dot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
  },
});
