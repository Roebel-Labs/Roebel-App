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
import { Keyboard, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
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
  GLASS_PILL_HEIGHT,
  GLASS_PILL_INSET,
  GLASS_PILL_SIDE_MARGIN,
  GLASS_PILL_TOP_GAP,
  glassBarFootprint,
  glassHighlightX,
  glassPillBottomGap,
  glassTabWidth,
} from '@/lib/glass-tab-geometry';

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
const SPRING = { damping: 20, stiffness: 240, mass: 0.9 } as const;

// Last highlighted tab across all bar instances (one per pseudo-tab screen).
let lastHighlightIndex: number | null = null;

export default function GlassTabBar<K extends string>({ tabs, activeKey, onTabPress }: Props<K>) {
  const { colors, isDark, variant } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const liquid = useLiquidGlass();

  // Immediate feedback on press; the host's activeKey wins again whenever it
  // changes (screen focus, host state).
  const [pressedKey, setPressedKey] = useState<K | null>(null);
  // expo-router's own hook — the @react-navigation/native one crashes under
  // expo-router 56 (memory: reference_expo_router_use_is_focused).
  const focused = useIsFocused();
  useEffect(() => setPressedKey(null), [activeKey, focused]);
  const shownKey = pressedKey ?? activeKey;
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.key === shownKey));

  const [pillWidth, setPillWidth] = useState(0);
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
    x.value = reduceMotion ? withTiming(target, { duration: 0 }) : withSpring(target, SPRING);
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
    () =>
      isDark
        ? {
            active: '#FFFFFF',
            inactive: 'rgba(235,235,245,0.6)',
            highlight: 'rgba(255,255,255,0.16)',
            rim: 'rgba(255,255,255,0.14)',
            liquidTint: variant === 'dark' ? 'rgba(20,20,22,0.55)' : 'rgba(40,41,44,0.5)',
            wash: variant === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(24,25,27,0.2)',
            shadow: '0px 10px 30px rgba(0,0,0,0.55)',
          }
        : {
            active: '#000000',
            inactive: '#7C7C82',
            highlight: 'rgba(118,118,128,0.14)',
            rim: 'rgba(255,255,255,0.9)',
            liquidTint: 'rgba(255,255,255,0.6)',
            wash: 'rgba(255,255,255,0.45)',
            shadow: '0px 10px 30px rgba(0,0,0,0.12)',
          },
    [isDark, variant],
  );

  const onPillLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width - GLASS_PILL_BORDER * 2;
    setPillWidth((prev) => (prev === w ? prev : w));
  };

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
        <View style={[styles.pill, { borderColor: palette.rim }]} onLayout={onPillLayout}>
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
              <GlassSurface androidExperimentalBlur />
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: palette.wash }]} />
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
    width: 28,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 16,
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
