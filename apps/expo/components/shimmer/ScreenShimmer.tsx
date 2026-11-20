/**
 * ScreenShimmer — the entry skeleton every main screen shows for a short beat
 * on each focus (tab switch, push, back), then fades out to the real content.
 *
 * It is an OVERLAY: the screen renders its real content underneath from the
 * first frame, so navigation never waits on data and nothing jumps when the
 * skeleton leaves. Place it after the scrolling content and before floating
 * chrome (header, bottom nav) in JSX so the chrome stays on top.
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { ShimmerBlock, ShimmerGroup } from '@/components/feed/Shimmer';
import type { EntryShimmer } from '@/hooks/useEntryShimmer';

const FADE_MS = 180;

const StaticContext = createContext(false);

type Props = {
  /**
   * From `useEntryShimmer()`, called at the TOP of the screen (before any
   * early `loading` return) so the time spent on the screen's own loading
   * skeleton counts toward the beat instead of adding to it.
   */
  shimmer: EntryShimmer;
  /** The screen's skeleton layout (see ScreenSkeletons). */
  children: React.ReactNode;
  /** Space kept clear at the top (a floating header the skeleton must not cover). */
  topInset?: number;
  /** Overlay fill; defaults to the theme background. */
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
};

export default function ScreenShimmer({ shimmer, children, topInset = 0, backgroundColor, style }: Props) {
  const { colors } = useTheme();
  const { visible, reduceMotion } = shimmer;
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      opacity.stopAnimation();
      opacity.setValue(1);
      setRendered(true);
      return;
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: reduceMotion ? 80 : FADE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setRendered(false);
    });
  }, [visible, reduceMotion, opacity]);

  if (!rendered) return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        StyleSheet.absoluteFill,
        { top: topInset, backgroundColor: backgroundColor ?? colors.background, opacity },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <StaticContext.Provider value={reduceMotion}>
        {reduceMotion ? children : <ShimmerGroup>{children}</ShimmerGroup>}
      </StaticContext.Provider>
    </Animated.View>
  );
}

/**
 * One skeleton block. Sweeps with the screen's shared shimmer band, or stays
 * a static placeholder when the user has reduced motion on.
 */
export function Bone({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const isStatic = useContext(StaticContext);
  if (isStatic) return <View style={[styles.bone, { backgroundColor: colors.skeleton }, style]} />;
  return <ShimmerBlock style={[styles.bone, style]} />;
}

const styles = StyleSheet.create({
  bone: { borderRadius: 8 },
});
